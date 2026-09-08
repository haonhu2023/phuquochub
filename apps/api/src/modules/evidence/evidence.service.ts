import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { computeFieldValueHash } from './field-value-hash';
import { GATE_PASSING_VERIFICATION_STATUSES } from './evidence-trust';

// Maps a field_name accepted by PlaceFieldEvidenceLink to how its CURRENT value is actually read.
// Deliberately explicit and small, not a closed enum on the column itself (field_name stays
// free-form VARCHAR, same ADR-020 reasoning as before) — but computing a "current value hash"
// requires knowing where that value lives, so a field with no resolver here cannot be given a
// current-value binding. Extend this map, not the schema, when a new field
// (phone/website/address/price/operating status) needs current-value evidence.
const PLACE_FIELD_VALUE_READERS: Record<string, (place: PlaceDetailRow) => unknown> = {
  opening_hours: (place) => place.opening_hours,
  short_description: (place) => place.short_description,
};

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

// GATE_PASSING_VERIFICATION_STATUSES now lives in ./evidence-trust.ts (re-exported here for
// existing importers of this module) — moved out so PlacesRepository.rightNow() can use the same
// gate without creating a circular import (this file already imports PlacesRepository).
export { GATE_PASSING_VERIFICATION_STATUSES };

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
  // place, pinned to the field's value AT LINK TIME via fieldValueHash (see field-value-hash.ts —
  // same sha256(canonicalJson(value)) idiom as place_translations.source_text_hash). A row alone
  // never means "supports the current value" — only listCurrentEvidenceForPlaceField's comparison
  // against the LIVE value does. Deliberately does NOT touch places.verification_status/verified_at
  // — see PLACES-026 trust-model note: linking evidence to one field must never read as "the whole
  // place is now trusted."
  //
  // Existence checks happen HERE, explicitly, before the insert — same pattern as
  // SourcesService.attachAttribution's `await this.getSource(...)` (clearer error than relying on
  // the FK violation alone, even though the FK is still the real backstop). Reuses
  // getCardByIdIncludingInactive for BOTH the existence check and the current value read — one
  // query, not two — since we need the row's actual field value regardless.
  async linkEvidenceToPlaceField(placeId: string, fieldName: string, evidenceArtifactId: string): Promise<PlaceFieldEvidenceLink> {
    const trimmedField = fieldName?.trim();
    if (!trimmedField) {
      throw new Error('fieldName must not be blank');
    }

    const readCurrentValue = PLACE_FIELD_VALUE_READERS[trimmedField];
    if (!readCurrentValue) {
      throw new BadRequestException(`fieldName "${trimmedField}" has no current-value reader registered`);
    }

    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) {
      throw new NotFoundException(`Place ${placeId} not found`);
    }

    const evidence = await this.repo.findById(evidenceArtifactId);
    if (!evidence) {
      throw new NotFoundException(`Evidence artifact ${evidenceArtifactId} not found`);
    }

    const fieldValueHash = computeFieldValueHash(readCurrentValue(place));

    const existing = await this.fieldLinksRepo.findLink(placeId, trimmedField, evidenceArtifactId, fieldValueHash);
    if (existing) return existing;

    const row = this.fieldLinksRepo.create({ placeId, fieldName: trimmedField, evidenceArtifactId, fieldValueHash });
    return this.fieldLinksRepo.save(row);
  }

  // Read-only lookup, scoped to exactly one (place, field) pair — ALL history, every
  // field_value_hash. A different field on the same place, or the same field on a different place,
  // must never leak into the result (verified by
  // PlaceFieldEvidenceLinksRepository.listByPlaceAndField's WHERE clause + the covering index). Not
  // proof of current-value support — a link here may back a since-superseded value. Use
  // listCurrentEvidenceForPlaceField for a current-value claim.
  listEvidenceForPlaceField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.fieldLinksRepo.listByPlaceAndField(placeId, fieldName);
  }

  // THE current-value query: computes the field's LIVE value hash and returns only links pinned to
  // that exact hash. A link created against a value the field no longer holds (T1: value A linked;
  // T2: value changes to B) is real, retained history that simply will not appear here once the
  // value has moved on — it is never counted as support for the new value. If the place cannot be
  // found, there is no "current value" to compare against, so the honest answer is an empty result,
  // not an error (mirrors listEvidenceForPlaceField's read-only leniency).
  async listCurrentEvidenceForPlaceField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    const readCurrentValue = PLACE_FIELD_VALUE_READERS[fieldName];
    if (!readCurrentValue) {
      throw new BadRequestException(`fieldName "${fieldName}" has no current-value reader registered`);
    }

    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) return [];

    const currentHash = computeFieldValueHash(readCurrentValue(place));
    return this.fieldLinksRepo.listCurrentByPlaceAndField(placeId, fieldName, currentHash);
  }
}
