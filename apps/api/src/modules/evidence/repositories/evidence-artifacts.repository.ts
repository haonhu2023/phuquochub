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
  // Evidence Workflow). NEEDS_REVIEW là trạng thái khởi tạo của ensureEvidenceArtifact; MỌI quyết
  // định review ghi nhận được (APPROVE+eligible → VERIFIED, REJECT → REJECTED, NEEDS_CHANGES hoặc
  // một APPROVE không đủ điều kiện → NEEDS_CHANGES — xem EvidenceService.reviewEvidenceArtifact)
  // đều đưa hàng RỜI khỏi NEEDS_REVIEW, nên hàng tự rời khỏi danh sách này (không cần xoá/đánh dấu
  // riêng). Sửa 2026-10-22: trước đó CHỈ nhánh APPROVE+eligible đổi trạng thái — REJECT/
  // NEEDS_CHANGES để nguyên NEEDS_REVIEW, khiến artifact quay lại danh sách này MÃI MÃI dù đã có
  // quyết định ghi nhận (gap "kẹt hàng chờ" phát hiện khi rà soát kiểm duyệt toàn site).
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
