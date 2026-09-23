import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { correlationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { securityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { AppLoggerService } from './core/logger/app-logger.service';

async function bootstrap(): Promise<void> {
  // PLACE-030: bufferLogs giữ log phát sinh trước khi useLogger() gắn xong, tránh mất dòng log
  // bootstrap sớm. app.useLogger(...) hoàn thiện TD-03 — một khi gắn, MỌI Logger nội bộ của
  // framework lẫn `new Logger(x)` ở nơi khác trong app đều tự động đi qua AppLoggerService
  // (Logger.overrideLogger), không cần sửa từng call site. AppLoggerService là Scope.TRANSIENT
  // nên PHẢI dùng app.resolve() (async) — app.get() ném lỗi runtime cho provider scoped
  // (xác nhận qua Docker boot thật: "Request and transient-scoped providers can't be used in
  // combination with get() method. Please, use resolve() instead.").
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(await app.resolve(AppLoggerService));

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

  // PLACE-030: gắn TRƯỚC mọi thứ khác — mọi request (kể cả preflight OPTIONS) đều có
  // correlation ID trước khi chạm guard/interceptor/filter nào.
  app.use(correlationIdMiddleware);
  // PLACE-041: security response headers — found missing by the production audit (no `helmet`
  // and no manual equivalent existed).
  app.use(securityHeadersMiddleware);

  app.setGlobalPrefix(prefix);
  app.enableCors({
    origin: allowedOrigins,
    credentials: corsCredentials,
    // 'PUT' added S1 (2026-09-22) — SiteContentAdminController's whole-value-replace upsert route
    // is the first PUT endpoint in this app; found missing here by a real browser preflight
    // failing with "Method PUT is not allowed by Access-Control-Allow-Methods" against the live
    // dev stack (unit/e2e tests never exercise a real CORS preflight, so this was invisible to them).
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalInterceptors(
    new LoggingInterceptor((await app.resolve(AppLoggerService)).setContext('HTTP')),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(
    new AllExceptionsFilter(
      (await app.resolve(AppLoggerService)).setContext(AllExceptionsFilter.name),
    ),
  );
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`API sẵn sàng tại http://localhost:${port}/${prefix}`, 'Bootstrap');
}

void bootstrap();
