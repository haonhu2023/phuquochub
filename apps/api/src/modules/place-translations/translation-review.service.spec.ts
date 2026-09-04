import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { TranslationReviewService, PLACE_TRANSLATION_REVIEW_PERMISSION, REVIEW_NOTES_MAX_LENGTH } from './translation-review.service';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { HumanReviewStatus } from '../multilingual-import/multilingual-import.enums';
import { PlaceTranslation } from './entities/place-translation.entity';
import { TextFormat, TranslationMethod } from './place-translations.enums';
import { User } from '../users/entities/user.entity';
import { decodeReviewQueueCursor, encodeReviewQueueCursor } from './review-queue-cursor';

const TRANSLATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function currentRow(overrides: Partial<PlaceTranslation> = {}): PlaceTranslation {
  return {
    id: TRANSLATION_ID,
    placeId: 'place-1',
    fieldKey: 'short_description',
    localeCode: 'en',
    sourceLocaleCode: 'vi',
    translatedText: 'The most beautiful beach in Phu Quoc',
    textFormat: TextFormat.PLAIN_TEXT,
    sourceTextHash: 'hash',
    translationMethod: TranslationMethod.HUMAN,
    translationStatus: 'PENDING',
    humanReviewStatus: 'PENDING',
    qualityGate: 'PASS',
    revisionId: 'content-revision-1',
    supersedesTranslationId: null,
    isCurrent: true,
    isPublic: false,
    isProductionData: false,
    productionEligible: false,
    sourceId: null,
    evidenceId: null,
    importBatchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlaceTranslation;
}

function actor(overrides: Partial<User> = {}): User {
  return {
    id: ACTOR_ID,
    email: 'reviewer@example.com',
    displayName: 'Real Reviewer',
    isActive: true,
    isServiceAccount: false,
    ...overrides,
  } as User;
}

describe('TranslationReviewService — CRITICAL HUMAN-REVIEW RULE enforcement', () => {
  let translationsRepo: jest.Mocked<PlaceTranslationsRepository>;
  let revisionsService: jest.Mocked<RevisionsService>;
  let usersRepo: jest.Mocked<UsersRepository>;
  let authz: jest.Mocked<AuthorizationService>;
  let dataSource: jest.Mocked<DataSource>;
  let service: TranslationReviewService;

  const fakeManager = {} as EntityManager;

  beforeEach(() => {
    translationsRepo = {
      findById: jest.fn(),
      updateReviewState: jest.fn().mockResolvedValue(true),
      listReviewQueue: jest.fn(),
    } as unknown as jest.Mocked<PlaceTranslationsRepository>;

    revisionsService = {
      recordPlaceTranslationRevision: jest.fn().mockResolvedValue({ id: 'review-rev-1', revisionNumber: 2 }),
    } as unknown as jest.Mocked<RevisionsService>;

    usersRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    authz = {
      can: jest.fn(),
    } as unknown as jest.Mocked<AuthorizationService>;

    dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(fakeManager)),
    } as unknown as jest.Mocked<DataSource>;

    service = new TranslationReviewService(translationsRepo, revisionsService, usersRepo, authz, dataSource);
  });

  it('rejects when the reviewing actor does not exist', async () => {
    usersRepo.findById.mockResolvedValue(null);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(ForbiddenException);
    expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
  });

  it('SYSTEM_ACTOR_CAN_APPROVE=NO — a service account cannot record a review decision even with the permission', async () => {
    usersRepo.findById.mockResolvedValue(actor({ isServiceAccount: true }));
    authz.can.mockResolvedValue(true);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(ForbiddenException);
    expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
    expect(revisionsService.recordPlaceTranslationRevision).not.toHaveBeenCalled();
  });

  it('an inactive user cannot record a review decision', async () => {
    usersRepo.findById.mockResolvedValue(actor({ isActive: false }));
    authz.can.mockResolvedValue(true);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(ForbiddenException);
    expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
  });

  it('a real, active, non-service-account user without PlaceTranslation.Review.Any is denied', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(false);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(ForbiddenException);
    expect(authz.can).toHaveBeenCalledWith(ACTOR_ID, PLACE_TRANSLATION_REVIEW_PERMISSION);
    expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
  });

  describe('notes policy', () => {
    it('rejects a REJECTED decision with no notes', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.REJECTED, null),
      ).rejects.toThrow(BadRequestException);
      expect(translationsRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects a NEEDS_CHANGES decision with only whitespace notes', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.NEEDS_CHANGES, '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an APPROVED decision with no notes', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow());

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
      ).resolves.toBeDefined();
    });

    it(`rejects notes longer than ${REVIEW_NOTES_MAX_LENGTH} characters, before ever reading the translation`, async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, 'x'.repeat(REVIEW_NOTES_MAX_LENGTH + 1)),
      ).rejects.toThrow(BadRequestException);
      expect(translationsRepo.findById).not.toHaveBeenCalled();
    });
  });

  it('throws NotFoundException when the translation does not exist', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    translationsRepo.findById.mockResolvedValue(null);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(NotFoundException);
  });

  describe('stale/concurrent review protection (Phase 4/5)', () => {
    it('409s on a superseded (not-current) row — the current row must be reviewed instead', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow({ isCurrent: false }));

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
      ).rejects.toThrow(ConflictException);
      expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
    });

    it('409s on a row already decided (APPROVED) — a second decision is not a re-review', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow({ humanReviewStatus: 'APPROVED' }));

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.REJECTED, 'changed my mind'),
      ).rejects.toThrow(ConflictException);
      expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
    });

    it('409s on a row already decided (REJECTED)', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow({ humanReviewStatus: 'REJECTED' }));

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
      ).rejects.toThrow(ConflictException);
    });

    it('allows re-review of a NEEDS_CHANGES row without a content edit', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow({ humanReviewStatus: 'NEEDS_CHANGES' }));

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
      ).resolves.toBeDefined();
    });

    it('DOUBLE_SUBMISSION_SAFE — when the conditional UPDATE affects 0 rows (a concurrent write won the race), throws 409 and never reports false success', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow());
      translationsRepo.updateReviewState.mockResolvedValue(false);

      await expect(
        service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
      ).rejects.toThrow(ConflictException);
    });

    it('passes the OBSERVED prior humanReviewStatus as the optimistic-concurrency guard to updateReviewState', async () => {
      usersRepo.findById.mockResolvedValue(actor());
      authz.can.mockResolvedValue(true);
      translationsRepo.findById.mockResolvedValue(currentRow({ humanReviewStatus: 'NEEDS_CHANGES' }));

      await service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null);

      expect(translationsRepo.updateReviewState).toHaveBeenCalledWith(
        TRANSLATION_ID,
        'NEEDS_CHANGES',
        expect.objectContaining({ humanReviewStatus: HumanReviewStatus.APPROVED }),
        fakeManager,
      );
    });
  });

  it('APPROVE by an authorized human: writes a real audit revision (reviewer + timestamp + content version) and flips governance flags to public/eligible', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    const row = currentRow();
    translationsRepo.findById.mockResolvedValue(row);

    const result = await service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, 'looks good');

    expect(revisionsService.recordPlaceTranslationRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: TRANSLATION_ID,
        origin: RevisionOrigin.MODERATOR_EDIT,
        editorId: null,
        status: RevisionStatus.APPROVED,
        reviewedBy: ACTOR_ID,
        reviewedAt: expect.any(Date),
        snapshot: expect.objectContaining({
          decision: HumanReviewStatus.APPROVED,
          reviewedContentRevisionId: 'content-revision-1',
        }),
      }),
      fakeManager,
    );
    expect(translationsRepo.updateReviewState).toHaveBeenCalledWith(
      TRANSLATION_ID,
      'PENDING',
      {
        humanReviewStatus: HumanReviewStatus.APPROVED,
        translationStatus: 'APPROVED',
        isPublic: true,
        isProductionData: true,
        productionEligible: true,
      },
      fakeManager,
    );
    expect(result.isPublic).toBe(true);
    expect(result.productionEligible).toBe(true);
  });

  it('REJECTED_CAN_BE_PUBLIC=NO — a REJECT decision never sets isPublic/isProductionData/productionEligible', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    translationsRepo.findById.mockResolvedValue(currentRow());

    const result = await service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.REJECTED, 'not accurate');

    expect(result.isPublic).toBe(false);
    expect(result.isProductionData).toBe(false);
    expect(result.productionEligible).toBe(false);
    expect(translationsRepo.updateReviewState).toHaveBeenCalledWith(
      TRANSLATION_ID,
      'PENDING',
      expect.objectContaining({ humanReviewStatus: HumanReviewStatus.REJECTED, isPublic: false }),
      fakeManager,
    );
  });

  it('NEEDS_CHANGES_CAN_BE_PUBLIC=NO — a NEEDS_CHANGES decision never sets isPublic/isProductionData/productionEligible', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    translationsRepo.findById.mockResolvedValue(currentRow());

    const result = await service.reviewTranslation(
      TRANSLATION_ID,
      ACTOR_ID,
      HumanReviewStatus.NEEDS_CHANGES,
      'fix the address',
    );

    expect(result.isPublic).toBe(false);
    expect(result.humanReviewStatus).toBe(HumanReviewStatus.NEEDS_CHANGES);
  });

  it('PENDING_CAN_BE_PUBLIC=NO — an unreviewed row stays not-public (sanity check on the fixture itself)', () => {
    const row = currentRow();
    expect(row.humanReviewStatus).toBe('PENDING');
    expect(row.isPublic).toBe(false);
  });

  it('never trusts a client-supplied reviewer id — always writes the authenticated actorId, never a value from the row/content', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    // Row's own importBatchId/sourceId carry no reviewer concept; confirm the ONLY id ever written
    // as reviewedBy is the actorId this method was called with.
    translationsRepo.findById.mockResolvedValue(currentRow());

    await service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null);

    const call = revisionsService.recordPlaceTranslationRevision.mock.calls[0][0];
    expect(call.reviewedBy).toBe(ACTOR_ID);
  });

  describe('listReviewQueue — keyset pagination', () => {
    it('page 1 (no cursor): passes filter through with cursor=undefined, returns nextCursor=null when hasMore=false', async () => {
      translationsRepo.listReviewQueue.mockResolvedValue({ rows: [], hasMore: false });

      const result = await service.listReviewQueue({ placeId: 'place-1', limit: 10 });

      expect(translationsRepo.listReviewQueue).toHaveBeenCalledWith({ placeId: 'place-1', limit: 10, cursor: undefined });
      expect(result).toEqual({ rows: [], nextCursor: null });
    });

    it('hasMore=true: nextCursor encodes the LAST row of the page (created_at + id)', async () => {
      const ROW_1 = 'aaaaaaaa-1111-4111-8111-111111111111';
      const ROW_2 = 'bbbbbbbb-2222-4222-8222-222222222222';
      const lastRow = { id: ROW_2, created_at: new Date('2026-09-04T00:00:00.000Z') } as never;
      translationsRepo.listReviewQueue.mockResolvedValue({ rows: [{ id: ROW_1 } as never, lastRow], hasMore: true });

      const result = await service.listReviewQueue({});

      expect(result.nextCursor).not.toBeNull();
      // Round-trips through the same decoder listReviewQueue itself uses — proves it's the LAST row.
      const decoded = decodeReviewQueueCursor(result.nextCursor!);
      expect(decoded.id).toBe(ROW_2);
      expect(decoded.createdAt.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    });

    it('a well-formed cursor string is decoded and forwarded to the repository as a real (createdAt, id) pair', async () => {
      translationsRepo.listReviewQueue.mockResolvedValue({ rows: [], hasMore: false });
      const ROW_1 = 'aaaaaaaa-1111-4111-8111-111111111111';
      const cursor = encodeReviewQueueCursor({ created_at: new Date('2026-09-04T00:00:00.000Z'), id: ROW_1 });

      await service.listReviewQueue({ cursor });

      const passedFilter = translationsRepo.listReviewQueue.mock.calls[0][0];
      expect(passedFilter.cursor).toEqual({ createdAt: new Date('2026-09-04T00:00:00.000Z'), id: ROW_1 });
    });

    it('a malformed cursor is rejected with BadRequestException BEFORE ever querying the repository', async () => {
      await expect(service.listReviewQueue({ cursor: 'not-a-valid-cursor!!' })).rejects.toThrow(BadRequestException);
      expect(translationsRepo.listReviewQueue).not.toHaveBeenCalled();
    });
  });
});
