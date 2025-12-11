import { DateGrouping } from './dashboard-query.dto';

/**
 * A numeric metric plus its % change vs a previous period.
 * Example: total calls and change vs previous 7 days.
 */
export interface MetricWithChange {
    value: number;
    changePercent: number;
}

/**
 * All KPIs for a single department + period
 * (Sales or Service, for one time window).
 */
export interface CallSummaryKpis {
    // Total calls + change vs previous comparable period
    totalCalls: MetricWithChange;

    // Raw counts
    connectedCalls: number;
    requestedAppointments: number;
    bookedAppointments: number;

    // Percentage 0–100, e.g. 25 => 25%
    conversationRatePercent: number;
    bookingRatePercent: number;

    // 1–5 (nullable if not enough data)
    avgSentiment: number | null;
}


/**
 * Static summary for a single department (Sales or Service):
 * today, last 7 days, last 30 days.
 */
export interface DepartmentStaticSummary {
    today: CallSummaryKpis;
    last7Days: CallSummaryKpis;
    last30Days: CallSummaryKpis;
}

/**
 * Selected-date-range summary for a single department.
 * This *does* depend on the DateRangePicker + marketing filters.
 */
export interface DepartmentRangeSummary {
    selectedRange: CallSummaryKpis;
}

// ---- Chart types -------------------------------------------------------

export interface ChartPointDto {
    bucket: string; // label (e.g. ISO date / "Week of 2025-11-17" / "Nov")
    calls: number;
    minutes: number;
}

export interface ChartData {
    groupBy: DateGrouping;
    from: string;
    to: string;
    points: ChartPointDto[];
}

// ---- API response shapes ----------------------------------------------

/**
 * 1) STATIC METRICS
 *    - Today / Last 7 Days / Last 30 Days for Sales & Service
 */
export interface DashboardStaticResponseDto {
    summary: {
        sales: DepartmentStaticSummary;
        service: DepartmentStaticSummary;
    };
}

/**
 * 2) SELECTED RANGE + CHART
 *    - Selected range metrics for Sales & Service
 *    - Chart data for the same filters.
 */
export interface DashboardRangeResponseDto {
    summary: {
        sales: DepartmentRangeSummary;
        service: DepartmentRangeSummary;
    };
    chart: ChartData;
}
