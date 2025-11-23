
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import { Repository, DataSource } from 'typeorm';

import { Injectable, BadRequestException, ForbiddenException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
import { handleDbError, PgQueryError } from 'src/common/utils';
import type { Paginated } from 'src/common/utils';
import { sleep, isRetryablePgError } from 'src/common/utils';

// ── App modules/services/providers  ─────────────────────────────────────────────
import { TwilioService } from '../twilio/twilio.service';
import { MarketingSourcesService } from '../marketing-sources/marketing-sources.service';
// import { ConfigService } from '../../config/config.service';

// ── Domain (Entities/Repositories/Enums)  ──────────────────────────────────────────────────────────
import { TrackingNumber } from 'src/entities/tracking-number.entity';
import { NumberRoute } from 'src/entities/number-route.entity';
import { ProvisionNumberDto } from './dto/provision-number.dto';
import { MarketingSource } from '../../entities/marketing-source.entity';
import { TrackingNumberStatus } from 'src/common/enums/phone-number.enum';
import { NumberRouteStatus } from 'src/common/enums/phone-number.enum';

import { TrackingNumberSortBy, SortOrder } from 'src/common/enums';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import { TrackingNumberResponseDto } from './dto/tracking-number-response.dto';
import { UpdateTrackingNumberDto } from './dto/update-tracking-number.dto';
import { AvailableNumberResponseDto } from './dto/available-number-response.dto';
import { Business } from 'src/entities/business.entity';
import { SearchTrackingNumbersQueryDto } from './dto/search-tracking-numbers.query.dto';


type SearchOptions = SearchTrackingNumbersQueryDto & {
    businessId?: string;
};

@Injectable()
export class CallTrackingService {
    constructor(
        @InjectRepository(TrackingNumber) private tnRepo: Repository<TrackingNumber>,
        @InjectRepository(MarketingSource) private msRepo: Repository<MarketingSource>,
        @InjectRepository(NumberRoute) private nrRepo: Repository<NumberRoute>,
        @InjectRepository(Business) private bizRepo: Repository<Business>,
        private readonly twilio: TwilioService,
        private readonly msService: MarketingSourcesService,
        private readonly dataSource: DataSource,
        // private readonly cfg: ConfigService
    ) { }
    private readonly logger = new Logger(CallTrackingService.name);
    private static readonly MAX_RETRIES = 3;

    async search(opts: SearchOptions): Promise<Paginated<TrackingNumberResponseDto>> {
        this.logger.debug(opts);

        const page = Math.max(1, Number(opts?.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(opts?.limit ?? 20)));

        const SORTABLE = new Set<string>(Object.values(TrackingNumberSortBy));

        const sortBy: TrackingNumberSortBy = SORTABLE.has(String(opts?.sortBy))
            ? opts!.sortBy as TrackingNumberSortBy
            : TrackingNumberSortBy.CreatedAt;

        const sortOrder: SortOrder =
            String(opts?.sortOrder ?? '').toUpperCase() === SortOrder.ASC
                ? SortOrder.ASC
                : SortOrder.DESC;

        try {
            const baseQb = this.tnRepo.createQueryBuilder('tn')
                .leftJoin('tn.marketingSource', 'ms')
                .leftJoin(
                    'tn.routes',           // relation path, not "numberRoutes[]"
                    'nr',
                    `nr.status = 'active'`        // put the filter in the JOIN condition
                )
                .where('tn.status = :status', {
                    status: TrackingNumberStatus.Active
                });

            // const baseQb = this.tnRepo
            //     .createQueryBuilder('tn')
            //     .leftJoin('tn.marketingSource', 'ms')
            //     // join the ACTIVE route
            //     .leftJoin(
            //         (qb) =>
            //             qb.from(NumberRoute, 'nr')
            //                 .where('nr.is_active = true'),
            //         'nr',
            //         'nr.tracking_number_id = tn.id',
            //     )
            //     .where('tn.business_id = :bid', { bid: businessId });

            if (opts?.businessId) {
                baseQb.andWhere('tn.businessId = :bid', { bid: opts.businessId });
            }

            // number exact match
            if (opts?.number) {
                baseQb.andWhere('tn.number = :number', { number: opts.number });
            }

            // forwarding voice number exact match
            if (opts?.forwardingVoiceNumber) {
                baseQb.andWhere('nr.forwardingVoiceNumber = :number', { number: opts.forwardingVoiceNumber });
            }

            // marketing source id match
            if (opts?.marketingSourceId) {
                if (opts.marketingSourceId === '#') {
                    // search for NULL values
                    baseQb.andWhere('tn.marketingSourceId IS NULL');
                } else {
                    // search for a specific id
                    baseQb.andWhere('tn.marketingSourceId = :id', {
                        id: opts.marketingSourceId,
                    });
                }
            }

            // createdAt range
            if (opts?.createdFrom) baseQb.andWhere('tn.createdAt >= :from', { from: opts.createdFrom });
            if (opts?.createdTo) baseQb.andWhere('tn.createdAt < :to', { to: opts.createdTo });

            const cntRow = await baseQb
                .clone()
                .select('COUNT(DISTINCT tn.id)', 'cnt')
                .getRawOne<{ cnt: string }>();
            const total = Number(cntRow?.cnt ?? 0);
            const pageCount = Math.max(1, Math.ceil(total / limit));

            const raw = await baseQb
                .clone()
                .select([
                    'tn.id AS "id"',
                    'tn.number AS "number"',
                    'nr.forwarding_voice_number AS "forwardingVoiceNumber"',
                    'ms.id AS "marketingSourceId"',
                    'ms.name AS "marketingSourceName"',
                    'ms.description AS "marketingSourceDescription"',
                    'ms.channel AS "marketingSourceChannel"',
                    'ms.campaign_name AS "marketingSourceCampaignName"',
                    'tn.created_at AS "createdAt"',
                    'tn.updated_at AS "updatedAt"',
                ])
                .orderBy(`tn.${sortBy}`, sortOrder)
                .skip((page - 1) * limit)
                .take(limit)
                .getRawMany<{
                    id: string;
                    number: string;
                    forwardingVoiceNumber: string | null;
                    marketingSourceId: string;
                    marketingSourceName: string;
                    marketingSourceDescription: string | null;
                    marketingSourceChannel: string | null;
                    marketingSourceCampaignName: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                }>();

            const items: TrackingNumberResponseDto[] = raw.map((r) => ({
                id: r.id,
                number: r.number,
                forwardingVoiceNumber: r.forwardingVoiceNumber ?? undefined,
                marketingSource: {
                    id: r.marketingSourceId,
                    name: r.marketingSourceName,
                    description: r.marketingSourceDescription ?? '',
                    channel: r.marketingSourceChannel ?? '',
                    campaignName: r.marketingSourceCampaignName ?? '',
                },
                createdAt: r.createdAt ?? null,
                updatedAt: r.updatedAt ?? null,
            }));

            return {
                items,
                meta: {
                    total,
                    page,
                    limit,
                    pageCount,
                    hasNext: page < pageCount,
                    hasPrev: page > 1,
                },
            };
        } catch (err: any) {
            handleDbError(err as PgQueryError, 'Cannot search tracking numbers');
        }
    }

    async availableNumbers(
        _businessId: string,
        params: { country?: string; areaCode: string; limit?: number }): Promise<AvailableNumberResponseDto[]> {
        return this.twilio.listAvailableNumbers({
            country: params.country ?? 'US',
            areaCode: params.areaCode,
            limit: params.limit ?? 10,
        });
    }

    async provision(businessId: string, dto: ProvisionNumberDto) {
        if (!(businessId?.trim() ?? '')) {
            throw new BadRequestException('Business Id is required');
        }

        // ensure marketing source belongs to this business
        if (dto?.marketingSourceId) {
            const ms = await this.msService.findOneScoped(businessId, dto.marketingSourceId);
            if (!ms) throw new NotFoundException('Marketing source not found');
        }

        const biz = await this.bizRepo.findOne({ where: { id: businessId } });
        if (!biz) throw new NotFoundException('Business not found');

        // Guard: prevent purchase when the business has reached its tracking number limit
        // 1) Atomically "reserve" a slot by incrementing used count only if under the limit.
        //    This prevents races without long-lived row locks.
        const reserve = await this.bizRepo
            .createQueryBuilder()
            .update(this.bizRepo.metadata.target)
            .set({ trackingNumbersUsedCount: () => `"tracking_numbers_used_count" + 1` })
            .where('id = :id', { id: businessId })
            .andWhere(`"tracking_numbers_used_count" < "max_tracking_numbers"`)
            .returning(['id', 'tracking_numbers_used_count', 'max_tracking_numbers'])
            .execute();

        if (!reserve.affected) {
            throw new BadRequestException('You have reached the limit for purchasing tracking numbers.');
        }

        // Helper to roll back the reservation if anything fails after this point
        const rollbackReservation = async () => {
            try {
                await this.bizRepo
                    .createQueryBuilder()
                    .update(this.bizRepo.metadata.target)
                    .set({ trackingNumbersUsedCount: () => `"tracking_numbers_used_count" - 1` })
                    .where('id = :id', { id: businessId })
                    .andWhere(`"tracking_numbers_used_count" > 0`)
                    .execute();
            } catch (err: any) {
                this.logger.error(
                    `Reservation rollback failed for businessId=${businessId}: ${err?.message ?? 'unknown error'}`,
                    err?.stack
                );
            }
        };

        let purchasedNumber: string | undefined;
        let phoneSid: string | undefined;

        try {
            // buy number on Twilio
            const purchase = await this.twilio.buyIncomingNumber({
                phoneNumber: dto?.trackingNumber ?? '',
                country: dto?.country ?? 'US',
                areaCode: dto?.areaCode ? parseInt(dto.areaCode, 10) : undefined,
                voiceUrlPath: '/twilio/voice',
                statusCallbackPath: '/twilio/call-status',
            });

            purchasedNumber = purchase.trackingNumber;
            phoneSid = purchase.phoneSid;
        } catch (err: any) {
            // external purchase failed; free the reserved slot
            await rollbackReservation();
            throw new BadRequestException('Failed to purchase a tracking number. Please try again.');
        }

        try {
            await this.dataSource.transaction(async (mgr) => {
                const tnRepo = mgr.withRepository(this.tnRepo);
                const nrRepo = mgr.withRepository(this.nrRepo);

                // Persist TrackingNumber
                const tracking = tnRepo.create({
                    number: purchasedNumber!,
                    businessId,
                    marketingSourceId: dto.marketingSourceId ? dto.marketingSourceId : null,
                    twilioPhoneSid: phoneSid!,
                    status: TrackingNumberStatus.Active,
                    purchasedAt: new Date()
                } as any);
                const saved = await tnRepo.save(tracking as any);

                // Create ACTIVE route with the forwarding voice number
                if (dto?.forwardingVoiceNumber) {
                    const route = nrRepo.create({
                        trackingNumberId: (saved as any).id,
                        status: NumberRouteStatus.Active,
                        forwardingVoiceNumber: dto.forwardingVoiceNumber,
                    } as any);
                    await nrRepo.save(route);
                }
            });

            return {
                trackingNumber: purchasedNumber,
                forwardingVoiceNumber: dto.forwardingVoiceNumber,
                // marketingSource: ms?.name ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        } catch (err: any) {
            // DB persistence failed → compensate: release Twilio number + free slot
            try {
                if (phoneSid)
                    await this.twilio.releaseIncomingNumber({ phoneSid });
            } catch (err: any) {
                this.logger.error(
                    `Failed to release Twilio number (phoneSid=${phoneSid}) for businessId=${businessId}: ${err?.message ?? 'unknown error'}`,
                    err?.stack
                );
            }

            await rollbackReservation();
            handleDbError(err as PgQueryError, 'Cannot create a tracking number');
        }

    }

    /** Update forwarding voice number (NumberRoute) and/or marketing source */
    async update(businessId: string, id: string, dto: UpdateTrackingNumberDto) {
        if (!businessId) throw new BadRequestException('Business id is required');
        if (!id) throw new BadRequestException('Tracking number id is required');

        if (dto?.forwardingVoiceNumber === undefined && dto?.marketingSourceId === undefined) {
            throw new BadRequestException('Nothing to update');
        }

        for (let attempt = 1; attempt <= CallTrackingService.MAX_RETRIES; attempt++) {
            try {
                await this.dataSource.transaction(async (manager) => {
                    const tnRepo = manager.withRepository(this.tnRepo);
                    const nrRepo = manager.withRepository(this.nrRepo);
                    const msRepo = manager.withRepository(this.msRepo);

                    // ── Load fresh TN + ownership check inside the txn ───────────────────────
                    const tn = await tnRepo.findOne({ where: { id }, relations: ['marketingSource'] });
                    if (!tn) throw new NotFoundException('Tracking number not found');
                    if (tn?.marketingSource && tn.marketingSource?.businessId !== businessId) {
                        throw new ForbiddenException();
                    }

                    // Keep a stable snapshot timestamp for OCC on TN
                    const tnTs = tn.updatedAt;

                    // ── Forwarding voice number: update/create active route ──────────────────
                    if (dto?.forwardingVoiceNumber !== undefined) {
                        // Lock existing active route briefly to serialize writers
                        const activeRoute = await nrRepo.findOne({
                            where: { trackingNumberId: (tn as any).id, status: NumberRouteStatus.Active },
                            lock: { mode: 'pessimistic_write' },
                        });

                        if (activeRoute) {
                            const nrTs = activeRoute.updatedAt;

                            // OCC update using updatedAt comparison and bump to NOW()
                            const updated = await nrRepo
                                .createQueryBuilder()
                                .update(nrRepo.metadata.target)
                                .set({
                                    forwardingVoiceNumber: dto.forwardingVoiceNumber,
                                    updatedAt: () => 'NOW()',
                                } as any)
                                .where('id = :id AND "updated_at" = :updatedAt', {
                                    id: (activeRoute as any).id,
                                    updatedAt: nrTs,
                                })
                                .execute();

                            if (updated.affected === 0) {
                                throw new ConflictException('Active route was updated concurrently');
                            }
                        } else if (dto.forwardingVoiceNumber !== null) {
                            // Create-if-missing with upsert; if another txn wins, update instead and bump updatedAt
                            await nrRepo
                                .createQueryBuilder()
                                .insert()
                                .into(nrRepo.metadata.target)
                                .values({
                                    trackingNumberId: (tn as any).id,
                                    status: NumberRouteStatus.Active,
                                    forwardingVoiceNumber: dto.forwardingVoiceNumber,
                                    // updatedAt will default to NOW() via @UpdateDateColumn on UPDATE, but for INSERT we set explicitly:
                                    updatedAt: () => 'NOW()',
                                } as any)
                                .onConflict(`
                                    ("tracking_number_id") WHERE status = 'active'
                                    DO UPDATE SET
                                      "forwarding_voice_number" = EXCLUDED."forwarding_voice_number",
                                      "updated_at" = NOW()
                                  `)
                                // .orUpdate(
                                //     ['forwarding_voice_number', 'updated_at'],
                                //     'uniq_active_route_per_tn'
                                // )
                                .execute();
                        }
                        // If dto.forwardingVoiceNumber === null and no active route exists, nothing to do.
                    }

                    // ── Marketing source migrate/clear with OCC on TN (updatedAt) ────────────
                    if (dto.marketingSourceId !== undefined) {
                        if (dto.marketingSourceId === null) {
                            const cleared = await tnRepo
                                .createQueryBuilder()
                                .update(tnRepo.metadata.target)
                                .set({ marketingSourceId: null, updatedAt: () => 'NOW()' } as any)
                                .where('id = :id AND "updated_at" = :updatedAt', {
                                    id: (tn as any).id,
                                    updatedAt: tnTs,
                                })
                                .execute();

                            if (cleared.affected === 0) {
                                throw new ConflictException('Tracking number was updated concurrently');
                            }
                        } else if (dto.marketingSourceId !== '') {
                            const ms = await msRepo.findOne({ where: { id: dto.marketingSourceId } });
                            if (!ms) throw new NotFoundException('Marketing source not found');
                            if ((ms as any).businessId !== businessId) throw new ForbiddenException();

                            const migrated = await tnRepo
                                .createQueryBuilder()
                                .update(tnRepo.metadata.target)
                                .set({ marketingSourceId: (ms as any).id, updatedAt: () => 'NOW()' } as any)
                                .where('id = :id AND "updated_at" = :updatedAt', {
                                    id: (tn as any).id,
                                    updatedAt: tnTs,
                                })
                                .execute();

                            if (migrated.affected === 0) {
                                throw new ConflictException('Tracking number was updated concurrently');
                            }
                        }
                    }
                });

                // success
                return { updated: true };
            } catch (err: any) {
                if (err instanceof ConflictException || isRetryablePgError(err)) {
                    if (attempt < (this.constructor as any).MAX_RETRIES) {
                        const jitter = 15 + Math.floor(Math.random() * 35); // 15–50ms
                        await sleep(jitter);
                        continue;
                    }
                    throw new ConflictException('Concurrent update detected; please retry');
                }
                return handleDbError(err as PgQueryError, 'Cannot update a tracking number');
            }
        }

        throw new ConflictException('Concurrent update detected; please retry');
    }

    /** Delete tracking number (routes cascade via FK) */
    async remove(businessId: string, id: string) {
        const releaseTarget = await this.dataSource.transaction(async (manager) => {
            const tnRepo = manager.withRepository(this.tnRepo);

            const result = await tnRepo
                .createQueryBuilder()
                .update(tnRepo.metadata.target)
                .set({ status: TrackingNumberStatus.Releasing })
                .where('id = :id', { id })
                .andWhere('status <> :releasing', { releasing: TrackingNumberStatus.Releasing })
                .andWhere('business_id = :biz', { biz: businessId })
                .returning(['id', 'number', 'twilio_phone_sid'])
                .execute();

            if (result.affected === 0) {
                throw new ConflictException('Release already in progress or not permitted');
            }

            const releasingTn = result.raw[0];
            return {
                id: releasingTn.id,
                number: releasingTn.number,
                twilioPhoneSid: releasingTn.twilio_phone_sid,
            };
        });

        // release on Twilio (by phoneSid if we have it, else search by number)
        let result: { released: boolean; reason?: string };
        result = await this.twilio.releaseIncomingNumber({
            phoneSid: releaseTarget.twilioPhoneSid,
            phoneNumber: releaseTarget.number
        });

        // Treat `not_found` as success (already gone / nothing to do)
        const deleted = result.released || result.reason === 'not_found';

        try {
            await this.dataSource.transaction(async (mgr) => {
                const tnRepo = mgr.withRepository(this.tnRepo);
                const nrRepo = mgr.withRepository(this.nrRepo);
                const bizRepo = mgr.withRepository(this.bizRepo);

                if (deleted) {
                    // Mark TN released + clear SID — prevents future attempts
                    await tnRepo
                        .createQueryBuilder()
                        .update(tnRepo.metadata.target)
                        .set({
                            twilioPhoneSid: () => 'NULL',
                            status: TrackingNumberStatus.Released,
                            releasedAt: () => 'NOW()'
                        } as any)
                        .where('id = :id', { id: id })
                        .execute();

                    // Delete active routes for this TN
                    await nrRepo
                        .createQueryBuilder()
                        .update(nrRepo.metadata.target)
                        .set({ status: NumberRouteStatus.Deleted, deletedAt: () => 'NOW()' })
                        .where('"tracking_number_id" = :id AND "status" = :status', {
                            id: id,
                            status: NumberRouteStatus.Active,
                        })
                        .execute();

                    // Decrement the business counter (never below zero)
                    await bizRepo
                        .createQueryBuilder()
                        .update(bizRepo.metadata.target)
                        .set({
                            trackingNumbersUsedCount: () => `GREATEST("tracking_numbers_used_count" - 1, 0)`,
                        } as any)
                        .where('id = :biz', { biz: businessId })
                        .andWhere('"tracking_numbers_used_count" > 0')
                        .execute();
                } else {
                    // Twilio failed → revert TN back to Active
                    await tnRepo
                        .createQueryBuilder()
                        .update(tnRepo.metadata.target)
                        .set({ status: TrackingNumberStatus.Active } as any)
                        .where('id = :id', { id })
                        .andWhere('business_id = :biz', { biz: businessId })
                        .execute();
                }
            });
        } catch (err: any) {
            handleDbError(err as PgQueryError, 'Cannot delete a tracking number');
        }

        if (deleted) return { deleted: true };
        else {
            // If Twilio reported an actionable failure, surface reason
            this.logger.warn(
                `Failed to release ${releaseTarget.number} (id=${releaseTarget.id}) on Twilio: ${result.reason}`,
            );
            return {
                deleted: false,
                reason: result.reason
            };
        }
    }

    async findByTrackingNumber(trackingNumber: string) {
        try {
            const tn = await this.tnRepo.findOne({ where: { number: trackingNumber } });
            if (!tn) throw new NotFoundException('Tracking number not found');
            return tn;
        } catch (err: any) {
            handleDbError(err as PgQueryError, 'Cannot find a tracking number');
        }
    }

    /** Update forwarding voice number (NumberRoute) and/or marketing source */
    /** 
    async update(businessId: string, id: string, dto: UpdateTrackingNumberDto) {
        if (!businessId) throw new BadRequestException('Business id is required');
        if (!id) throw new BadRequestException('Tracking number id is required');
 
        if (dto?.forwardingVoiceNumber === undefined && dto?.marketingSourceId === undefined) {
            throw new BadRequestException('Nothing to update');
        }
 
        // Load the tracking number with ownership via its marketing source
        const tn = await this.tnRepo.findOne({ where: { id }, relations: ['marketingSource'] });
        if (!tn) throw new NotFoundException('Tracking number not found');
        // const tn = await this.tnRepo
        //     .createQueryBuilder('tn')
        //     .leftJoinAndSelect('tn.marketingSource', 'ms')
        //     .where('tn.id = :id', { id })
        //     .getOne();
 
        // Enforce current ownership (if TN already tied to an MS)
        if (tn?.marketingSource && tn.marketingSource?.businessId !== businessId) throw new ForbiddenException();
 
        try {
            // ── Forwarding voice number update/clear (on ACTIVE route) ─────────────
            if (dto?.forwardingVoiceNumber !== undefined) {
                const activeRoute = await this.nrRepo.findOne({
                    where: { trackingNumberId: (tn as any).id, isActive: true },
                    // lock: { mode: 'pessimistic_write' }
                });
 
                if (activeRoute) {
                    activeRoute.forwardingVoiceNumber = dto.forwardingVoiceNumber;
                    await this.nrRepo.save(activeRoute);
                } else {
                    // No active route exists:
                    // - If value is non-null, create the active route with that value.
                    // - If value is null, do NOT create a route (nothing to forward).
                    if (dto.forwardingVoiceNumber !== null && dto.forwardingVoiceNumber !== '') {
                        const newRoute = this.nrRepo.create({
                            trackingNumberId: (tn as any).id,
                            isActive: true,
                            forwardingVoiceNumber: dto.forwardingVoiceNumber,
                        } as any);
                        await this.nrRepo.save(newRoute);
                    }
                }
            }
 
            // ── Marketing source migrate/clear ─────────────────────────────────────
            if (dto.marketingSourceId !== undefined) {
                if (dto.marketingSourceId === null) {
                    // Clear association
                    (tn as any).marketingSourceId = null;
                    await this.tnRepo.save(tn);
                } else if (dto.marketingSourceId !== '') {
                    // Migrate to a specific MS (must belong to the same business)
                    const ms = await this.msRepo.findOne({ where: { id: dto.marketingSourceId } });
                    if (!ms) throw new NotFoundException('Marketing source not found');
                    if ((ms as any).businessId !== businessId) throw new ForbiddenException();
 
                    (tn as any).marketingSourceId = ms.id;
                    await this.tnRepo.save(tn);
                }
            }
 
            return { updated: true };
        } catch (err: any) {
            handleDbError(err as PgQueryError, 'Cannot update a tracking number');
        }
    } */
}
