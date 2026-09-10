import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EvidenceService } from './evidence.service';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceReviewsRepository } from './repositories/evidence-reviews.repository';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { EvidenceReview } from './entities/evidence-review.entity';
import { Source } from '../sources/entities/source.entity';
import { SourceType } from '../sources/sources.enums';
import { Clock } from '../../common/clock';
import { computeFieldValueHash } from './field-value-hash';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function makeReview(overrides: Partial<EvidenceReview> = {}): EvidenceReview {
  const row = new EvidenceReview();
  Object.assign(row, {
    id: 'review-1',
    evidenceArtifactId: 'evd-1',
    decision: 'APPROVE',
    reviewerName: 'Reviewer One',
    reviewedAt: new Date('2026-09-05T00:00:00.000Z'),
    approvalArtifactSha256: 'c'.repeat(64),
    claimType: 'opening_hours',
    policyKey: 'OPENING_HOURS_OFFICIAL_STABLE_V1',
    policyVersion: '1',
    evidenceContentSha256: 'f'.repeat(64),
    verificationExpiresAt: new Date('2026-10-05T00:00:00.000Z'),
    reviewNote: null,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    ...overrides,
  });
  return row;
}

function makeSource(overrides: Partial<Source> = {}): Source {
  const s = new Source();
  Object.assign(s, { id: 'src-1', type: SourceType.OFFICIAL_WEBSITE, ...overrides });
  return s;
}

function makePlace(overrides: Partial<PlaceDetailRow> = {}): PlaceDetailRow {
  return {
    id: 'place-1',
    opening_hours: { regular: { mon: ['09:00-17:00'] } },
    short_description: 'A place',
    ...overrides,
  } as PlaceDetailRow;
}

function makeEvidence(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  const row = new EvidenceArtifact();
  Object.assign(row, {
    id: 'evd-1',
    sourceId: 'src-1',
    businessKey: 'EVD-VIN-OFFICIAL-VI-20260829',
    evidenceType: 'OFFICIAL_WEBPAGE',
    sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
    capturedAt: new Date('2026-08-29T09:01:24.000Z'),
    contentHashSha256: 'f'.repeat(64),
    storageReference: null,
    verificationStatus: 'NEEDS_REVIEW',
    licenseStatus: 'UNKNOWN',
    verifiedBy: null,
    verifiedAt: null,
    metadata: null,
    ...overrides,
  });
  return row;
}

function makeLink(overrides: Partial<PlaceTranslationEvidenceLink> = {}): PlaceTranslationEvidenceLink {
  const row = new PlaceTranslationEvidenceLink();
  Object.assign(row, {
    id: 'link-1',
    translationId: 'trans-1',
    evidenceId: 'evd-1',
    relationshipType: 'SUPPORTS',
    ...overrides,
  });
  return row;
}

function makeFieldLink(overrides: Partial<PlaceFieldEvidenceLink> = {}): PlaceFieldEvidenceLink {
  const row = new PlaceFieldEvidenceLink();
  Object.assign(row, {
    id: 'field-link-1',
    placeId: 'place-1',
    fieldName: 'opening_hours',
    evidenceArtifactId: 'evd-1',
    fieldValueHash: computeFieldValueHash(makePlace().opening_hours),
    ...overrides,
  });
  return row;
}

