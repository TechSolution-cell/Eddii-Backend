import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import {
    RECORDING_WORKFLOW_QUEUE,
    JOB_ENSURE_PROCESSED,
    EnsureProcessedJob
} from '../../infra/queue/queue.constants';

import { RecordingWorkflowService } from './services/recording-workflow.service';

@Processor(RECORDING_WORKFLOW_QUEUE, {
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
})
export class RecordingWorkflowProcessor extends WorkerHost {
    constructor(
        private readonly workflow: RecordingWorkflowService) { super(); }

    private readonly logger = new Logger(RecordingWorkflowProcessor.name);

    async process(job: Job<EnsureProcessedJob>): Promise<void> {
        this.logger.debug('process: recordingProcessWorkflow');
        
        switch (job.name) {
            case JOB_ENSURE_PROCESSED: {
                const { callSid, recordingUrlBase } = job.data;
                await this.workflow.ensureProcessed(callSid, recordingUrlBase);
                return;
            }
            default:
                return;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        console.log(`Job ${job.id} for ${job.data.to} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job | undefined, err: Error) {
        console.error(`Job ${job?.id} failed:`, err);
    }
}
