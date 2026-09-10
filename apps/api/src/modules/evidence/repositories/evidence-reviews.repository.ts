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

  create(data: Partial<EvidenceReview>): EvidenceReview {
    return this.repo.create(data);
  }

  save(row: EvidenceReview, manager?: EntityManager): Promise<EvidenceReview> {
    return this.target(manager).save(row);
  }
}
