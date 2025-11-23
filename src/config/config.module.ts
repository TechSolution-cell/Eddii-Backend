import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfig } from '@nestjs/config';
import { envSchema } from './env.validation';
import { ConfigService } from './config.service'

@Global()
@Module({
    imports: [
        NestConfig.forRoot({
            isGlobal: true,
            envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
            validationSchema: envSchema,
        }),
    ],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule { }



