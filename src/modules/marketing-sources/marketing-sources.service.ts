
// ──  Framework & Lib  ──────────────────────────────────────────────────────────
import { Repository, Brackets, DataSource, QueryFailedError } from 'typeorm';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
import { handleDbError, PgQueryError, sleep, isRetryablePgError } from 'src/common/utils';
import type { Paginated } from 'src/common/utils';
import { escapeLike } from 'src/common/utils/like-utils';

// ── Domain (Entities/Repositories/Enums)  ──────────────────────────────────────────────────────────
import { MarketingSource } from 'src/entities/marketing-source.entity';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import {
    CreateMarketingSourceDto,
    UpdateMarketingSourceDto,
    MarketingSourceResponseDto,
    SearchMarketingSourcesQueryDto
} from './dto';
import { MarketingSourceStatus } from 'src/common/enums/marketing.enum';
import { BusinessStatus } from 'src/common/enums';
import { TrackingNumber } from 'src/entities/tracking-number.entity';


const SAFE_SELECT: (keyof MarketingSource)[] = [
    'id',
    'name',
    'description',
    'channel',
    'campaignName',
    'createdAt',
    'updatedAt'
];

// function escapeLike(input: string) {
//     // return String(input).replace(/[\\%_]/g, (m) => '\\' + m);
//     return String(input).replace(/[\\%_]/g, '\\$&');
// }

@Injectable()
export class MarketingSourcesService {
    constructor(
        @InjectRepository(MarketingSource) private repo: Repository<MarketingSource>,
        @InjectRepository(TrackingNumber) private trRepo: Repository<TrackingNumber>,
        private readonly dataSource: DataSource
    ) { }

    private static readonly MAX_RETRIES = 3;

    async create(businessId: string, dto: CreateMarketingSourceDto) {
        try {
            const isNameInUse = await this.repo.exists({ where: { name: dto.name } });
            if (isNameInUse) {
                throw new BadRequestException('Name already in use');
            }
            const ms = this.repo.create({ ...dto, businessId, status: MarketingSourceStatus.Active });
            return this.repo.save(ms);
        } catch (err) {
            handleDbError(err as PgQueryError, 'Cannot create marketing source');
        }
    }

    async search(
        businessId: string,
        opts?: SearchMarketingSourcesQueryDto
    ): Promise<Paginated<MarketingSourceResponseDto>> {

        const page = Math.max(1, Number(opts?.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(opts?.limit ?? 25)));
        if (!businessId) throw new BadRequestException('Business Id not found');

        const SORTABLE = new Set(['createdAt', 'updatedAt', 'name', 'channel', 'campaignName']);
        const sortBy = SORTABLE.has(String(opts?.sortBy)) ? String(opts!.sortBy) : 'createdAt';
        const sortOrder: 'ASC' | 'DESC' =
            String(opts?.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        try {
            const qb = this.repo
                .createQueryBuilder('ms')
                // Select safe columns for query builder using keys from SAFE_SELECT
                .select(SAFE_SELECT.map((c) => `ms.${String(c)}`))
                .where('ms.businessId = :businessId AND ms.status = :status', { businessId, status: BusinessStatus.Active })
                .orderBy(`ms.${sortBy}`, sortOrder)
                .skip((page - 1) * limit)
                .take(limit);

            // name partial match
            if (opts?.name?.trim()) {
                const name = `%${escapeLike(opts.name.trim())}%`;
                qb.andWhere("ms.name ILIKE :name ESCAPE '\\'", { name });
            }

            // Free-text term across name/description/campaignName
            if (opts?.term?.trim()) {
                const term = `%${escapeLike(opts.term.trim())}%`;
                qb.andWhere(
                    new Brackets((wqb) => {
                        wqb.where("ms.name ILIKE :term ESCAPE '\\'", { term })
                            .orWhere("ms.description ILIKE :term ESCAPE '\\'", { term })
                            .orWhere("ms.campaignName ILIKE :term ESCAPE '\\'", { term });
                    })
                );
            }

            // channel exact match (or array)
            if (opts?.channel) {
                if (Array.isArray(opts.channel)) {
                    qb.andWhere('ms.channel = ANY(:channels)', { channels: opts.channel });
                } else {
                    qb.andWhere('ms.channel = :channel', { channel: opts.channel });
                }
            }

            // campaignName partial match
            if (opts?.campaignName?.trim()) {
                const cn = `%${escapeLike(opts.campaignName.trim())}%`;
                qb.andWhere("ms.campaignName ILIKE :cn ESCAPE '\\'", { cn });
            }

            // createdAt range
            if (opts?.createdFrom) qb.andWhere('ms.createdAt >= :from', { from: opts.createdFrom });
            if (opts?.createdTo) qb.andWhere('ms.createdAt < :to', { to: opts.createdTo });


            const [rows, total] = await qb.getManyAndCount();

            const pageCount = Math.max(1, Math.ceil(total / limit));
            return {
                items: rows as unknown as MarketingSourceResponseDto[],
                meta: {
                    total,
                    page,
                    limit,
                    pageCount,
                    hasNext: page < pageCount,
                    hasPrev: page > 1,
                },
            };
        } catch (err) {
            handleDbError(err as PgQueryError, 'Cannot load marketing sources');
        }
    }

    async update(businessId: string, id: string, dto: UpdateMarketingSourceDto) {
        if (!businessId) throw new BadRequestException('Business id is required');
        if (!id) throw new BadRequestException('Marketing source id is required');

        const payload = Object.fromEntries(
            Object.entries(dto).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
            throw new BadRequestException('Nothing to update');
        }

        // Guard --- Ensure the new business name is unique
        if (dto?.name) {
            const existing = await this.repo.findOne({
                where: { business: { id: businessId } as any, name: dto.name },
                select: { id: true } as any,
            });
            if (existing && existing.id !== id) {
                throw new BadRequestException('New marketing source name is already in use.');
            }
        }

        const PG_UNIQUE_VIOLATION = '23505';

        for (let attempt = 1; attempt <= MarketingSourcesService.MAX_RETRIES; attempt++) {
            try {
                await this.dataSource.transaction(async (manager) => {
                    const msRepo = manager.withRepository(this.repo);

                    // Load fresh row inside the txn and enforce ownership
                    const ms = await msRepo.findOne({ where: { id } });

                    // Lock the row so only one writer proceeds at a time.
                    // const ms = await msRepo
                    //     .createQueryBuilder('ms')
                    //     .setLock('pessimistic_write')
                    //     .where('ms.id = :id', { id })
                    //     .andWhere('ms.businessId = :businessId', { businessId })
                    //     .getOne();

                    if (!ms) throw new NotFoundException('Marketing source not found');
                    if ((ms as any).businessId !== businessId) throw new ForbiddenException();

                    // Snapshot for OCC
                    const msTs = (ms as any).updatedAt;

                    // Build SET with bump to NOW() so writers serialize by timestamp
                    // .setLock('pessimistic_write')
                    const set: any = { ...payload, updatedAt: () => 'NOW()' };
                    const res = await msRepo
                        .createQueryBuilder()
                        .update(msRepo.metadata.target)
                        .set(set)
                        .where('id = :id AND "updated_at" = :updatedAt', {
                            id: (ms as any).id,
                            updatedAt: msTs,
                        })
                        .execute();

                    if (res.affected === 0) {
                        throw new ConflictException('Marketing source was updated concurrently');
                    }
                });

                const updatedMs = await this.repo.findOne({ where: { id }, select: SAFE_SELECT })
                return { udpated: true, ms: updatedMs };
            } catch (err: any) {
                // Friendly error if UNIQUE(business_id, name) is hit
                if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
                    // You can parse detail to confirm it’s the name index, if multiple UNIQUEs exist.
                    throw new BadRequestException('New marketing source name is already in use.');
                }

                // Retry on OCC conflicts or retryable PG errors (deadlocks, serialization, etc.)
                if (err instanceof ConflictException || isRetryablePgError?.(err)) {
                    if (attempt < MarketingSourcesService.MAX_RETRIES) {
                        const jitter = 15 + Math.floor(Math.random() * 35); // 15–50ms
                        await sleep(jitter);
                        continue;
                    }
                    throw new ConflictException('Concurrent update detected; please retry');
                }

                // Non-retryable: delegate to your existing handler
                return handleDbError(err as PgQueryError, 'Cannot update marketing source');
            }
        }
    }

