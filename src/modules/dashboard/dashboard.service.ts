
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import { Repository, Between, In } from 'typeorm';
import { DateTime } from 'luxon';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { Business } from 'src/entities/business.entity';
import { CallAnalyticsHourly } from 'src/entities/call-analytics-hourly.entity';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
    DashboardResponseDto,
    MetricWithChange,
    ChartPoint,
} from './dto/dashboard-response.dto';
import { DateGrouping } from './dto/dashboard-query.dto';

interface HourlyAggRow {
    bucketStartUtc: Date;
    totalCalls: number;
    totalSeconds: number;
}

@Injectable()
export class DashboardService {
    constructor(
        @InjectRepository(CallAnalyticsHourly)
        private readonly hourlyRepo: Repository<CallAnalyticsHourly>,
        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,
        @Inject(CACHE_MANAGER)
        private readonly cache: Cache,
    ) { }

    private readonly logger = new Logger(DashboardService.name);

    async getDashboard(
        businessId: string,
        query: DashboardQueryDto,
    ): Promise<DashboardResponseDto> {
        const cacheKey = this.buildCacheKey(businessId, query);
        const cached = await this.cache.get<DashboardResponseDto>(cacheKey);
        if (cached) return cached;

        const business = await this.businessRepo.findOneOrFail({
            where: { id: businessId },
            select: ['id', 'timezone'],
        });

        const tz = business.timezone ?? 'UTC';
        const now = DateTime.utc().setZone(tz);

        const fromLocal = query.from
            ? DateTime.fromISO(query.from, { zone: tz }).startOf('day')
            : now.minus({ days: 30 }).startOf('day');

        const toLocal = query.to
            ? DateTime.fromISO(query.to, { zone: tz }).endOf('day')
            : now.endOf('day');

        const groupBy = query.groupBy ?? this.inferGrouping(fromLocal, toLocal);

        const [summary, chartPoints] = await Promise.all([
            this.buildSummary(businessId, tz, now, []), // query.marketingSourceIds
            this.buildChart(
                businessId,
                tz,
                fromLocal,
                toLocal,
                groupBy,
                query.marketingSourceIds,
            ),
        ]);

        const response: DashboardResponseDto = {
            summary,
            chart: {
                groupBy,
                from: fromLocal.toISO()!,
                to: toLocal.toISO()!,
                points: chartPoints,
            },
        };

        // short TTL cache in Redis
        await this.cache.set(cacheKey, response, 30);

        return response;
    }

    private buildCacheKey(
        businessId: string,
        query: DashboardQueryDto,
    ): string {
        const { from, to, groupBy, marketingSourceIds } = query;
        return [
            'dashboard',
            businessId,
            from ?? '',
            to ?? '',
            groupBy ?? '',
            (marketingSourceIds ?? []).slice().sort().join(','),
        ].join('|');
    }

    private inferGrouping(from: DateTime, to: DateTime): DateGrouping {
        const days = Math.max(1, Math.round(to.diff(from, 'days').days));
        if (days <= 31) return DateGrouping.Day;
        if (days <= 180) return DateGrouping.Week;
        return DateGrouping.Month;
    }

    /* ------------------------------------------------------------------ */
    /* SUMMARY: today / last7 / last30 using one hourly query             */
    /* ------------------------------------------------------------------ */

