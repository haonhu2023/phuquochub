import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OwnerDecisionQueueRepository } from './owner-decision-queue.repository';
import { OwnerDecisionQueueItem, OdqQuestionType, OdqFailSafe, OdqStatus } from './entities/owner-decision-queue.entity';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { AuthorizationService } from '../authz/authorization.service';

// Đầu vào để tạo một câu hỏi theo mẫu 6 mục (chính sách dữ liệu 2026-09-18):
// place_id/candidate_key, field, question_type, nguồn A+B, đề xuất, fail_safe.
export interface EnqueueItemInput {
  placeId?: string;
  candidateKey?: string;
  field?: string;
  questionType: OdqQuestionType;
  sourceAUrl?: string;
  sourceAType?: string;
  sourceBUrl?: string;
  sourceBType?: string;
  conflictSummary: string;
  recommendation: string;
  failSafe: OdqFailSafe;
  actorScope?: string;
  expiresAt?: Date;
}

export interface ResolveItemInput {
  id: string;
  resolvedBy: string;
  resolution: Record<string, unknown>;
}

@Injectable()
export class OwnerDecisionQueueService {
  // AuditModule is @Global() — no explicit import needed in OwnerDecisionQueueModule.
  // AuthorizationService: RbacModule must be imported in OwnerDecisionQueueModule.
  constructor(
    private readonly repo: OwnerDecisionQueueRepository,
    private readonly auditService: AuditService,
    private readonly authzService: AuthorizationService,
  ) {}

  async enqueue(input: EnqueueItemInput): Promise<OwnerDecisionQueueItem> {
    const item = this.repo.create({
      placeId: input.placeId ?? null,
      candidateKey: input.candidateKey ?? null,
      field: input.field ?? null,
      questionType: input.questionType,
      sourceAUrl: input.sourceAUrl ?? null,
      sourceAType: input.sourceAType ?? null,
      sourceBUrl: input.sourceBUrl ?? null,
      sourceBType: input.sourceBType ?? null,
      conflictSummary: input.conflictSummary,
      recommendation: input.recommendation,
      failSafe: input.failSafe,
      status: 'pending',
      actorScope: input.actorScope ?? null,
      expiresAt: input.expiresAt ?? null,
    });
    return this.repo.save(item);
  }

  async enqueueMany(inputs: EnqueueItemInput[]): Promise<OwnerDecisionQueueItem[]> {
    if (inputs.length === 0) return [];
    const items = inputs.map((input) =>
      this.repo.create({
        placeId: input.placeId ?? null,
        candidateKey: input.candidateKey ?? null,
        field: input.field ?? null,
        questionType: input.questionType,
        sourceAUrl: input.sourceAUrl ?? null,
        sourceAType: input.sourceAType ?? null,
        sourceBUrl: input.sourceBUrl ?? null,
        sourceBType: input.sourceBType ?? null,
        conflictSummary: input.conflictSummary,
        recommendation: input.recommendation,
        failSafe: input.failSafe,
        status: 'pending',
        actorScope: input.actorScope ?? null,
        expiresAt: input.expiresAt ?? null,
      }),
    );
    return this.repo.saveMany(items);
  }

  // Scope enforcement: actor needs Place.Approve (global, moderator) OR Place.Edit.Managed
  // scoped to item.placeId (business_owner with managed grant). ADR-015 Model A: businessId === placeId.
  private async assertResolutionAccess(actorId: string, item: OwnerDecisionQueueItem): Promise<void> {
    const isGlobal = await this.authzService.can(actorId, 'Place.Approve');
    if (isGlobal) return;

    if (item.placeId) {
      const placeId = item.placeId;
      const isScoped = await this.authzService.can(
        actorId,
        'Place.Edit.Managed',
        async () => ({
          resourceType: 'place',
          resourceId: placeId,
          businessId: placeId,
          ownerId: null,
        }),
      );
      if (isScoped) return;
    }

    throw new ForbiddenException(
      item.placeId
        ? `No managed access to place ${item.placeId} for this decision`
        : 'Place.Approve required for decisions with no place association',
    );
  }

  async resolve(input: ResolveItemInput): Promise<OwnerDecisionQueueItem> {
    const item = await this.repo.findById(input.id);
    if (!item) throw new NotFoundException(`Owner decision queue item ${input.id} not found`);

    await this.assertResolutionAccess(input.resolvedBy, item);

    const before = { status: item.status, resolvedBy: item.resolvedBy, resolvedAt: item.resolvedAt };
    item.status = 'resolved';
    item.resolvedBy = input.resolvedBy;
    item.resolvedAt = new Date();
    item.resolution = input.resolution;
    const saved = await this.repo.save(item);

    await this.auditService.record({
      event: 'odq.resolved',
      entityType: 'owner_decision_queue',
      entityId: item.id,
      actorId: input.resolvedBy,
      permission: 'Place.Approve',
      scope: item.actorScope ?? undefined,
      result: AuditResult.SUCCESS,
      before,
      after: { status: 'resolved', resolvedBy: input.resolvedBy, resolvedAt: saved.resolvedAt },
      context: { placeId: item.placeId, field: item.field, questionType: item.questionType },
    });

    return saved;
  }

  async withdraw(id: string, resolvedBy: string, reason: string): Promise<OwnerDecisionQueueItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException(`Owner decision queue item ${id} not found`);

    await this.assertResolutionAccess(resolvedBy, item);

    const before = { status: item.status, resolvedBy: item.resolvedBy, resolvedAt: item.resolvedAt };
    item.status = 'withdrawn';
    item.resolvedBy = resolvedBy;
    item.resolvedAt = new Date();
    item.resolution = { action: 'withdrawn', reason };
    const saved = await this.repo.save(item);

    await this.auditService.record({
      event: 'odq.withdrawn',
      entityType: 'owner_decision_queue',
      entityId: item.id,
      actorId: resolvedBy,
      permission: 'Place.Approve',
      scope: item.actorScope ?? undefined,
      result: AuditResult.SUCCESS,
      before,
      after: { status: 'withdrawn', resolvedBy, reason },
      context: { placeId: item.placeId, field: item.field, questionType: item.questionType },
    });

    return saved;
  }

  list(status?: OdqStatus, limit = 50, offset = 0): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.findAll(status, limit, offset);
  }

  getById(id: string): Promise<OwnerDecisionQueueItem | null> {
    return this.repo.findById(id);
  }

  getPendingByPlace(placeId: string): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.findPendingByPlace(placeId);
  }

  getPendingByCandidate(candidateKey: string): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.findPendingByCandidate(candidateKey);
  }

  getByStatus(status: OdqStatus, limit?: number): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.findByStatus(status, limit);
  }

  hasResolvedDecision(placeId: string, field: string): Promise<boolean> {
    return this.repo.hasResolvedDecision(placeId, field);
  }

  hasPendingConflict(placeId: string, field: string): Promise<boolean> {
    return this.repo.hasPendingConflict(placeId, field);
  }
}
