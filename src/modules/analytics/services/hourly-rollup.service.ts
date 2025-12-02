import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';

import { CallLog } from 'src/entities/call-log.entity';
import { CallAnalyticsHourly } from 'src/entities/call-analytics-hourly.entity';

@Injectable()
export class HourlyRollupService {
    constructor(
        @InjectRepository(CallAnalyticsHourly)
        private readonly hourlyRepo: Repository<CallAnalyticsHourly>,
    ) { }

    /**
     * Increment hourly analytics for a completed call.
     * Call this when you persist / finalize a CallLog.
     */
    async incrementFromCallLog(call: CallLog): Promise<void> {
        if (!call.callStartedAt || !call.businessId) return;

        const bucketStartUtc = DateTime.fromJSDate(call.callStartedAt)
            .toUTC()
            .startOf('hour')
            .toJSDate();

        const durationSeconds = call.durationSeconds ?? 0;

        await this.hourlyRepo
            .createQueryBuilder()
            .insert()
            .into(CallAnalyticsHourly)
            .values({
                businessId: call.businessId,
                marketingSourceId: call.marketingSourceId ?? null,
                bucketStartUtc,
                totalCalls: 1,
                totalSeconds: durationSeconds,
            })
            .onConflict(
                `("business_id","marketing_source_id","bucket_start_utc")
         DO UPDATE SET
           total_calls   = call_analytics_hourly.total_calls + EXCLUDED.total_calls,
           total_seconds = call_analytics_hourly.total_seconds + EXCLUDED.total_seconds`,
            )
            .execute();
    }
}
