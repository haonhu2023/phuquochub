import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { TranslationReviewService, PLACE_TRANSLATION_REVIEW_PERMISSION } from './translation-review.service';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { HumanReviewStatus } from '../multilingual-import/multilingual-import.enums';
import { PlaceTranslation } from './entities/place-translation.entity';
import { TextFormat, TranslationMethod } from './place-translations.enums';
import { User } from '../users/entities/user.entity';

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
      updateReviewState: jest.fn().mockResolvedValue(undefined),
      listPendingReview: jest.fn(),
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

  it('throws NotFoundException when the translation does not exist', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    translationsRepo.findById.mockResolvedValue(null);

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to review a superseded (not-current) row — the current row must be reviewed instead', async () => {
    usersRepo.findById.mockResolvedValue(actor());
    authz.can.mockResolvedValue(true);
    translationsRepo.findById.mockResolvedValue(currentRow({ isCurrent: false }));

    await expect(
      service.reviewTranslation(TRANSLATION_ID, ACTOR_ID, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow(BadRequestException);
    expect(translationsRepo.updateReviewState).not.toHaveBeenCalled();
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
});
