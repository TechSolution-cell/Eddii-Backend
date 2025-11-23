// import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bullmq';
// import { ConfigModule } from 'src/config/config.module';
// import { ConfigService } from 'src/config/config.service';
// import type { RedisOptions } from 'ioredis';

// @Module({
//     imports: [
//         ConfigModule,
//         BullModule.forRootAsync({
//             imports: [ConfigModule],
//             inject: [ConfigService],
//             useFactory: (config: ConfigService) => {
//                 const connection: RedisOptions = {
//                     // ✅ ElastiCache for Valkey endpoint + port
//                     // e.g. my-cache.xxxxxx.use1.cache.amazonaws.com
//                     host: config.redisHost,
//                     port: config.redisPort ?? 6379,

//                     // ✅ If you enabled AUTH (recommended)
//                     // For Valkey serverless, this is usually the auth token
//                     // username: config.redisUserName, // optional, often omitted
//                     // password: config.redisPassword,

//                     // BullMQ recommendation when using ioredis with clusters / ElastiCache
//                     maxRetriesPerRequest: null,
//                 };

//                 // ✅ Enable TLS if your Valkey cache requires in-transit encryption
//                 // (Serverless Valkey does by default)
//                 // if (config.valkeyTlsEnabled) {
//                 (connection as any).tls = {}; // minimal TLS config; certs are handled by AWS CA
//                 // }

//                 return {
//                     connection,
//                     // Queue key prefix (unchanged)
//                     prefix: config.bullPrefix ?? 'bull',
//                 };
//             },
//         }),
//     ],
//     exports: [BullModule],
// })
// export class BullMQRootModule { }
