import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { envValidationSchema } from './env.validation';

// Config toàn cục — nạp .env ở gốc monorepo (một nguồn cho cả FE/BE dev).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
      envFilePath: ['.env', '../../.env'],
    }),
  ],
})
export class AppConfigModule {}
