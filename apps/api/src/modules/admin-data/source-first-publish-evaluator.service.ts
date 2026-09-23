import { Injectable } from '@nestjs/common';
import { SourceType, SOURCE_TYPE_DEFAULT_RELIABILITY } from '../sources/sources.enums';
import { OdqQuestionType, OdqFailSafe } from '../owner-decision-queue/entities/owner-decision-queue.entity';

// Ngưỡng reliability tối thiểu để tính là "authoritative" cho việc phát hiện xung đột.
const AUTHORITATIVE_THRESHOLD = 75;

// POLICY 2026-09-19: chỉ official_website/government mới đủ để trigger auto-publish.
// business_owner bị loại khỏi set này: nguồn tự khai của operator được ghi nhận là
// attribution nhưng KHÔNG đủ một mình để thỏa mãn gate official/government.
// OSM (75) đủ để cảnh báo conflict nhưng không đủ để trigger tự động publish.
export const PUBLISH_AUTHORITATIVE_TYPES = new Set<SourceType>([
  SourceType.OFFICIAL_WEBSITE,
  SourceType.GOVERNMENT,
]);

// Các field được auto-publish khi tất cả machine gates đều PASS (safe subset).
// Mọi field khác (opening_hours, price_range, photos…) phải qua human review.
export const AUTO_PUBLISH_SAFE_FIELDS = new Set<string>([
  'name', 'category', 'coordinates', 'address', 'short_description', 'website', 'phone',
]);

// Các field KHÔNG BAO GIỜ tự động publish, bất kể chất lượng nguồn.
// Observation cho các field này được ghi nhận là attribution và log vào auditNotes,
// nhưng place row không bao giờ được cập nhật tự động.
// opening_hours: lịch thay đổi thường xuyên; stale hours gây vấn đề cho visitor.
// price_range: rủi ro fabrication; giá phải được xác minh thủ công trước khi hiển thị.
const ALWAYS_HOLD_FIELDS = new Set<string>(['opening_hours', 'price_range']);

// Conflict detection chỉ cho safe fields — opening_hours đã bị loại bỏ.
// Xung đột hours không block verdict tổng thể; được log vào auditNotes (non-blocking).
const CONFLICT_TRACKED_FIELDS: Array<{ field: string; type: OdqQuestionType; label: string }> = [
  { field: 'name', type: 'identity_conflict', label: 'Tên địa điểm' },
  { field: 'address', type: 'address_conflict', label: 'Địa chỉ' },
  { field: 'phone', type: 'contact_conflict', label: 'Điện thoại' },
];

// Identity fields: stale source ở đây block toàn bộ place khỏi việc publish.
const IDENTITY_FIELDS = ['name', 'address', 'coordinates'];

// Recheck days theo field — dữ liệu dễ thay đổi cần tái xác minh sớm hơn.
export const DEFAULT_RECHECK_DAYS: Record<string, number> = {
  opening_hours: 30,
  phone: 60,
  address: 90,
  price_range: 30,
  name: 365,
  coordinates: 730,
};

// Một quan sát: giá trị mà một nguồn cụ thể báo cáo cho một field.
export interface CandidateSourceObservation {
  field: string;
  observedValue?: unknown;
  sourceType: SourceType;
  sourceUrl: string;
  publisher?: string;
  retrievedAt: Date;
  confidence?: number;
  isPrimary?: boolean;
  contentHashSha256?: string;
}

export interface CandidateInput {
  candidateKey: string;
  // When set, the pipeline resolves this existing place slug and enriches it
  // instead of creating a new place. candidateKey still serves as advisory lock key.
  targetSlug?: string;
  name: string;
  categorySlug: string;
  lat?: number;
  lng?: number;
  address?: string;
  ward?: string;
  province?: string;
  adminArea?: string;
  // shortDescription PHẢI là nội dung gốc từ facts — KHÔNG sao chép nguyên bản từ nguồn.
  shortDescription?: string;
  openingHours?: Record<string, unknown>;
  phones?: Array<{ value: string; label?: string }>;
  website?: string;
  observations: CandidateSourceObservation[];
  externalIds?: Array<{ provider: string; externalId: string; isPrimary?: boolean }>;
}

