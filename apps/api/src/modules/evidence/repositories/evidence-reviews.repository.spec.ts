import { Repository, SelectQueryBuilder } from 'typeorm';
import { EvidenceReviewsRepository } from './evidence-reviews.repository';
import { EvidenceReview } from '../entities/evidence-review.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('EvidenceReviewsRepository', () => {
  let repo: LooseMock<Repository<EvidenceReview>>;
  let sut: EvidenceReviewsRepository;

  function makeQb(): LooseMock<SelectQueryBuilder<EvidenceReview>> {
    const qb = createMock<SelectQueryBuilder<EvidenceReview>>({
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      getOne: jest.fn().mockResolvedValue(null),
    });
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    return qb;
  }

  beforeEach(() => {
    repo = createMock<Repository<EvidenceReview>>({
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn((data) => Object.assign(new EvidenceReview(), data)),
      save: jest.fn(async (row: EvidenceReview) => row),
    });
    sut = new EvidenceReviewsRepository(repo);
  });

  describe('findByEvidenceAndReceipt', () => {
    it('looks up by the UNIQUE(evidence_artifact_id, approval_artifact_sha256) idempotency key', async () => {
      const found = new EvidenceReview();
      repo.findOne.mockResolvedValue(found);

      const result = await sut.findByEvidenceAndReceipt('evd-1', 'a'.repeat(64));

      expect(repo.findOne).toHaveBeenCalledWith({ where: { evidenceArtifactId: 'evd-1', approvalArtifactSha256: 'a'.repeat(64) } });
      expect(result).toBe(found);
    });
  });

  describe('findLatestForTuple — Evidence Field-Binding V2', () => {
    it('filters by the exact (evidenceArtifactId, placeId, fieldName, fieldValueHash) tuple', async () => {
      const qb = makeQb();
      repo.createQueryBuilder.mockReturnValue(qb);

      await sut.findLatestForTuple('evd-1', 'place-1', 'opening_hours', 'a'.repeat(64));

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('er');
      expect(qb.where).toHaveBeenCalledWith('er.evidenceArtifactId = :evidenceArtifactId', { evidenceArtifactId: 'evd-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('er.placeId = :placeId', { placeId: 'place-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('er.fieldName = :fieldName', { fieldName: 'opening_hours' });
      expect(qb.andWhere).toHaveBeenCalledWith('er.fieldValueHash = :fieldValueHash', { fieldValueHash: 'a'.repeat(64) });
    });

    // The exact ordering here MUST match PlacesRepository.getVerifiedOpeningHoursHashes's own
    // LATERAL join ORDER BY — a divergence between this single-row lookup (used by the link-write
    // guard) and the batched read gate would let the two disagree on "which review is latest" for a
    // tied-timestamp tuple, exactly the kind of split-brain a governance gate cannot tolerate.
    it('orders reviewedAt DESC, createdAt DESC, decision-precedence ASC (APPROVE last), id DESC — same semantics as the shared read gate', async () => {
      const qb = makeQb();
      repo.createQueryBuilder.mockReturnValue(qb);

      await sut.findLatestForTuple('evd-1', 'place-1', 'opening_hours', 'a'.repeat(64));

      expect(qb.orderBy).toHaveBeenCalledWith('er.reviewedAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(1, 'er.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, `CASE WHEN er.decision = 'APPROVE' THEN 1 ELSE 0 END`, 'ASC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(3, 'er.id', 'DESC');
    });

    it('returns the single row getOne resolves, regardless of decision — eligibility is the caller\'s job', async () => {
      const qb = makeQb();
      const found = new EvidenceReview();
      qb.getOne.mockResolvedValue(found);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await sut.findLatestForTuple('evd-1', 'place-1', 'opening_hours', 'a'.repeat(64));

      expect(result).toBe(found);
    });

    it('runs against the transactional manager\'s repository when one is supplied', async () => {
      const qb = makeQb();
      const managerRepo = createMock<Repository<EvidenceReview>>({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) } as never;

      await sut.findLatestForTuple('evd-1', 'place-1', 'opening_hours', 'a'.repeat(64), manager);

      expect(managerRepo.createQueryBuilder).toHaveBeenCalledWith('er');
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('create/save', () => {
    it('create() builds an EvidenceReview instance from partial data', () => {
      const row = sut.create({ evidenceArtifactId: 'evd-1', decision: 'APPROVE' });
      expect(row).toBeInstanceOf(EvidenceReview);
      expect(row.evidenceArtifactId).toBe('evd-1');
    });

    it('save() persists via the plain repository when no manager is supplied', async () => {
      const row = new EvidenceReview();
      await sut.save(row);
      expect(repo.save).toHaveBeenCalledWith(row);
    });
  });
});
