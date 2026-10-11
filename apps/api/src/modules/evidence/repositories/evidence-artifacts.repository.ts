import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EvidenceArtifact } from '../entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from '../entities/place-translation-evidence-link.entity';

@Injectable()
export class EvidenceArtifactsRepository {
  constructor(
    @InjectRepository(EvidenceArtifact)
    private readonly repo: Repository<EvidenceArtifact>,
    @InjectRepository(PlaceTranslationEvidenceLink)
    private readonly linkRepo: Repository<PlaceTranslationEvidenceLink>,
  ) {}

  private target(manager?: EntityManager): Repository<EvidenceArtifact> {
    return manager ? manager.getRepository(EvidenceArtifact) : this.repo;
  }

  private linkTarget(manager?: EntityManager): Repository<PlaceTranslationEvidenceLink> {
    return manager ? manager.getRepository(PlaceTranslationEvidenceLink) : this.linkRepo;
  }

  // Dedupe theo business_key (workbook evidence_id) — cùng nguyên tắc SourcesRepository.findByTypeAndExternalRef.
  findByBusinessKey(businessKey: string, manager?: EntityManager): Promise<EvidenceArtifact | null> {
    return this.target(manager).findOne({ where: { businessKey } });
  }

  findById(id: string, manager?: EntityManager): Promise<EvidenceArtifact | null> {
    return this.target(manager).findOne({ where: { id } });
  }

  // Hàng chờ duyệt cho một evidenceType cụ thể — dùng cho hàng chờ moderator (Opening-Hours
  // Evidence Workflow). NEEDS_REVIEW là trạng thái khởi tạo của ensureEvidenceArtifact; một khi
  // reviewEvidenceArtifact ghi APPROVE+eligible, verificationStatus chuyển VERIFIED và hàng tự rời
  // khỏi danh sách này (không cần xoá/đánh dấu riêng).
  listByTypeAndStatus(evidenceType: string, verificationStatus: string, manager?: EntityManager): Promise<EvidenceArtifact[]> {
    return this.target(manager).find({ where: { evidenceType, verificationStatus }, order: { createdAt: 'ASC' } });
  }

  create(data: Partial<EvidenceArtifact>): EvidenceArtifact {
    return this.repo.create(data);
  }

  save(row: EvidenceArtifact, manager?: EntityManager): Promise<EvidenceArtifact> {
    return this.target(manager).save(row);
  }

  findLink(translationId: string, evidenceId: string, manager?: EntityManager): Promise<PlaceTranslationEvidenceLink | null> {
    return this.linkTarget(manager).findOne({ where: { translationId, evidenceId } });
  }

  createLink(data: Partial<PlaceTranslationEvidenceLink>): PlaceTranslationEvidenceLink {
    return this.linkRepo.create(data);
  }

  saveLink(row: PlaceTranslationEvidenceLink, manager?: EntityManager): Promise<PlaceTranslationEvidenceLink> {
    return this.linkTarget(manager).save(row);
  }

  listLinksByTranslation(translationId: string, manager?: EntityManager): Promise<PlaceTranslationEvidenceLink[]> {
    return this.linkTarget(manager).find({ where: { translationId } });
  }
}