export interface HoldReason {
  type: OdqQuestionType;
  field: string;
  sourceAUrl?: string;
  sourceAType?: string;
  sourceBUrl?: string;
  sourceBType?: string;
  summary: string;
  recommendation: string;
  failSafe: OdqFailSafe;
}

export interface FieldCoverage {
  sourceType: SourceType;
  sourceUrl: string;
  publisher?: string;
  confidence: number;
  recheckDays: number | null;
}

export interface PublishReadinessResult {
  verdict: 'PUBLISH' | 'HOLD';
  // Blocking — ảnh hưởng verdict: mỗi phần tử này khiến verdict = HOLD.
  holdReasons: HoldReason[];
  // Informational — được ghi nhận và ODQ'd nhưng KHÔNG thay đổi verdict.
  // Ví dụ: xung đột opening_hours, always-hold fields có dữ liệu.
  auditNotes: HoldReason[];
  // Safe fields từ CandidateInput sẽ được ghi khi auto-publish (verdict = PUBLISH).
  autoPublishFields: string[];
  // Fields có trong candidate nhưng KHÔNG được ghi tự động (always-hold, conflict, stale).
  heldFields: string[];
  primarySourceUrl: string | null;
  primarySourceType: SourceType | null;
  coverageByField: Record<string, FieldCoverage>;
}

