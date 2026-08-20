/**
 * Kiểu dữ liệu cho Data Quality Audit (2026-08-20) — xem `data-quality-audit.service.ts` cho luật
 * suy ra các giá trị này. File tách riêng vì phía CLI script (`scripts/audit-data-quality.ts`) và
 * test cần import kiểu mà không kéo theo toàn bộ dependency NestJS của service.
 *
 * NGUYÊN TẮC: mọi field ở đây phản ánh dữ liệu ĐÃ CÓ trong repository hiện tại — không field nào
 * được suy ra bằng cách gọi ra ngoài (không AI, không HTTP, không suy đoán). Nơi nào không biết,
 * kiểu phải cho phép `null`/`'UNKNOWN'` thay vì buộc một giá trị.
 */

/** Từ vựng loại vấn đề — ĐÓNG có chủ ý (Section 10 của brief), không mở rộng tuỳ tiện. */
export enum IssueType {
  MISSING_FIELD = 'MISSING_FIELD',
  STALE_DATA = 'STALE_DATA',
  CONFLICTING_DATA = 'CONFLICTING_DATA',
  UNVERIFIED_VALUE = 'UNVERIFIED_VALUE',
  MISSING_SOURCE = 'MISSING_SOURCE',
  MISSING_MEDIA = 'MISSING_MEDIA',
  LICENSE_GAP = 'LICENSE_GAP',
  ADMINISTRATIVE_MISMATCH = 'ADMINISTRATIVE_MISMATCH',
  POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE',
  POSSIBLE_CLOSED_PLACE = 'POSSIBLE_CLOSED_PLACE',
  GENERIC_CATEGORY = 'GENERIC_CATEGORY',
  WRONG_ENTITY_TYPE = 'WRONG_ENTITY_TYPE',
  LOW_USER_UTILITY = 'LOW_USER_UTILITY',
  SEO_GAP = 'SEO_GAP',
  TRUST_GAP = 'TRUST_GAP',
}

export type IssuePriority = 'P0' | 'P1' | 'P2';

export type IssueConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * MỘT work item — KHÔNG BAO GIỜ là một thay đổi đã áp dụng. `status` luôn `NEEDS_HUMAN_REVIEW`
 * ở v1 (chưa có bảng lưu trạng thái review — xem class doc của service về quyết định không
 * migration). `proposed_value` CHỈ xuất hiện khi có evidence hỗ trợ; nếu không có, để `null` và
 * diễn đạt trong `reason` rằng cần xác minh — KHÔNG BAO GIỜ đoán một giá trị thay thế.
 */
export interface AuditIssue {
  place_id: string;
  place_slug: string;
  place_name: string;
  issue_type: IssueType;
  priority: IssuePriority;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  evidence: string | null;
  confidence: IssueConfidence;
  status: 'NEEDS_HUMAN_REVIEW';
}

/** Một nguồn đã đối chiếu — rút gọn từ trust_sources (PlaceTrustSource) cho mục đích audit. */
export interface AuditTrustSourceRef {
  field: string | null;
  publisher: string | null;
}

/**
 * Bản kiểm kê đầy đủ MỘT place — Phase 2 của brief. Chỉ chứa dữ liệu đọc được, không field nào
 * bịa thêm. `khu_pho` LUÔN `null` — cột này CHƯA tồn tại ở schema (xem Phase 9 của brief và
 * ADMINISTRATIVE_RECONCILIATION_NOTE trong service), không phải một chỗ trống cần điền.
 */
export interface PlaceAuditRecord {
  id: string;
  slug: string;
  name: string;
  category_slug: string | null;
  status: string;
  address: string | null;
  province: string | null;
  admin_area: string | null;
  ward: string | null;
  khu_pho: null;
  location: { lat: number; lng: number };
  price_range: string | null;
  contacts: {
    total: number;
    phone_count: number;
    website_count: number;
    verified_count: number;
  };
  opening_hours_present: boolean;
  media: {
    total: number;
    published: number;
    licensed: number;
    license_gap: number;
  };
  sources: {
    attribution_count: number;
    distinct_source_count: number;
    fields_covered: string[];
  };
  verification_status: string;
  verified_at: string | null;
  trust_sources: AuditTrustSourceRef[];
  reviews_count: number;
  faq_count: number;
  seo: { has_meta_title: boolean; has_meta_description: boolean };
  ai_summary: { exists: boolean; status: string | null; is_approved: boolean };
  business_claim: { has_any: boolean; latest_status: string | null };
  created_at: string;
  updated_at: string;
  last_revision_at: string | null;
  scores: {
    completeness: number;
    trust: number;
    freshness: number;
    overall: number;
  };
}

export interface FieldCoverageRow {
  field: string;
  filled: number;
  empty: number;
  coverage_pct: number;
}

export interface AuditSummary {
  total_places: number;
  issues_by_priority: Record<IssuePriority, number>;
  issues_by_type: Record<string, number>;
  average_scores: { completeness: number; trust: number; freshness: number; overall: number };
}

export interface AuditReport {
  audit_run_id: string;
  generated_at: string;
  dataset_version: string;
  summary: AuditSummary;
  field_coverage: FieldCoverageRow[];
  places: PlaceAuditRecord[];
  issues: AuditIssue[];
  administrative_notes: string[];
}
