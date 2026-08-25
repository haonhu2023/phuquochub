import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import type { ApprovalEvidencePayloadV1 } from './approval-evidence.contract';

/**
 * NORMALIZED REVIEW RECORD CONTRACT (2026-08-25, Slice 0.5D2) — dữ liệu policy (D2) thực sự dùng
 * khi kiểm `reviewRecordDigest`, và dữ liệu producer (0.5D3, CHƯA triển khai) phải dùng để TÍNH
 * `reviewRecordDigest` khi dựng `approval-evidence.json`. D2 và D3 BẮT BUỘC dùng CHÍNH BA HÀM ở
 * file này — không tự viết lại record/serialize/digest ở nơi khác (Design Amendment 1, Correction
 * 4: tránh hai implementation lệch nhau làm rule 18 fail giả hoặc PASS giả).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ REVIEW RECORD DIGEST CHỈ CHỨNG MINH A↔A INTERNAL CONSISTENCY — KHÔNG PHẢI AUTHENTICITY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `computeReviewRecordDigest()` bắt được: một producer khai `approverSubjectId = X` trong evidence
 * payload nhưng tính `reviewRecordDigest` trên `Y` — tức payload TỰ MÂU THUẪN với chính nó.
 *
 * `computeReviewRecordDigest()` KHÔNG chứng minh: normalized record thực sự đến từ GitHub
 * review-history API. Cả `environmentId`/`state`/`approverSubjectId`/`comment` lẫn digest của
 * chúng đều là dữ liệu TỰ KHAI trong `approval-evidence.json` (nhóm A) — một payload bịa hoàn
 * toàn nhưng NHẤT QUÁN NỘI BỘ vẫn cho digest khớp. Bằng chứng review có thật đến từ GitHub CHỈ
 * đến từ chuỗi: protected workflow (P0) đọc review-history API → dựng evidence → GitHub
 * OIDC/Sigstore attestation KÝ đúng digest của evidence đó (0.5D3/0.5D4) — KHÔNG đến từ file này.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MAPPING evidence ↔ GitHub review record — ĐÃ ĐỐI CHIẾU CODE THẬT (approval-evidence.contract.ts)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `evidence.reason` (nếu có mặt)       → `comment`        — nội dung comment duyệt.
 * `evidence.reasonDigest` (nếu có mặt) → `commentDigest`   — digest nếu không muốn lộ nội dung.
 * Đúng MỘT trong hai (kế thừa quy tắc XOR của D1's `reason`/`reasonDigest`).
 *
 * KHÔNG bao gồm: `approverLogin` (display-only, không phải identity authority), `environmentName`
 * (display-only), avatar URL (không tồn tại trong `ApprovalEvidencePayloadV1`), hay bất kỳ field
 * nào khác. Chỉ đúng bốn field trong schema dưới đây.
 */

/**
 * Normalized review record V1 — CLOSED SCHEMA, PHẲNG. `state` chỉ chấp nhận literal `'approved'`
 * (cùng ràng buộc `ApprovalEvidencePayloadV1.reviewState`).
 */
export interface NormalizedReviewRecordV1 {
  environmentId: string;
  state: 'approved';
  approverSubjectId: string;
  comment?: string;
  commentDigest?: string;
}

/**
 * CLOSED SCHEMA — danh sách ĐẦY ĐỦ và DUY NHẤT khoá được phép, cùng quy ước
 * `approval-evidence.contract.ts`. Không dùng trực tiếp trong build (record dựng từ evidence đã
 * validate nên hình dạng đã đúng theo kiểu học) — giữ lại để đối chiếu/tài liệu hoá, và để một
 * test kiểm serialize không lọt field ngoài danh sách này.
 */
export const NORMALIZED_REVIEW_RECORD_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'environmentId',
  'state',
  'approverSubjectId',
  'comment',
  'commentDigest',
]);

/**
 * Dựng `NormalizedReviewRecordV1` từ một `ApprovalEvidencePayloadV1` ĐÃ VALIDATE (đầu vào là kiểu
 * đã thu hẹp bởi `validateApprovalEvidence()`, không phải `unknown` — hàm này KHÔNG tự validate
 * cấu trúc evidence, đó là trách nhiệm của D1). THUẦN: không I/O, không network, không DB, không
 * mutate `payload`, không đọc đồng hồ hệ thống.
 *
 * XOR reason/reasonDigest được suy trực tiếp từ chính payload đã validate (D1 đã ép đúng một
 * trong hai tồn tại) bằng `hasOwnProperty` — không dùng `in` để tránh prototype chain, cùng quy
 * ước D1.
 */
export function buildNormalizedReviewRecord(
  payload: ApprovalEvidencePayloadV1,
): NormalizedReviewRecordV1 {
  const hasReason = Object.prototype.hasOwnProperty.call(payload, 'reason');
  const base = {
    environmentId: payload.environmentId,
    state: payload.reviewState,
    approverSubjectId: payload.approverSubjectId,
  };
  return hasReason
    ? { ...base, comment: payload.reason as string }
    : { ...base, commentDigest: payload.reasonDigest as string };
}

/**
 * Serialize deterministic — TÁI DÙNG `canonicalJson()` (không viết hàm chuẩn hoá JSON thứ hai),
 * cùng nguyên tắc `serializeApprovalEvidence()`/`computeManifestChecksum()`. Khoá đã sắp xếp bởi
 * `canonicalJson()`, không pretty-print, không BOM, không newline cuối.
 */
export function serializeNormalizedReviewRecord(record: NormalizedReviewRecordV1): string {
  return canonicalJson(record);
}

/**
 * Băm SHA-256 trên bytes UTF-8 do `serializeNormalizedReviewRecord()` trả ra. ENCODING TƯỜNG MINH
 * (cùng Gate B đã áp cho `computeApprovalEvidenceDigest()`/`computeManifestChecksum()`):
 * `Buffer.from(str, 'utf8')` được gọi RIÊNG, tách khỏi `.update()` — KHÔNG dựa vào default
 * encoding ngầm của `Hash.update(string)`.
 *
 * Digest này KHÔNG BAO GIỜ được ghi vào chính record nó mô tả — không self-reference, cùng
 * nguyên tắc "KHÔNG CÓ WRAPPER TYPE" của `approval-evidence.contract.ts`.
 */
export function computeReviewRecordDigest(record: NormalizedReviewRecordV1): string {
  const bytes = Buffer.from(serializeNormalizedReviewRecord(record), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}
