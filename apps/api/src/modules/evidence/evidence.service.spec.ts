import { NotFoundException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';

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
    ...overrides,
  });
  return row;
}

describe('EvidenceService', () => {
  let service: EvidenceService;
  let repo: jest.Mocked<EvidenceArtifactsRepository>;
  let fieldLinksRepo: jest.Mocked<PlaceFieldEvidenceLinksRepository>;
  let placesRepo: jest.Mocked<PlacesRepository>;

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
      create: jest.fn((data) => Object.assign(new PlaceFieldEvidenceLink(), data)),
      save: jest.fn(async (row) => row),
    } as unknown as jest.Mocked<PlaceFieldEvidenceLinksRepository>;
    placesRepo = {
      existsById: jest.fn(),
    } as unknown as jest.Mocked<PlacesRepository>;
    service = new EvidenceService(repo, fieldLinksRepo, placesRepo);
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
    beforeEach(() => {
      placesRepo.existsById.mockResolvedValue(true);
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1' }));
      fieldLinksRepo.findLink.mockResolvedValue(null);
    });

    it('creates a new link when none exists', async () => {
      const result = await service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'evd-1');
      expect(fieldLinksRepo.save).toHaveBeenCalledTimes(1);
      expect(result.placeId).toBe('place-1');
      expect(result.fieldName).toBe('opening_hours');
      expect(result.evidenceArtifactId).toBe('evd-1');
    });

    it('is idempotent — the same (place, field, evidence) triple returns the existing link, no duplicate write', async () => {
      const existing = makeFieldLink();
      fieldLinksRepo.findLink.mockResolvedValue(existing);
      const result = await service.linkEvidenceToPlaceField('place-1', 'opening_hours', 'evd-1');
      expect(result).toBe(existing);
      expect(fieldLinksRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent place before touching the evidence-artifact check or the link table', async () => {
      placesRepo.existsById.mockResolvedValue(false);
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
      expect(placesRepo.existsById).not.toHaveBeenCalled();
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('trims the field name before storing it', async () => {
      await service.linkEvidenceToPlaceField('place-1', '  opening_hours  ', 'evd-1');
      const created = fieldLinksRepo.create.mock.calls[0][0];
      expect(created?.fieldName).toBe('opening_hours');
    });
  });

  describe('listEvidenceForPlaceField', () => {
    it('returns only links for the exact requested place + field, not other fields on the same place', async () => {
      const openingHoursLink = makeFieldLink({ id: 'l1', fieldName: 'opening_hours' });
      fieldLinksRepo.listByPlaceAndField.mockResolvedValue([openingHoursLink]);

      const result = await service.listEvidenceForPlaceField('place-1', 'opening_hours');

      expect(fieldLinksRepo.listByPlaceAndField).toHaveBeenCalledWith('place-1', 'opening_hours');
      expect(result).toEqual([openingHoursLink]);
      // 'phone' evidence on the SAME place must never appear in an 'opening_hours' lookup — the
      // repository call above is scoped by field_name, so a phone-field row would only surface if
      // the mock itself returned it, which it deliberately does not.
    });

    it('returns only links for the exact requested place, not the same field on a different place', async () => {
      fieldLinksRepo.listByPlaceAndField.mockResolvedValue([]);
      const result = await service.listEvidenceForPlaceField('place-2', 'opening_hours');
      expect(fieldLinksRepo.listByPlaceAndField).toHaveBeenCalledWith('place-2', 'opening_hours');
      expect(result).toEqual([]);
    });
  });

  describe('cross-field: same evidence artifact may support two different fields', () => {
    it('does not block linking the same evidence_artifact_id to a second field on the same place', async () => {
      placesRepo.existsById.mockResolvedValue(true);
      repo.findById.mockResolvedValue(makeEvidence({ id: 'evd-1' }));
      // No existing (place-1, phone, evd-1) row — only (place-1, opening_hours, evd-1) exists,
      // which is a DIFFERENT composite key, so this must proceed as a fresh insert, not a duplicate.
      fieldLinksRepo.findLink.mockResolvedValue(null);

      const result = await service.linkEvidenceToPlaceField('place-1', 'phone', 'evd-1');

      expect(fieldLinksRepo.findLink).toHaveBeenCalledWith('place-1', 'phone', 'evd-1');
      expect(fieldLinksRepo.save).toHaveBeenCalledTimes(1);
      expect(result.fieldName).toBe('phone');
    });
  });
});
