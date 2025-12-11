// dashboard-summary.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';

import { CallDepartment } from 'src/common/enums/telephony.enum';
import { CallDepartmentHourlyKpi } from 'src/entities/call-department-hourly-kpi.entity';

import {
    CallSummaryKpis,
    DepartmentStaticSummary,
    DepartmentRangeSummary,
    MetricWithChange,
} from '../dto/dashboard-response.dto';

interface RawKpiStats {
    totalCalls: number;
    connectedCalls: number;
    requestedAppointments: number;
    bookedAppointments: number;
    sentimentSum: number;
    sentimentCount: number;
}

@Injectable()
export class DashboardSummaryService {
    constructor(
        @InjectRepository(CallDepartmentHourlyKpi)
        private readonly kpiHourlyRepo: Repository<CallDepartmentHourlyKpi>,
    ) { }

    // -------------------------------------------------------------------
    // PUBLIC: Static summary for Sales + Service
    // -------------------------------------------------------------------
    async getStaticSummaryForBusiness(
        businessId: string,
        tz: string,
        now: DateTime,
        marketingSourceIds: string[],
    ): Promise<{
        sales: DepartmentStaticSummary;
        service: DepartmentStaticSummary;
    }> {
        const [sales, service] = await Promise.all([
            this.buildStaticSummaryForDepartment(
                businessId,
                CallDepartment.Sales,
                tz,
                now,
                marketingSourceIds,
            ),
            this.buildStaticSummaryForDepartment(
                businessId,
                CallDepartment.Service,
                tz,
                now,
                marketingSourceIds,
            ),
        ]);

        return { sales, service };
    }

    // -------------------------------------------------------------------
    // PUBLIC: Range summary for Sales + Service
    // -------------------------------------------------------------------
    async getRangeSummaryForBusiness(
        businessId: string,
        tz: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        marketingSourceIds: string[],
    ): Promise<{
        sales: DepartmentRangeSummary;
        service: DepartmentRangeSummary;
    }> {
        const [sales, service] = await Promise.all([
            this.buildRangeSummaryForDepartment(
                businessId,
                CallDepartment.Sales,
                tz,
                fromLocal,
                toLocal,
                marketingSourceIds,
            ),
            this.buildRangeSummaryForDepartment(
                businessId,
                CallDepartment.Service,
                tz,
                fromLocal,
                toLocal,
                marketingSourceIds,
            ),
        ]);

        return { sales, service };
    }

    // ---------------------------------------------------------------------
    // STATIC SUMMARY per department
    // ---------------------------------------------------------------------
    private async buildStaticSummaryForDepartment(
        businessId: string,
        department: CallDepartment,
        tz: string,
        now: DateTime,
        marketingSourceIds: string[],
    ): Promise<DepartmentStaticSummary> {

        const todayStart = now.startOf('day');
        const todayEnd = now.endOf('day');

        const yesterdayEnd = todayStart.minus({ seconds: 1 });
        const yesterdayStart = yesterdayEnd.startOf('day');

        const last7Start = todayStart.minus({ days: 6 });
        const last7End = todayEnd;
        const prev7End = last7Start.minus({ seconds: 1 });
        const prev7Start = prev7End.minus({ days: 6 }).startOf('day');

        const last30Start = todayStart.minus({ days: 29 });
        const last30End = todayEnd;
        const prev30End = last30Start.minus({ seconds: 1 });
        const prev30Start = prev30End.minus({ days: 29 }).startOf('day');

        const [
            todayStats,
            yesterdayStats,
            last7Stats,
            prev7Stats,
            last30Stats,
            prev30Stats,
        ] = await Promise.all([
            this.computeRawStatsForRange(businessId, department, todayStart, todayEnd, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, yesterdayStart, yesterdayEnd, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, last7Start, last7End, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, prev7Start, prev7End, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, last30Start, last30End, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, prev30Start, prev30End, tz, marketingSourceIds),
        ]);

        const todayKpis = this.buildKpisFromRaw(
            todayStats,
            yesterdayStats.totalCalls,
        );
        const last7Kpis = this.buildKpisFromRaw(
            last7Stats,
            prev7Stats.totalCalls,
        );
        const last30Kpis = this.buildKpisFromRaw(
            last30Stats,
            prev30Stats.totalCalls,
        );

        const summary: DepartmentStaticSummary = {
            today: todayKpis,
            last7Days: last7Kpis,
            last30Days: last30Kpis,
        };

        return summary;
    }

