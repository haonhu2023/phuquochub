/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerDecisionQueueService } from './owner-decision-queue.service';
import { OwnerDecisionQueueItem } from './entities/owner-decision-queue.entity';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof OwnerDecisionQueueService>;

const makeItem = (overrides: Partial<OwnerDecisionQueueItem> = {}): OwnerDecisionQueueItem =>
  ({
    id: 'item-uuid',
    placeId: 'place-uuid',
    candidateKey: 'test-001',
    field: 'phone',
    questionType: 'contact_conflict',
    sourceAUrl: 'https://official.com',
    sourceAType: 'official_website',
    sourceBUrl: 'https://osm.org/node/1',
    sourceBType: 'openstreetmap',
    conflictSummary: 'Phone conflict',
    recommendation: 'Use official website value',
    failSafe: 'hold_publish',
    status: 'pending',
    resolvedBy: null,
    resolvedAt: null,
    resolution: null,
    actorScope: 'place:place-uuid:field:phone',
    expiresAt: null,
    createdAt: new Date('2026-09-18'),
    updatedAt: new Date('2026-09-18'),
    ...overrides,
  } as OwnerDecisionQueueItem);

describe('OwnerDecisionQueueService', () => {
  let repo: LooseMock<Ctor[0]>;
  let auditService: LooseMock<Ctor[1]>;
  let authzService: LooseMock<Ctor[2]>;
  let service: OwnerDecisionQueueService;

  beforeEach(() => {
    repo = createMock<Ctor[0]>({
      findById: jest.fn(),
      save: jest.fn().mockImplementation((item) => Promise.resolve(item)),
      create: jest.fn().mockImplementation((d) => d),
      findPendingByPlace: jest.fn().mockResolvedValue([]),
      findPendingByCandidate: jest.fn().mockResolvedValue([]),
      findByStatus: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      hasResolvedDecision: jest.fn().mockResolvedValue(false),
      hasPendingConflict: jest.fn().mockResolvedValue(false),
      saveMany: jest.fn().mockResolvedValue([]),
    });
    auditService = createMock<Ctor[1]>({
      record: jest.fn().mockResolvedValue(undefined),
    });
    // Default: actor has Place.Approve (global) — all existing tests remain unaffected.
    authzService = createMock<Ctor[2]>({
      can: jest.fn().mockResolvedValue(true),
    });

    service = new OwnerDecisionQueueService(repo as any, auditService as any, authzService as any);
  });

  describe('resolve', () => {
    it('throws NotFoundException when item not found', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(
        service.resolve({ id: 'missing-uuid', resolvedBy: 'actor-uuid', resolution: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates item status to resolved', async () => {
      const item = makeItem();
      (repo.findById as jest.Mock).mockResolvedValue(item);

      const result = await service.resolve({
        id: 'item-uuid',
        resolvedBy: 'actor-uuid',
        resolution: { chosenSourceUrl: 'https://official.com' },
      });

      expect(result.status).toBe('resolved');
      expect(result.resolvedBy).toBe('actor-uuid');
      expect(result.resolution).toEqual({ chosenSourceUrl: 'https://official.com' });
    });

    it('records audit event with odq.resolved', async () => {
      const item = makeItem();
      (repo.findById as jest.Mock).mockResolvedValue(item);

      await service.resolve({ id: 'item-uuid', resolvedBy: 'actor-uuid', resolution: {} });

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'odq.resolved',
          entityType: 'owner_decision_queue',
          entityId: 'item-uuid',
          actorId: 'actor-uuid',
          permission: 'Place.Approve',
          scope: 'place:place-uuid:field:phone',
        }),
      );
    });

    it('captures scope from item.actorScope in audit event', async () => {
      const item = makeItem({ actorScope: 'place:abc:field:address' });
      (repo.findById as jest.Mock).mockResolvedValue(item);

      await service.resolve({ id: 'item-uuid', resolvedBy: 'actor-uuid', resolution: {} });

      const call = (auditService.record as jest.Mock).mock.calls[0][0];
      expect(call.scope).toBe('place:abc:field:address');
    });
  });

  describe('scope enforcement — resolve', () => {
    it('throws ForbiddenException when actor has neither Place.Approve nor managed grant', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem());
      (authzService.can as jest.Mock).mockResolvedValue(false);

      await expect(
        service.resolve({ id: 'item-uuid', resolvedBy: 'actor-uuid', resolution: {} }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows resolve when actor has Place.Edit.Managed for the item placeId', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem({ placeId: 'place-uuid' }));
      // First can() call: Place.Approve → false; second call: Place.Edit.Managed scoped → true
      (authzService.can as jest.Mock)
        .mockResolvedValueOnce(false)  // Place.Approve
        .mockResolvedValueOnce(true);  // Place.Edit.Managed

      const result = await service.resolve({ id: 'item-uuid', resolvedBy: 'actor-uuid', resolution: {} });
      expect(result.status).toBe('resolved');
    });
  });

  describe('withdraw', () => {
    it('throws NotFoundException when item not found', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.withdraw('missing-uuid', 'actor-uuid', 'test reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates item status to withdrawn', async () => {
      const item = makeItem();
      (repo.findById as jest.Mock).mockResolvedValue(item);

      const result = await service.withdraw('item-uuid', 'actor-uuid', 'stale data');

      expect(result.status).toBe('withdrawn');
      expect(result.resolvedBy).toBe('actor-uuid');
      expect(result.resolution).toEqual({ action: 'withdrawn', reason: 'stale data' });
    });

    it('records audit event with odq.withdrawn', async () => {
      const item = makeItem();
      (repo.findById as jest.Mock).mockResolvedValue(item);

      await service.withdraw('item-uuid', 'actor-uuid', 'stale data');

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'odq.withdrawn',
          entityType: 'owner_decision_queue',
          entityId: 'item-uuid',
          actorId: 'actor-uuid',
          permission: 'Place.Approve',
        }),
      );
    });

    it('includes placeId and field in audit context', async () => {
      const item = makeItem({ placeId: 'place-xyz', field: 'name' });
      (repo.findById as jest.Mock).mockResolvedValue(item);

      await service.withdraw('item-uuid', 'actor-uuid', 'reason');

      const call = (auditService.record as jest.Mock).mock.calls[0][0];
      expect(call.context).toEqual(
        expect.objectContaining({ placeId: 'place-xyz', field: 'name' }),
      );
    });
  });
});