    async remove(businessId: string, id: string) {
        return this.dataSource.transaction(async (manager) => {
            try {
                // 1) Atomically mark as Deleted and soft-delete (set deletedAt) IF:
                //    - id matches
                //    - business matches
                //    - not already Deleted
                const msRepo = manager.withRepository(this.repo);
                const trRepo = manager.withRepository(this.trRepo);

                const res = await msRepo
                    .createQueryBuilder()
                    .update(msRepo.metadata.target)
                    .set({
                        status: MarketingSourceStatus.Deleted,
                        deletedAt: () => 'NOW()',
                    })
                    .where('id = :id', { id })
                    .andWhere('business_id = :biz', { biz: businessId })
                    .andWhere('status <> :deleted', { deleted: MarketingSourceStatus.Deleted })
                    .returning(['id'])
                    .execute();

                if (res.affected === 0) {
                    // Nothing changed. To return accurate errors, probe minimally.
                    // (This probe is outside the race because we already tried the atomic flip.)
                    const probe = await msRepo.findOne({
                        where: { id },
                        withDeleted: true, // include soft-deleted rows
                        select: ['id', 'businessId', 'status', 'deletedAt'],
                    });

                    if (!probe) {
                        throw new NotFoundException('Marketing source not found');
                    }
                    if (probe.businessId !== businessId) {
                        throw new ForbiddenException();
                    }

                    // Already deleted → idempotent success
                    if (
                        probe.status === MarketingSourceStatus.Deleted ||
                        probe.deletedAt != null
                    ) {
                        // Still clean up dangling references just in case
                        await trRepo
                            .createQueryBuilder()
                            .update(trRepo.metadata.target)
                            .set({ marketingSourceId: () => 'NULL' })
                            .where('marketing_source_id = :id', { id: probe.id })
                            .execute();

                        return { deleted: true };
                    }

                    // If we got here, something else prevented the update (rare)
                    throw new ConflictException('Could not delete marketing source');
                }

                // 2) Detach tracking numbers referencing this source (idempotent)
                await trRepo
                    .createQueryBuilder()
                    .update(trRepo.metadata.target)
                    .set({ marketingSourceId: () => 'NULL' })
                    .where('marketing_source_id = :id', { id })
                    .execute();

                return { deleted: true };
            } catch (err) {
                handleDbError(err as PgQueryError, 'Cannot delete marketing source');
            }
        });
    }

    async findOneScoped(businessId: string, id: string) {
        const ms = await this.repo.findOne({ where: { id } });
        if (!ms) throw new NotFoundException('Marketing source not found');
        if (ms.businessId !== businessId) throw new ForbiddenException();
        return ms;
    }
}