    // ---------------------------------------------------------------------
    // RANGE SUMMARY per department
    // ---------------------------------------------------------------------
    private async buildRangeSummaryForDepartment(
        businessId: string,
        department: CallDepartment,
        tz: string,
        fromLocal: DateTime,
        toLocal: DateTime,
        marketingSourceIds: string[],
    ): Promise<DepartmentRangeSummary> {
        const fromDayStart = fromLocal.startOf('day');
        const toDayEnd = toLocal.endOf('day');

        const daySpan =
            Math.floor(
                toDayEnd.startOf('day').diff(fromDayStart.startOf('day'), 'days').days,
            ) + 1;

        const prevTo = fromDayStart.minus({ seconds: 1 });
        const prevFrom = prevTo.minus({ days: daySpan - 1 }).startOf('day');

        const [currentStats, prevStats] = await Promise.all([
            this.computeRawStatsForRange(businessId, department, fromDayStart, toDayEnd, tz, marketingSourceIds),
            this.computeRawStatsForRange(businessId, department, prevFrom, prevTo, tz, marketingSourceIds),
        ]);

        const selectedRange = this.buildKpisFromRaw(
            currentStats,
            prevStats.totalCalls,
        );

        const summary: DepartmentRangeSummary = {
            selectedRange,
        };

        return summary;
    }

    // -------------------------------------------------------------------
    // RAW KPI STATS from hourly KPI table (timezone-aware)
    // -------------------------------------------------------------------
    private async computeRawStatsForRange(
        businessId: string,
        department: CallDepartment,
        fromLocal: DateTime,   // in tz
        toLocal: DateTime,     // in tz
        tz: string,
        marketingSourceIds: string[],
    ): Promise<RawKpiStats> {
        const fromUtc = fromLocal.setZone(tz).toUTC().startOf('hour');
        const toUtc = toLocal.setZone(tz).toUTC().endOf('hour');

        const qb = this.kpiHourlyRepo.createQueryBuilder('kpi')
            .where('kpi.businessId = :businessId', { businessId })
            .andWhere('kpi.department = :department', { department })
            .andWhere('kpi.bucketStartUtc BETWEEN :from AND :to', {
                from: fromUtc.toJSDate(),
                to: toUtc.toJSDate(),
            });

        if (marketingSourceIds?.length) {
            qb.andWhere('kpi.marketingSourceId IN (:...marketingSourceIds)', {
                marketingSourceIds,
            });
        }

        qb.select('SUM(kpi.totalCalls)', 'totalCalls')
            .addSelect('SUM(kpi.connectedCalls)', 'connectedCalls')
            .addSelect('SUM(kpi.requestedAppointments)', 'requestedAppointments')
            .addSelect('SUM(kpi.bookedAppointments)', 'bookedAppointments')
            .addSelect('SUM(kpi.sentimentSum)', 'sentimentSum')
            .addSelect('SUM(kpi.sentimentCount)', 'sentimentCount');

        const row = await qb.getRawOne<{
            totalCalls: string | null;
            connectedCalls: string | null;
            requestedAppointments: string | null;
            bookedAppointments: string | null;
            sentimentSum: string | null;
            sentimentCount: string | null;
        }>();

        const toNum = (v: string | null | undefined) => Number(v ?? 0);

        return {
            totalCalls: toNum(row?.totalCalls),
            connectedCalls: toNum(row?.connectedCalls),
            requestedAppointments: toNum(row?.requestedAppointments),
            bookedAppointments: toNum(row?.bookedAppointments),
            sentimentSum: toNum(row?.sentimentSum),
            sentimentCount: toNum(row?.sentimentCount),
        };
    }

    private buildKpisFromRaw(
        current: RawKpiStats,
        previousTotalCalls: number,
    ): CallSummaryKpis {
        const totalCallsMetric = this.withChange(
            current.totalCalls,
            previousTotalCalls,
        );

        const conversationRatePercent =
            current.connectedCalls > 0
                ? Math.round(
                    (current.bookedAppointments / current.connectedCalls) * 100,
                )
                : 0;

        const bookingRatePercent =
            (current.requestedAppointments + current.bookedAppointments) > 0
                ? Math.round(
                    current.bookedAppointments / (current.requestedAppointments + current.bookedAppointments) * 100
                )
                : 0;

        const avgSentiment =
            current.sentimentCount > 0
                ? current.sentimentSum / current.sentimentCount
                : null;

        return {
            totalCalls: totalCallsMetric,
            connectedCalls: current.connectedCalls,
            requestedAppointments: current.requestedAppointments,
            bookedAppointments: current.bookedAppointments,
            conversationRatePercent,
            bookingRatePercent,
            avgSentiment,
        };
    }

    private withChange(current: number, previous: number): MetricWithChange {
        if (!previous) {
            return { value: current, changePercent: current ? 100 : 0 };
        }
        const change = ((current - previous) / previous) * 100;
        return {
            value: current,
            changePercent: Math.round(change * 10) / 10,
        };
    }
}
