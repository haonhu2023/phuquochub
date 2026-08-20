import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { Contact } from '../contacts/entities/contact.entity';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { PriceHistory } from '../prices/entities/price-history.entity';
import { MediaRepository } from '../media/repositories/media.repository';
import { Media } from '../media/entities/media.entity';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { RevisionListRow } from '../revisions/repositories/revisions.repository';
import { RevisionsService } from '../revisions/revisions.service';
import { SourceAttribution } from '../sources/entities/source-attribution.entity';
import { ReviewsRepository } from '../reviews/repositories/reviews.repository';
import { BusinessClaimsRepository } from '../business/repositories/business-claims.repository';
import { PlaceSeo } from '../places/entities/place-seo.entity';
import { PlaceAiSummary } from '../places/entities/place-ai-summary.entity';
import { VerificationStatus } from '../places/place.enums';
import { MediaStatus } from '../media/media.enums';
import { ADMINISTRATIVE_BACKFILL_TARGETS } from './administrative-backfill.manifest';
import {
  AuditIssue,
  AuditReport,
  AuditSummary,
  AuditTrustSourceRef,
  FieldCoverageRow,
  IssueConfidence,
  IssuePriority,
  IssueType,
  PlaceAuditRecord,
} from './data-quality-audit.types';

// PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE — CÙNG hằng số places.service.ts dùng cho trust_sources
// (Place Trust & Freshness Surface, b07ecd8). Không export từ đó (places.service.ts là service,
// không phải module dùng chung) nên khai lại — đúng tiền lệ PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE
// đã có ở administrative-backfill.service.ts.
const PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE = 'place_field';
const PLACE_OWNER_DISCRIMINATOR = 'place';

/** Trạng thái tin cậy — CÙNG định nghĩa `isTrustedStatus()` (verification.transition.ts) và
 *  `isTrustedVerification()` (apps/web/src/modules/places/trust.ts). MỘT định nghĩa, ba nơi dùng
 *  (API ghi cache, web hiển thị, audit đọc) — không suy luận lại theo cách khác ở đây. */
function isTrustedStatus(status: VerificationStatus): boolean {
  return (
    status === VerificationStatus.VERIFIED ||
    status === VerificationStatus.OFFICIAL ||
    status === VerificationStatus.COMMUNITY_VERIFIED
  );
}

/**
 * 49 slug chính thức của bộ nội dung hiện tại — TÁI DÙNG danh sách đã có ở
 * `administrative-backfill.manifest.ts` (nguồn thật duy nhất, đã được owner phê duyệt bao gồm
 * Grand World). KHÔNG khai lại danh sách này ở đây — trôi giữa hai bản sao là đúng loại lỗi
 * audit này tồn tại để bắt.
 */
export const AUDIT_TARGET_SLUGS: readonly string[] = ADMINISTRATIVE_BACKFILL_TARGETS.map((t) => t.slug);

/** Khoảng cách xấp xỉ (mét) giữa hai toạ độ — công thức haversine, đủ chính xác cho việc phát hiện
 *  trùng lặp ở quy mô một hòn đảo (không cần độ chính xác trắc địa). */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface ContactInfo {
  hasPhone: boolean;
  hasWebsite: boolean;
  verifiedContactCount: number;
  totalContacts: number;
  /** Ít nhất một dòng price_history hiện hành có verificationStatus tin cậy — CÙNG nguyên tắc
   *  "điền nhưng chưa xác minh ≠ NULL" áp cho contacts (Phase 8 của brief), áp lại cho giá. */
  hasVerifiedPrice: boolean;
}

/**
 * DATA QUALITY ASSISTANT — Deterministic Place Audit (2026-08-20).
 *
 * ĐỌC-CHỈ-ĐỌC: hàm `audit()` KHÔNG BAO GIỜ ghi bất kỳ bảng nào — không UPDATE, không INSERT,
 * không xoá mềm. Toàn bộ bề mặt là các repository `list*`/`get*`/`current`/`find*` đã có sẵn từ
 * places/contacts/prices/media/sources/revisions/reviews/business — không subsystem nào bị nhân
 * bản (Section 3/21 của brief: "AI đề xuất, KHÔNG BAO GIỜ tự xuất bản"). Không có bảng nào được
 * tạo cho kết quả audit (Phase 12 "prefer no migration") — `AuditReport` là một object thuần,
 * caller (CLI script) quyết định ghi ra file hay không.
 *
 * MỖI issue PHẢI có: field, current_value, reason, confidence, evidence (hoặc `null` nếu không
 * có), và `status` luôn `NEEDS_HUMAN_REVIEW` — không có nhánh nào tự đặt `status` khác. Không hàm
 * nào trong file này tạo ra một giá trị thay thế (điện thoại, giờ mở cửa, giá, địa chỉ, toạ độ...)
 * — nơi thiếu dữ liệu, `proposed_value` LUÔN `null`.
 */
