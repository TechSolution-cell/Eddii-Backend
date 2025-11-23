// ──  Framework & Lib  ──────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

// import { BullMQRootModule } from 'src/infra/queue/bullmq.module';
// import { RECORDING_WORKFLOW_QUEUE } from 'src/infra/queue/queue.constants';

// ──  App modules/services/providers  ────────────────────────────────────────────────────
import { ClientsModule } from 'src/infra/clients.module';
import { CallLogsModule } from 'src/modules/call-logs/call-logs.module';
import { ConfigModule } from '../config/config.module';
// import { RecordingWorkflowProcessor } from 'src/modules/recordings/recording.processor';
import { RecordingsModule } from 'src/modules/recordings/recordings.module';

// import { RecordingWorkflowService } from 'src/modules/recordings/services/recording-workflow.service';
// import { MediaIngestService } from 'src/modules/recordings/services/media-ingest.service';
// import { TranscriptionService } from 'src/modules/recordings/services/transcription.service';
// import { AnalysisService } from 'src/modules/recordings/services/analysis.service';
import { ConfigService } from '../config/config.service';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { Business } from '../entities/business.entity';
import { MarketingSource } from '../entities/marketing-source.entity';
import { NumberRoute } from '../entities/number-route.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { CallLog } from '../entities/call-log.entity';


@Module({
  imports: [
    // BullMQRootModule,
    // BullModule.registerQueue({ name: RECORDING_WORKFLOW_QUEUE }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.dbHost,
        port: cfg.dbPort,
        username: cfg.dbUser,
        password: cfg.dbPass,
        database: cfg.dbName,
        entities: [Business, MarketingSource, CallLog, NumberRoute, TrackingNumber],
        synchronize: true, // use migrations in prod; set true in dev if needed
        logging: cfg.isDev,
      }),
    }),
    ClientsModule, CallLogsModule, RecordingsModule
  ],
  providers: [
    // RecordingWorkflowProcessor,
    // RecordingWorkflowService,
    // MediaIngestService,
    // TranscriptionService,
    // AnalysisService,
  ],
})
export class WorkerModule { }
