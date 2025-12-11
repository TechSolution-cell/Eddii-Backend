
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import { Repository, Between, In } from 'typeorm';
import { DateTime } from 'luxon';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { Business } from 'src/entities/business.entity';

import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardChartService } from './dashboard-chart.service';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import { DashboardStaticQueryDto, DashboardRangeQueryDto } from '../dto/dashboard-query.dto';
import { DashboardRangeResponseDto, DashboardStaticResponseDto } from '../dto/dashboard-response.dto';


@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,

        @Inject(CACHE_MANAGER)
        private readonly cache: Cache,

        private readonly summaryService: DashboardSummaryService,
        private readonly chartService: DashboardChartService,

    ) { }

    private readonly logger = new Logger(DashboardService.name);


    // ---------------------------------------------------------------------
    // PUBLIC: STATIC DASHBOARD (today / last7 / last30)
    // ---------------------------------------------------------------------
    async getStaticDashboard(
        businessId: string,
        query: DashboardStaticQueryDto,
    ): Promise<DashboardStaticResponseDto> {
        const cacheKey = this.buildStaticCacheKey(businessId, query);
        const cached = await this.cache.get<DashboardStaticResponseDto>(cacheKey);
        if (cached) return cached;

        const business = await this.businessRepo.findOneOrFail({
            where: { id: businessId },
            select: ['id', 'timezone'],
        });

        // Business timezone as fallback
        const businessTz = business.timezone ?? 'UTC';
        // frontend tz from query, fallback to business tz
        const tz = query.timezone ?? businessTz;
        const now = DateTime.utc().setZone(tz);

        const summary = await this.summaryService.getStaticSummaryForBusiness(
            businessId,
            tz,
            now,
            query.marketingSourceIds ?? [],
        );

        const response: DashboardStaticResponseDto = { summary };

        await this.cache.set(cacheKey, response, 30); // 30 seconds TTL
        return response;

    }

    // ---------------------------------------------------------------------
    // PUBLIC: RANGE DASHBOARD (selected range + chart)
    // ---------------------------------------------------------------------
    async getRangeDashboard(
        businessId: string,
        query: DashboardRangeQueryDto,
    ): Promise<DashboardRangeResponseDto> {
        const cacheKey = this.buildRangeCacheKey(businessId, query);
        const cached = await this.cache.get<DashboardRangeResponseDto>(cacheKey);
        if (cached) return cached;

        const business = await this.businessRepo.findOneOrFail({
            where: { id: businessId },
            select: ['id', 'timezone'],
        });

        const businessTz = business.timezone ?? 'UTC';
        const tz = query.timezone ?? businessTz;

        const now = DateTime.utc().setZone(tz);

        // Frontend typically sends UTC ISO strings (Date.toISOString()).
        // Interpret them as UTC, then shift into the target tz.
        const fromLocal = query.from
            ? DateTime.fromISO(query.from, { zone: 'utc' })
                .setZone(tz)
                .startOf('day')
            : now.minus({ days: 29 }).startOf('day');

        const toLocal = query.to
            ? DateTime.fromISO(query.to, { zone: 'utc' })
                .setZone(tz)
                .endOf('day')
            : now.endOf('day');

        const groupBy = query.groupBy ?? this.chartService.inferGrouping(fromLocal, toLocal);

        const [summary, chartPoints] = await Promise.all([
            this.summaryService.getRangeSummaryForBusiness(businessId, tz, fromLocal, toLocal, query.marketingSourceIds ?? []),
            this.chartService.buildChart(businessId, tz, fromLocal, toLocal, groupBy, query.marketingSourceIds ?? [],
            ),
        ]);

        const response: DashboardRangeResponseDto = {
            summary,
            chart: {
                groupBy,
                from: fromLocal.toISO()!,
                to: toLocal.toISO()!,
                points: chartPoints,
            },
        };

        await this.cache.set(cacheKey, response, 30);
        return response;

    }

    // ---------------------------------------------------------------------
    // CACHE KEYS
    // ---------------------------------------------------------------------
    private buildStaticCacheKey(
        businessId: string,
        query: DashboardStaticQueryDto,
    ): string {
        const { marketingSourceIds, timezone } = query;
        return [
            'dashboard:static',
            businessId,
            timezone ?? '',
            (marketingSourceIds ?? []).slice().sort().join(','),
        ].join('|');
    }

    private buildRangeCacheKey(
        businessId: string,
        query: DashboardRangeQueryDto,
    ): string {
        const { from, to, groupBy, marketingSourceIds, timezone } = query;
        return [
            'dashboard:range',
            businessId,
            from ?? '',
            to ?? '',
            groupBy ?? '',
            timezone ?? '',
            (marketingSourceIds ?? []).slice().sort().join(','),
        ].join('|');
    }

}