// Thuần (pure) — không phụ thuộc DB, dễ unit test.
@Injectable()
export class SourceFirstPublishEvaluator {
  evaluate(candidate: CandidateInput): PublishReadinessResult {
    const holdReasons: HoldReason[] = [];
    const auditNotes: HoldReason[] = [];

    // Nhóm observations theo field
    const byField = new Map<string, CandidateSourceObservation[]>();
    for (const obs of candidate.observations) {
      const list = byField.get(obs.field) ?? [];
      list.push(obs);
      byField.set(obs.field, list);
    }

    // 1. Kiểm tra xung đột giữa các nguồn authoritative cho safe fields
    for (const tracked of CONFLICT_TRACKED_FIELDS) {
      const obs = byField.get(tracked.field) ?? [];
      const conflict = this.detectConflict(obs);
      if (conflict) {
        const rec = this.higherReliabilityObs(conflict.a, conflict.b);
        holdReasons.push({
          type: tracked.type,
          field: tracked.field,
          sourceAUrl: conflict.a.sourceUrl,
          sourceAType: conflict.a.sourceType,
          sourceBUrl: conflict.b.sourceUrl,
          sourceBType: conflict.b.sourceType,
          summary: `${tracked.label}: "${conflict.aValue}" (${conflict.a.sourceType}) ≠ "${conflict.bValue}" (${conflict.b.sourceType})`,
          recommendation: `Ưu tiên ${rec.sourceType} (reliability=${SOURCE_TYPE_DEFAULT_RELIABILITY[rec.sourceType]}). Xác minh trực tiếp trước khi publish.`,
          failSafe: 'use_source_a',
        });
      }
    }

    // 2. Kiểm tra staleness cho identity fields (blocking HOLD)
    const staleHoldFields = new Set<string>();
    for (const field of IDENTITY_FIELDS) {
      const obs = byField.get(field) ?? [];
      if (obs.length === 0) continue;
      const best = this.bestObs(obs);
      if (best && this.isStale(best.retrievedAt, field)) {
        staleHoldFields.add(field);
        holdReasons.push({
          type: 'insufficient_sources',
          field,
          sourceAUrl: best.sourceUrl,
          sourceAType: best.sourceType,
          summary: `Nguồn tốt nhất cho "${field}" quá hạn tái xác minh (thu thập: ${best.retrievedAt.toISOString().split('T')[0]}, giới hạn: ${DEFAULT_RECHECK_DAYS[field] ?? 365} ngày).`,
          recommendation: `Tái xác minh từ official_website hoặc government trong vòng ${DEFAULT_RECHECK_DAYS[field] ?? 365} ngày.`,
          failSafe: 'hold_publish',
        });
      }
    }

    // 3. Kiểm tra nguồn publish-authoritative tối thiểu cho identity.
    // OSM đủ cho conflict detection nhưng KHÔNG đủ để trigger publish — phải có
    // official_website hoặc government (operator-verified hoặc nhà nước).
    const identityObsFields = ['name', 'address', 'coordinates'];
    const hasAuthoritativeIdentity = candidate.observations.some(
      (o) =>
        identityObsFields.includes(o.field) &&
        PUBLISH_AUTHORITATIVE_TYPES.has(o.sourceType),
    );

    if (!hasAuthoritativeIdentity) {
      holdReasons.push({
        type: 'insufficient_sources',
        field: 'name',
        sourceAUrl: candidate.observations[0]?.sourceUrl,
        sourceAType: candidate.observations[0]?.sourceType,
        summary: `Không có nguồn publish-authoritative (official_website/government) cho identity. Nguồn hiện có: ${[...new Set(candidate.observations.map((o) => o.sourceType))].join(', ') || 'không có'}`,
        recommendation: `Bổ sung nguồn từ: official_website hoặc government. OSM, Google Maps và business_owner hỗ trợ xác nhận vị trí/xung đột nhưng không đủ để tự động publish.`,
        failSafe: 'hold_publish',
      });
    }

    // 4. Kiểm tra location coverage
    const hasLocation = (candidate.lat != null && candidate.lng != null) || !!candidate.address;
    if (!hasLocation) {
      holdReasons.push({
        type: 'insufficient_sources',
        field: 'address',
        summary: 'Thiếu cả địa chỉ lẫn tọa độ GPS',
        recommendation: 'Cung cấp địa chỉ (address) hoặc tọa độ (lat/lng) từ ít nhất một nguồn chính thức',
        failSafe: 'hold_publish',
      });
    }

    // 5. Audit notes cho always-hold fields (informational — không ảnh hưởng verdict)
    for (const { field, type, label } of [
      { field: 'opening_hours', type: 'hours_conflict' as OdqQuestionType, label: 'Giờ hoạt động' },
      { field: 'price_range', type: 'insufficient_sources' as OdqQuestionType, label: 'Giá / chi phí' },
    ]) {
      const obs = byField.get(field) ?? [];
      if (obs.length === 0) continue;
      const conflict = this.detectConflict(obs);
      if (conflict) {
        auditNotes.push({
          type,
          field,
          sourceAUrl: conflict.a.sourceUrl,
          sourceAType: conflict.a.sourceType,
          sourceBUrl: conflict.b.sourceUrl,
          sourceBType: conflict.b.sourceType,
          summary: `${label}: conflict "${conflict.aValue}" (${conflict.a.sourceType}) ≠ "${conflict.bValue}" (${conflict.b.sourceType}) — field này không auto-publish (always-hold).`,
          recommendation: 'Xem xét thủ công sau khi place được publish.',
          failSafe: 'skip_field',
        });
      } else {
        const best = this.bestObs(obs)!;
        auditNotes.push({
          type: 'insufficient_sources',
          field,
          sourceAUrl: best.sourceUrl,
          sourceAType: best.sourceType,
          summary: `${label}: có dữ liệu từ ${best.sourceType} — không auto-publish (always-hold field). Nguồn: ${best.sourceUrl}`,
          recommendation: 'Xem xét thủ công để cập nhật field này sau khi publish.',
          failSafe: 'skip_field',
        });
      }
    }

    // 6. Tính autoPublishFields và heldFields
    const conflictFields = new Set(
      holdReasons
        .filter((r) => ['identity_conflict', 'address_conflict', 'contact_conflict'].includes(r.type))
        .map((r) => r.field),
    );

    const candidateHasSafeField: Record<string, boolean> = {
      name: !!candidate.name,
      category: !!candidate.categorySlug,
      coordinates: candidate.lat != null && candidate.lng != null,
      address: !!candidate.address,
      short_description: !!candidate.shortDescription,
      website: !!candidate.website,
      phone: !!(candidate.phones?.length),
    };

    const autoPublishFields: string[] = [];
    const heldFields: string[] = [];

    for (const field of AUTO_PUBLISH_SAFE_FIELDS) {
      if (!candidateHasSafeField[field]) continue;
      if (conflictFields.has(field) || staleHoldFields.has(field)) {
        heldFields.push(field);
        continue;
      }
      // Non-identity safe fields: check staleness (non-blocking for verdict, just omit the field)
      if (!IDENTITY_FIELDS.includes(field)) {
        const obs = byField.get(field) ?? [];
        const best = this.bestObs(obs);
        if (best && this.isStale(best.retrievedAt, field)) {
          heldFields.push(field);
          continue;
        }
      }
      autoPublishFields.push(field);
    }

    // Always-hold fields present in candidate
    if (candidate.openingHours && Object.keys(candidate.openingHours).length > 0) {
      heldFields.push('opening_hours');
    }

    // Build coverage map: source tốt nhất (reliability cao nhất) cho mỗi field
    const coverageByField: Record<string, FieldCoverage> = {};
    for (const [field, obsList] of byField) {
      const best = this.bestObs(obsList);
      if (best) {
        const reliability = SOURCE_TYPE_DEFAULT_RELIABILITY[best.sourceType];
        coverageByField[field] = {
          sourceType: best.sourceType,
          sourceUrl: best.sourceUrl,
          publisher: best.publisher,
          confidence: best.confidence ?? reliability,
          recheckDays: DEFAULT_RECHECK_DAYS[field] ?? null,
        };
      }
    }

    // Primary source: best obs trên identity fields
    const allIdentityObs = [
      ...(byField.get('name') ?? []),
      ...(byField.get('address') ?? []),
      ...(byField.get('coordinates') ?? []),
    ];
    const primaryObs = this.bestObs(allIdentityObs);

    return {
      verdict: holdReasons.length === 0 ? 'PUBLISH' : 'HOLD',
      holdReasons,
      auditNotes,
      autoPublishFields,
      heldFields,
      primarySourceUrl: primaryObs?.sourceUrl ?? null,
      primarySourceType: primaryObs?.sourceType ?? null,
      coverageByField,
    };
  }

