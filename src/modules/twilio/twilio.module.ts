
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { BullModule } from '@nestjs/bullmq';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
// import { RECORDING_WORKFLOW_QUEUE } from '../../infra/queue/queue.constants';

// ──  App modules/services/providers  ────────────────────────────────────────────────────
import { RecordingsModule } from '../recordings/recordings.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TwilioService } from './twilio.service';
import { TwilioController } from './twilio.controller';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { TrackingNumber } from 'src/entities/tracking-number.entity';
import { CallLog } from '../../entities/call-log.entity';
import { NumberRoute } from 'src/entities/number-route.entity';


@Module({
    imports: [
        // BullModule.registerQueue({
        //     name: RECORDING_WORKFLOW_QUEUE
        // }),
        TypeOrmModule.forFeature([TrackingNumber, CallLog, NumberRoute]),
        RecordingsModule,
        CallLogsModule,
        AnalyticsModule
    ],
    providers: [TwilioService],
    controllers: [TwilioController],
    exports: [TwilioService],
})
export class TwilioModule { }
