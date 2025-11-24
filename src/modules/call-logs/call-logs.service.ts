
// ──  Framework & Lib  ──────────────────────────────────────────────────────────
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
import { handleDbError, Paginated, PgQueryError } from 'src/common/utils';

// ── Domain (Entities/Repositories/Enums)  ──────────────────────────────────────────────────────────
import { CallLog } from '../../entities/call-log.entity';

import { CallIntent, CallLogSortBy, CallResult } from 'src/common/enums/telephony.enum';
import { SortOrder } from 'src/common/enums';
import { CallStatus } from 'src/common/enums/telephony.enum';

import { CallLogReponseDto } from './dto/call-log-response.dto';
import { SearchCallLogsQueryDto } from './dto/search-call-logs.query.dto';


@Injectable()
export class CallLogsService {
    constructor(@InjectRepository(CallLog) private readonly repo: Repository<CallLog>) { }

    /**
     * Create a call log keyed by twilioCallSid.
     * - Requires twilioCallSid (function name implies SID-based creation).
     * - Throws Conflict if the SID already exists.
     */
    async createBySid(payload: Partial<CallLog> & { twilioCallSid: string }) {
        const sid = payload.twilioCallSid?.trim();
        if (!sid) {
            throw new BadRequestException('twilioCallSid is required to create a call log by SID');
        }

        const existing = await this.repo.findOne({ where: { twilioCallSid: sid } });
        if (existing) {
            throw new ConflictException('Call log already exists for this twilioCallSid');
        }

        const log = this.repo.create({ ...payload, twilioCallSid: sid });
        try {
            return await this.repo.save(log);
        } catch (err: any) {
            // Handle unique constraint races (e.g., concurrent inserts)
            if (err?.code === '23505') {
                throw new ConflictException('Call log already exists for this twilioCallSid');
            }
            throw err;
        }
    }

    /**
     * Update a call log by twilioCallSid.
     * - Requires twilioCallSid.
     * - Throws NotFound if the record doesn’t exist.
     */
    async updateBySid(payload: Partial<CallLog> & { twilioCallSid: string }) {
        const sid = payload.twilioCallSid?.trim();
        if (!sid) {
            throw new BadRequestException('twilioCallSid is required to update a call log by SID');
        }

        const existing = await this.repo.findOne({ where: { twilioCallSid: sid } });
        if (!existing) {
            throw new NotFoundException('Call log not found');
        }

        // Avoid overwriting immutable/unique fields accidentally
        const { id, createdAt, updatedAt, twilioCallSid, ...rest } = payload;
        const merged = this.repo.merge(existing, { ...rest });
        return this.repo.save(merged);
    }