@Injectable()
export class DataQualityAuditService {
  constructor(
    private readonly placesRepo: PlacesRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly pricesRepo: PricesRepository,
    private readonly mediaRepo: MediaRepository,
    private readonly sourceAttributionsRepo: SourceAttributionsRepository,
    private readonly sourcesRepo: SourcesRepository,
    private readonly revisionsService: RevisionsService,
    private readonly reviewsRepo: ReviewsRepository,
    private readonly businessClaimsRepo: BusinessClaimsRepository,
    @InjectRepository(PlaceSeo)
    private readonly placeSeoRepo: Repository<PlaceSeo>,
    @InjectRepository(PlaceAiSummary)
    private readonly placeAiSummaryRepo: Repository<PlaceAiSummary>,
  ) {}

  /**
   * Chạy audit cho danh sách slug đã cho (mặc định: 49 slug chính thức). Slug không tìm thấy
   * (không tồn tại HOẶC chưa `published`) được GHI LẠI trong `administrative_notes`, không làm
   * hỏng cả lượt chạy — cùng nguyên tắc `administrative-backfill.service.ts` xử lý `not_found`.
   */
  async audit(slugs: readonly string[] = AUDIT_TARGET_SLUGS): Promise<AuditReport> {
    const notes: string[] = [];
    const records: PlaceAuditRecord[] = [];
    const issues: AuditIssue[] = [];
    const notFound: string[] = [];

    for (const slug of slugs) {
      const built = await this.buildPlaceRecord(slug);
      if (!built) {
        notFound.push(slug);
        continue;
      }
      records.push(built.record);
      issues.push(...built.issues);
    }

    if (notFound.length > 0) {
      notes.push(
        `${notFound.length} slug trong danh sách 49 không tìm thấy (không tồn tại hoặc chưa published): ${notFound.join(', ')}`,
      );
    }

    issues.push(...this.knownCuratorClaims(records));
    issues.push(...this.detectPossibleDuplicates(records));
    notes.push(...this.administrativeReconciliationNotes());

    return {
      audit_run_id: randomUUID(),
      generated_at: new Date().toISOString(),
      dataset_version: `${records.length}/${slugs.length} places`,
      summary: this.buildSummary(records, issues),
      field_coverage: this.buildFieldCoverage(records),
      places: records,
      issues,
      administrative_notes: notes,
    };
  }

  /**
   * Phase 9 của brief — KHU PHỐ. Cột `khu_pho` KHÔNG tồn tại ở schema `places` (chỉ có `ward` —
   * nhãn khu vực, KHÔNG phải đơn vị hành chính, xem place.entity.ts). Vì vậy đây là một GHI CHÚ
   * HỆ THỐNG, không phải 49 issue lặp lại "thiếu khu_pho" cho từng place (điều đó sẽ ngụ ý field
   * này có thể điền ngay bây giờ, trong khi thực ra chưa có nơi nào để điền).
   *
   * Discrepancy do owner cung cấp trong brief: "46 khu phố đổi tên + 5 giữ tên" nhưng nghiên cứu
   * trước đó phát hiện danh sách chi tiết cộng lại ra 47. KHÔNG tự giải quyết chênh lệch này —
   * chỉ báo cáo NEEDS_SOURCE_RECONCILIATION, đúng yêu cầu brief.
   */
  private administrativeReconciliationNotes(): string[] {
    return [
      'NEEDS_SOURCE_RECONCILIATION: Chưa có văn bản/URL nguồn chính thức nào được lưu trong repository ' +
        'cho cấu trúc khu phố (46 đổi tên + 5 giữ tên, hiệu lực 23/10/2025, theo thông tin owner cung ' +
        'cấp trong brief tác vụ này). Một nghiên cứu trước đó (không lưu vết trong repo) phát hiện danh ' +
        'sách chi tiết cộng lại 47 mục thay vì 46 — chênh lệch này CHƯA được đối chiếu lại với văn bản ' +
        'gốc. Không tạo bảng tham chiếu khu phố, không gán khu_pho cho bất kỳ place nào cho tới khi có ' +
        'nguồn xác thực được trích dẫn được (URL/số hiệu văn bản).',
      'Trường `khu_pho` không tồn tại trên bảng `places` — 49/49 place đều `null` vì cột chưa được ' +
        'tạo, không phải vì dữ liệu bị thiếu ở nơi lẽ ra đã có. Không tính vào field_coverage.',
    ];
  }

