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
  // review ALREADY exists for this exact tuple). SAME deterministic order as that lateral join:
  // reviewedAt DESC, then createdAt DESC, then id DESC — the trailing two exist only to break a tie
  // deterministically (reviewedAt is server-clock time and can theoretically collide between two
  // reviews; id is a random gen_random_uuid() with no temporal meaning, kept purely so this ordering
  // never depends on whatever order the DB happens to return ties in). Returns the single latest row
  // regardless of decision; the caller decides eligibility (APPROVE + unexpired).
  findLatestForTuple(
    evidenceArtifactId: string,
    placeId: string,
    fieldName: string,
    fieldValueHash: string,
    manager?: EntityManager,
  ): Promise<EvidenceReview | null> {
    return this.target(manager).findOne({
      where: { evidenceArtifactId, placeId, fieldName, fieldValueHash },
      order: { reviewedAt: 'DESC', createdAt: 'DESC', id: 'DESC' },
    });
  }

  create(data: Partial<EvidenceReview>): EvidenceReview {
    return this.repo.create(data);
  }

  save(row: EvidenceReview, manager?: EntityManager): Promise<EvidenceReview> {
    return this.target(manager).save(row);
  }
}
