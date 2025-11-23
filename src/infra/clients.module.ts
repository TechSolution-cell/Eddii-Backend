import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import axios from 'axios';
import OpenAI from 'openai';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

import { ConfigModule } from 'src/config/config.module';
import { ConfigService } from 'src/config/config.service';


// Shared keep-alive agents (singletons)
// Tune socket limits to your worker concurrency.
//
const HTTP_AGENT = new HttpAgent({
    keepAlive: true,
    maxSockets: 512,
    maxFreeSockets: 64,
    keepAliveMsecs: 30_000,
});
const HTTPS_AGENT = new HttpsAgent({
    keepAlive: true,
    maxSockets: 512,
    maxFreeSockets: 64,
    keepAliveMsecs: 30_000,
});


@Module({
    imports: [
        ConfigModule,
    ],
    providers: [
        {
            provide: 'S3_CLIENT',
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const region = config.awsRegion;
                if (!region) {
                    throw new Error('AWS_REGION not set');
                }

                const creds =
                    config.awsAccessKeyId && config.awsSecretAccessKey
                        ? { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey }
                        : undefined; // default provider chain

                // Attach keep-alive & timeouts via Smithy NodeHttpHandler
                const requestHandler = new NodeHttpHandler({
                    httpAgent: HTTP_AGENT,
                    httpsAgent: HTTPS_AGENT,
                    connectionTimeout: 5_000, // ms to establish TCP/TLS
                    socketTimeout: 120_000,   // ms total inactivity per request
                });

                return new S3Client({
                    region,
                    credentials: creds,
                    requestHandler
                });

            },
        },
        {
            provide: 'TWILIO_AXIOS',
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const accountSid = config.twilioAccountSid!;
                const authToken = config.twilioAuthToken!;
                if (!accountSid || !authToken) {
                    throw new Error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set');
                }
                return axios.create({
                    auth: { username: accountSid, password: authToken }, // HTTP Basic Auth
                    // Optional: keep-alive
                    // httpAgent: new (require('http').Agent)({ keepAlive: true }),
                    // httpsAgent: new (require('https').Agent)({ keepAlive: true }),
                    httpAgent: HTTP_AGENT,
                    httpsAgent: HTTPS_AGENT,
                    timeout: 25_000,             // end-to-end request timeout
                    maxBodyLength: Infinity,     // allow streaming large media
                    maxContentLength: Infinity,
                    // Validate status manually if you prefer:
                    // validateStatus: (s) => s < 500, // retry on 5xx in your calling code
                });
            },
        },
        {
            provide: 'OPENAI',
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const apiKey = config.openAIApiKey;
                if (!apiKey) {
                    // Keep your previous behavior (return null) or throw; throwing is safer for DI.
                    throw new Error('OPENAI_API_KEY not set');
                    // return null;
                }
                return new OpenAI({
                    apiKey,
                    // Optional overrides:
                    // baseURL: config.openAIBaseUrl, // e.g. for proxies / Azure OpenAI-compatible endpoints
                    // organization: config.openAIOrgId,
                    // project: config.openAIProjectId,
                });

            },
        },
    ],
    exports: ['S3_CLIENT', 'TWILIO_AXIOS', 'OPENAI'],
})
export class ClientsModule { }