    private async buildSummary(
        businessId: string,
        tz: string,
        now: DateTime,
        marketingSourceIds?: string[],
    ) {
        const today = now.startOf('day');
        const yesterday = today.minus({ days: 1 });

        const last7Start = today.minus({ days: 6 });
        const prev7Start = last7Start.minus({ days: 7 });
        const prev7End = last7Start.minus({ days: 1 });

        const last30Start = today.minus({ days: 29 });
        const prev30Start = last30Start.minus({ days: 30 });
        const prev30End = last30Start.minus({ days: 1 });

        // we need data from prev30Start..today
        const minDate = prev30Start;
        const maxDate = today;

        const hourlyRows = await this.fetchHourlyRows(
            businessId,
            minDate,
            maxDate,
            marketingSourceIds,
        );

        const dailyMap = this.buildDailyMapFromHourly(hourlyRows, tz);

        const todayStats = this.sumRange(dailyMap, today, today);
        const yesterdayStats = this.sumRange(dailyMap, yesterday, yesterday);

        const last7Stats = this.sumRange(dailyMap, last7Start, today);
        const prev7Stats = this.sumRange(dailyMap, prev7Start, prev7End);

        const last30Stats = this.sumRange(dailyMap, last30Start, today);
        const prev30Stats = this.sumRange(dailyMap, prev30Start, prev30End);

        const mkMetric = (
            current: { calls: number; minutes: number },
            previous: { calls: number; minutes: number },
        ) => ({
            calls: this.withChange(current.calls, previous.calls),
            minutes: this.withChange(current.minutes, previous.minutes),
        });

        // this.logger.debug(todayStats, yesterdayStats);
        const todayMetric = mkMetric(todayStats, yesterdayStats);
        const last7Metric = mkMetric(last7Stats, prev7Stats);
        const last30Metric = mkMetric(last30Stats, prev30Stats);

        return {
            callsToday: todayMetric.calls,
            callsLast7Days: last7Metric.calls,
            callsLast30Days: last30Metric.calls,
            minutesToday: todayMetric.minutes,
            minutesLast7Days: last7Metric.minutes,
            minutesLast30Days: last30Metric.minutes,
        };
    }

    private async fetchHourlyRows(
        businessId: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        marketingSourceIds?: string[],
    ): Promise<HourlyAggRow[]> {
        // Convert local date range to UTC bucket range
        const fromUtc = fromLocal.toUTC().startOf('day');
        const toUtc = toLocal.toUTC().endOf('day');

        const where: any = {
            businessId,
            bucketStartUtc: Between(fromUtc.toJSDate(), toUtc.toJSDate()),
        };

        if (marketingSourceIds?.length) {
            where.marketingSourceId = In(marketingSourceIds);
        }

        const rows = await this.hourlyRepo.find({
            where,
            select: ['bucketStartUtc', 'totalCalls', 'totalSeconds'],
        });

        return rows.map((r) => ({
            bucketStartUtc: r.bucketStartUtc,
            totalCalls: r.totalCalls,
            totalSeconds: r.totalSeconds,
        }));
    }

    private buildDailyMapFromHourly(
        rows: HourlyAggRow[],
        tz: string,
    ): Map<string, { calls: number; seconds: number }> {
        const map = new Map<string, { calls: number; seconds: number }>();

        for (const row of rows) {
            const localDate = DateTime.fromJSDate(row.bucketStartUtc, { zone: 'utc' })
                .setZone(tz)
                .toISODate()!; // YYYY-MM-DD

            const existing = map.get(localDate) ?? { calls: 0, seconds: 0 };
            existing.calls += row.totalCalls;
            existing.seconds += row.totalSeconds;
            map.set(localDate, existing);
        }

        return map;
    }

    private sumRange(
        map: Map<string, { calls: number; seconds: number }>,
        start: DateTime,
        end: DateTime,
    ): { calls: number; minutes: number } {
        const dayDiff = Math.floor(end.diff(start, 'days').days);
        const totalDays = dayDiff >= 0 ? dayDiff + 1 : 0;

        let calls = 0;
        let seconds = 0;

        for (let i = 0; i < totalDays; i++) {
            const key = start.plus({ days: i }).toISODate()!;
            const val = map.get(key);
            if (val) {
                calls += val.calls;
                seconds += val.seconds;
            }
        }

        return { calls, minutes: seconds / 60 };
    }

    private withChange(current: number, previous: number): MetricWithChange {
        if (!previous) {
            return { value: current, changePercent: current ? 100 : 0 };
        }
        const change = ((current - previous) / previous) * 100;
        return { value: current, changePercent: Math.round(change * 10) / 10 };
    }

