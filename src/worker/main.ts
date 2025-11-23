import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
    // Application context only; no HTTP server
    await NestFactory.createApplicationContext(WorkerModule, {
        logger: ['log', 'error', 'warn'],
    });
    // Keep process alive; BullMQ workers run inside the context
}
bootstrap();
