import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerDecisionQueueItem } from './entities/owner-decision-queue.entity';
import { OwnerDecisionQueueRepository } from './owner-decision-queue.repository';
import { OwnerDecisionQueueService } from './owner-decision-queue.service';
import { OwnerDecisionQueueController } from './owner-decision-queue.controller';
import { RbacModule } from '../rbac/rbac.module';

// Hàng chờ quyết định có cấu trúc — source-first publish pipeline (2026-09-18).
// Controller: GET /owner-decisions, GET /owner-decisions/:id,
//             POST /owner-decisions/:id/resolve, POST /owner-decisions/:id/withdraw.
// GET: Place.Approve (moderator). POST: JWT-only; service enforces Place.Approve (global) OR
// Place.Edit.Managed (scoped to item.placeId) — allows business_owner to resolve their own conflicts.
// AuditModule is @Global() — AuditService available without import. RbacModule: AuthorizationService.
@Module({
  imports: [TypeOrmModule.forFeature([OwnerDecisionQueueItem]), RbacModule],
  controllers: [OwnerDecisionQueueController],
  providers: [OwnerDecisionQueueRepository, OwnerDecisionQueueService],
  exports: [OwnerDecisionQueueService],
})
export class OwnerDecisionQueueModule {}
