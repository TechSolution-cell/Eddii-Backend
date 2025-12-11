
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ── App modules/services/providers  ─────────────────────────────────────────────
import { ClientsModule } from 'src/infra/clients.module';
import { AnalyticsModule } from '../analytics/analytics.module';

import { CallLogsService } from '../call-logs/call-logs.service';
import { MediaIngestService } from './services/media-ingest.service';
import { TranscriptionService } from './services/transcription.service';
import { AnalysisService } from './services/analysis.service';
import { RecordingWorkflowService } from './services/recording-workflow.service';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { CallLog } from 'src/entities/call-log.entity';

@Module({
    imports: [TypeOrmModule.forFeature([CallLog]), ClientsModule, AnalyticsModule], // S3 client, Twilio axios, etc.
    providers: [
        CallLogsService,
        MediaIngestService,
        TranscriptionService,
        AnalysisService,
        RecordingWorkflowService,
    ],
    exports: [
        RecordingWorkflowService,
        MediaIngestService,
        TranscriptionService,
        AnalysisService,
    ],
})
export class RecordingsModule { }
