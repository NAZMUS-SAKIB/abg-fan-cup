import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const raw = config.get<string>('CORS_ORIGIN') || 'http://localhost:4200';
  const listed = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowAll = listed.includes('*');

  const cors: CorsOptions = {
    origin: allowAll
      ? true
      : (
          origin: string | undefined,
          cb: (err: Error | null, allow?: boolean) => void,
        ) => {
          if (!origin || listed.includes(origin)) {
            cb(null, true);
          } else {
            cb(null, false);
          }
        },
    credentials: !allowAll,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  app.enableCors(cors);

  app.enableShutdownHooks();

  const port = Number(config.get('PORT') || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`ABG Fan Cup API listening on :${port}`);
}
bootstrap();