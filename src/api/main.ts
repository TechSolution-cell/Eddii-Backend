import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'body-parser';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
// import * as express from 'express';

// Needed to verify Twilio signatures (access to raw body)
function rawBodyBuffer(req: any, res: any, buf: Buffer, encoding: string) {
  if (buf && buf.length) {
    req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Body parsers (Twilio sends application/x-www-form-urlencoded by default)
  app.use('/twilio', urlencoded({ extended: false, verify: rawBodyBuffer }));
  app.use('/twilio', json({ verify: rawBodyBuffer }));

  // 2) Global body parsers for the rest of your API
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // app.use(express.urlencoded({ extended: true }));
  // app.use(express.json());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true, // OR throw 400 instead of dropping them
      forbidUnknownValues: true // (extra hardening) reject non-objects
    }),
  );

  app.enableCors();


  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);

  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://localhost:${port}`);
}
bootstrap();