describe('EvidenceService', () => {
  let service: EvidenceService;
  let repo: jest.Mocked<EvidenceArtifactsRepository>;
  let fieldLinksRepo: jest.Mocked<PlaceFieldEvidenceLinksRepository>;
  let reviewsRepo: LooseMock<EvidenceReviewsRepository>;
  let placesRepo: jest.Mocked<PlacesRepository>;
  let sourcesRepo: LooseMock<SourcesRepository>;
  let clock: LooseMock<Clock>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;

  beforeEach(() => {
    repo = {
      findByBusinessKey: jest.fn(),
      findById: jest.fn(),
      create: jest.fn((data) => Object.assign(new EvidenceArtifact(), data)),
      save: jest.fn(async (row) => row),
      findLink: jest.fn(),
      createLink: jest.fn((data) => Object.assign(new PlaceTranslationEvidenceLink(), data)),
      saveLink: jest.fn(async (row) => row),
      listLinksByTranslation: jest.fn(),
    } as unknown as jest.Mocked<EvidenceArtifactsRepository>;
    fieldLinksRepo = {
      findLink: jest.fn(),
      listByPlaceAndField: jest.fn(),
      listCurrentByPlaceAndField: jest.fn(),
      create: jest.fn((data) => Object.assign(new PlaceFieldEvidenceLink(), data)),
      save: jest.fn(async (row) => row),
    } as unknown as jest.Mocked<PlaceFieldEvidenceLinksRepository>;
    reviewsRepo = createMock<EvidenceReviewsRepository>({
      findByEvidenceAndReceipt: jest.fn(),
      create: jest.fn((data) => Object.assign(new EvidenceReview(), data)),
      save: jest.fn(async (row: EvidenceReview) => row),
    });
    placesRepo = {
      existsById: jest.fn(),
      getCardByIdIncludingInactive: jest.fn(),
    } as unknown as jest.Mocked<PlacesRepository>;
    sourcesRepo = createMock<SourcesRepository>({ findById: jest.fn() });
    clock = createMock<Clock>({ now: jest.fn() });
    manager = createMock<EntityManager>();
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new EvidenceService(repo, fieldLinksRepo, reviewsRepo, placesRepo, sourcesRepo, clock, dataSource);
  });

  describe('ensureEvidenceArtifact', () => {
    it('inserts a new row when the business_key does not exist', async () => {
      repo.findByBusinessKey.mockResolvedValue(null);
      const result = await service.ensureEvidenceArtifact({
        sourceId: 'src-1',
        businessKey: 'EVD-VIN-OFFICIAL-VI-20260829',
        evidenceType: 'OFFICIAL_WEBPAGE',
        sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
        capturedAt: new Date('2026-08-29T09:01:24.000Z'),
        contentHashSha256: 'f'.repeat(64),
        verificationStatus: 'NEEDS_REVIEW',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.businessKey).toBe('EVD-VIN-OFFICIAL-VI-20260829');
      expect(result.verificationStatus).toBe('NEEDS_REVIEW');
    });

    it('is idempotent — same business_key returns the existing row without a second write', async () => {
      const existing = makeEvidence();
      repo.findByBusinessKey.mockResolvedValue(existing);
      const result = await service.ensureEvidenceArtifact({
        sourceId: 'src-1',
        businessKey: 'EVD-VIN-OFFICIAL-VI-20260829',
        evidenceType: 'OFFICIAL_WEBPAGE',
        sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
        capturedAt: new Date(),
        contentHashSha256: 'f'.repeat(64),
        verificationStatus: 'NEEDS_REVIEW',
      });
      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('never upgrades verificationStatus on re-import — existing row wins as-is even if input claims VERIFIED', async () => {
      const existing = makeEvidence({ verificationStatus: 'NEEDS_REVIEW' });
      repo.findByBusinessKey.mockResolvedValue(existing);
      const result = await service.ensureEvidenceArtifact({
        sourceId: 'src-1',
        businessKey: existing.businessKey,
        evidenceType: 'OFFICIAL_WEBPAGE',
        sourceUrl: existing.sourceUrl,
        capturedAt: new Date(),
        contentHashSha256: existing.contentHashSha256,
        verificationStatus: 'VERIFIED', // caller trying to sneak an upgrade
      });
      expect(result.verificationStatus).toBe('NEEDS_REVIEW');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('linkEvidenceToTranslation', () => {
    it('creates a new link when none exists', async () => {
      repo.findLink.mockResolvedValue(null);
      const result = await service.linkEvidenceToTranslation('trans-1', 'evd-1');
      expect(repo.saveLink).toHaveBeenCalledTimes(1);
      expect(result.translationId).toBe('trans-1');
      expect(result.evidenceId).toBe('evd-1');
      expect(result.relationshipType).toBe('SUPPORTS');
    });

    it('is idempotent — same (translationId, evidenceId) pair returns the existing link, no duplicate', async () => {
      const existing = makeLink();
      repo.findLink.mockResolvedValue(existing);
      const result = await service.linkEvidenceToTranslation('trans-1', 'evd-1');
      expect(result).toBe(existing);
      expect(repo.saveLink).not.toHaveBeenCalled();
    });
  });

  describe('evaluateTranslationEvidenceGate', () => {
    it('returns BLOCKED when a translation has zero linked evidence', async () => {
      repo.listLinksByTranslation.mockResolvedValue([]);
      const result = await service.evaluateTranslationEvidenceGate('trans-1');
      expect(result.status).toBe('BLOCKED');
      expect(result.linkedEvidenceCount).toBe(0);
    });

    it('returns HOLD when linked evidence is NEEDS_REVIEW — never silently PASS', async () => {
      repo.listLinksByTranslation.mockResolvedValue([makeLink()]);
      repo.findById.mockResolvedValue(makeEvidence({ verificationStatus: 'NEEDS_REVIEW' }));
      const result = await service.evaluateTranslationEvidenceGate('trans-1');
      expect(result.status).toBe('HOLD');
      expect(result.linkedEvidenceCount).toBe(1);
      expect(result.needsReviewCount).toBe(1);
    });

    it('returns PASS only when every linked evidence is genuinely VERIFIED', async () => {
      repo.listLinksByTranslation.mockResolvedValue([makeLink()]);
      repo.findById.mockResolvedValue(makeEvidence({ verificationStatus: 'VERIFIED', verifiedBy: 'user-1', verifiedAt: new Date() }));
      const result = await service.evaluateTranslationEvidenceGate('trans-1');
      expect(result.status).toBe('PASS');
      expect(result.needsReviewCount).toBe(0);
    });

    it('returns HOLD when ONE of multiple linked evidence rows is still NEEDS_REVIEW', async () => {
      repo.listLinksByTranslation.mockResolvedValue([makeLink({ id: 'link-1', evidenceId: 'evd-1' }), makeLink({ id: 'link-2', evidenceId: 'evd-2' })]);
      repo.findById.mockImplementation(async (id: string) =>
        id === 'evd-1' ? makeEvidence({ id: 'evd-1', verificationStatus: 'VERIFIED' }) : makeEvidence({ id: 'evd-2', verificationStatus: 'NEEDS_REVIEW' }),
      );
      const result = await service.evaluateTranslationEvidenceGate('trans-1');
      expect(result.status).toBe('HOLD');
      expect(result.linkedEvidenceCount).toBe(2);
      expect(result.needsReviewCount).toBe(1);
    });
  });

  describe('linkEvidenceToPlaceField', () => {
    const place = makePlace();
    const openingHoursHash = computeFieldValueHash(place.opening_hours);

    beforeEach(() => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(place);
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1' }));
      fieldLinksRepo.findLink.mockResolvedValue(null);
    });

    it('creates a new link when none exists, pinned to the CURRENT field value hash', async () => {
      const result = await service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'evd-1');
      expect(fieldLinksRepo.save).toHaveBeenCalledTimes(1);
      expect(result.placeId).toBe('place-1');
      expect(result.fieldName).toBe('opening_hours');
      expect(result.evidenceArtifactId).toBe('evd-1');
      expect(result.fieldValueHash).toBe(openingHoursHash);
      expect(fieldLinksRepo.findLink).toHaveBeenCalledWith('place-1', 'opening_hours', 'evd-1', openingHoursHash);
    });

    it('is idempotent — the same (place, field, evidence, value) quadruple returns the existing link, no duplicate write', async () => {
      const existing = makeFieldLink({ fieldValueHash: openingHoursHash });
      fieldLinksRepo.findLink.mockResolvedValue(existing);
      const result = await service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'evd-1');
      expect(result).toBe(existing);
      expect(fieldLinksRepo.save).not.toHaveBeenCalled();
    });

    it('creates a NEW row (not a duplicate) when the same artifact is re-linked after the value changed', async () => {
      // Row already exists for the OLD value's hash; findLink is queried with the NEW hash and
      // correctly finds nothing, so this proceeds as a fresh insert rather than returning the old row.
      fieldLinksRepo.findLink.mockResolvedValue(null);
      const changedPlace = makePlace({ opening_hours: { regular: { mon: ['10:00-18:00'] } } });
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(changedPlace);

      const result = await service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'evd-1');

      const newHash = computeFieldValueHash(changedPlace.opening_hours);
      expect(newHash).not.toBe(openingHoursHash);
      expect(fieldLinksRepo.findLink).toHaveBeenCalledWith('place-1', 'opening_hours', 'evd-1', newHash);
      expect(fieldLinksRepo.save).toHaveBeenCalledTimes(1);
      expect(result.fieldValueHash).toBe(newHash);
    });

    it('rejects a nonexistent place before touching the evidence-artifact check or the link table', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);
      await expect(service.linkEvidenceToPlaceField('missing-place', 'opening_hours', 'evd-1')).rejects.toThrow(NotFoundException);
      expect(repo.findById).not.toHaveBeenCalled();
      expect(fieldLinksRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent evidence artifact', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'missing-evd')).rejects.toThrow(NotFoundException);
      expect(fieldLinksRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a blank field name without querying either FK', async () => {
      await expect(service.linkEvidenceToPlaceField('place-1', '   ', 'evd-1')).rejects.toThrow(/blank/);
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('rejects a field name with no registered current-value reader', async () => {
      await expect(service.linkEvidenceToPlaceField('place-1', 'phone', 'evd-1')).rejects.toThrow(BadRequestException);
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
    });

    it('trims the field name before storing it', async () => {
      await service.linkEvidenceToPlaceField('place-1', '  opening_hours  ', 'evd-1');
      const created = fieldLinksRepo.create.mock.calls[0][0];
      expect(created?.fieldName).toBe('opening_hours');
    });
  });

  describe('listEvidenceForPlaceField (all history, every value hash)', () => {
    it('returns only links for the exact requested place + field, not other fields on the same place', async () => {
      const openingHoursLink = makeFieldLink({ id: 'l1', fieldName: 'opening_hours' });
      fieldLinksRepo.listByPlaceAndField.mockResolvedValue([openingHoursLink]);

      const result = await service.listEvidenceForPlaceField('place-1', 'opening_hours');

      expect(fieldLinksRepo.listByPlaceAndField).toHaveBeenCalledWith('place-1', 'opening_hours');
      expect(result).toEqual([openingHoursLink]);
      // 'short_description' evidence on the SAME place must never appear in an 'opening_hours'
      // lookup — the repository call above is scoped by field_name, so it would only surface if the
      // mock itself returned it, which it deliberately does not.
    });

    it('returns only links for the exact requested place, not the same field on a different place', async () => {
      fieldLinksRepo.listByPlaceAndField.mockResolvedValue([]);
      const result = await service.listEvidenceForPlaceField('place-2', 'opening_hours');
      expect(fieldLinksRepo.listByPlaceAndField).toHaveBeenCalledWith('place-2', 'opening_hours');
      expect(result).toEqual([]);
    });
  });

  describe('listCurrentEvidenceForPlaceField — the required current-value safety invariant', () => {
    it('T1: value A + artifact A linked; T2: value changes to B, artifact B linked — current lookup for B includes B and excludes A', async () => {
      const valueA = { regular: { mon: ['09:00-17:00'] } };
      const valueB = { regular: { mon: ['10:00-18:00'] } };
      const hashA = computeFieldValueHash(valueA);
      const hashB = computeFieldValueHash(valueB);
      expect(hashA).not.toBe(hashB); // sanity: the fixture actually exercises two distinct values

      const linkA = makeFieldLink({ id: 'link-a', evidenceArtifactId: 'evd-a', fieldValueHash: hashA });
      const linkB = makeFieldLink({ id: 'link-b', evidenceArtifactId: 'evd-b', fieldValueHash: hashB });

      // Place is now at value B (T2) — the repository is the one place a real DB would filter by
      // hash; simulate that filtering here rather than returning both links and hoping the service
      // filters client-side (it must not need to: the query itself is scoped).
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace({ opening_hours: valueB }));
      fieldLinksRepo.listCurrentByPlaceAndField.mockImplementation(async (_placeId, _fieldName, hash) =>
        [linkA, linkB].filter((l) => l.fieldValueHash === hash),
      );

      const result = await service.listCurrentEvidenceForPlaceField('place-1', 'opening_hours');

      expect(fieldLinksRepo.listCurrentByPlaceAndField).toHaveBeenCalledWith('place-1', 'opening_hours', hashB);
      expect(result).toEqual([linkB]);
      expect(result).not.toContainEqual(linkA);
      // linkA is not deleted anywhere in this flow — it simply isn't returned by the CURRENT query,
      // exactly the "old links remain historical rather than being destroyed" requirement.
    });

    it('returns an empty array (not an error) when the place cannot be found — there is no current value to compare against', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);
      const result = await service.listCurrentEvidenceForPlaceField('missing-place', 'opening_hours');
      expect(result).toEqual([]);
      expect(fieldLinksRepo.listCurrentByPlaceAndField).not.toHaveBeenCalled();
    });

    it('rejects a field name with no registered current-value reader', async () => {
      await expect(service.listCurrentEvidenceForPlaceField('place-1', 'phone')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cross-field: same evidence artifact may support two different fields', () => {
    it('does not block linking the same evidence_artifact_id to a second field on the same place', async () => {
      const place = makePlace();
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(place);
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1' }));
      // No existing (place-1, short_description, evd-1, hash) row — only (place-1, opening_hours,
      // evd-1, hash) exists, a DIFFERENT composite key, so this must proceed as a fresh insert.
      fieldLinksRepo.findLink.mockResolvedValue(null);

      const result = await service.linkEvidenceToPlaceField('place-1', 'short_description', 'evd-1');

      const expectedHash = computeFieldValueHash(place.short_description);
      expect(fieldLinksRepo.findLink).toHaveBeenCalledWith('place-1', 'short_description', 'evd-1', expectedHash);
      expect(fieldLinksRepo.save).toHaveBeenCalledTimes(1);
      expect(result.fieldName).toBe('short_description');
    });
  });

  describe('reviewEvidenceArtifact — Opening-Hours Evidence Governance v1', () => {
    const capturedAt = new Date('2026-09-01T00:00:00.000Z');
    const reviewedAt = new Date(capturedAt.getTime() + HOUR_MS);
    const contentHash = 'f'.repeat(64);
    const receiptDigest = 'c'.repeat(64);

    function baseInput(overrides: Partial<Parameters<EvidenceService['reviewEvidenceArtifact']>[0]> = {}) {
      return {
        evidenceArtifactId: 'evd-1',
        decision: 'APPROVE' as const,
        reviewerName: 'Reviewer One',
        approvalArtifactSha256: receiptDigest,
        claimType: 'opening_hours',
        scheduleStability: 'STABLE' as const,
        evidenceContentSha256: contentHash,
        ...overrides,
      };
    }

    beforeEach(() => {
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1', sourceId: 'src-1', capturedAt, contentHashSha256: contentHash }));
      sourcesRepo.findById.mockResolvedValue(makeSource({ id: 'src-1', type: SourceType.OFFICIAL_WEBSITE }));
      reviewsRepo.findByEvidenceAndReceipt.mockResolvedValue(null);
      clock.now.mockReturnValue(reviewedAt);
    });

    it('evidence artifact not found -> NotFoundException, opens the transaction but writes nothing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.reviewEvidenceArtifact(baseInput())).rejects.toThrow(NotFoundException);
      expect(reviewsRepo.save).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a blank reviewerName before opening a transaction', async () => {
      await expect(service.reviewEvidenceArtifact(baseInput({ reviewerName: '   ' }))).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a malformed approvalArtifactSha256 before opening a transaction', async () => {
      await expect(service.reviewEvidenceArtifact(baseInput({ approvalArtifactSha256: 'not-a-hash' }))).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a malformed evidenceContentSha256 before opening a transaction', async () => {
      await expect(service.reviewEvidenceArtifact(baseInput({ evidenceContentSha256: 'ZZZZ' }))).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('APPROVE + every gate passes -> evidence moves to VERIFIED with expiry/policy/digest recorded, inside one transaction', async () => {
      const result = await service.reviewEvidenceArtifact(baseInput());

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.idempotentReplay).toBe(false);
      expect(result.evidenceVerified).toBe(true);
      expect(result.evaluation.eligible).toBe(true);

      expect(reviewsRepo.save).toHaveBeenCalledTimes(1);
      const savedReview = reviewsRepo.save.mock.calls[0][0] as EvidenceReview;
      expect(savedReview.decision).toBe('APPROVE');
      expect(savedReview.policyKey).toBe('OPENING_HOURS_OFFICIAL_STABLE_V1');
      expect(savedReview.verificationExpiresAt?.getTime()).toBe(capturedAt.getTime() + 30 * DAY_MS);

      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedEvidence = repo.save.mock.calls[0][0] as EvidenceArtifact;
      expect(savedEvidence.verificationStatus).toBe('VERIFIED');
      expect(savedEvidence.verifiedAt).toBe(reviewedAt);
      expect(savedEvidence.approvalArtifactSha256).toBe(receiptDigest);
      expect(savedEvidence.freshnessPolicyKey).toBe('OPENING_HOURS_OFFICIAL_STABLE_V1');
      expect(savedEvidence.verificationExpiresAt?.getTime()).toBe(capturedAt.getTime() + 30 * DAY_MS);

      // Both writes happened via the SAME manager the transaction callback received.
      expect(reviewsRepo.save.mock.calls[0][1]).toBe(manager);
      expect(repo.save.mock.calls[0][1]).toBe(manager);
    });

    it('reviewedAt is always the injected clock\'s value — there is no input field a caller could use to backdate it', () => {
      const input = baseInput() as Record<string, unknown>;
      expect(input).not.toHaveProperty('reviewedAt');
    });

    it('the recorded reviewed_at tracks the clock exactly, independent of captured_at', async () => {
      const laterNow = new Date(reviewedAt.getTime() + 3 * DAY_MS);
      clock.now.mockReturnValue(laterNow);

      await service.reviewEvidenceArtifact(baseInput());

      const savedReview = reviewsRepo.save.mock.calls[0][0] as EvidenceReview;
      expect(savedReview.reviewedAt).toBe(laterNow);
    });

    it('capture older than 168h -> review recorded, but evidence is NOT moved to VERIFIED', async () => {
      const staleCapturedAt = new Date(reviewedAt.getTime() - 169 * HOUR_MS);
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1', sourceId: 'src-1', capturedAt: staleCapturedAt, contentHashSha256: contentHash }));

      const result = await service.reviewEvidenceArtifact(baseInput());

      expect(result.evaluation.eligible).toBe(false);
      expect(result.evaluation.reasonCodes).toContain('CAPTURE_TOO_OLD');
      expect(result.evidenceVerified).toBe(false);
      expect(reviewsRepo.save).toHaveBeenCalledTimes(1); // still audited
      expect(repo.save).not.toHaveBeenCalled(); // never flips to VERIFIED
      const savedReview = reviewsRepo.save.mock.calls[0][0] as EvidenceReview;
      expect(savedReview.verificationExpiresAt).toBeNull(); // no expiry persisted for a non-eligible outcome
    });

    it('evidenceContentSha256 does not match the artifact\'s current content hash -> HASH_MISMATCH, not verified', async () => {
      const result = await service.reviewEvidenceArtifact(baseInput({ evidenceContentSha256: 'b'.repeat(64) }));
      expect(result.evaluation.reasonCodes).toContain('EVIDENCE_HASH_MISMATCH');
      expect(result.evidenceVerified).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('source is not first-party (e.g. community/aggregator) -> SOURCE_NOT_FIRST_PARTY, not verified', async () => {
      sourcesRepo.findById.mockResolvedValue(makeSource({ id: 'src-1', type: SourceType.COMMUNITY }));
      const result = await service.reviewEvidenceArtifact(baseInput());
      expect(result.evaluation.reasonCodes).toContain('SOURCE_NOT_FIRST_PARTY');
      expect(result.evidenceVerified).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('temporary/event schedule -> TEMPORARY_SCHEDULE_UNSUPPORTED, held for a future policy, not verified', async () => {
      const result = await service.reviewEvidenceArtifact(baseInput({ scheduleStability: 'TEMPORARY' }));
      expect(result.evaluation.reasonCodes).toContain('TEMPORARY_SCHEDULE_UNSUPPORTED');
      expect(result.evidenceVerified).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('decision = NEEDS_CHANGES -> audited, never verified even though every other gate would pass', async () => {
      const result = await service.reviewEvidenceArtifact(baseInput({ decision: 'NEEDS_CHANGES' }));
      expect(result.evaluation.reasonCodes).toContain('DECISION_NOT_APPROVED');
      expect(result.evidenceVerified).toBe(false);
      expect(reviewsRepo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('decision = REJECT -> audited, never verified', async () => {
      const result = await service.reviewEvidenceArtifact(baseInput({ decision: 'REJECT' }));
      expect(result.evidenceVerified).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });

    describe('idempotency and conflict (evidenceArtifactId, approvalArtifactSha256)', () => {
      it('replaying the exact same payload + digest is a no-op — no second insert, no second evidence write', async () => {
        const existing = makeReview({
          evidenceArtifactId: 'evd-1',
          approvalArtifactSha256: receiptDigest,
          decision: 'APPROVE',
          reviewerName: 'Reviewer One',
          reviewedAt,
          claimType: 'opening_hours',
          evidenceContentSha256: contentHash,
          reviewNote: null,
        });
        reviewsRepo.findByEvidenceAndReceipt.mockResolvedValue(existing);
        repo.findById.mockResolvedValue(
          makeEvidence({
            id: 'evd-1',
            sourceId: 'src-1',
            capturedAt,
            contentHashSha256: contentHash,
            verificationStatus: 'VERIFIED',
            approvalArtifactSha256: receiptDigest,
          }),
        );

        const result = await service.reviewEvidenceArtifact(baseInput());

        expect(result.idempotentReplay).toBe(true);
        expect(result.review).toBe(existing);
        expect(result.evidenceVerified).toBe(true);
        expect(reviewsRepo.save).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('same digest, different payload (e.g. different decision) -> ConflictException, no write attempted', async () => {
        const existing = makeReview({
          evidenceArtifactId: 'evd-1',
          approvalArtifactSha256: receiptDigest,
          decision: 'REJECT', // different from the incoming APPROVE
        });
        reviewsRepo.findByEvidenceAndReceipt.mockResolvedValue(existing);

        await expect(service.reviewEvidenceArtifact(baseInput({ decision: 'APPROVE' }))).rejects.toThrow(ConflictException);
        expect(reviewsRepo.save).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('a concurrent duplicate insert with a DIFFERENT payload (unique-violation race) is converted to ConflictException, not a raw DB error', async () => {
        const dbError = { code: '23505', constraint: 'uq_evidence_review_receipt' };
        reviewsRepo.save.mockRejectedValueOnce(dbError);
        // Post-rollback re-read finds nothing matching (simulates: the concurrent winner's payload
        // differs, or is simply not visible to this simplified mock) -> a real conflict, not a replay.
        await expect(service.reviewEvidenceArtifact(baseInput())).rejects.toThrow(ConflictException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      // The race-fallback must NOT collapse every unique-violation into a blanket conflict — a
      // caller whose own request raced ITSELF (e.g. a retried network call) submitted the exact same
      // payload twice; the second one loses the INSERT race but must still see success, not a 409.
      it('a concurrent duplicate insert that turns out to be the SAME payload (a true replay race) resolves as a replay, not a conflict', async () => {
        const dbError = { code: '23505', constraint: 'uq_evidence_review_receipt' };
        reviewsRepo.save.mockRejectedValueOnce(dbError);

        const winningRow = makeReview({
          evidenceArtifactId: 'evd-1',
          approvalArtifactSha256: receiptDigest,
          decision: 'APPROVE',
          reviewerName: 'Reviewer One',
          claimType: 'opening_hours',
          evidenceContentSha256: contentHash,
          reviewNote: null,
        });
        // First call (pre-read, inside the doomed transaction) finds nothing — that's WHY this
        // request proceeded to INSERT and lost the race. Second call (post-rollback re-read, outside
        // any transaction) finds the row the concurrent request actually committed.
        reviewsRepo.findByEvidenceAndReceipt.mockResolvedValueOnce(null).mockResolvedValueOnce(winningRow);

        const result = await service.reviewEvidenceArtifact(baseInput());

        expect(result.idempotentReplay).toBe(true);
        expect(result.review).toBe(winningRow);
        // The re-read that resolves this is NOT transactional — proven by it happening on the plain
        // (manager-less) call signature, i.e. a THIRD arg was never passed on the second lookup.
        expect(reviewsRepo.findByEvidenceAndReceipt).toHaveBeenCalledTimes(2);
        expect(reviewsRepo.findByEvidenceAndReceipt.mock.calls[1]).toEqual(['evd-1', receiptDigest]);
      });

      it('an unrelated DB error from the review insert is NOT swallowed as a conflict', async () => {
        const dbError = { code: '23503', message: 'fk violation' };
        reviewsRepo.save.mockRejectedValueOnce(dbError);
        await expect(service.reviewEvidenceArtifact(baseInput())).rejects.toBe(dbError);
      });
    });

    it('a failure updating evidence_artifacts propagates out of the transaction — the review write is never left standing alone', async () => {
      const writeFailure = new Error('simulated write failure after the review insert');
      repo.save.mockRejectedValueOnce(writeFailure);

      await expect(service.reviewEvidenceArtifact(baseInput())).rejects.toThrow(writeFailure);

      // Both writes were attempted inside the SAME transaction() call — a real Postgres transaction
      // rolls both back together when the callback throws (dataSource.transaction's own contract,
      // exercised for real by VerificationsService against the CI Postgres service container); this
      // unit test proves the code path funnels both writes through that one callback.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(reviewsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('never mutates evidence_artifacts.contentHashSha256/capturedAt — only governance fields', async () => {
      const evidence = makeEvidence({ id: 'evd-1', sourceId: 'src-1', capturedAt, contentHashSha256: contentHash });
      repo.findById.mockResolvedValue(evidence);
      await service.reviewEvidenceArtifact(baseInput());
      const savedEvidence = repo.save.mock.calls[0][0] as EvidenceArtifact;
      expect(savedEvidence.contentHashSha256).toBe(contentHash);
      expect(savedEvidence.capturedAt).toBe(capturedAt);
    });
  });
});
