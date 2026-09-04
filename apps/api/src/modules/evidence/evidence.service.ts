import { Injectable } from '@nestjs/common';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';

export interface EnsureEvidenceArtifactInput {
  sourceId: string;
  businessKey: string;
  evidenceType: string;
  sourceUrl: string;
  capturedAt: Date;
  contentHashSha256: string;
  storageReference?: string | null;
  verificationStatus: string;
  licenseStatus?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Verification statuses this service will accept as "clears the gate" — NEEDS_REVIEW is
// deliberately excluded. Only a real human review (recorded via verifiedBy/verifiedAt, never set
// by this import path) may move a row into one of these.
const GATE_PASSING_VERIFICATION_STATUSES = new Set(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED']);

@Injectable()
export class EvidenceService {
  constructor(private readonly repo: EvidenceArtifactsRepository) {}

  // Idempotent theo business_key (workbook evidence_id). KHÔNG BAO GIỜ nâng verificationStatus của
  // một hàng đã tồn tại lên cao hơn — nếu hàng đã có, trả về nguyên trạng, không ghi đè. Import lại
  // đúng workbook business_key hai lần là no-op, không tạo bản ghi thứ hai.
  async ensureEvidenceArtifact(input: EnsureEvidenceArtifactInput): Promise<EvidenceArtifact> {
    const existing = await this.repo.findByBusinessKey(input.businessKey);
    if (existing) return existing;

    const row = this.repo.create({
      sourceId: input.sourceId,
      businessKey: input.businessKey,
      evidenceType: input.evidenceType,
      sourceUrl: input.sourceUrl,
      capturedAt: input.capturedAt,
      contentHashSha256: input.contentHashSha256,
      storageReference: input.storageReference ?? null,
      verificationStatus: input.verificationStatus,
      licenseStatus: input.licenseStatus ?? null,
      verifiedBy: null,
      verifiedAt: null,
      metadata: input.metadata ?? null,
    });
    return this.repo.save(row);
  }

  // Idempotent theo UNIQUE(translation_id, evidence_id) ở migration — gọi lại với cùng cặp là no-op.
  async linkEvidenceToTranslation(
    translationId: string,
    evidenceId: string,
    relationshipType = 'SUPPORTS',
  ): Promise<PlaceTranslationEvidenceLink> {
    const existing = await this.repo.findLink(translationId, evidenceId);
    if (existing) return existing;
    const row = this.repo.createLink({ translationId, evidenceId, relationshipType });
    return this.repo.saveLink(row);
  }

  // Cổng gate cho một translation: PASS chỉ khi CÓ ít nhất một evidence link VÀ MỌI evidence liên
  // kết đều ở trạng thái "đã xác minh thật" (xem GATE_PASSING_VERIFICATION_STATUSES). Không có
  // link nào → BLOCKED (thiếu evidence). Có link nhưng còn NEEDS_REVIEW → HOLD, không phải PASS —
  // đây chính là quy tắc "NEEDS_REVIEW evidence → translation/release giữ HOLD" mà task yêu cầu.
  async evaluateTranslationEvidenceGate(translationId: string): Promise<{
    status: 'PASS' | 'HOLD' | 'BLOCKED';
    linkedEvidenceCount: number;
    needsReviewCount: number;
  }> {
    const links = await this.repo.listLinksByTranslation(translationId);
    if (links.length === 0) {
      return { status: 'BLOCKED', linkedEvidenceCount: 0, needsReviewCount: 0 };
    }

    let needsReviewCount = 0;
    for (const link of links) {
      const evidence = await this.repo.findById(link.evidenceId);
      if (!evidence || !GATE_PASSING_VERIFICATION_STATUSES.has(evidence.verificationStatus)) {
        needsReviewCount += 1;
      }
    }

    return {
      status: needsReviewCount === 0 ? 'PASS' : 'HOLD',
      linkedEvidenceCount: links.length,
      needsReviewCount,
    };
  }
}
