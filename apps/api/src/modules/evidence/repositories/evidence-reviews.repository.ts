import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EvidenceReview } from '../entities/evidence-review.entity';

@Injectable()
export class EvidenceReviewsRepository {
  constructor(
    @InjectRepository(EvidenceReview)
    private readonly repo: Repository<EvidenceReview>,
  ) {}

  private target(manager?: EntityManager): Repository<EvidenceReview> {
    return manager ? manager.getRepository(EvidenceReview) : this.repo;
  }

  // Idempotency lookup theo UNIQUE(evidence_artifact_id, approval_artifact_sha256) ở migration —
  // cùng nguyên tắc EvidenceArtifactsRepository.findByBusinessKey.
  findByEvidenceAndReceipt(evidenceArtifactId: string, approvalArtifactSha256: string, manager?: EntityManager): Promise<EvidenceReview | null> {
    return this.target(manager).findOne({ where: { evidenceArtifactId, approvalArtifactSha256 } });
  }

  // Evidence Field-Binding V2 — the single-row equivalent of PlacesRepository's batched, SQL-level
  // "latest review per tuple" lateral join, used by EvidenceService.linkEvidenceToPlaceField's
  // opening_hours link-write guard (section 8: a new link may only be created when a qualifying V2
  // review ALREADY exists for this exact tuple). MUST use the exact SAME ordering as that lateral
  // join — reviewedAt DESC, createdAt DESC, decision-precedence ASC, id DESC — the two read paths
  // (this single-row lookup and PlacesRepository's batched gate) would silently disagree on "which
  // review is latest" for a tied-timestamp tuple otherwise, which is exactly the kind of divergence
  // a governance gate cannot afford. reviewedAt/createdAt are the real (if theoretically collidable)
  // temporal signals; the decision-precedence term is a FAIL-CLOSED SAFETY RULE that applies ONLY
  // when reviewedAt AND createdAt both tie — a negative decision (REJECT/NEEDS_CHANGES) outranks
  // APPROVE in that genuinely ambiguous case, so a tie resolves toward NOT trusting it rather than
  // toward whichever row a random UUID comparison happens to favor (see PlacesRepository's own
  // comment on this exact query for the full reasoning). `id DESC` is the FINAL tie-break, reached
  // only when decision also ties (two reviews with the SAME decision at the exact same instant) —
  // genuinely arbitrary-but-deterministic there, since the outcome is identical either way.
  //
  // TypeORM's `findOne({ order })` cannot express the CASE expression the decision-precedence term
  // needs, so this uses a QueryBuilder with an explicit `addOrderBy` raw fragment instead of the
  // plain object-order form the rest of this repository otherwise uses.
  findLatestForTuple(
    evidenceArtifactId: string,
    placeId: string,
    fieldName: string,
    fieldValueHash: string,
    manager?: EntityManager,
  ): Promise<EvidenceReview | null> {
    return this.target(manager)
      .createQueryBuilder('er')
      .where('er.evidenceArtifactId = :evidenceArtifactId', { evidenceArtifactId })
      .andWhere('er.placeId = :placeId', { placeId })
      .andWhere('er.fieldName = :fieldName', { fieldName })
      .andWhere('er.fieldValueHash = :fieldValueHash', { fieldValueHash })
      .orderBy('er.reviewedAt', 'DESC')
      .addOrderBy('er.createdAt', 'DESC')
      .addOrderBy(`CASE WHEN er.decision = 'APPROVE' THEN 1 ELSE 0 END`, 'ASC')
      .addOrderBy('er.id', 'DESC')
      .getOne();
  }

  create(data: Partial<EvidenceReview>): EvidenceReview {
    return this.repo.create(data);
  }

  save(row: EvidenceReview, manager?: EntityManager): Promise<EvidenceReview> {
    return this.target(manager).save(row);
  }
}
