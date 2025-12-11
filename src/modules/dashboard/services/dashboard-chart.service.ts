// dashboard-chart.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { DateTime } from 'luxon';

import { CallVolumeHourly } from 'src/entities/call-volume-hourly.entity';

import { DateGrouping } from '../dto/dashboard-query.dto';
import { ChartPointDto } from '../dto/dashboard-response.dto';

interface HourlyAggRow {
    bucketStartUtc: Date;
    totalCalls: number;
    totalSeconds: number;
}

@Injectable()
export class DashboardChartService {
    private readonly logger = new Logger(DashboardChartService.name);

    constructor(
        @InjectRepository(CallVolumeHourly)
        private readonly volumeHourlyRepo: Repository<CallVolumeHourly>,
    ) { }

    // -------------------------------------------------------------------
    // PUBLIC: infer grouping
    // -------------------------------------------------------------------
    inferGrouping(from: DateTime, to: DateTime): DateGrouping {
        const days = Math.max(1, Math.round(to.diff(from, 'days').days));
        this.logger.debug(`days between: ${days}`);
        if (days <= 31) return DateGrouping.Day;
        if (days <= 180) return DateGrouping.Week;
        return DateGrouping.Month;
    }

    // -------------------------------------------------------------------
    // PUBLIC: build chart
    // -------------------------------------------------------------------
    async buildChart(
        businessId: string,
        tz: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        groupBy: DateGrouping,
        marketingSourceIds: string[],
    ): Promise<ChartPointDto[]> {
        const rangeStart = this.normalizeToBucketStart(fromLocal.setZone(tz), groupBy);
        const rangeEnd = this.normalizeToBucketStart(toLocal.setZone(tz), groupBy);

        const hourlyRows = await this.fetchHourlyRows(
            businessId,
            rangeStart,
            rangeEnd,
            marketingSourceIds,
        );

        const bucketMap = new Map<
            string,
            { start: DateTime; calls: number; seconds: number }
        >();

        for (const row of hourlyRows) {
            const localDt = DateTime.fromJSDate(row.bucketStartUtc, { zone: 'utc' })
                .setZone(tz);

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

        // Fill missing buckets
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

        const buckets = Array.from(bucketMap.values()).sort(
            (a, b) => a.start.toMillis() - b.start.toMillis(),
        );

        return buckets.map(({ start, calls, seconds }) => ({
            bucket: this.formatBucketLabel(start, groupBy),
            calls,
            minutes: seconds / 60,
        }));
    }

    // -------------------------------------------------------------------
    // PRIVATE: fetch hourly volume rows
    // -------------------------------------------------------------------
    private async fetchHourlyRows(
        businessId: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        marketingSourceIds: string[],
    ): Promise<HourlyAggRow[]> {
        const fromUtc = fromLocal.toUTC().startOf('hour');
        const toUtc = toLocal.toUTC().endOf('hour');

        const where: any = {
            businessId,
            bucketStartUtc: Between(fromUtc.toJSDate(), toUtc.toJSDate()),
        };

        if (marketingSourceIds?.length) {
            where.marketingSourceId = In(marketingSourceIds);
        }

        const rows = await this.volumeHourlyRepo.find({
            where,
            select: ['bucketStartUtc', 'totalCalls', 'totalSeconds'],
        });

        return rows.map((r) => ({
            bucketStartUtc: r.bucketStartUtc,
            totalCalls: r.totalCalls,
            totalSeconds: r.totalSeconds,
        }));
    }

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

    private bucketStep(
        groupBy: DateGrouping,
    ): { days?: number; weeks?: number; months?: number } {
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

    private formatBucketLabel(start: DateTime, groupBy: DateGrouping): string {
        switch (groupBy) {
            case DateGrouping.Month:
                return start.toFormat('LLL'); // "Oct", "Nov", ...
            case DateGrouping.Week:
                return `Week of ${start.toFormat('yyyy-LL-dd')}`;
            case DateGrouping.Day:
            default:
                return start.toFormat('yyyy-LL-dd');
        }
    }
}
