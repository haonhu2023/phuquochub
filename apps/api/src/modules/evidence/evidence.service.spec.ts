import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { computeFieldValueHash } from './field-value-hash';

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
      listCurrentByPlaceAndField: jest.fn(),
      create: jest.fn((data) => Object.assign(new PlaceFieldEvidenceLink(), data)),
      save: jest.fn(async (row) => row),
    } as unknown as jest.Mocked<PlaceFieldEvidenceLinksRepository>;
    placesRepo = {
      existsById: jest.fn(),
      getCardByIdIncludingInactive: jest.fn(),
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
});
