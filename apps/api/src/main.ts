import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const prefix = config.get<string>('api.globalPrefix') ?? 'api';
  const port = config.get<number>('api.port') ?? 4000;
  const trustProxyHops = config.get<number>('trustProxyHops') ?? 0;
  const allowedOrigins = config.get<string[]>('cors.allowedOrigins') ?? [];
  const corsCredentials = config.get<boolean>('cors.credentials') ?? false;

  // PLACE-028 (OD2-13): chỉ tin tưởng header forwarded từ N hop reverse-proxy đã xác nhận triển
  // khai (mặc định 0 — chưa có proxy thật, không tin bất kỳ header X-Forwarded-* nào).
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.setGlobalPrefix(prefix);
  app.enableCors({
    origin: allowedOrigins,
    credentials: corsCredentials,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`API sẵn sàng tại http://localhost:${port}/${prefix}`, 'Bootstrap');
}

void bootstrap();
