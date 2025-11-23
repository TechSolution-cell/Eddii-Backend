import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
    constructor(private readonly cfg: NestConfigService) { }

    get isDev() { return this.cfg.get('NODE_ENV') !== 'production'; }

    get jwtSecret() { return this.cfg.get<string>('JWT_SECRET'); }
    get jwtExpiresIn() { return this.cfg.get<string>('JWT_EXPIRES_IN'); }

    get jwtRefreshSecret() { return this.cfg.get<string>('JWT_REFRESH_SECRET'); }
    get jwtRefreshExpiresIn() { return this.cfg.get<string>('JWT_REFRESH_EXPIRES_IN'); }
    get jwtRefreshExpiresInRemember() { return this.cfg.get<string>('JWT_REFRESH_EXPIRES_IN_REMEMBER'); }

    get dbHost() { return this.cfg.get<string>('DB_HOST'); }
    get dbPort() { return Number(this.cfg.get<number>('DB_PORT')); }
    get dbName() { return this.cfg.get<string>('DB_NAME'); }
    get dbUser() { return this.cfg.get<string>('DB_USER'); }
    get dbPass() { return this.cfg.get<string>('DB_PASS'); }

    get twilioAccountSid() { return this.cfg.get<string>('TWILIO_ACCOUNT_SID'); }
    get twilioAuthToken() { return this.cfg.get<string>('TWILIO_AUTH_TOKEN'); }
    get twilioWebhookBase() { return this.cfg.get<string>('TWILIO_WEBHOOK_BASE_URL'); }

    get awsRegion() { return this.cfg.get<string>('AWS_REGION'); }
    get awsAccessKeyId() { return this.cfg.get<string>('AWS_ACCESS_KEY_ID'); }
    get awsSecretAccessKey() { return this.cfg.get<string>('AWS_SECRET_ACCESS_KEY'); }
    get s3Bucket() { return this.cfg.get<string>('S3_BUCKET'); }

    get deepgramApiKey() { return this.cfg.get<string>('DEEPGRAM_API_KEY'); }

    get openAIApiKey() { return this.cfg.get<string>('OPENAI_API_KEY'); }

    get redisHost() { return this.cfg.get<string>('REDIS_HOST'); }
    get redisPort() { return this.cfg.get<number>('REDIS_PORT'); }
    get redisUserName() { return this.cfg.get<string>('REDIS_USERNAME'); }
    get redisPassword() { return this.cfg.get<string>('REDIS_PASSWORD'); }
    get bullPrefix() { return this.cfg.get<string>('BULL_PREFIX'); }
    get workerConcurrency() { return this.cfg.get<number>('WORKER_CONCURRENCY'); }
}