    /**
     * Search call logs for a business with optional filters, sorting, and pagination.
     * 
     * Filters:
     * - marketingSourceId: restrict to a specific marketing source.
     * - startedFrom: include calls with callStartedAt >= this ISO date/time.
     * - startedTo:   include calls with callStartedAt  < this ISO date/time (exclusive upper bound).
     *
     * Sorting:
     * - sortBy: one of CallLogSortBy (defaults to CallLogSortBy.CallStartedAt).
     * - sortOrder: 'ASC' | 'DESC' (defaults to DESC).
     * 
     * Pagination:
     * - page: 1-based page index (defaults to 1).
     * - limit: page size between 1 and 100 (defaults to 25).
     * 
     * @param businessId - The business ID whose call logs are being queried.
     * @param opts - Optional query parameters
     */
    async search(
        businessId: string,
        opts?: SearchCallLogsQueryDto): Promise<Paginated<CallLogReponseDto>> {
        const page = Math.max(1, Number(opts?.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(opts?.limit ?? 25)));
        if (!businessId) throw new BadRequestException('Business Id not found');

        const SORTABLE = new Set<CallLogSortBy>(Object.values(CallLogSortBy));
        const sortBy: CallLogSortBy =
            opts?.sortBy && SORTABLE.has(opts.sortBy as CallLogSortBy)
                ? (opts.sortBy as CallLogSortBy)
                : CallLogSortBy.CallStartedAt;
        const sortOrder: SortOrder =
            String(opts?.sortOrder).toUpperCase() === 'ASC' ? SortOrder.ASC : SortOrder.DESC;

        try {
            const qb = this.repo
                .createQueryBuilder('cl')
                .innerJoin(
                    'cl.marketingSource',
                    'ms',
                    `ms.businessId = :businessId`,
                    { businessId }
                )
                .leftJoin(
                    'cl.trackingNumber',
                    'tn'
                )
                // .orderBy(`cl.${sortBy}`, sortOrder)
                // .skip((page - 1) * limit)
                // .take(limit);


            // mareketingSourceId
            if (opts?.marketingSourceId) {
                qb.andWhere('cl.marketingSourceId = :id', { id: opts.marketingSourceId });
            }

            // callStartedAt range
            if (opts?.startedFrom) qb.andWhere('cl.callStartedAt >= :from', { from: opts.startedFrom });
            if (opts?.startedTo) qb.andWhere('cl.callStartedAt < :to', { to: opts.startedTo });

            const cntRow = await qb
                .clone()
                .orderBy()
                .select('COUNT(DISTINCT cl.id)', 'cnt')
                .getRawOne<{ cnt: string }>();
            const total = Number(cntRow?.cnt ?? 0);
            const pageCount = Math.max(1, Math.ceil(total / limit));

            const raw = await qb
                .clone()
                .select([
                    'cl.id AS "id"',
                    'cl.caller_number AS "callerNumber"',
                    'cl.receiver_number AS "receiverNumber"',
                    'cl.status AS "status"',
                    'cl.call_started_at AS "callStartedAt"',
                    'cl.duration_seconds AS "durationSeconds"',
                    'cl.result AS "result"',
                    'cl.sentiment AS "sentiment"',
                    'cl.intent AS "intent"',
                    'cl.transcript_json AS "transcriptJson"',
                    'cl.recording_url AS "recordingUrl"',
                    'ms.id AS "marketingSourceId"',
                    'ms.name AS "marketingSourceName"',
                    'ms.description AS "marketingSourceDescription"',
                    'ms.channel AS "marketingSourceChannel"',
                    'ms.campaign_name AS "marketingSourceCampaignName"',
                    'tn.number AS "trackingNumber"',
                ])
                .orderBy(`cl.${sortBy}`, sortOrder)
                .skip((page - 1) * limit)
                .take(limit)
                .getRawMany<{
                    id: string;
                    callerNumber: string;
                    receiverNumber: string;
                    status: CallStatus;
                    callStartedAt: Date;
                    durationSeconds: number;
                    result: CallResult,
                    sentiment: number | null,
                    intent: CallIntent,
                    transcriptJson: string | null;
                    recordingUrl: string | null;
                    marketingSourceId: string;
                    marketingSourceName: string;
                    marketingSourceDescription: string | null;
                    marketingSourceChannel: string | null;
                    marketingSourceCampaignName: string | null;
                    trackingNumber: string;
                }>();

            const items: CallLogReponseDto[] = raw.map((r) => ({
                id: r.id,
                callerNumber: r.callerNumber,
                receiverNumber: r.receiverNumber,
                status: r.status,
                callStartedAt: r.callStartedAt,
                durationSeconds: r.durationSeconds,
                result: r.result,
                sentiment: r.sentiment,
                intent: r.intent,
                transcriptJson: r.transcriptJson,
                recordingUrl: r.recordingUrl,
                trackingNumber: r.trackingNumber,
                marketingSource: {
                    id: r.marketingSourceId,
                    name: r.marketingSourceName,
                    description: r.marketingSourceDescription ?? '',
                    channel: r.marketingSourceChannel ?? '',
                    campaignName: r.marketingSourceCampaignName ?? '',
                },
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
            handleDbError(err as PgQueryError, 'Cannot load call logs');
        }
    }

    /**
     * Fetch a call log by its primary id. Returns null if not found.
     */
    async findById(id: string): Promise<CallLog> {
        const normalizedId = id?.trim();
        if (!normalizedId) {
            throw new BadRequestException('id is required');
        }

        const log = await this.repo.findOne({ where: { id: normalizedId } });
        if (!log) {
            throw new NotFoundException('Log is not found');
        }

        return log;
    }

    /**
     * Idempotent upsert by twilioCallSid.
     * If no row exists, insert; otherwise update the provided fields.
     * Not exposed in original interface but handy for webhook ingestion.
     */
    async upsertBySid(payload: Partial<CallLog> & { twilioCallSid?: string }) {
        const sid = payload.twilioCallSid?.trim();
        if (!sid) {
            throw new BadRequestException('twilioCallSid is required to upsert by SID');
        }
        // TypeORM 0.3+ supports repository.upsert
        await this.repo.upsert(
            [{ ...payload, twilioCallSid: sid }],
            { conflictPaths: ['twilioCallSid'] }
        );
        // Return the latest row
        return this.repo.findOneOrFail({ where: { twilioCallSid: sid } });
    }

    /**
     * Fetch one by SID (small helper, optional).
     */
    async findOneBySid(twilioCallSid: string) {
        const sid = twilioCallSid?.trim();
        if (!sid) {
            throw new BadRequestException('twilioCallSid is required');
        }
        const row = await this.repo.findOne({ where: { twilioCallSid: sid } });
        if (!row) throw new NotFoundException('Call log not found');
        return row;
    }
}
