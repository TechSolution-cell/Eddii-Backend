import { DateGrouping } from "./dashboard-query.dto";

export interface MetricWithChange {
    value: number;
    changePercent: number; // vs previous period
}

export interface SummaryMetrics {
    callsToday: MetricWithChange;
    callsLast7Days: MetricWithChange;
    callsLast30Days: MetricWithChange;
    minutesToday: MetricWithChange;
    minutesLast7Days: MetricWithChange;
    minutesLast30Days: MetricWithChange;
}

export interface ChartPoint {
    bucket: string; // ISO date/time string
    calls: number;
    minutes: number;
}

export interface DashboardResponseDto {
    summary: SummaryMetrics;
    chart: {
        groupBy: DateGrouping;
        from: string;
        to: string;
        points: ChartPoint[];
    };
}