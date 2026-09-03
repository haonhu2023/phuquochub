import { EvidenceService } from './evidence.service';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';

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

describe('EvidenceService', () => {
  let service: EvidenceService;
  let repo: jest.Mocked<EvidenceArtifactsRepository>;

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
    service = new EvidenceService(repo);
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
});