  /**
   * GENERIC_CATEGORY / POSSIBLE_CLOSED_PLACE — hai loại issue này đòi PHÁN ĐOÁN theo ngữ cảnh
   * (vd "đây là danh mục nhiều nhà điều hành, không phải một cơ sở"), KHÔNG suy ra được từ field
   * đã có bằng luật xác định. Không đoán mò bằng heuristic (tên chứa "tour"/"chợ"…) — chỉ ghi lại
   * NGUYÊN VĂN các claim đã có trong brief tác vụ này (Phase 6), gắn rõ `confidence: LOW` và
   * `evidence` trỏ về nguồn thật của claim (chưa phải một nguồn chính thức đã xác minh) — để không
   * ai đọc issue này rồi tưởng nó là một phát hiện đã được xác nhận.
   */
  private knownCuratorClaims(records: PlaceAuditRecord[]): AuditIssue[] {
    const claims: Array<{
      slug: string;
      type: IssueType;
      priority: IssuePriority;
      reason: string;
      evidence: string;
    }> = [
      {
        slug: 'cho-dem-phu-quoc',
        type: IssueType.POSSIBLE_CLOSED_PLACE,
        priority: 'P0',
        reason:
          'Claim (chưa xác minh qua nguồn chính thức): được báo cáo đã đóng cửa kể từ 28/02/2026. ' +
          'Nếu đúng, place này đang hiển thị cho khách như đang hoạt động trong khi thực tế đã đóng — ' +
          'rủi ro sai lệch thông tin cao, cần xác nhận tình trạng hoạt động hiện tại TRƯỚC bất kỳ ' +
          'thay đổi nào khác.',
        evidence: 'Ghi chú trong task brief (Phase 6) — chưa có URL/văn bản nguồn chính thức nào đính kèm.',
      },
      {
        slug: 'tour-3-dao-an-thoi',
        type: IssueType.GENERIC_CATEGORY,
        priority: 'P1',
        reason:
          'Claim (chưa xác minh): đây có thể là một DANH MỤC tour do nhiều nhà điều hành khai thác ' +
          '("3 đảo An Thới" là tên tuyến, không phải tên một doanh nghiệp), không phải một cơ sở kinh ' +
          'doanh đơn lẻ. Nếu đúng, hiển thị như một "place" duy nhất có thể gây hiểu lầm — cần quyết ' +
          'định giữ nguyên như mục tổng quát hay tách theo từng nhà điều hành.',
        evidence: 'Ghi chú trong task brief (Phase 6) — cần xác nhận qua khảo sát thị trường/nhà điều hành thật.',
      },
    ];

    const issues: AuditIssue[] = [];
    for (const claim of claims) {
      const record = records.find((r) => r.slug === claim.slug);
      if (!record) continue; // slug không có trong lượt audit này (vd chạy với --slugs= một tập con)
      issues.push({
        place_id: record.id,
        place_slug: record.slug,
        place_name: record.name,
        issue_type: claim.type,
        priority: claim.priority,
        field: null,
        current_value: null,
        proposed_value: null,
        reason: claim.reason,
        evidence: claim.evidence,
        confidence: 'LOW',
        status: 'NEEDS_HUMAN_REVIEW',
      });
    }
    return issues;
  }

