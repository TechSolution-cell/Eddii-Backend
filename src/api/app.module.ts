
// ──  Framework & Lib  ──────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';


// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
// import { RECORDING_WORKFLOW_QUEUE } from '../infra/queue/queue.constants';

// ──  App modules/services/providers  ────────────────────────────────────────────────────
import { AppService } from './app.service';
import { AppController } from './app.controller';
// import { BullMQRootModule } from '../infra/queue/bullmq.module';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../modules/auth/auth.module';
import { BusinessesModule } from '../modules/businesses/businesses.module';
import { MarketingSourcesModule } from '../modules/marketing-sources/marketing-sources.module';
import { CallTrackingModule } from '../modules/call-tracking/call-tracking.module';
import { CallLogsModule } from '../modules/call-logs/call-logs.module';
import { TwilioModule } from '../modules/twilio/twilio.module';
import { DashboardModule } from 'src/modules/dashboard/dashboard.module';

import { ConfigService } from '../config/config.service';

// ── Domain (Entities/Repositories/Enums)  ────────────────────────────────────────────────────
import { Business } from '../entities/business.entity';
import { MarketingSource } from '../entities/marketing-source.entity';
import { NumberRoute } from '../entities/number-route.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { CallLog } from '../entities/call-log.entity';
import { CallAnalyticsHourly } from 'src/entities/call-analytics-hourly.entity';


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
        entities: [Business, MarketingSource, CallLog, NumberRoute, TrackingNumber, CallAnalyticsHourly],
        synchronize: true, // use migrations in prod; set true in dev if needed
        logging: cfg.isDev,
        ssl: false
      }),
    }),
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   useFactory: async () => ({
    //     store: await redisStore({
    //       socket: {
    //         host: process.env.REDIS_HOST || 'localhost',
    //         port: Number(process.env.REDIS_PORT) || 6379,
    //       },
    //       password: process.env.REDIS_PASSWORD,
    //       ttl: 30, // default, can override per key
    //     }),
    //   }),
    // }),
    CacheModule.register({
      isGlobal: true,
      ttl: 30, // seconds
    }),
    AuthModule, BusinessesModule, MarketingSourcesModule, CallTrackingModule, TwilioModule, CallLogsModule, DashboardModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
