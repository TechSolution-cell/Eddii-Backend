import { Injectable, Logger } from '@nestjs/common';

import { MediaIngestService } from './media-ingest.service';
import { TranscriptionService, TranscriptionSummary } from './transcription.service';
import { AnalysisService } from './analysis.service';
import { CallLogsService } from 'src/modules/call-logs/call-logs.service';

@Injectable()
export class RecordingWorkflowService {
    private readonly logger = new Logger(RecordingWorkflowService.name);

    constructor(
        private readonly media: MediaIngestService,
        private readonly transcription: TranscriptionService,
        private readonly analysis: AnalysisService,
        private readonly callLogs: CallLogsService,
    ) { }

    /**
     * - Copies media to S3 if missing
     * - Transcribes if missing
     * - Runs LLM analysis if missing
     */
    async ensureProcessed(callSid: string, recordingUrlBase: string) { // processRecordingPipeline
        this.logger.debug('ensureProcessed started .... ' + callSid);

        if (!recordingUrlBase) return;

        let log = await this.callLogs.findOneBySid(callSid);
        if (!log) {
            this.logger.warn(`Call log not found for ${callSid}`);
            return;
        }

        // 1) Media in S3
        let s3Key = log.recordingObjectKey;
        if (!s3Key) {
            try {
                s3Key = await this.media.copyFromTwilio(callSid, recordingUrlBase);
                await this.callLogs.updateBySid({
                    twilioCallSid: callSid,
                    recordingObjectKey: s3Key
                });
            } catch (err) {
                this.logger.error(`Media copy failed for ${callSid}: ${err}`);
                return; // stop here; retry later
            }
        }


        // 2) Transcript — use URL
        let transcript = log.transcriptText;
        let summary: TranscriptionSummary | undefined;

        if (!transcript) {
            const presigned = await this.media.getPresignedReadUrl(s3Key, 60 * 30); // 30 min
            summary = await this.transcription.transcribeUrl(presigned, { phonecall: true });
            // small safety net: if URL failed (rare), fall back to buffer
            if (!summary) {
                const { buffer, mimeType } = await this.media.getBuffer(s3Key);
                summary = await this.transcription.transcribeBuffer(buffer, mimeType);
            }

            if (!summary || !summary.turns.length) return;

            // 2) Role assignment via OpenAI (using chronological "speakerX: ..." lines)
            summary.turns = await this.analysis.assignRoles(summary.turns);

            // 3) Persist minimal JSON + fullText
            await this.callLogs.updateBySid({
                twilioCallSid: callSid,
                transcriptText: summary.fullText,
                transcriptJson: {
                    turns: summary.turns,
                    language: summary?.language ?? 'en',
                    durationSec: summary.durationSec ?? 0
                },
            });
        }

        // 3) LLM analysis
        log = await this.callLogs.findOneBySid(callSid);  // Get a fresh log.
        const needsIntent = !log?.intent;
        const needsSentiment = log?.sentiment == null;
        const needsResult = !log?.result || log.result === 'none';

        if (needsIntent || needsSentiment || needsResult) {
            try {
                const analysis = await this.analysis.classifyConversation(summary?.turns ?? []);
                if (!analysis) return;
                const { intent, sentiment, result } = analysis;
                await this.callLogs.updateBySid({
                    twilioCallSid: callSid,
                    intent: intent ?? log?.intent,
                    sentiment: sentiment ?? log?.sentiment,
                    result: result ?? log?.result,
                });
            } catch (err) {
                this.logger.error(`Analysis failed for ${callSid}: ${err}`);
                // not fatal; will retry
            }
        }
    }
}
