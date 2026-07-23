import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';

// Global (như RedisModule): mọi module inject AppLoggerService không cần import lại.
// Hạ tầng logging tập trung theo architecture.md §5 (`core/logger/`).
@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {}
