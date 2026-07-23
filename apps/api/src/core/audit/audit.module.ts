import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';

// Global (như LoggerModule/RedisModule): mọi service inject AuditService không cần import lại.
// Hạ tầng kiểm toán xuyên suốt (ADR-016).
@Global()
@Module({
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
