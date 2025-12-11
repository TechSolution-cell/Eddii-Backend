import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';

import { CallLog } from 'src/entities/call-log.entity';
import { CallVolumeHourly } from 'src/entities/call-volume-hourly.entity';
import { CallDepartmentHourlyKpi } from 'src/entities/call-department-hourly-kpi.entity';
import { CallResult } from 'src/common/enums/telephony.enum';

type RollupContext = {
    bucketStartUtc: Date;
    durationSeconds: number;
    marketingSourceId: string | null;
};

@Injectable()
export class HourlyRollupService {
    constructor(
        @InjectRepository(CallVolumeHourly)
        private readonly volumeRepo: Repository<CallVolumeHourly>,

        @InjectRepository(CallDepartmentHourlyKpi)
        private readonly kpiRepo: Repository<CallDepartmentHourlyKpi>,
    ) { }

    /**
     * Main entry: update both hourly aggregates (volume + KPIs)
     * from a finalized CallLog.
     */
    async updateHourlyAggregatesFromCallLog(callLog: CallLog): Promise<void> {
        if (!this.canRollup(callLog)) return;

        const ctx = this.buildRollupContext(callLog);

        // Run in parallel; if you prefer sequential, just await them one by one.
        await Promise.all([
            this.updateVolumeFromContext(callLog, ctx),
            this.updateDepartmentKpisFromContext(callLog, ctx),
        ]);
    }

    /**
     * Optional: if you ever want to update ONLY the volume table.
     */
    async updateVolumeFromCallLog(callLog: CallLog): Promise<void> {
        if (!this.canRollup(callLog)) return;
        const ctx = this.buildRollupContext(callLog);
        await this.updateVolumeFromContext(callLog, ctx);
    }

    /**
     * Optional: if you ever want to update ONLY the department KPI table.
     */
    async updateDepartmentKpisFromCallLog(callLog: CallLog): Promise<void> {
        if (!this.canRollup(callLog)) return;
        const ctx = this.buildRollupContext(callLog);
        await this.updateDepartmentKpisFromContext(callLog, ctx);
    }

    /* ------------------------------------------------------------------ */
    /* Private helpers                                                    */
    /* ------------------------------------------------------------------ */

    private canRollup(callLog: CallLog): boolean {
        return !!(callLog.callStartedAt && callLog.businessId);
    }

    private buildRollupContext(callLog: CallLog): RollupContext {
        const bucketStartUtc = DateTime.fromJSDate(callLog.callStartedAt!)
            .toUTC()
            .startOf('hour')
            .toJSDate();

        const durationSeconds = callLog.durationSeconds ?? 0;
        const marketingSourceId = callLog.marketingSourceId ?? null;

        return { bucketStartUtc, durationSeconds, marketingSourceId };
    }

    // ---- PART 1: CallVolumeHourly --------------------------------------

    private async updateVolumeFromContext(
        callLog: CallLog,
        ctx: RollupContext,
    ): Promise<void> {
        const { bucketStartUtc, durationSeconds, marketingSourceId } = ctx;

        await this.volumeRepo
            .createQueryBuilder()
            .insert()
            .into(CallVolumeHourly)
            .values({
                businessId: callLog.businessId,
                marketingSourceId,
                bucketStartUtc,
                totalCalls: 1,
                totalSeconds: durationSeconds,
            })
            .onConflict(
                `("business_id","marketing_source_id","bucket_start_utc")
         DO UPDATE SET
           total_calls   = call_volume_hourly.total_calls   + EXCLUDED.total_calls,
           total_seconds = call_volume_hourly.total_seconds + EXCLUDED.total_seconds`,
            )
            .execute();

        // NOTE: if your table is still named "call_analytics_hourly",
        // change "call_volume_hourly" above to "call_analytics_hourly".
    }

    // ---- PART 2: CallDepartmentHourlyKpi -------------------------------

    private async updateDepartmentKpisFromContext(
        callLog: CallLog,
        ctx: RollupContext,
    ): Promise<void> {
        const { bucketStartUtc, durationSeconds, marketingSourceId } = ctx;

        const {
            connectedCalls,
            requestedAppointments,
            bookedAppointments,
            sentimentSum,
            sentimentCount,
        } = this.buildKpiIncrements(callLog);

        await this.kpiRepo
            .createQueryBuilder()
            .insert()
            .into(CallDepartmentHourlyKpi)
            .values({
                businessId: callLog.businessId,
                department: callLog.department, // CallDepartment enum
                marketingSourceId,
                bucketStartUtc,
                totalCalls: 1,
                connectedCalls,
                requestedAppointments,
                bookedAppointments,
                sentimentSum,
                sentimentCount,
                totalSeconds: durationSeconds,
            })
            .onConflict(
                `("business_id","department","marketing_source_id","bucket_start_utc")
         DO UPDATE SET
           total_calls            = call_department_hourly_kpis.total_calls            + EXCLUDED.total_calls,
           connected_calls        = call_department_hourly_kpis.connected_calls        + EXCLUDED.connected_calls,
           requested_appointments = call_department_hourly_kpis.requested_appointments + EXCLUDED.requested_appointments,
           booked_appointments    = call_department_hourly_kpis.booked_appointments    + EXCLUDED.booked_appointments,
           sentiment_sum          = call_department_hourly_kpis.sentiment_sum          + EXCLUDED.sentiment_sum,
           sentiment_count        = call_department_hourly_kpis.sentiment_count        + EXCLUDED.sentiment_count,
           total_seconds          = call_department_hourly_kpis.total_seconds          + EXCLUDED.total_seconds`,
            )
            .execute();
    }

    private buildKpiIncrements(callLog: CallLog) {
        const result = callLog.result;

        // "Connected" = anything that is not NotConnected.
        const connectedCalls =
            result && result !== CallResult.NotConnected ? 1 : 0;

        const requestedAppointments =
            result === CallResult.AppointmentRequested ? 1 : 0;

        // "Booked" = actually booked or rescheduled
        const bookedAppointments =
            result === CallResult.AppointmentBooked ||
                result === CallResult.AppointmentRescheduled
                ? 1
                : 0;

        const sentiment = callLog.sentiment ?? null;
        const sentimentSum = sentiment ?? 0;
        const sentimentCount = sentiment != null ? 1 : 0;

        return {
            connectedCalls,
            requestedAppointments,
            bookedAppointments,
            sentimentSum,
            sentimentCount,
        };
    }
}