    /* ------------------------------------------------------------------ */
    /* CHART: aggregated to day/week/month in current timezone            */
    /* ------------------------------------------------------------------ */

    private async buildChart(
        businessId: string,
        tz: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        groupBy: DateGrouping,
        marketingSourceIds?: string[],
    ): Promise<ChartPoint[]> {
        // Normalize the requested range to bucket boundaries
        const rangeStart = this.normalizeToBucketStart(fromLocal.setZone(tz), groupBy);
        const rangeEnd = this.normalizeToBucketStart(toLocal.setZone(tz), groupBy);

        // Fetch hourly rows for the whole bucket range
        const hourlyRows = await this.fetchHourlyRows(
            businessId,
            rangeStart,
            rangeEnd,
            marketingSourceIds,
        );

        // Map: bucketKey (ISO) -> aggregate
        const bucketMap = new Map<
            string,
            { start: DateTime; calls: number; seconds: number }
        >();

        for (const row of hourlyRows) {
            const localDt = DateTime.fromJSDate(row.bucketStartUtc, { zone: 'utc' }).setZone(tz);

            const bucketStart = this.normalizeToBucketStart(localDt, groupBy);
            const key = bucketStart.toISO()!;

            const existing = bucketMap.get(key) ?? {
                start: bucketStart,
                calls: 0,
                seconds: 0,
            };

            existing.calls += row.totalCalls;
            existing.seconds += row.totalSeconds;

            bucketMap.set(key, existing);
        }

        // Fill missing buckets in [rangeStart, rangeEnd]
        const step = this.bucketStep(groupBy);
        let cursor = rangeStart;

        while (cursor.toMillis() <= rangeEnd.toMillis()) {
            const key = cursor.toISO()!;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, {
                    start: cursor,
                    calls: 0,
                    seconds: 0,
                });
            }
            cursor = cursor.plus(step);
        }

        // Sort buckets by start time
        const buckets = Array.from(bucketMap.values()).sort(
            (a, b) => a.start.toMillis() - b.start.toMillis(),
        );

        // Build chart points with pretty labels based on groupBy
        return buckets.map(({ start, calls, seconds }) => ({
            bucket: this.formatBucketLabel(start, groupBy),
            calls,
            minutes: seconds / 60,
        }));
    }

    /* ------------ helpers ------------ */

    private normalizeToBucketStart(dt: DateTime, groupBy: DateGrouping): DateTime {
        switch (groupBy) {
            case DateGrouping.Week:
                return dt.startOf('week'); // Monday by default in Luxon
            case DateGrouping.Month:
                return dt.startOf('month');
            case DateGrouping.Day:
            default:
                return dt.startOf('day');
        }
    }

    private bucketStep(groupBy: DateGrouping): { days?: number; weeks?: number; months?: number } {
        switch (groupBy) {
            case DateGrouping.Week:
                return { weeks: 1 };
            case DateGrouping.Month:
                return { months: 1 };
            case DateGrouping.Day:
            default:
                return { days: 1 };
        }
    }

    /**
     * What ends up on the X-axis:
     * - Day   -> "2025-11-21"
     * - Week  -> "Week of 2025-11-17"
     * - Month -> "Nov" (or "Nov 2025" if you prefer)
     */
    private formatBucketLabel(start: DateTime, groupBy: DateGrouping): string {
        switch (groupBy) {
            case DateGrouping.Month:
                // "Oct", "Nov", ... (change to 'LLL yyyy' if you want year too)
                return start.toFormat('LLL');

            case DateGrouping.Week:
                // Week of YYYY-MM-DD
                return `Week of ${start.toFormat('yyyy-LL-dd')}`;

            case DateGrouping.Day:
            default:
                // ISO-like date for clarity
                return start.toFormat('yyyy-LL-dd');
        }
    }

}
