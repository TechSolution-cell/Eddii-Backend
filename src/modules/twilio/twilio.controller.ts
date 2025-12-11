
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { Body, Controller, Headers, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';

// ── Internal shared/utils  ───────────────────────────────────────────────────────
// import {
//     RECORDING_WORKFLOW_QUEUE,
//     JOB_ENSURE_PROCESSED,
//     EnsureProcessedJob
// } from '../../infra/queue/queue.constants';

// ── App modules/services/providers  ─────────────────────────────────────────────
import { TwilioService } from './twilio.service';
import { CallLogsService } from '../call-logs/call-logs.service';
import { HourlyRollupService } from '../analytics/services/hourly-rollup.service';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { TrackingNumber } from 'src/entities/tracking-number.entity';
import { NumberRoute } from 'src/entities/number-route.entity';
import { CallDirection, CallResult, CallStatus } from 'src/common/enums/telephony.enum';
import { NumberRouteStatus } from 'src/common/enums/phone-number.enum';
import { TrackingNumberStatus } from 'src/common/enums/phone-number.enum';

@Controller('twilio')
export class TwilioController {
    constructor(
        private readonly twilio: TwilioService,
        private readonly callLogs: CallLogsService,
        private readonly hourlyRollupService: HourlyRollupService,
        // @InjectQueue(RECORDING_WORKFLOW_QUEUE) private readonly queue: Queue<EnsureProcessedJob>,
        @InjectRepository(TrackingNumber) private readonly tnRepo: Repository<TrackingNumber>,
        @InjectRepository(NumberRoute) private readonly nrRepo: Repository<NumberRoute>
    ) { }

    private readonly logger = new Logger(TwilioController.name);

    /**
     * Incoming call webhook: returns TwiML to forward the call and starts a log row.
     * Twilio sends form-encoded payload with fields like To, From, CallSid.
     */
    @Post('voice')
    @HttpCode(200)
    async voice(
        @Body() body: any,
        @Headers('x-twilio-signature') signature: string,
        @Res() res: Response,
    ) {

        this.logger.debug('voice ----------- ' + String(body?.CallSid ?? ''));

        this.twilio.verifyOrThrow('/twilio/voice', body, signature);

        const to = String(body?.To ?? '');      // tracking number (E.164)
        const from = String(body?.From ?? '');  // caller
        const callSid = String(body?.CallSid ?? '');

        const sendTwiML = (xml: string) => {
            res.setHeader('Content-Type', 'text/xml');
            res.setHeader('Cache-Control', 'no-store');
            return res.send(xml);
        };

        // small helper to return TwiML consistently
        const sayAndHangup = (message: string) =>
            `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>${message}</Say>
          <Hangup/>
        </Response>`;

        try {
            // 1) Validate that the dialed number is one of our active tracking numbers
            const tn = await this.tnRepo.findOne({
                where: {
                    number: to,
                    status: TrackingNumberStatus.Active
                }
            });

            this.logger.debug('To: ' + to);

            if (!tn) {
                this.logger.error('Number not recognized.');
                return sendTwiML(sayAndHangup('Number not recognized.'));
            }

            // 2) Get the active routing rule for that tracking number
            const nr = await this.nrRepo.findOne({
                where: {
                    trackingNumberId: tn.id,
                    status: NumberRouteStatus.Active
                }
            });
            if (!nr?.forwardingVoiceNumber) {
                this.logger.error('Forwarding Number not found.');
                return sendTwiML(sayAndHangup('Number not recognized.'));
            }

            // 3) Create a call log
            await this.callLogs.createBySid({
                twilioCallSid: callSid,
                businessId: tn.businessId,
                marketingSourceId: tn.marketingSourceId,
                trackingNumberId: tn.id,
                callerNumber: from,
                receiverNumber: nr.forwardingVoiceNumber!,
                direction: CallDirection.Inbound,
                status: CallStatus.InProgress,
                callStartedAt: new Date(),
            });

            const xml = this.twilio.buildForwardTwiML(
                nr.forwardingVoiceNumber!,
                from // <-- callerIdE164
            );

            this.logger.debug(xml);
            return sendTwiML(xml);
        } catch (err: any) {
            this.logger.error(err?.message);
            return sendTwiML(sayAndHangup('Number not recognized.'));
        }
    }

    /**
     * Call status callback from Twilio
     * Body fields: CallSid, CallStatus, CallDuration, To, From, Direction, Timestamp, etc.
     */
    @Post('call-status')
    @HttpCode(200)
    async callStatus(
        @Body() body: any,
        @Headers('x-twilio-signature') signature: string,
    ) {
        this.twilio.verifyOrThrow('/twilio/call-status', body, signature);

        const callSid = body.CallSid as string;
        // const status = (body.CallStatus as string) ?? 'unknown';
        const rawStatus = (body.CallStatus as string | undefined)?.toLowerCase();
        const allowedStatuses = new Set<CallStatus>([
            CallStatus.Queued,
            CallStatus.Ringing,
            CallStatus.InProgress,
            CallStatus.Completed,
            CallStatus.Busy,
            CallStatus.Failed,
            CallStatus.NoAnswer,
            CallStatus.Canceled,
            CallStatus.Unknown,
        ]);
        const status: CallStatus = rawStatus && allowedStatuses.has(rawStatus as CallStatus)
            ? (rawStatus as CallStatus)
            : CallStatus.Unknown;
        const duration = body.CallDuration ? parseInt(body.CallDuration, 10) : undefined;

        // For calls that never connect (busy / failed / no-answer / canceled),
        // mark them as NotConnected and update BOTH volume + KPI hourly aggregates.
        if (status === CallStatus.Busy ||
            status === CallStatus.Failed ||
            status === CallStatus.NoAnswer ||
            status === CallStatus.Canceled) {
            const saved = await this.callLogs.updateBySid({
                twilioCallSid: callSid,
                status,
                result: CallResult.NotConnected,
                durationSeconds: Number.isFinite(duration) ? duration : 0,
            });

            void this.hourlyRollupService.updateHourlyAggregatesFromCallLog(saved);
        }

        // For fully completed calls, update ONLY the hourly volume rollup.
        // (Department / result / sentiment KPIs will be rolled up later once classified.)
        if (status === CallStatus.Completed) {
            const saved = await this.callLogs.updateBySid({
                twilioCallSid: callSid,
                status,
                durationSeconds: Number.isFinite(duration) ? duration : 0,
            });
            void this.hourlyRollupService.updateVolumeFromCallLog(saved);
        }

        return 'OK';
    }

    /**
    * Recording callback: updates recording_url
    * Body fields: CallSid, RecordingUrl, RecordingStatus, RecordingDuration, etc.
    */
    @Post('recording')
    @HttpCode(200)
    async recording(
        @Body() body: any,
        @Headers('x-twilio-signature') signature: string,
    ) {
        this.twilio.verifyOrThrow('/twilio/recording', body, signature);
        const callSid = body.CallSid as string;
        const recordingUrlBase = body.RecordingUrl as string;
        const recordingStatus = (body.RecordingStatus as string | undefined)?.toLowerCase();

        // Only proceed when Twilio says the recording is ready
        // (Twilio will call this route with status=completed if you set recordingStatusCallbackEvent)
        if (recordingStatus && recordingStatus !== 'completed') return 'OK';

        // Persist the raw URL first (handy for debugging)
        if (recordingUrlBase) {
            await this.callLogs.updateBySid({
                twilioCallSid: callSid,
                recordingUrl: recordingUrlBase,
            });

            // Kick off async processing (idempotent jobId helps with Twilio retries)
            // await this.queue.add(
            //     JOB_ENSURE_PROCESSED,
            //     { callSid, recordingUrlBase },
            //     {
            //         attempts: 3,
            //         backoff: { type: 'exponential', delay: 30_000 },
            //         removeOnComplete: { age: 3600, count: 1000 },
            //         removeOnFail: 200,
            //         jobId: `ensure-${callSid}`, // idempotent across Twilio retries
            //     },
            // );
        }


        // Option 1: fire-and-forget (fast webhook). Log errors inside service.
        // this.workflow.ensureProcessed(callSid, recordingUrlBase);

        // Option 2: await if you prefer to ensure backfill before returning:
        // await this.recordingIngest.backfillFromTwilio(callSid, recordingUrl);

        return 'OK';
    }

    /**
   * Recording callback test: updates recording_url
   * Body fields: CallSid, RecordingUrl, RecordingStatus, RecordingDuration, etc.
   */
    @Post('test')
    async test(
        @Body() body: any,
    ) {
        const callSid = body.CallSid as string;
        const recordingUrlBase = body.RecordingUrl as string;

        // Kick off async processing (idempotent jobId helps with Twilio retries)
        // await this.queue.add(
        //     JOB_ENSURE_PROCESSED,
        //     { callSid, recordingUrlBase },
        //     {
        //         attempts: 2,
        //         backoff: { type: 'exponential', delay: 30_000 },
        //         removeOnComplete: { age: 3600, count: 1000 },
        //         removeOnFail: 200,
        //         jobId: `ensure-${callSid}`, // idempotent across Twilio retries
        //     },
        // );

        return 'OK';
    }

}