  /**
   * POSSIBLE_DUPLICATE — kiểm tra RẺ, XÁC ĐỊNH: hai place CÙNG category cách nhau dưới
   * `DUPLICATE_DISTANCE_METERS`. Ngưỡng này là ĐỀ XUẤT MẶC ĐỊNH, KHÔNG phải một chính sách đã có
   * sẵn trong repository (khác freshness — nơi backend đã có `expires_at`) — ghi rõ ở đây để không
   * ai đọc nhầm nó là một hằng số đã được owner duyệt.
   */
  private detectPossibleDuplicates(records: PlaceAuditRecord[]): AuditIssue[] {
    const DUPLICATE_DISTANCE_METERS = 25;
    const issues: AuditIssue[] = [];
    const flagged = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i];
        const b = records[j];
        if (a.category_slug !== b.category_slug) continue;
        const distance = haversineMeters(a.location, b.location);
        if (distance > DUPLICATE_DISTANCE_METERS) continue;
        for (const [self, other] of [
          [a, b],
          [b, a],
        ] as const) {
          const key = `${self.slug}:${other.slug}`;
          if (flagged.has(key)) continue;
          flagged.add(key);
          issues.push({
            place_id: self.id,
            place_slug: self.slug,
            place_name: self.name,
            issue_type: IssueType.POSSIBLE_DUPLICATE,
            priority: 'P2',
            field: 'location',
            current_value: `${self.location.lat},${self.location.lng}`,
            proposed_value: null,
            reason: `Toạ độ cách "${other.name}" (${other.slug}) chỉ ~${Math.round(distance)}m, cùng danh mục — có thể là cùng một địa điểm ghi hai lần, hoặc hai cơ sở thật sự sát nhau. Ngưỡng ${DUPLICATE_DISTANCE_METERS}m là đề xuất mặc định, cần owner xác nhận trước khi coi là chính sách.`,
            evidence: null,
            confidence: 'LOW',
            status: 'NEEDS_HUMAN_REVIEW',
          });
        }
      }
    }
    return issues;
  }

  // -------------------------------------------------------------------------
  // Xây dựng bản ghi audit cho MỘT place
  // -------------------------------------------------------------------------

  private async buildPlaceRecord(
    slug: string,
  ): Promise<{ record: PlaceAuditRecord; issues: AuditIssue[] } | null> {
    const row = await this.placesRepo.getDetailBySlug(slug);
    if (!row) return null;

    const [contacts, currentPrices, allMedia, attributions, revisions, reviews, claims, seo, aiSummary, faqs] =
      await Promise.all([
        this.contactsRepo.listByOwner(PLACE_OWNER_DISCRIMINATOR, row.id),
        this.pricesRepo.current(PLACE_OWNER_DISCRIMINATOR, row.id),
        this.mediaRepo.listAllByPlace(row.id),
        this.sourceAttributionsRepo.listByEntity(PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE, row.id),
        this.revisionsService.listByPlace(row.id),
        this.reviewsRepo.listPublishedByPlace(row.id),
        // limit rộng hơn 1: list() ORDER BY createdAt ASC (đọc phân trang cho moderator, không
        // phải "mới nhất trước") — cần đủ hàng để tự tìm claim MỚI NHẤT ở dưới, không lấy nhầm
        // claim CŨ NHẤT nếu chỉ giới hạn 1.
        this.businessClaimsRepo.list({ placeId: row.id, limit: 20, offset: 0 }),
        this.placeSeoRepo.findOne({ where: { placeId: row.id } }),
        this.placeAiSummaryRepo.findOne({ where: { placeId: row.id } }),
        this.placesRepo.listFaqs(row.id),
      ]);

    const contactInfo = this.summarizeContacts(contacts, currentPrices);
    const publishedMedia = allMedia.filter((m) => m.status === MediaStatus.PUBLISHED);
    const licensedMedia = allMedia.filter((m) => m.licenseType !== null);
    const trustSources = await this.resolveTrustSources(attributions);
    const distinctSourceIds = new Set(attributions.map((a) => a.sourceId));
    const fieldsCovered = [...new Set(attributions.map((a) => a.field).filter((f): f is string => f !== null))];
    const latestRevision = revisions[0] ?? null; // listByEntity đã ORDER BY revision_number DESC (xem repository)
    const latestClaim =
      claims.items.length === 0
        ? null
        : claims.items.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));

    const completeness = this.computeCompleteness(row, contactInfo, allMedia, revisions);
    const trust = this.computeTrust(row, contactInfo, attributions, licensedMedia, allMedia);
    const freshness = this.computeFreshness(row);
    const overall = Math.round((completeness + trust + freshness) / 3);

    const record: PlaceAuditRecord = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category_slug: row.category_slug,
      status: row.status,
      address: row.address,
      province: row.province,
      admin_area: row.admin_area,
      ward: row.ward,
      khu_pho: null,
      location: { lat: row.lat, lng: row.lng },
      price_range: row.price_range,
      contacts: {
        total: contactInfo.totalContacts,
        phone_count: contacts.filter((c) => /phone|hotline|mobile|tel/i.test(c.contactType)).length,
        website_count: contacts.filter((c) => /website|url/i.test(c.contactType)).length,
        verified_count: contactInfo.verifiedContactCount,
      },
      opening_hours_present: row.opening_hours !== null && Object.keys(row.opening_hours).length > 0,
      media: {
        total: allMedia.length,
        published: publishedMedia.length,
        licensed: licensedMedia.length,
        license_gap: allMedia.length - licensedMedia.length,
      },
      sources: {
        attribution_count: attributions.length,
        distinct_source_count: distinctSourceIds.size,
        fields_covered: fieldsCovered,
      },
      verification_status: row.verification_status,
      verified_at: row.verified_at ? row.verified_at.toISOString() : null,
      trust_sources: trustSources,
      reviews_count: reviews.length,
      // listFaqs() chỉ trả FAQ status='published' (places.repository.ts) — cùng tập FAQ mà
      // GET /places/:slug công khai trả về, không phải toàn bộ hàng kể cả pending/hidden.
      faq_count: faqs.length,
      seo: {
        has_meta_title: !!seo?.metaTitle,
        has_meta_description: !!seo?.metaDescription,
      },
      ai_summary: {
        exists: aiSummary !== null,
        status: aiSummary?.status ?? null,
        is_approved: aiSummary?.isApproved ?? false,
      },
      business_claim: {
        has_any: claims.total > 0,
        latest_status: latestClaim?.status ?? null,
      },
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      last_revision_at: latestRevision ? latestRevision.created_at.toISOString() : null,
      scores: { completeness, trust, freshness, overall },
    };

    const issues = this.buildIssues(record, row, contacts, currentPrices);

    return { record, issues };
  }

  /**
   * Ghép publisher thật cho trust_sources — CÙNG cách `PlacesService.resolveTrustSources()` làm
   * cho GET /places/:slug (b07ecd8): dedupe sourceId rồi `findById` từng nguồn (số attribution mỗi
   * place rất nhỏ, N+1 ở đây không đáng kể — 49 place, không phải danh sách/tìm kiếm). Attribution
   * trỏ tới source đã bị xoá mềm (`findById` lọc `deleted_at IS NULL`) bị bỏ qua, không hiện publisher rỗng.
   */
  private async resolveTrustSources(attributions: readonly SourceAttribution[]): Promise<AuditTrustSourceRef[]> {
    if (attributions.length === 0) return [];
    const uniqueSourceIds = [...new Set(attributions.map((a) => a.sourceId))];
    const sources = await Promise.all(uniqueSourceIds.map((id) => this.sourcesRepo.findById(id)));
    const sourceById = new Map(sources.filter((s) => s !== null).map((s) => [s.id, s]));
    const resolved: AuditTrustSourceRef[] = [];
    for (const a of attributions) {
      const source = sourceById.get(a.sourceId);
      if (!source) continue;
      resolved.push({ field: a.field, publisher: source.publisher });
    }
    return resolved;
  }

  private summarizeContacts(contacts: readonly Contact[], currentPrices: readonly PriceHistory[]): ContactInfo {
    const hasPhone = contacts.some((c) => /phone|hotline|mobile|tel/i.test(c.contactType));
    const hasWebsite = contacts.some((c) => /website|url/i.test(c.contactType));
    const verifiedContactCount = contacts.filter((c) => isTrustedStatus(c.verificationStatus)).length;
    const hasVerifiedPrice = currentPrices.some((p) => isTrustedStatus(p.verificationStatus));
    return { hasPhone, hasWebsite, verifiedContactCount, totalContacts: contacts.length, hasVerifiedPrice };
  }

  // -------------------------------------------------------------------------
  // Scoring — ba trục TÁCH BIỆT (Phase 4 của brief). Xem class doc: COMPLETENESS đo sự HIỆN DIỆN,
  // TRUST đo BẰNG CHỨNG, FRESHNESS đo mức "còn hiệu lực theo chính sách hết hạn đã có" — không
  // trục nào được phép bù cho trục kia (một điện thoại điền nhưng chưa xác minh không được cộng
  // điểm TRUST, dù nó CÓ cộng điểm COMPLETENESS).
  // -------------------------------------------------------------------------

  /** Trọng số cộng dồn = 100. Chỉ đo "có mặt hay không", không đánh giá độ tin cậy. */
  private computeCompleteness(
    row: PlaceDetailRow,
    contactInfo: ContactInfo,
    media: readonly Media[],
    revisions: readonly RevisionListRow[],
  ): number {
    let score = 0;
    if (row.address) score += 10;
    if (row.province) score += 5;
    if (row.admin_area) score += 5;
    if (row.ward) score += 5;
    if (row.price_range) score += 10;
    if (row.opening_hours && Object.keys(row.opening_hours).length > 0) score += 15;
    if (contactInfo.hasPhone) score += 15;
    if (contactInfo.hasWebsite) score += 10;
    if (media.length > 0) score += 15;
    if (revisions.length > 0) score += 10;
    return score;
  }

  /** Trọng số cộng dồn = 100. Mỗi thành phần đòi BẰNG CHỨNG cụ thể, không phải chỉ "có giá trị". */
  private computeTrust(
    row: PlaceDetailRow,
    contactInfo: ContactInfo,
    attributions: readonly SourceAttribution[],
    licensedMedia: readonly Media[],
    allMedia: readonly Media[],
  ): number {
    let score = 0;
    if (isTrustedStatus(row.verification_status as VerificationStatus)) score += 40;
    if (attributions.length > 0) score += 25;
    // Một chi tiết CỤ THỂ (liên hệ hoặc giá) có bằng chứng — CÙNG một hạng mục, không cộng dồn hai
    // lần cho hai loại field khác nhau (tránh thổi phồng điểm chỉ vì có NHIỀU loại field hơn).
    if (contactInfo.verifiedContactCount > 0 || contactInfo.hasVerifiedPrice) score += 15;
    if (allMedia.length > 0 && licensedMedia.length === allMedia.length) score += 20;
    else if (licensedMedia.length > 0) score += 10; // một phần được cấp phép — điểm một phần, không toàn phần
    return score;
  }

  /**
   * KHÔNG tự đặt ngưỡng số-ngày (bài học từ Place Trust & Freshness Surface, b07ecd8): hệ thống
   * ĐÃ CÓ chính sách hết hạn ở backend (`expires_at` + job `expireOverdue()`, verification.md §7).
   * `verification_status = 'expired'` CHÍNH LÀ tín hiệu "đã lâu chưa xác minh lại" — không suy ra
   * gì thêm từ `updated_at`/`created_at` (đó sẽ là phát minh lại một ngưỡng freshness thứ hai,
   * không đồng bộ với ngưỡng backend đã có).
   */
  private computeFreshness(
    row: PlaceDetailRow,
  ): number {
    const status = row.verification_status as VerificationStatus;
    if (isTrustedStatus(status)) return 100;
    if (status === VerificationStatus.EXPIRED) return 30;
    return 0; // pending/rejected — chưa từng có, hoặc không còn, một trạng thái tin cậy
  }

  // -------------------------------------------------------------------------
  // Issue generation — MỖI rule ở đây phải trích dẫn được field/current_value/reason cụ thể.
  // -------------------------------------------------------------------------

  private buildIssues(
    record: PlaceAuditRecord,
    row: PlaceDetailRow,
    contacts: readonly Contact[],
    currentPrices: readonly PriceHistory[],
  ): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const push = (
      type: IssueType,
      priority: IssuePriority,
      field: string | null,
      currentValue: string | null,
      reason: string,
      confidence: IssueConfidence,
      evidence: string | null = null,
    ) => {
      issues.push({
        place_id: record.id,
        place_slug: record.slug,
        place_name: record.name,
        issue_type: type,
        priority,
        field,
        current_value: currentValue,
        proposed_value: null, // audit không bao giờ đề xuất giá trị thay thế cụ thể (Section 4 của brief)
        reason,
        evidence,
        confidence,
        status: 'NEEDS_HUMAN_REVIEW',
      });
    };

    // MISSING_FIELD — hữu dụng trực tiếp cho khách (Phase 18: "ở đâu / liên hệ thế nào / giờ nào / giá bao nhiêu")
    if (!record.contacts.phone_count) {
      push(
        IssueType.MISSING_FIELD,
        'P1',
        'phone',
        null,
        'Không có số điện thoại liên hệ — khách không thể gọi xác nhận trước khi đến.',
        'HIGH',
      );
    }
    if (!record.opening_hours_present) {
      push(
        IssueType.MISSING_FIELD,
        'P1',
        'opening_hours',
        null,
        'Thiếu giờ mở cửa — không trả lời được câu hỏi cơ bản nhất "còn mở không".',
        'HIGH',
      );
    }
    if (!record.address) {
      push(
        IssueType.MISSING_FIELD,
        'P1',
        'address',
        null,
        'Thiếu địa chỉ cụ thể — chỉ có toạ độ, khách khó xác nhận đã đến đúng nơi qua bản đồ/taxi.',
        'HIGH',
      );
    }
    if (!record.contacts.website_count) {
      push(IssueType.MISSING_FIELD, 'P2', 'website', null, 'Không có website/kênh chính thức.', 'HIGH');
    }
    if (!record.price_range) {
      push(IssueType.MISSING_FIELD, 'P2', 'price_range', null, 'Thiếu mức giá tham khảo.', 'HIGH');
    }
    if (!record.faq_count) {
      push(
        IssueType.LOW_USER_UTILITY,
        'P2',
        'faqs',
        null,
        'Không có câu hỏi thường gặp nào được duyệt — giảm hữu ích cho người mới đến.',
        'MEDIUM',
      );
    }

    // ADMINISTRATIVE_MISMATCH — có nguồn cụ thể để trích dẫn (đợt backfill administrative đã có)
    if (!record.province || !record.admin_area) {
      const inManifest = AUDIT_TARGET_SLUGS.includes(record.slug);
      push(
        IssueType.ADMINISTRATIVE_MISMATCH,
        'P1',
        !record.province ? 'province' : 'admin_area',
        null,
        inManifest
          ? 'Chưa có province/admin_area dù place này đã nằm trong danh sách backfill hành chính đã duyệt (Nghị quyết 1654/NQ-UBTVQH15) — migration StrengthenPlaceInformationModel đã tạo cột, script admin:backfill-administrative-data chưa chạy trên môi trường này.'
          : 'Chưa có province/admin_area và place này KHÔNG có trong danh sách backfill hành chính hiện tại — cần xác nhận trước khi thêm vào danh sách.',
        'HIGH',
        inManifest ? 'administrative-backfill.manifest.ts (Nghị quyết 1654/NQ-UBTVQH15)' : null,
      );
    }
    // CONFLICTING_DATA — địa chỉ còn nhắc tỉnh cũ trong khi province đã cập nhật (kiểm tra hẹp, an toàn)
    if (record.address && record.province && /Kiên Giang/i.test(record.address)) {
      push(
        IssueType.CONFLICTING_DATA,
        'P1',
        'address',
        record.address,
        `Chuỗi address vẫn nhắc "Kiên Giang" trong khi province đã cập nhật thành "${record.province}" — hai trường mâu thuẫn nhau.`,
        'HIGH',
      );
    }

    // TRUST_GAP / STALE_DATA — dùng ĐÚNG chính sách backend đã có (không tự đặt ngưỡng)
    if (record.verification_status === VerificationStatus.PENDING || record.verification_status === VerificationStatus.REJECTED) {
      push(
        IssueType.TRUST_GAP,
        'P1',
        'verification_status',
        record.verification_status,
        'Place chưa từng đạt trạng thái tin cậy (verified/official/community_verified) — badge "Đã xác minh" sẽ không hiện ra với khách.',
        'HIGH',
      );
    }
    if (record.verification_status === VerificationStatus.EXPIRED) {
      const isShowcase = SHOWCASE_15_SLUGS.has(record.slug);
      push(
        IssueType.STALE_DATA,
        isShowcase ? 'P0' : 'P1',
        'verification_status',
        record.verification_status,
        isShowcase
          ? 'Xác minh đã hết hạn cho một place THUỘC DANH SÁCH SHOWCASE (độ hiển thị cao) — rủi ro sai lệch thông tin cho nhiều khách hơn.'
          : 'Xác minh đã hết hạn — cần xác minh lại theo đúng luồng verifications hiện có.',
        'HIGH',
      );
    }

    // MISSING_SOURCE
    if (record.sources.attribution_count === 0) {
      push(
        IssueType.MISSING_SOURCE,
        'P1',
        null,
        null,
        'Không có source_attributions nào cho place này — không trường nào có thể hiển thị "đối chiếu với nguồn: X" trên Trust Surface.',
        'HIGH',
      );
    }

    // UNVERIFIED_VALUE — có giá trị nhưng KHÔNG có bằng chứng cho riêng giá trị đó
    for (const c of contacts) {
      if (!isTrustedStatus(c.verificationStatus)) {
        push(
          IssueType.UNVERIFIED_VALUE,
          'P1',
          `contact:${c.contactType}`,
          c.value,
          `Liên hệ "${c.contactType}" có giá trị nhưng verification_status="${c.verificationStatus}" — KHÔNG được hiển thị như thông tin đã kiểm chứng.`,
          'HIGH',
        );
      }
    }
    // CÙNG nguyên tắc, áp cho price_history hiện hành (Phase 8 của brief: "phone điền nhưng chưa
    // xác minh KHÔNG được coi bằng NULL" — áp lại cho giá).
    for (const p of currentPrices) {
      if (!isTrustedStatus(p.verificationStatus)) {
        push(
          IssueType.UNVERIFIED_VALUE,
          'P1',
          `price:${p.serviceName}`,
          `${p.amount} ${p.currency}`,
          `Giá "${p.serviceName}" có giá trị nhưng verification_status="${p.verificationStatus}" — KHÔNG được hiển thị như mức giá đã kiểm chứng.`,
          'HIGH',
        );
      }
    }

    // MISSING_MEDIA / LICENSE_GAP
    if (record.media.total === 0) {
      push(
        IssueType.MISSING_MEDIA,
        'P1',
        'media',
        null,
        'Không có ảnh nào (kể cả pending) — trang chi tiết không có gallery.',
        'HIGH',
      );
    } else if (record.media.license_gap > 0) {
      push(
        IssueType.LICENSE_GAP,
        'P1',
        'media.license_type',
        `${record.media.license_gap}/${record.media.total} chưa gán license_type`,
        'Có ảnh chưa được xét quyền sử dụng (license_type NULL) — không đủ điều kiện xuất bản cho tới khi xét.',
        'HIGH',
      );
    }

    // SEO_GAP
    if (!record.seo.has_meta_title || !record.seo.has_meta_description) {
      push(
        IssueType.SEO_GAP,
        'P2',
        'place_seo',
        null,
        'Chưa có meta_title/meta_description riêng — trang dùng fallback (tên/short_description).',
        'HIGH',
      );
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // Coverage matrix + summary
  // -------------------------------------------------------------------------

  private buildFieldCoverage(records: PlaceAuditRecord[]): FieldCoverageRow[] {
    const total = records.length;
    const row = (field: string, filledCount: number): FieldCoverageRow => ({
      field,
      filled: filledCount,
      empty: total - filledCount,
      coverage_pct: total === 0 ? 0 : Math.round((filledCount / total) * 1000) / 10,
    });

    return [
      row('name', records.filter((r) => !!r.name).length),
      row('address', records.filter((r) => !!r.address).length),
      row('province', records.filter((r) => !!r.province).length),
      row('admin_area', records.filter((r) => !!r.admin_area).length),
      row('ward', records.filter((r) => !!r.ward).length),
      row('phone', records.filter((r) => r.contacts.phone_count > 0).length),
      row('website', records.filter((r) => r.contacts.website_count > 0).length),
      row('opening_hours', records.filter((r) => r.opening_hours_present).length),
      row('price_range', records.filter((r) => !!r.price_range).length),
      row('photos', records.filter((r) => r.media.total > 0).length),
      row('licensed_photos', records.filter((r) => r.media.licensed > 0).length),
      row('source_attribution', records.filter((r) => r.sources.attribution_count > 0).length),
      row('verification (trusted)', records.filter((r) => isTrustedStatus(r.verification_status as VerificationStatus)).length),
      row('verified_at', records.filter((r) => !!r.verified_at).length),
      row('reviews', records.filter((r) => r.reviews_count > 0).length),
      row('faqs', records.filter((r) => r.faq_count > 0).length),
      row('seo_meta_title', records.filter((r) => r.seo.has_meta_title).length),
      row('ai_summary', records.filter((r) => r.ai_summary.exists).length),
    ];
  }

  private buildSummary(records: PlaceAuditRecord[], issues: AuditIssue[]): AuditSummary {
    const issuesByPriority: Record<IssuePriority, number> = { P0: 0, P1: 0, P2: 0 };
    const issuesByType: Record<string, number> = {};
    for (const issue of issues) {
      issuesByPriority[issue.priority] += 1;
      issuesByType[issue.issue_type] = (issuesByType[issue.issue_type] ?? 0) + 1;
    }
    const avg = (pick: (r: PlaceAuditRecord) => number) =>
      records.length === 0 ? 0 : Math.round(records.reduce((sum, r) => sum + pick(r), 0) / records.length);

    return {
      total_places: records.length,
      issues_by_priority: issuesByPriority,
      issues_by_type: issuesByType,
      average_scores: {
        completeness: avg((r) => r.scores.completeness),
        trust: avg((r) => r.scores.trust),
        freshness: avg((r) => r.scores.freshness),
        overall: avg((r) => r.scores.overall),
      },
    };
  }
}

/** 15 slug showcase (Phase 6 của brief) — dùng để nâng độ ưu tiên STALE_DATA lên P0. */
export const SHOWCASE_15_SLUGS: ReadonlySet<string> = new Set([
  'bai-sao',
  'bai-truong',
  'sun-world-hon-thom',
  'vinwonders-phu-quoc',
  'vinpearl-safari',
  'dinh-cau',
  'cau-hon',
  'cho-dem-phu-quoc',
  'grand-world-phu-quoc',
  'lang-chai-ham-ninh',
  'bai-khem',
  'jw-marriott-phu-quoc',
  'sailing-club-phu-quoc',
  'chua-ho-quoc',
  'tour-3-dao-an-thoi',
]);
