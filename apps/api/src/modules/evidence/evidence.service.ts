import { Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { PlacesRepository } from '../places/repositories/places.repository';

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
  constructor(
    private readonly repo: EvidenceArtifactsRepository,
    private readonly fieldLinksRepo: PlaceFieldEvidenceLinksRepository,
    private readonly placesRepo: PlacesRepository,
  ) {}

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

  // Place-field evidence V0 — links an EXISTING evidence_artifact to a named scalar field on a
  // place (opening_hours today; generic enough for phone/website/address/price/operating status
  // later, per PlaceFieldEvidenceLink's own field_name comment). Deliberately does NOT touch
  // places.verification_status/verified_at — see PLACES-026 trust-model note: linking evidence to
  // one field must never read as "the whole place is now trusted."
  //
  // Existence checks happen HERE, explicitly, before the insert — same pattern as
  // SourcesService.attachAttribution's `await this.getSource(...)` (clearer error than relying on
  // the FK violation alone, even though the FK is still the real backstop). PlacesRepository.existsById
  // is already documented as the cross-module "is this place_id valid" seam (its own JSDoc names
  // ReviewsService.create as an existing caller) — reused here rather than re-querying places.
  async linkEvidenceToPlaceField(placeId: string, fieldName: string, evidenceArtifactId: string): Promise<PlaceFieldEvidenceLink> {
    const trimmedField = fieldName?.trim();
    if (!trimmedField) {
      throw new Error('fieldName must not be blank');
    }

    const placeExists = await this.placesRepo.existsById(placeId);
    if (!placeExists) {
      throw new NotFoundException(`Place ${placeId} not found`);
    }

    const evidence = await this.repo.findById(evidenceArtifactId);
    if (!evidence) {
      throw new NotFoundException(`Evidence artifact ${evidenceArtifactId} not found`);
    }

    const existing = await this.fieldLinksRepo.findLink(placeId, trimmedField, evidenceArtifactId);
    if (existing) return existing;

    const row = this.fieldLinksRepo.create({ placeId, fieldName: trimmedField, evidenceArtifactId });
    return this.fieldLinksRepo.save(row);
  }

  // Read-only lookup, scoped to exactly one (place, field) pair — a different field on the same
  // place, or the same field on a different place, must never leak into the result (verified by
  // PlaceFieldEvidenceLinksRepository.listByPlaceAndField's WHERE clause + the covering index).
  listEvidenceForPlaceField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.fieldLinksRepo.listByPlaceAndField(placeId, fieldName);
  }
}
