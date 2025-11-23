import { Inject, Injectable, Logger } from '@nestjs/common';

import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { Readable } from 'stream';

import { retry } from 'src/common/utils';

import { ConfigService } from 'src/config/config.service';

@Injectable()
export class MediaIngestService {
    private readonly logger = new Logger(MediaIngestService.name);

    constructor(
        private readonly cfg: ConfigService,
        @Inject('S3_CLIENT') private readonly s3: S3Client,
        @Inject('TWILIO_AXIOS') private readonly twilioHttp: AxiosInstance,
    ) { }

    private readonly MAX_TWILIO_ATTEMPTS = 2;

    private async s3ObjectExists(bucket: string, key: string): Promise<boolean> {
        try {
            await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            return true;
        } catch (err: any) {
            if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
            // Other errors (e.g., perms, throttling)
            throw err;
        }
    }

    /**
     * Copy a Twilio recording (private media) to S3.
     * Idempotent if you pass an existing s3Key.
     * @returns the s3Key used for storage
     */
    async copyFromTwilio(
        callSid: string,
        recordingUrlBase: string,
        existingS3Key?: string
    ): Promise<string> {
        const srcUrl = /\.(mp3|wav)$/.test(recordingUrlBase) ? recordingUrlBase : `${recordingUrlBase}.mp3`;
        const isWav = srcUrl.toLowerCase().endsWith('.wav');
        const contentType = isWav ? 'audio/wav' : 'audio/mpeg';
        const s3Key = existingS3Key ?? `calls/${callSid}${isWav ? '.wav' : '.mp3'}`;
        const bucket = this.cfg.s3Bucket;

        if (!bucket) throw new Error('S3 bucket not configured.');
        
        // Skip if already uploaded (makes the job idempotent across retries)
        if (await this.s3ObjectExists(bucket, s3Key)) {
            return s3Key;
        }

        const twilioStream = await this.fetchTwilioStreamWithRetry(srcUrl);

        // Optional: pick content-type from Twilio header if present
        const headerCtRaw = twilioStream.headers['content-type'];
        const ct = Array.isArray(headerCtRaw) ? headerCtRaw[0] : (headerCtRaw || contentType);

        const contentLengthHeader = twilioStream.headers['content-length'];
        const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

        // Stream upload to S3 (multipart under the hood; handles large files)
        const uploader = new Upload({
            client: this.s3,
            params: {
                Bucket: this.cfg.s3Bucket,
                Key: s3Key,
                Body: twilioStream.data, // Readable stream, no buffering
                ContentType: ct,
                ContentLength: contentLength, // Optional but nice if known
                // ServerSideEncryption: 'AES256',
            },
            queueSize: 4,   // concurrency
            partSize: 8 * 1024 * 1024, // 8MB parts
            leavePartsOnError: false,
        });

        // Optional: progress hook for metrics
        // uploader.on('httpUploadProgress', (p) => this.metrics.record('s3_upload_progress', p));

        await uploader.done();
        return s3Key;
    }

    /**
     * GET Twilio media URL as a stream with exponential backoff + jitter.
     * Uses the injected Axios client configured with keep-alive.
    */
    private async fetchTwilioStreamWithRetry(
        url: string
    ): Promise<AxiosResponse<Readable>> {
        const attempts = this.MAX_TWILIO_ATTEMPTS ?? 2;

        return await retry<AxiosResponse<Readable>>(
            async () => {
                const resp = await this.twilioHttp.get<Readable>(url, {
                    responseType: 'stream',
                    timeout: 25_000,
                });

                // Retry on 429/5xx by throwing; pass other 4xx through as failures
                if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
                    const err: any = new Error(`Twilio ${resp.status}`);
                    (err.response = resp);
                    throw err;
                }
                if (resp.status >= 400) {
                    // Non-retriable client error
                    throw new Error(`Twilio download failed: ${resp.status}`);
                }

                return resp; // IMPORTANT: return the response so retry() can resolve it
            },
            {
                retries: Math.max(0, attempts - 1),
                shouldRetry: (err: any) => {
                    const status = err?.response?.status;
                    // Retry on network errors (no status), 429, and 5xx
                    return !status || status === 429 || (status >= 500 && status < 600);
                },
                onRetry: (err: any, attemptNo, delayMs) => {
                    const status = err?.response?.status ?? err?.code ?? 'N/A';
                    this.logger?.warn?.(
                        `Twilio media retry ${attemptNo}/${attempts} in ${delayMs}ms (status: ${status})`
                    );
                },
            }
        );
    }

    /**
     * Load an S3 object fully into memory (small/medium files).
     * For very large files, stream to temp file instead.
     */
    async getBuffer(s3Key: string): Promise<{ buffer: Buffer; mimeType: string }> {
        const obj = await this.s3.send(new GetObjectCommand({
            Bucket: this.cfg.s3Bucket,
            Key: s3Key
        }));
        const chunks: Buffer[] = [];
        const body = obj.Body as Readable;
        await new Promise<void>((resolve, reject) => {
            body.on('data', (c) => chunks.push(c instanceof Buffer ? c : Buffer.from(c)));
            body.on('error', reject);
            body.on('end', () => resolve());
        });
        const buffer = Buffer.concat(chunks);
        const mimeType = (obj.ContentType as string) || this.guessMimeByKey(s3Key);
        return { buffer, mimeType };
    }

    private guessMimeByKey(key: string): string {
        if (key.endsWith('.wav')) return 'audio/wav';
        return 'audio/mpeg';
    }

    async getPresignedReadUrl(s3Key: string, expiresInSec = 60 * 30): Promise<string> {
        const cmd = new GetObjectCommand({
            Bucket: this.cfg.s3Bucket,
            Key: s3Key
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresInSec });
    }

    // async copyFromTwilio(callSid: string, recordingUrlBase: string, existingS3Key?: string): Promise<string> {
    //     const srcUrl = /\.(mp3|wav)$/.test(recordingUrlBase) ? recordingUrlBase : `${recordingUrlBase}.mp3`;
    //     const isWav = srcUrl.endsWith('.wav');
    //     const contentType = isWav ? 'audio/wav' : 'audio/mpeg';
    //     const s3Key = existingS3Key ?? `calls/${callSid}${isWav ? '.wav' : '.mp3'}`;

    //     // If caller provided an s3Key, we still upload (caller should check DB idempotency)
    //     const resp = await this.twilioHttp.get<ArrayBuffer>(srcUrl, { responseType: 'arraybuffer' });
    //     if (resp.status >= 400) {
    //         throw new Error(`Twilio download failed: ${resp.status} ${resp.statusText}`);
    //     }

    //     await this.s3.send(
    //         new PutObjectCommand({
    //             Bucket: this.cfg.s3Bucket,
    //             Key: s3Key,
    //             Body: Buffer.from(resp.data),
    //             ContentType: contentType,
    //             // ServerSideEncryption: 'AES256', // or 'aws:kms' + SSEKMSKeyId
    //         }),
    //     );

    //     return s3Key;
    // }
}