  // Nguồn cũ hơn recheckDays[field] ngày tính từ hôm nay → stale.
  private isStale(retrievedAt: Date, field: string): boolean {
    const thresholdDays = DEFAULT_RECHECK_DAYS[field] ?? 365;
    const ageMs = Date.now() - retrievedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > thresholdDays;
  }

  private detectConflict(
    observations: CandidateSourceObservation[],
  ): { a: CandidateSourceObservation; b: CandidateSourceObservation; aValue: string; bValue: string } | null {
    const withValues = observations.filter(
      (o) => o.observedValue !== undefined && o.observedValue !== null,
    );
    if (withValues.length < 2) return null;

    for (let i = 0; i < withValues.length; i++) {
      for (let j = i + 1; j < withValues.length; j++) {
        const a = withValues[i];
        const b = withValues[j];
        const reliA = SOURCE_TYPE_DEFAULT_RELIABILITY[a.sourceType];
        const reliB = SOURCE_TYPE_DEFAULT_RELIABILITY[b.sourceType];
        if (
          reliA >= AUTHORITATIVE_THRESHOLD &&
          reliB >= AUTHORITATIVE_THRESHOLD &&
          this.valuesConflict(a.observedValue, b.observedValue)
        ) {
          return {
            a,
            b,
            aValue: this.valueStr(a.observedValue),
            bValue: this.valueStr(b.observedValue),
          };
        }
      }
    }
    return null;
  }

  private valuesConflict(a: unknown, b: unknown): boolean {
    if (typeof a === 'string' && typeof b === 'string') {
      return this.normalizeStr(a) !== this.normalizeStr(b);
    }
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  private normalizeStr(s: string): string {
    return s.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private valueStr(v: unknown): string {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }

  private higherReliabilityObs(
    a: CandidateSourceObservation,
    b: CandidateSourceObservation,
  ): CandidateSourceObservation {
    const reliA = SOURCE_TYPE_DEFAULT_RELIABILITY[a.sourceType];
    const reliB = SOURCE_TYPE_DEFAULT_RELIABILITY[b.sourceType];
    return reliA >= reliB ? a : b;
  }

  private bestObs(observations: CandidateSourceObservation[]): CandidateSourceObservation | null {
    if (observations.length === 0) return null;
    return observations.reduce((best, curr) => {
      const reliCurr = SOURCE_TYPE_DEFAULT_RELIABILITY[curr.sourceType];
      const reliBest = SOURCE_TYPE_DEFAULT_RELIABILITY[best.sourceType];
      return reliCurr > reliBest ? curr : best;
    });
  }
}
