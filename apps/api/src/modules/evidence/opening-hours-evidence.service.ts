import { randomUUID, createHash } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { SourcesService } from '../sources/sources.service';
import { PlacesRepository } from '../places/repositories/places.repository';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { computeFieldValueHash } from './field-value-hash';
import { canonicalJson } from '../../common/canonical-json';
import { Clock } from '../../common/clock';
import { SourceKind } from '../sources/sources.enums';
import { SubmitOpeningHoursEvidenceDto, ReviewOpeningHoursEvidenceDto } from './dto/opening-hours-evidence.dto';

const EVIDENCE_TYPE = 'opening_hours_observation';

// Opening-Hours Evidence WORKFLOW (admin-submit + moderator-review API/UI) — the missing piece
// identified 2026-10-11: EvidenceService/PlacesRepository already implement the FULL gate
// mechanism (Field-Binding V2, field_value_hash, fail-closed public read) but nothing ever called
// them for opening_hours outside a unit test. This service is a THIN orchestrator over the
// existing, already-audited primitives (EvidenceService.ensureEvidenceArtifact/
// reviewEvidenceArtifact/linkEvidenceToPlaceField, SourcesService.createSource,
// PlacesRepository.getCardByIdIncludingInactive) — it adds ZERO new trust rules and ZERO new
// schema (place_id is carried in evidence_artifacts.metadata, a column that already existed and
// already allows arbitrary jsonb, so no migration is needed). Deliberately scoped to
// opening_hours ONLY (see module header "không xây nền tảng governance mới cho tất cả field") —
// a second field would need its own workflow service, not a generic one bolted on here.
@Injectable()
export class OpeningHoursEvidenceService {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly sourcesService: SourcesService,
    private readonly placesRepo: PlacesRepository,
    private readonly artifactsRepo: EvidenceArtifactsRepository,
    private readonly clock: Clock,
  ) {}

  // Ai được nhập: gác bởi Place.Edit.Managed/.Any ở controller (route param = place id, cùng
  // resolver IDENTITY_PLACE_RESOLVER mọi route sửa place khác đang dùng) — CHÍNH xác người đã được
  // tin để sửa opening_hours của place này, không phải một quyền Source.Create rời rạc không gắn
  // với place cụ thể.
  async submit(placeId: string, dto: SubmitOpeningHoursEvidenceDto, actorUserId: string) {
    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) {
      throw new NotFoundException(`Không tìm thấy địa điểm ${placeId}`);
    }
    if (place.opening_hours === null) {
      throw new BadRequestException(
        'Địa điểm này chưa có giờ mở cửa nào được nhập — nhập giờ mở cửa qua editor trước khi nộp bằng chứng cho nó.',
      );
    }

    const source = await this.sourcesService.createSource(
      {
        type: dto.source_type,
        kind: SourceKind.URL,
        url: dto.source_url,
        title: dto.source_title,
        publisher: dto.source_publisher,
      },
      actorUserId,
    );

    const capturedAt = dto.captured_at ? new Date(dto.captured_at) : this.clock.now();
    const contentHashSha256 = createHash('sha256').update(dto.observed_text, 'utf8').digest('hex');
    const businessKey = `opening_hours_submission:${placeId}:${randomUUID()}`;

    // fieldValueHash TẠI THỜI ĐIỂM NỘP chỉ lưu để hiển thị cho moderator (minh bạch "giá trị lúc
    // người nộp xem là gì") — KHÔNG phải giá trị sẽ được duyệt. reviewEvidenceArtifact (gọi ở
    // review() dưới) luôn tự đọc lại giá trị HIỆN TẠI của place tại chính lúc duyệt — nếu giữa lúc
    // nộp và lúc duyệt có ai sửa opening_hours lần nữa, duyệt sẽ bind theo giá trị MỚI đó, không
    // phải giá trị cũ này (đúng điểm 3 của thiết kế: bằng chứng luôn so khớp giá trị CÒN HIỆU LỰC
    // ngay lúc quyết định, không phải giá trị tại lúc nộp).
    const fieldValueHashAtSubmission = computeFieldValueHash(place.opening_hours);

    const artifact = await this.evidenceService.ensureEvidenceArtifact({
      sourceId: source.id,
      businessKey,
      evidenceType: EVIDENCE_TYPE,
      sourceUrl: dto.source_url,
      capturedAt,
      contentHashSha256,
      verificationStatus: 'NEEDS_REVIEW',
      metadata: {
        place_id: placeId,
        observed_text: dto.observed_text,
        schedule_stability_claimed: dto.schedule_stability,
        field_value_hash_at_submission: fieldValueHashAtSubmission,
        submitted_by: actorUserId,
      },
    });

    return {
      evidence_artifact_id: artifact.id,
      place_id: placeId,
      verification_status: artifact.verificationStatus,
    };
  }

  // Ai được duyệt: gác bởi Source.Verify ở controller (hiện chỉ moderator giữ) — tách biệt khỏi
  // Place.Edit.Managed/.Any của submit() nên business_manager không tự duyệt được bằng chứng của
  // chính mình (self-review không khả thi thực tế, không cần thêm ràng buộc "khác người" riêng).
  async listPending() {
    const artifacts = await this.artifactsRepo.listByTypeAndStatus(EVIDENCE_TYPE, 'NEEDS_REVIEW');
    const rows = [];
    for (const artifact of artifacts) {
      const placeId = (artifact.metadata?.place_id as string | undefined) ?? null;
      const place = placeId ? await this.placesRepo.getCardByIdIncludingInactive(placeId) : null;
      rows.push({
        evidence_artifact_id: artifact.id,
        place_id: placeId,
        place_name: place?.name ?? null,
        place_slug: place?.slug ?? null,
        // Giá trị HIỆN TẠI của place (không phải giá trị lúc nộp) — để moderator so khớp trực tiếp
        // với observed_text, đúng việc "con người xét lại", không chỉ ký nhận một con số đã có.
        place_current_opening_hours: place?.opening_hours ?? null,
        source_url: artifact.sourceUrl,
        captured_at: artifact.capturedAt,
        observed_text: (artifact.metadata?.observed_text as string | undefined) ?? null,
        schedule_stability_claimed: (artifact.metadata?.schedule_stability_claimed as string | undefined) ?? null,
        submitted_at: artifact.createdAt,
      });
    }
    return rows;
  }

  async review(evidenceArtifactId: string, dto: ReviewOpeningHoursEvidenceDto, reviewerUserId: string, reviewerName: string) {
    const artifact = await this.artifactsRepo.findById(evidenceArtifactId);
    if (!artifact) {
      throw new NotFoundException(`Không tìm thấy bằng chứng ${evidenceArtifactId}`);
    }
    if (artifact.evidenceType !== EVIDENCE_TYPE) {
      throw new BadRequestException(`Bằng chứng ${evidenceArtifactId} không thuộc luồng opening_hours`);
    }
    const placeId = artifact.metadata?.place_id as string | undefined;
    if (!placeId) {
      throw new BadRequestException(`Bằng chứng ${evidenceArtifactId} thiếu place_id trong metadata — không tạo bởi luồng này`);
    }
    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) {
      throw new NotFoundException(`Không tìm thấy địa điểm ${placeId}`);
    }

    // Luôn đọc lại giá trị HIỆN TẠI ngay lúc duyệt — không dùng field_value_hash_at_submission đã
    // lưu ở metadata. Nếu place đã bị sửa opening_hours lần nữa sau khi nộp, duyệt này bind theo
    // giá trị MỚI; nếu observed_text không còn khớp giá trị mới đó, moderator phải tự nhận ra qua
    // so sánh hiển thị ở listPending() và chọn NEEDS_CHANGES/REJECT — cơ chế hash không tự phát
    // hiện "nội dung không khớp ý nghĩa", chỉ phát hiện "giá trị đã đổi so với README gốc" một khi
    // có MỘT giá trị khác đã từng được approve trước đó.
    const fieldValueHash = computeFieldValueHash(place.opening_hours);

    const approvalArtifactSha256 = createHash('sha256')
      .update(
        canonicalJson({
          evidenceArtifactId,
          placeId,
          fieldName: 'opening_hours',
          fieldValueHash,
          reviewerUserId,
          decision: dto.decision,
          reviewNote: dto.review_note ?? null,
          nonce: randomUUID(),
        }),
        'utf8',
      )
      .digest('hex');

    const result = await this.evidenceService.reviewEvidenceArtifact({
      evidenceArtifactId,
      decision: dto.decision,
      reviewerName,
      approvalArtifactSha256,
      claimType: 'opening_hours',
      scheduleStability: dto.schedule_stability,
      evidenceContentSha256: artifact.contentHashSha256,
      reviewNote: dto.review_note ?? null,
      reviewerUserId,
      placeId,
      fieldName: 'opening_hours',
      fieldValueHash,
    });

    let linked = false;
    if (result.evidenceVerified) {
      await this.evidenceService.linkEvidenceToPlaceField(placeId, 'opening_hours', evidenceArtifactId);
      linked = true;
    }

    return {
      decision: dto.decision,
      eligible: result.evaluation.eligible,
      reason_codes: result.evaluation.reasonCodes,
      evidence_verified: result.evidenceVerified,
      linked_to_public_gate: linked,
    };
  }
}
