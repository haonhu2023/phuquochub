import { isCanonicalDecimalString } from '../../common/canonical-decimal-string';
import { isValidCanonicalTimestamp } from '../../common/canonical-timestamp';
import { buildNormalizedReviewRecord, computeReviewRecordDigest } from './approval-review-record.contract';
import { computeApprovalEvidenceDigest, validateApprovalEvidence, type ApprovalEvidencePayloadV1 } from './approval-evidence.contract';

/**
 * APPROVAL EVIDENCE POLICY CONTRACT (2026-08-25, Slice 0.5D2) — pure offline policy evaluator cho
 * `approval-evidence.json`. Design authority: `APPROVAL-AUDIT-EVIDENCE-DESIGN-2026-08-25.md` sau
 * Amendment 2, cộng "SLICE 0.5D2 — SECURITY DESIGN AMENDMENT 1" và "SLICE 0.5D2 — FINAL DESIGN
 * CLOSURE" (cùng phiên hội thoại này). Report cũ trên đĩa KHÔNG chứa các sửa đổi của hai lượt
 * design-review đó — nơi hai bên mâu thuẫn, file NÀY (bản đã triển khai) là nguồn đúng.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BỐN NGUỒN DỮ LIỆU — KHÔNG NGUỒN NÀO MỘT MÌNH ĐỦ
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A. `evidence`      — approval-evidence.json (0.5D1). KHÔNG TIN. Đối tượng bị đánh giá.
 * B. `facts`         — VerifiedAttestationFactsV1, DO 0.5D4 (CHƯA triển khai) dựng SAU KHI verify
 *                       Sigstore bundle thành công. CRYPTOGRAPHIC AUTHENTICITY INPUT — chứng minh
 *                       artifact do đúng repository/workflow tạo ra, và thời điểm ký.
 * C. `policy`        — ApprovalEvidencePolicyV1, provision out-of-band, root-owned. AUTHORIZATION
 *                       POLICY INPUT — định nghĩa "ai/cái gì được phép". KHÔNG kém tin cậy hơn B.
 * D. `observations`/`evaluationTime` — sự thật cục bộ do runner 0.5E quan sát. CONDITIONALLY
 *                       TRUSTED — đúng tới mức đồng hồ và môi trường VPS đúng.
 *
 * D2 CẦN CẢ B VÀ C mới PASS. B không biết ai được phép duyệt; C không chứng minh được gì đã thực
 * sự xảy ra. Hàm này KHÔNG tự verify Sigstore/GitHub và KHÔNG chứng minh approval là thật một
 * mình — giá trị an ninh của nó phụ thuộc hoàn toàn vào việc D4 chỉ dựng `facts` từ vật liệu ĐÃ
 * VERIFY, và KHÔNG BAO GIỜ lấp các trường bắt buộc từ payload tự khai.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * evaluationTime — CONDITIONALLY TRUSTED RUNNER OBSERVATION, KHÔNG PHẢI GIÁ TRỊ TỰ XÁC THỰC
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * D2 KHÔNG gọi `Date.now()` hay đọc đồng hồ hệ thống ở bất kỳ đâu — `evaluationTime` PHẢI được
 * truyền vào tường minh bởi caller. D2 KHÔNG tự xác thực đồng hồ của caller.
 *
 * Rule "E ≥ verifiedTimeNotBefore − skew" (TP-eval-before-attestation) chỉ chứng minh ĐÚNG MỘT
 * điều: evaluationTime không đứng TRƯỚC attestation window quá mức skew cho phép. Nó KHÔNG phải
 * một cơ chế phát hiện clock-rollback tổng quát — một caller bị chiếm quyền vẫn bịa được
 * `evaluationTime` (vd đặt evidence 25 giờ tuổi nhưng khai evaluationTime ở giờ thứ 23) và D2
 * KHÔNG thấy gì bất thường. Đây là RESIDUAL RISK có chủ đích, không phải lỗi.
 *
 * 0.5E (CHƯA triển khai) BẮT BUỘC: lấy `evaluationTime` từ đồng hồ VPS; preflight trạng thái đồng
 * bộ thời gian (NTP/chrony) TRƯỚC khi publish; nếu đồng hồ không synchronized hoặc lệch vượt
 * ngưỡng thì ABORT TRƯỚC KHI mở kết nối DB. D2 không đóng được lỗ này bằng kỹ thuật — nó nằm ở kỷ
 * luật vận hành của 0.5E và ở việc bảo vệ chính runner (P0).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * D2 TUYỆT ĐỐI KHÔNG LÀM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Gọi GitHub review-history API · verify chữ ký/certificate/Sigstore bundle · tải/đọc trusted
 * root · filesystem I/O · DB connection · flock · UNIQUE(manifest_id) · ingestion · receipt ·
 * replay authority · deployment · đọc process.env · đọc đồng hồ hệ thống · sinh ngẫu nhiên ·
 * parse GitHub ID bằng Number/parseInt/parseFloat/BigInt. Import cho phép: 3 module `common/` +
 * 2 file cùng thư mục (`approval-evidence.contract`, `approval-review-record.contract`).
 *
 * Một evidence "PASS policy" nghĩa là: TẬP FACTS mà D4 tuyên bố đã verify thì PHÙ HỢP với policy.
 * KHÔNG nghĩa là approval có thật — nếu `facts` bị bịa (bởi một D4 lỗi hoặc bị compromise) nhưng
 * NHẤT QUÁN NỘI BỘ, `evaluateApprovalEvidencePolicy()` vẫn trả `ok:true`. Toàn bộ giá trị an ninh
 * nằm ở việc D4 CHỈ dựng `facts` từ vật liệu đã verify mật mã.
 */

export type VerifiedTimeSource =
  | 'rfc3161-tsa'
  | 'fulcio-certificate-validity'
  | 'rekor-signed-entry-timestamp';

export const VERIFIED_TIME_SOURCES: readonly VerifiedTimeSource[] = [
  'rfc3161-tsa',
  'fulcio-certificate-validity',
  'rekor-signed-entry-timestamp',
];

/**
 * Hợp đồng D4 → D2. TÁM trường BẮT BUỘC, KHÔNG nullable, KHÔNG có policy flag nào tắt được
 * (Design Amendment 1 Correction 1): `subjectDigest`, `verifiedTimeNotBefore`,
 * `verifiedTimeNotAfter`, `verifiedTimeSource`, `verifiedIssuer`, `verifiedRepositoryId`,
 * `verifiedRepositoryOwnerId`, `verifiedWorkflowRef`. D4 KHÔNG được lấp các trường này từ evidence
 * payload — không trích được từ vật liệu ĐÃ VERIFY thì D4 không được dựng object này.
 *
 * BA trường TUỲ CHỌN (known unknown thật — GitHub bundle có phơi các claim này hay không CHƯA
 * xác nhận bằng rehearsal): `verifiedWorkflowSha`, `verifiedRunId`, `verifiedRunAttempt`.
 */
export interface VerifiedAttestationFactsV1 {
  readonly factsVersion: 1;

  readonly subjectDigest: string;
  readonly verifiedTimeNotBefore: string;
  readonly verifiedTimeNotAfter: string;
  readonly verifiedTimeSource: VerifiedTimeSource;
  readonly verifiedIssuer: string;
  readonly verifiedRepositoryId: string;
  readonly verifiedRepositoryOwnerId: string;
  readonly verifiedWorkflowRef: string;

  readonly verifiedWorkflowSha: string | null;
  readonly verifiedRunId: string | null;
  readonly verifiedRunAttempt: number | null;
}

/**
 * Out-of-band authorization policy — provision độc lập, root-owned, KHÔNG lấy từ repo đang được
 * verify. CLOSED SCHEMA. KHÔNG có `requireAttestedRepositoryBinding`/`requireAttestedWorkflowRefBinding`
 * (Correction 1 — hai binding đó giờ LUÔN bắt buộc, không thể tắt). Sáu allow-list
 * (`allowedWorkflowRefs`/`allowedIssuers`/`allowedAttestationIssuers`/`allowedApproverProviders`/
 * `allowedApproverSubjectIds`/`acceptedVerifiedTimeSources`) BẮT BUỘC non-empty — một allow-list
 * rỗng gần như chắc chắn là lỗi provisioning, để nó im lặng biến thành "không ai được phép" sẽ
 * làm operator đi tìm sai chỗ. `revokedApproverSubjectIds` là ngoại lệ hợp lệ duy nhất được rỗng.
 */
export interface ApprovalEvidencePolicyV1 {
  readonly policyVersion: number;

  readonly repositoryId: string;
  readonly repositoryOwnerId: string;
  readonly environmentId: string;
  readonly targetEnvironment: string;

  readonly allowedWorkflowRefs: readonly string[];
  readonly allowedIssuers: readonly string[];
  readonly allowedAttestationIssuers: readonly string[];
  readonly allowedApproverProviders: readonly string[];
  readonly allowedApproverSubjectIds: readonly string[];
  readonly revokedApproverSubjectIds: readonly string[];

  readonly acceptedVerifiedTimeSources: readonly VerifiedTimeSource[];
  readonly maximumEvidenceAgeMs: number;
  readonly allowedClockSkewMs: number;
  readonly maximumVerifiedTimeWindowMs: number;

  readonly requireAttestedWorkflowShaBinding: boolean;
  readonly requireAttestedRunBinding: boolean;
  readonly requireEvidenceWorkflowSha: boolean;
}

/** Sự thật cục bộ do runner 0.5E quan sát trực tiếp — KHÔNG đến từ policy, KHÔNG đến từ bundle. */
export interface RunnerObservationsV1 {
  readonly observationsVersion: 1;
  readonly manifestId: string;
  readonly manifestChecksum: string;
  readonly targetEnvironment: string;
  readonly expectedCommitSha: string;
  readonly evidenceSha256: string;
}

export interface ApprovalEvidenceEvaluationContext {
  readonly evidence: unknown;
  readonly facts: unknown;
  readonly policy: unknown;
  readonly observations: unknown;
  readonly evaluationTime: string;
}

/**
 * 48 mã lỗi, KHÔNG mã nào mang hai nghĩa khác nhau, KHÔNG nguyên nhân nào thuộc hai mã. Sáu quy
 * tắc precedence chốt cứng thứ tự/ranh giới giữa các mã (xem comment tại từng điểm áp dụng trong
 * `evaluateApprovalEvidencePolicy()`):
 *   P1. Phát hiện accessor property ⇒ chỉ `E_ACCESSOR_PROPERTY_REJECTED`, không thêm mã malformed
 *       khác cho cùng object.
 *   P2. Trường attested-identity/verified-time: absent/null ⇒ mã `*_MISSING`; có mặt nhưng sai
 *       hình dạng ⇒ `E_FACTS_MALFORMED`. Không bao giờ cả hai cho cùng trường.
 *   P3. Structural validator KHÔNG BAO GIỜ kiểm allow-list — enum ngoài contract ⇒ `*_MALFORMED`;
 *       enum hợp lệ nhưng không được phép ⇒ mã `*_NOT_ALLOWED`/`*_NOT_ACCEPTED` riêng.
 *   P4. Mã `*_MISMATCH` của một optional binding chỉ nổ khi CẢ HAI bên non-null.
 *   P5. Time: ordering → source semantics → độ rộng window; chỉ lỗi ĐẦU TIÊN trong bộ ba này nổ.
 *   P6. Số không hợp lệ hình dạng ⇒ `E_POLICY_MALFORMED`; số hợp lệ nhưng vượt hard cap ⇒
 *       `*_CAP_EXCEEDED`.
 *
 * `reviewState !== 'approved'` KHÔNG có mã riêng ở đây — D1 (`validateApprovalEvidence`) đã ép
 * literal `'approved'` và Stage 0 return ngay khi D1 fail, nên một mã D2 riêng cho trường hợp này
 * sẽ là DEAD CODE, không bao giờ nổ được (đã loại khỏi danh sách).
 */
export type ApprovalEvidencePolicyErrorCode =
  // Stage 0 — structural, return ngay nếu bất kỳ mã nào ở đây nổ
  | 'E_CONTEXT_INVALID'
  | 'E_ACCESSOR_PROPERTY_REJECTED'
  | 'E_EVIDENCE_STRUCTURE_INVALID'
  | 'E_POLICY_MALFORMED'
  | 'E_POLICY_AGE_CAP_EXCEEDED'
  | 'E_POLICY_SKEW_CAP_EXCEEDED'
  | 'E_POLICY_VERIFIED_TIME_WINDOW_CAP_EXCEEDED'
  | 'E_FACTS_MALFORMED'
  | 'E_ATTESTED_IDENTITY_MISSING'
  | 'E_VERIFIED_TIME_MISSING'
  | 'E_OBSERVATIONS_MALFORMED'
  | 'E_EVALUATION_TIME_INVALID'
  // Stage 1 — version
  | 'E_POLICY_VERSION_MISMATCH'
  // Stage 2 — manifest/environment binding
  | 'E_MANIFEST_ID_MISMATCH'
  | 'E_MANIFEST_CHECKSUM_MISMATCH'
  | 'E_TARGET_ENVIRONMENT_POLICY_MISMATCH'
  | 'E_TARGET_ENVIRONMENT_OBSERVED_MISMATCH'
  // Stage 3 — mandatory attested identity binding (B<->C, A<->B)
  | 'E_ATTESTED_REPOSITORY_ID_MISMATCH'
  | 'E_ATTESTED_REPOSITORY_OWNER_ID_MISMATCH'
  | 'E_ATTESTED_WORKFLOW_REF_NOT_ALLOWED'
  | 'E_ATTESTATION_ISSUER_NOT_ALLOWED'
  | 'E_WORKFLOW_REF_ATTESTATION_MISMATCH'
  // Stage 4 — policy consistency (A<->C)
  | 'E_REPOSITORY_ID_MISMATCH'
  | 'E_REPOSITORY_OWNER_ID_MISMATCH'
  | 'E_WORKFLOW_REF_NOT_ALLOWED'
  | 'E_ISSUER_NOT_ALLOWED'
  | 'E_ENVIRONMENT_ID_MISMATCH'
  | 'E_APPROVER_PROVIDER_NOT_ALLOWED'
  | 'E_APPROVER_NOT_ALLOWED'
  | 'E_APPROVER_REVOKED'
  // Stage 5 — commit/optional bindings/review record
  | 'E_COMMIT_SHA_MISMATCH'
  | 'E_WORKFLOW_SHA_MISSING'
  | 'E_WORKFLOW_SHA_NOT_ATTESTED'
  | 'E_WORKFLOW_SHA_MISMATCH'
  | 'E_RUN_BINDING_NOT_ATTESTED'
  | 'E_RUN_ID_MISMATCH'
  | 'E_RUN_ATTEMPT_MISMATCH'
  | 'E_REVIEW_RECORD_DIGEST_MISMATCH'
  // Stage 6 — exact bytes
  | 'E_SUBJECT_DIGEST_MISMATCH'
  | 'E_EVIDENCE_BYTES_NOT_CANONICAL'
  // Stage 7 — time
  | 'E_VERIFIED_TIME_SOURCE_NOT_ACCEPTED'
  | 'E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION'
  | 'E_VERIFIED_TIME_WINDOW_INVALID'
  | 'E_VERIFIED_TIME_WINDOW_TOO_WIDE'
  | 'E_EVALUATION_TIME_BEFORE_ATTESTATION'
  | 'E_EVIDENCE_EXPIRED'
  | 'E_ISSUED_AT_OUTSIDE_VERIFIED_WINDOW'
  | 'E_OUTSIDE_PRODUCER_VALIDITY_WINDOW';

export interface ApprovalEvidencePolicyViolation {
  readonly code: ApprovalEvidencePolicyErrorCode;
  /** Schema path (vd `policy.allowedApproverSubjectIds`, `evidence.workflowRef`) — KHÔNG BAO GIỜ
   *  là giá trị dữ liệu. */
  readonly field: string;
  /** Câu TĨNH — không interpolate bất kỳ giá trị nào từ evidence/policy/facts/observations. */
  readonly message: string;
}

/**
 * Primitive-only, `Object.freeze()`d — KHÔNG trả `payload`/`evidence`/`facts`/`policy`/
 * `observations` hay bất kỳ reference nào tới input (Design Amendment 1 Correction 5, chống
 * TOCTOU: caller không còn đường nào mutate object rồi ảnh hưởng tới kết quả đã trả).
 *
 * `evidenceRunId`/`evidenceRunAttempt` LUÔN đến từ evidence payload TỰ KHAI — KHÔNG BAO GIỜ được
 * gọi là "verified". `attestedRunId`/`attestedRunAttempt` chỉ non-null khi facts thực sự cung cấp
 * và khớp evidence; `runBindingVerified` là cờ provenance duy nhất phân biệt hai loại giá trị
 * trên (Design Amendment 1 Correction F2). 0.5E dùng các trường `evidenceRun*`/`attestedRun*`
 * PHẢI ghi rõ provenance vào receipt, không được ghi trần.
 */
export interface ApprovalEvidencePolicySuccess {
  readonly ok: true;

  readonly manifestId: string;
  readonly manifestChecksum: string;
  readonly targetEnvironment: string;

  readonly evidenceSha256: string;

  readonly attestedRepositoryId: string;
  readonly attestedRepositoryOwnerId: string;
  readonly attestedWorkflowRef: string;
  readonly verifiedTimeNotBefore: string;
  readonly verifiedTimeNotAfter: string;
  readonly verifiedTimeSource: VerifiedTimeSource;

  readonly effectiveExpiresAt: string;

  readonly approverSubjectId: string;

  readonly evidenceRunId: string;
  readonly evidenceRunAttempt: number;
  readonly attestedRunId: string | null;
  readonly attestedRunAttempt: number | null;
  readonly runBindingVerified: boolean;
}

export interface ApprovalEvidencePolicyFailure {
  readonly ok: false;
  /** Toàn bộ vi phạm tìm được (trừ khi Stage 0 fail — khi đó chỉ Stage 0). Thứ tự CỐ ĐỊNH theo
   *  thứ tự rule viết trong hàm, không phụ thuộc `Object.keys()` hay giá trị dữ liệu. */
  readonly violations: readonly ApprovalEvidencePolicyViolation[];
}

export type ApprovalEvidencePolicyResult =
  ApprovalEvidencePolicySuccess | ApprovalEvidencePolicyFailure;

/** Hard cap 24 giờ (OD-3) — policy chỉ được phép NGHIÊM HƠN, không bao giờ nới quá con số này. */
export const MAXIMUM_EVIDENCE_AGE_CAP_MS = 86_400_000;
/** Hard cap ±5 phút — owner chốt, KHÔNG phải 15 phút. */
export const MAXIMUM_CLOCK_SKEW_CAP_MS = 300_000;
/** Cận trên SUY DIỄN được từ chính thiết kế (không phải số đo Fulcio đã kiểm chứng) — xem comment
 *  tại chỗ áp dụng trong `evaluateApprovalEvidencePolicy()`. */
export const VERIFIED_TIME_WINDOW_CAP_MS = 86_400_000;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const GIT_SHA_HEX_RE = /^[0-9a-f]{40}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && SHA256_HEX_RE.test(v);
}

function isGitShaHex(v: unknown): v is string {
  return typeof v === 'string' && GIT_SHA_HEX_RE.test(v);
}

function isVerifiedTimeSource(v: unknown): v is VerifiedTimeSource {
  return typeof v === 'string' && (VERIFIED_TIME_SOURCES as readonly string[]).includes(v);
}

/**
 * Kiểm KHÔNG có accessor property (getter/setter) trên bất kỳ own property nào của `value`, bằng
 * `Object.getOwnPropertyDescriptors()` — KHÔNG BAO GIỜ đọc `value[key]` trực tiếp trước bước này
 * (sẽ invoke getter). Không phải object (primitive/null) ⇒ an toàn TRIVIALLY (không có gì để
 * screen — validator cấu trúc phía sau sẽ tự báo sai kiểu). Áp dụng cho object THƯỜNG lẫn mảng
 * (mảng cũng có own property là các index + `length`).
 */
function hasOnlyDataProperties(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (!Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) return false;
  }
  return true;
}

function accessorViolation(field: string): ApprovalEvidencePolicyViolation {
  return {
    code: 'E_ACCESSOR_PROPERTY_REJECTED',
    field,
    message: 'Trường này là accessor property (getter/setter) — bị từ chối, không được đọc.',
  };
}

/**
 * Đọc một mảng string đã được xác nhận KHÔNG có accessor property (ở cả mảng và từng phần tử —
 * `hasOnlyDataProperties` đã confirm trước khi hàm này được gọi). Trả `null` nếu không phải mảng
 * string thuần (mỗi phần tử phải `typeof === 'string'`) — không phân biệt lý do cụ thể ở đây, caller
 * tự quyết định mã lỗi phù hợp (accessor đã bị chặn từ trước, nên `null` ở đây luôn nghĩa là "sai
 * kiểu/hình dạng").
 */
function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    items.push(item);
  }
  return items;
}

interface StructuralStageResult<T> {
  readonly violations: ApprovalEvidencePolicyViolation[];
  readonly value: T | null;
}

const POLICY_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'policyVersion',
  'repositoryId',
  'repositoryOwnerId',
  'environmentId',
  'targetEnvironment',
  'allowedWorkflowRefs',
  'allowedIssuers',
  'allowedAttestationIssuers',
  'allowedApproverProviders',
  'allowedApproverSubjectIds',
  'revokedApproverSubjectIds',
  'acceptedVerifiedTimeSources',
  'maximumEvidenceAgeMs',
  'allowedClockSkewMs',
  'maximumVerifiedTimeWindowMs',
  'requireAttestedWorkflowShaBinding',
  'requireAttestedRunBinding',
  'requireEvidenceWorkflowSha',
]);

/**
 * Validate `policy: unknown` (đã qua `hasOnlyDataProperties` ở top-level bởi caller — hàm này tự
 * screen accessor cho các trường MẢNG bên trong, vì đọc top-level an toàn không đảm bảo các mảng
 * lồng bên trong cũng an toàn). CLOSED SCHEMA. Trả TẤT CẢ lỗi tìm được (trừ khi gặp accessor —
 * P1: không thêm mã malformed cho cùng trường).
 */
function validatePolicyShape(raw: unknown): StructuralStageResult<ApprovalEvidencePolicyV1> {
  const violations: ApprovalEvidencePolicyViolation[] = [];

  if (!isPlainObject(raw)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy',
      message: 'policy phải là một object.',
    });
    return { violations, value: null };
  }

  for (const key of Object.keys(raw)) {
    if (!POLICY_ALLOWED_KEYS.has(key)) {
      violations.push({
        code: 'E_POLICY_MALFORMED',
        field: `policy.${key}`,
        message: 'Khoá không được nhận dạng trong policy.',
      });
    }
  }

  if (!(typeof raw.policyVersion === 'number' && Number.isInteger(raw.policyVersion) && raw.policyVersion > 0)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.policyVersion',
      message: 'policy.policyVersion phải là số nguyên dương.',
    });
  }

  if (!isCanonicalDecimalString(raw.repositoryId)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.repositoryId',
      message: 'policy.repositoryId phải là chuỗi thập phân canonical.',
    });
  }
  if (!isCanonicalDecimalString(raw.repositoryOwnerId)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.repositoryOwnerId',
      message: 'policy.repositoryOwnerId phải là chuỗi thập phân canonical.',
    });
  }
  if (!isCanonicalDecimalString(raw.environmentId)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.environmentId',
      message: 'policy.environmentId phải là chuỗi thập phân canonical.',
    });
  }
  if (!isNonEmptyString(raw.targetEnvironment)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.targetEnvironment',
      message: 'policy.targetEnvironment phải là chuỗi không rỗng.',
    });
  }

  // Sáu mảng — mỗi mảng: screen accessor riêng (P1), rồi đọc string[], rồi kiểm non-empty (trừ
  // revokedApproverSubjectIds được phép rỗng) + kiểm hình dạng từng phần tử theo field.
  let accessorBlockedAnyArray = false;

  function readRequiredNonEmptyStringArray(
    fieldName: string,
    elementValidator?: (item: string) => boolean,
    elementDescription?: string,
  ): string[] | null {
    const value = (raw as Record<string, unknown>)[fieldName];
    if (!hasOnlyDataProperties(value)) {
      violations.push(accessorViolation(`policy.${fieldName}`));
      accessorBlockedAnyArray = true;
      return null;
    }
    const items = readStringArray(value);
    if (items === null) {
      violations.push({
        code: 'E_POLICY_MALFORMED',
        field: `policy.${fieldName}`,
        message: `policy.${fieldName} phải là một mảng chuỗi.`,
      });
      return null;
    }
    if (items.length === 0) {
      violations.push({
        code: 'E_POLICY_MALFORMED',
        field: `policy.${fieldName}`,
        message: `policy.${fieldName} không được rỗng.`,
      });
      return null;
    }
    if (elementValidator && !items.every(elementValidator)) {
      violations.push({
        code: 'E_POLICY_MALFORMED',
        field: `policy.${fieldName}`,
        message: `policy.${fieldName} có phần tử sai định dạng${elementDescription ? ` (${elementDescription})` : ''}.`,
      });
      return null;
    }
    return items;
  }

  const allowedWorkflowRefs = readRequiredNonEmptyStringArray('allowedWorkflowRefs', isNonEmptyString, 'phải là chuỗi không rỗng');
  const allowedIssuers = readRequiredNonEmptyStringArray('allowedIssuers', isNonEmptyString, 'phải là chuỗi không rỗng');
  const allowedAttestationIssuers = readRequiredNonEmptyStringArray('allowedAttestationIssuers', isNonEmptyString, 'phải là chuỗi không rỗng');
  const allowedApproverProviders = readRequiredNonEmptyStringArray('allowedApproverProviders', isNonEmptyString, 'phải là chuỗi không rỗng');
  const allowedApproverSubjectIds = readRequiredNonEmptyStringArray('allowedApproverSubjectIds', isCanonicalDecimalString, 'phải là chuỗi thập phân canonical');
  const acceptedVerifiedTimeSourcesRaw = readRequiredNonEmptyStringArray('acceptedVerifiedTimeSources', isVerifiedTimeSource, 'phải thuộc VERIFIED_TIME_SOURCES');

  // revokedApproverSubjectIds — ĐƯỢC PHÉP rỗng, nên kiểm riêng không dùng helper "non-empty" ở trên.
  let revokedApproverSubjectIds: string[] | null = null;
  {
    const value = raw.revokedApproverSubjectIds;
    if (!hasOnlyDataProperties(value)) {
      violations.push(accessorViolation('policy.revokedApproverSubjectIds'));
      accessorBlockedAnyArray = true;
    } else {
      const items = readStringArray(value);
      if (items === null || !items.every(isCanonicalDecimalString)) {
        violations.push({
          code: 'E_POLICY_MALFORMED',
          field: 'policy.revokedApproverSubjectIds',
          message: 'policy.revokedApproverSubjectIds phải là một mảng chuỗi thập phân canonical (được phép rỗng).',
        });
      } else {
        revokedApproverSubjectIds = items;
      }
    }
  }

  // Numeric caps — P6: sai hình dạng => MALFORMED; hợp lệ nhưng vượt cap => *_CAP_EXCEEDED.
  let maximumEvidenceAgeMs: number | null = null;
  if (!(typeof raw.maximumEvidenceAgeMs === 'number' && Number.isInteger(raw.maximumEvidenceAgeMs) && raw.maximumEvidenceAgeMs > 0)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.maximumEvidenceAgeMs',
      message: 'policy.maximumEvidenceAgeMs phải là số nguyên dương.',
    });
  } else if (raw.maximumEvidenceAgeMs > MAXIMUM_EVIDENCE_AGE_CAP_MS) {
    violations.push({
      code: 'E_POLICY_AGE_CAP_EXCEEDED',
      field: 'policy.maximumEvidenceAgeMs',
      message: `policy.maximumEvidenceAgeMs vượt hard cap ${MAXIMUM_EVIDENCE_AGE_CAP_MS}ms.`,
    });
  } else {
    maximumEvidenceAgeMs = raw.maximumEvidenceAgeMs;
  }

  let allowedClockSkewMs: number | null = null;
  if (!(typeof raw.allowedClockSkewMs === 'number' && Number.isInteger(raw.allowedClockSkewMs) && raw.allowedClockSkewMs >= 0)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.allowedClockSkewMs',
      message: 'policy.allowedClockSkewMs phải là số nguyên không âm.',
    });
  } else if (raw.allowedClockSkewMs > MAXIMUM_CLOCK_SKEW_CAP_MS) {
    violations.push({
      code: 'E_POLICY_SKEW_CAP_EXCEEDED',
      field: 'policy.allowedClockSkewMs',
      message: `policy.allowedClockSkewMs vượt hard cap ${MAXIMUM_CLOCK_SKEW_CAP_MS}ms.`,
    });
  } else {
    allowedClockSkewMs = raw.allowedClockSkewMs;
  }

  let maximumVerifiedTimeWindowMs: number | null = null;
  if (!(typeof raw.maximumVerifiedTimeWindowMs === 'number' && Number.isInteger(raw.maximumVerifiedTimeWindowMs) && raw.maximumVerifiedTimeWindowMs > 0)) {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.maximumVerifiedTimeWindowMs',
      message: 'policy.maximumVerifiedTimeWindowMs phải là số nguyên dương.',
    });
  } else if (raw.maximumVerifiedTimeWindowMs > VERIFIED_TIME_WINDOW_CAP_MS) {
    violations.push({
      code: 'E_POLICY_VERIFIED_TIME_WINDOW_CAP_EXCEEDED',
      field: 'policy.maximumVerifiedTimeWindowMs',
      message: `policy.maximumVerifiedTimeWindowMs vượt hard cap ${VERIFIED_TIME_WINDOW_CAP_MS}ms.`,
    });
  } else {
    maximumVerifiedTimeWindowMs = raw.maximumVerifiedTimeWindowMs;
  }

  if (typeof raw.requireAttestedWorkflowShaBinding !== 'boolean') {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.requireAttestedWorkflowShaBinding',
      message: 'policy.requireAttestedWorkflowShaBinding phải là boolean.',
    });
  }
  if (typeof raw.requireAttestedRunBinding !== 'boolean') {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.requireAttestedRunBinding',
      message: 'policy.requireAttestedRunBinding phải là boolean.',
    });
  }
  if (typeof raw.requireEvidenceWorkflowSha !== 'boolean') {
    violations.push({
      code: 'E_POLICY_MALFORMED',
      field: 'policy.requireEvidenceWorkflowSha',
      message: 'policy.requireEvidenceWorkflowSha phải là boolean.',
    });
  }

  if (violations.length > 0 || accessorBlockedAnyArray) {
    return { violations, value: null };
  }

  return {
    violations,
    value: {
      policyVersion: raw.policyVersion as number,
      repositoryId: raw.repositoryId as string,
      repositoryOwnerId: raw.repositoryOwnerId as string,
      environmentId: raw.environmentId as string,
      targetEnvironment: raw.targetEnvironment as string,
      allowedWorkflowRefs: allowedWorkflowRefs as string[],
      allowedIssuers: allowedIssuers as string[],
      allowedAttestationIssuers: allowedAttestationIssuers as string[],
      allowedApproverProviders: allowedApproverProviders as string[],
      allowedApproverSubjectIds: allowedApproverSubjectIds as string[],
      revokedApproverSubjectIds: revokedApproverSubjectIds as string[],
      acceptedVerifiedTimeSources: acceptedVerifiedTimeSourcesRaw as VerifiedTimeSource[],
      maximumEvidenceAgeMs: maximumEvidenceAgeMs as number,
      allowedClockSkewMs: allowedClockSkewMs as number,
      maximumVerifiedTimeWindowMs: maximumVerifiedTimeWindowMs as number,
      requireAttestedWorkflowShaBinding: raw.requireAttestedWorkflowShaBinding as boolean,
      requireAttestedRunBinding: raw.requireAttestedRunBinding as boolean,
      requireEvidenceWorkflowSha: raw.requireEvidenceWorkflowSha as boolean,
    },
  };
}

const FACTS_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'factsVersion',
  'subjectDigest',
  'verifiedTimeNotBefore',
  'verifiedTimeNotAfter',
  'verifiedTimeSource',
  'verifiedIssuer',
  'verifiedRepositoryId',
  'verifiedRepositoryOwnerId',
  'verifiedWorkflowRef',
  'verifiedWorkflowSha',
  'verifiedRunId',
  'verifiedRunAttempt',
]);

/**
 * Validate `facts: unknown`. P2 áp dụng cho BA nhóm trường: attested identity
 * (`verifiedRepositoryId`/`verifiedRepositoryOwnerId`/`verifiedWorkflowRef`) và verified time
 * (`verifiedTimeNotBefore`/`verifiedTimeNotAfter`/`verifiedTimeSource`) — absent/`null` ⇒ mã
 * `*_MISSING`; có mặt nhưng sai hình dạng ⇒ `E_FACTS_MALFORMED`. `subjectDigest`/`verifiedIssuer`
 * không thuộc hai nhóm đặc biệt này — thiếu hay sai hình dạng đều là `E_FACTS_MALFORMED` (không
 * có mã "missing" riêng, vì D1 không có tiền lệ tách hai loại lỗi này cho các trường thường).
 */
function validateFactsShape(raw: unknown): StructuralStageResult<VerifiedAttestationFactsV1> {
  const violations: ApprovalEvidencePolicyViolation[] = [];

  if (!isPlainObject(raw)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts',
      message: 'facts phải là một object.',
    });
    return { violations, value: null };
  }

  for (const key of Object.keys(raw)) {
    if (!FACTS_ALLOWED_KEYS.has(key)) {
      violations.push({
        code: 'E_FACTS_MALFORMED',
        field: `facts.${key}`,
        message: 'Khoá không được nhận dạng trong facts.',
      });
    }
  }

  if (raw.factsVersion !== 1) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.factsVersion',
      message: 'facts.factsVersion phải đúng literal 1.',
    });
  }

  if (!isSha256Hex(raw.subjectDigest)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.subjectDigest',
      message: 'facts.subjectDigest sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).',
    });
  }

  if (!isNonEmptyString(raw.verifiedIssuer)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedIssuer',
      message: 'facts.verifiedIssuer phải là chuỗi không rỗng.',
    });
  }

  // Nhóm verified-time — P2.
  const hasNotBefore = Object.prototype.hasOwnProperty.call(raw, 'verifiedTimeNotBefore');
  const hasNotAfter = Object.prototype.hasOwnProperty.call(raw, 'verifiedTimeNotAfter');
  const hasSource = Object.prototype.hasOwnProperty.call(raw, 'verifiedTimeSource');

  if (!hasNotBefore || raw.verifiedTimeNotBefore === null) {
    violations.push({
      code: 'E_VERIFIED_TIME_MISSING',
      field: 'facts.verifiedTimeNotBefore',
      message: 'facts.verifiedTimeNotBefore bắt buộc — D4 không được lấp từ evidence tự khai.',
    });
  } else if (!isValidCanonicalTimestamp(raw.verifiedTimeNotBefore)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedTimeNotBefore',
      message: 'facts.verifiedTimeNotBefore phải là timestamp UTC canonical hợp lệ.',
    });
  }

  if (!hasNotAfter || raw.verifiedTimeNotAfter === null) {
    violations.push({
      code: 'E_VERIFIED_TIME_MISSING',
      field: 'facts.verifiedTimeNotAfter',
      message: 'facts.verifiedTimeNotAfter bắt buộc — D4 không được lấp từ evidence tự khai.',
    });
  } else if (!isValidCanonicalTimestamp(raw.verifiedTimeNotAfter)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedTimeNotAfter',
      message: 'facts.verifiedTimeNotAfter phải là timestamp UTC canonical hợp lệ.',
    });
  }

  if (!hasSource || raw.verifiedTimeSource === null) {
    violations.push({
      code: 'E_VERIFIED_TIME_MISSING',
      field: 'facts.verifiedTimeSource',
      message: 'facts.verifiedTimeSource bắt buộc — D4 không được lấp từ evidence tự khai.',
    });
  } else if (!isVerifiedTimeSource(raw.verifiedTimeSource)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedTimeSource',
      message: `facts.verifiedTimeSource phải thuộc: ${VERIFIED_TIME_SOURCES.join(', ')}.`,
    });
  }

  // Nhóm attested identity — P2, Correction 1.
  const hasRepoId = Object.prototype.hasOwnProperty.call(raw, 'verifiedRepositoryId');
  const hasOwnerId = Object.prototype.hasOwnProperty.call(raw, 'verifiedRepositoryOwnerId');
  const hasWorkflowRef = Object.prototype.hasOwnProperty.call(raw, 'verifiedWorkflowRef');

  if (!hasRepoId || raw.verifiedRepositoryId === null) {
    violations.push({
      code: 'E_ATTESTED_IDENTITY_MISSING',
      field: 'facts.verifiedRepositoryId',
      message: 'facts.verifiedRepositoryId bắt buộc, không nullable — D4 phải trích từ vật liệu đã verify.',
    });
  } else if (!isCanonicalDecimalString(raw.verifiedRepositoryId)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRepositoryId',
      message: 'facts.verifiedRepositoryId phải là chuỗi thập phân canonical.',
    });
  }

  if (!hasOwnerId || raw.verifiedRepositoryOwnerId === null) {
    violations.push({
      code: 'E_ATTESTED_IDENTITY_MISSING',
      field: 'facts.verifiedRepositoryOwnerId',
      message: 'facts.verifiedRepositoryOwnerId bắt buộc, không nullable — D4 phải trích từ vật liệu đã verify.',
    });
  } else if (!isCanonicalDecimalString(raw.verifiedRepositoryOwnerId)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRepositoryOwnerId',
      message: 'facts.verifiedRepositoryOwnerId phải là chuỗi thập phân canonical.',
    });
  }

  if (!hasWorkflowRef || raw.verifiedWorkflowRef === null) {
    violations.push({
      code: 'E_ATTESTED_IDENTITY_MISSING',
      field: 'facts.verifiedWorkflowRef',
      message: 'facts.verifiedWorkflowRef bắt buộc, không nullable — D4 phải trích từ vật liệu đã verify.',
    });
  } else if (!isNonEmptyString(raw.verifiedWorkflowRef)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedWorkflowRef',
      message: 'facts.verifiedWorkflowRef phải là chuỗi không rỗng.',
    });
  }

  // Ba trường TUỲ CHỌN — optional, string|null / number|null.
  const hasWorkflowSha = Object.prototype.hasOwnProperty.call(raw, 'verifiedWorkflowSha');
  if (!hasWorkflowSha) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedWorkflowSha',
      message: 'facts.verifiedWorkflowSha bắt buộc có mặt (giá trị null hợp lệ, nhưng khoá không được vắng mặt).',
    });
  } else if (raw.verifiedWorkflowSha !== null && !isGitShaHex(raw.verifiedWorkflowSha)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedWorkflowSha',
      message: 'facts.verifiedWorkflowSha phải là null hoặc đúng 40 ký tự hex viết thường.',
    });
  }

  const hasRunId = Object.prototype.hasOwnProperty.call(raw, 'verifiedRunId');
  if (!hasRunId) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRunId',
      message: 'facts.verifiedRunId bắt buộc có mặt (giá trị null hợp lệ, nhưng khoá không được vắng mặt).',
    });
  } else if (raw.verifiedRunId !== null && !isCanonicalDecimalString(raw.verifiedRunId)) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRunId',
      message: 'facts.verifiedRunId phải là null hoặc chuỗi thập phân canonical.',
    });
  }

  const hasRunAttempt = Object.prototype.hasOwnProperty.call(raw, 'verifiedRunAttempt');
  if (!hasRunAttempt) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRunAttempt',
      message: 'facts.verifiedRunAttempt bắt buộc có mặt (giá trị null hợp lệ, nhưng khoá không được vắng mặt).',
    });
  } else if (
    raw.verifiedRunAttempt !== null &&
    !(typeof raw.verifiedRunAttempt === 'number' && Number.isInteger(raw.verifiedRunAttempt) && raw.verifiedRunAttempt > 0)
  ) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRunAttempt',
      message: 'facts.verifiedRunAttempt phải là null hoặc số nguyên dương.',
    });
  }

  // Cặp run binding phải NHẤT QUÁN: cùng null (D4 không trích được) hoặc cùng non-null. Nửa cặp
  // nghĩa là facts TỰ MÂU THUẪN — thuộc đúng nhóm "D4 sinh ra thứ hỏng" mà P2 giao cho
  // E_FACTS_MALFORMED. Chỉ đánh giá khi CẢ HAI trường đã qua kiểm hình dạng ở trên (own-property
  // có mặt và type/null hợp lệ) — nếu không, một giá trị sai hình dạng sẽ tự động khiến hai bên
  // "lệch null-ness" và phát sinh lỗi partial thứ cấp vô nghĩa chồng lên lỗi malformed đã có.
  // Chấp nhận nửa cặp sẽ mất tính chất phân biệt rerun mà runAttempt tồn tại để bảo vệ, trong khi
  // attestedRunId non-null làm success result TRÔNG như run đã được ràng buộc dù chưa hề đủ cặp.
  const runIdFieldValid = hasRunId && (raw.verifiedRunId === null || isCanonicalDecimalString(raw.verifiedRunId));
  const runAttemptFieldValid =
    hasRunAttempt &&
    (raw.verifiedRunAttempt === null ||
      (typeof raw.verifiedRunAttempt === 'number' && Number.isInteger(raw.verifiedRunAttempt) && raw.verifiedRunAttempt > 0));
  if (
    runIdFieldValid &&
    runAttemptFieldValid &&
    (raw.verifiedRunId === null) !== (raw.verifiedRunAttempt === null)
  ) {
    violations.push({
      code: 'E_FACTS_MALFORMED',
      field: 'facts.verifiedRunId',
      message: 'facts.verifiedRunId và facts.verifiedRunAttempt phải cùng null hoặc cùng non-null.',
    });
  }

  if (violations.length > 0) {
    return { violations, value: null };
  }

  return {
    violations,
    value: {
      factsVersion: 1,
      subjectDigest: raw.subjectDigest as string,
      verifiedTimeNotBefore: raw.verifiedTimeNotBefore as string,
      verifiedTimeNotAfter: raw.verifiedTimeNotAfter as string,
      verifiedTimeSource: raw.verifiedTimeSource as VerifiedTimeSource,
      verifiedIssuer: raw.verifiedIssuer as string,
      verifiedRepositoryId: raw.verifiedRepositoryId as string,
      verifiedRepositoryOwnerId: raw.verifiedRepositoryOwnerId as string,
      verifiedWorkflowRef: raw.verifiedWorkflowRef as string,
      verifiedWorkflowSha: raw.verifiedWorkflowSha as string | null,
      verifiedRunId: raw.verifiedRunId as string | null,
      verifiedRunAttempt: raw.verifiedRunAttempt as number | null,
    },
  };
}

const OBSERVATIONS_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'observationsVersion',
  'manifestId',
  'manifestChecksum',
  'targetEnvironment',
  'expectedCommitSha',
  'evidenceSha256',
]);

function validateObservationsShape(raw: unknown): StructuralStageResult<RunnerObservationsV1> {
  const violations: ApprovalEvidencePolicyViolation[] = [];

  if (!isPlainObject(raw)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations',
      message: 'observations phải là một object.',
    });
    return { violations, value: null };
  }

  for (const key of Object.keys(raw)) {
    if (!OBSERVATIONS_ALLOWED_KEYS.has(key)) {
      violations.push({
        code: 'E_OBSERVATIONS_MALFORMED',
        field: `observations.${key}`,
        message: 'Khoá không được nhận dạng trong observations.',
      });
    }
  }

  if (raw.observationsVersion !== 1) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.observationsVersion',
      message: 'observations.observationsVersion phải đúng literal 1.',
    });
  }
  if (!isNonEmptyString(raw.manifestId)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.manifestId',
      message: 'observations.manifestId phải là chuỗi không rỗng.',
    });
  }
  if (!isSha256Hex(raw.manifestChecksum)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.manifestChecksum',
      message: 'observations.manifestChecksum sai định dạng — cần đúng 64 ký tự hex viết thường.',
    });
  }
  if (!isNonEmptyString(raw.targetEnvironment)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.targetEnvironment',
      message: 'observations.targetEnvironment phải là chuỗi không rỗng.',
    });
  }
  if (!isGitShaHex(raw.expectedCommitSha)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.expectedCommitSha',
      message: 'observations.expectedCommitSha sai định dạng — cần đúng 40 ký tự hex viết thường.',
    });
  }
  if (!isSha256Hex(raw.evidenceSha256)) {
    violations.push({
      code: 'E_OBSERVATIONS_MALFORMED',
      field: 'observations.evidenceSha256',
      message: 'observations.evidenceSha256 sai định dạng — cần đúng 64 ký tự hex viết thường.',
    });
  }

  if (violations.length > 0) {
    return { violations, value: null };
  }

  return {
    violations,
    value: {
      observationsVersion: 1,
      manifestId: raw.manifestId as string,
      manifestChecksum: raw.manifestChecksum as string,
      targetEnvironment: raw.targetEnvironment as string,
      expectedCommitSha: raw.expectedCommitSha as string,
      evidenceSha256: raw.evidenceSha256 as string,
    },
  };
}

/**
 * ENTRY POINT DUY NHẤT. `context: unknown` — KHÔNG có overload nhận input đã gõ kiểu sẵn (một
 * `as` ở phía caller sẽ vô hiệu hoá toàn bộ fail-closed). Zero-throw: mọi input, kể cả rác/Proxy
 * độc, đều trả `{ok:false, violations:[...]}`, không bao giờ ném exception.
 */
export function evaluateApprovalEvidencePolicy(context: unknown): ApprovalEvidencePolicyResult {
  try {
    return evaluateInner(context);
  } catch {
    // Backstop cho Proxy độc (vd bẫy Object.getOwnPropertyDescriptor và ném) — outer try/catch
    // DUY NHẤT trong toàn bộ hàm, không dùng để che lỗi logic bình thường (những lỗi đó đã được
    // xử lý bằng nhánh if/else trả ok:false, không bao giờ throw).
    return {
      ok: false,
      violations: [
        {
          code: 'E_CONTEXT_INVALID',
          field: 'context',
          message: 'context không đọc được an toàn (backstop cho input độc/Proxy bất thường).',
        },
      ],
    };
  }
}

function evaluateInner(context: unknown): ApprovalEvidencePolicyResult {
  // -----------------------------------------------------------------------------------------
  // STAGE 0 — structural. Bất kỳ vi phạm nào ở đây ⇒ return NGAY, không sang Stage 1-8.
  // -----------------------------------------------------------------------------------------
  if (!isPlainObject(context)) {
    return {
      ok: false,
      violations: [
        { code: 'E_CONTEXT_INVALID', field: 'context', message: 'context phải là một object.' },
      ],
    };
  }

  if (!hasOnlyDataProperties(context)) {
    return { ok: false, violations: [accessorViolation('context')] };
  }

  const stage0: ApprovalEvidencePolicyViolation[] = [];

  const evidenceRaw = context.evidence;
  const factsRaw = context.facts;
  const policyRaw = context.policy;
  const observationsRaw = context.observations;
  const evaluationTimeRaw = context.evaluationTime;

  let validatedEvidence: ApprovalEvidencePayloadV1 | null = null;
  if (!hasOnlyDataProperties(evidenceRaw)) {
    stage0.push(accessorViolation('evidence'));
  } else {
    const result = validateApprovalEvidence(evidenceRaw);
    if (!result.ok) {
      stage0.push({
        code: 'E_EVIDENCE_STRUCTURE_INVALID',
        field: 'evidence',
        message: 'evidence không thoả cấu trúc D1 (validateApprovalEvidence).',
      });
    } else {
      validatedEvidence = result.payload;
    }
  }

  let validatedFacts: VerifiedAttestationFactsV1 | null = null;
  if (!hasOnlyDataProperties(factsRaw)) {
    stage0.push(accessorViolation('facts'));
  } else {
    const factsResult = validateFactsShape(factsRaw);
    stage0.push(...factsResult.violations);
    validatedFacts = factsResult.value;
  }

  let validatedPolicy: ApprovalEvidencePolicyV1 | null = null;
  if (!hasOnlyDataProperties(policyRaw)) {
    stage0.push(accessorViolation('policy'));
  } else {
    const policyResult = validatePolicyShape(policyRaw);
    stage0.push(...policyResult.violations);
    validatedPolicy = policyResult.value;
  }

  let validatedObservations: RunnerObservationsV1 | null = null;
  if (!hasOnlyDataProperties(observationsRaw)) {
    stage0.push(accessorViolation('observations'));
  } else {
    const observationsResult = validateObservationsShape(observationsRaw);
    stage0.push(...observationsResult.violations);
    validatedObservations = observationsResult.value;
  }

  if (!isValidCanonicalTimestamp(evaluationTimeRaw)) {
    stage0.push({
      code: 'E_EVALUATION_TIME_INVALID',
      field: 'evaluationTime',
      message: 'evaluationTime phải là timestamp UTC canonical hợp lệ theo lịch thật.',
    });
  }

  if (
    stage0.length > 0 ||
    validatedEvidence === null ||
    validatedFacts === null ||
    validatedPolicy === null ||
    validatedObservations === null
  ) {
    return { ok: false, violations: stage0 };
  }

  const evidence = validatedEvidence;
  const facts = validatedFacts;
  const policy = validatedPolicy;
  const observations = validatedObservations;
  const evaluationTime = evaluationTimeRaw as string;

  // -----------------------------------------------------------------------------------------
  // STAGE 1-8 — tích luỹ TOÀN BỘ vi phạm, thứ tự CỐ ĐỊNH theo thứ tự viết dưới đây.
  // -----------------------------------------------------------------------------------------
  const violations: ApprovalEvidencePolicyViolation[] = [];

  // Stage 1 — version
  if (evidence.policyVersion !== policy.policyVersion) {
    violations.push({
      code: 'E_POLICY_VERSION_MISMATCH',
      field: 'evidence.policyVersion',
      message: 'evidence.policyVersion không khớp policy.policyVersion.',
    });
  }

  // Stage 2 — manifest/environment binding
  if (evidence.manifestId !== observations.manifestId) {
    violations.push({
      code: 'E_MANIFEST_ID_MISMATCH',
      field: 'evidence.manifestId',
      message: 'evidence.manifestId không khớp observations.manifestId (manifest thật trên đĩa).',
    });
  }
  if (evidence.manifestChecksum !== observations.manifestChecksum) {
    violations.push({
      code: 'E_MANIFEST_CHECKSUM_MISMATCH',
      field: 'evidence.manifestChecksum',
      message: 'evidence.manifestChecksum không khớp checksum tính lại từ manifest thật.',
    });
  }
  if (evidence.targetEnvironment !== policy.targetEnvironment) {
    violations.push({
      code: 'E_TARGET_ENVIRONMENT_POLICY_MISMATCH',
      field: 'evidence.targetEnvironment',
      message: 'evidence.targetEnvironment không khớp policy.targetEnvironment.',
    });
  }
  if (evidence.targetEnvironment !== observations.targetEnvironment) {
    violations.push({
      code: 'E_TARGET_ENVIRONMENT_OBSERVED_MISMATCH',
      field: 'evidence.targetEnvironment',
      message: 'evidence.targetEnvironment không khớp môi trường runner THẬT sự đang chạy.',
    });
  }

  // Stage 3 — mandatory attested identity binding (B<->C, A<->B). Correction 1: không có cờ tắt.
  if (facts.verifiedRepositoryId !== policy.repositoryId) {
    violations.push({
      code: 'E_ATTESTED_REPOSITORY_ID_MISMATCH',
      field: 'facts.verifiedRepositoryId',
      message: 'facts.verifiedRepositoryId (đã xác minh mật mã) không khớp policy.repositoryId.',
    });
  }
  if (facts.verifiedRepositoryOwnerId !== policy.repositoryOwnerId) {
    violations.push({
      code: 'E_ATTESTED_REPOSITORY_OWNER_ID_MISMATCH',
      field: 'facts.verifiedRepositoryOwnerId',
      message: 'facts.verifiedRepositoryOwnerId (đã xác minh mật mã) không khớp policy.repositoryOwnerId.',
    });
  }
  if (!policy.allowedWorkflowRefs.includes(facts.verifiedWorkflowRef)) {
    violations.push({
      code: 'E_ATTESTED_WORKFLOW_REF_NOT_ALLOWED',
      field: 'facts.verifiedWorkflowRef',
      message: 'facts.verifiedWorkflowRef (đã xác minh mật mã) không thuộc policy.allowedWorkflowRefs.',
    });
  }
  if (!policy.allowedAttestationIssuers.includes(facts.verifiedIssuer)) {
    violations.push({
      code: 'E_ATTESTATION_ISSUER_NOT_ALLOWED',
      field: 'facts.verifiedIssuer',
      message: 'facts.verifiedIssuer không thuộc policy.allowedAttestationIssuers.',
    });
  }
  // Đóng lỗ transitivity: allowedWorkflowRefs là DANH SÁCH, nên A∈list ∧ B∈list KHÔNG kéo theo
  // A===B. Phải so A với B trực tiếp.
  if (evidence.workflowRef !== facts.verifiedWorkflowRef) {
    violations.push({
      code: 'E_WORKFLOW_REF_ATTESTATION_MISMATCH',
      field: 'evidence.workflowRef',
      message: 'evidence.workflowRef không khớp facts.verifiedWorkflowRef (đã xác minh mật mã).',
    });
  }

  // Stage 4 — policy consistency (A<->C). Chỉ chứng minh payload TỰ KHAI trùng policy — KHÔNG
  // phải authenticated identity binding (đó là Stage 3, B<->C).
  if (evidence.repositoryId !== policy.repositoryId) {
    violations.push({
      code: 'E_REPOSITORY_ID_MISMATCH',
      field: 'evidence.repositoryId',
      message: 'evidence.repositoryId (tự khai) không khớp policy.repositoryId.',
    });
  }
  if (evidence.repositoryOwnerId !== policy.repositoryOwnerId) {
    violations.push({
      code: 'E_REPOSITORY_OWNER_ID_MISMATCH',
      field: 'evidence.repositoryOwnerId',
      message: 'evidence.repositoryOwnerId (tự khai) không khớp policy.repositoryOwnerId.',
    });
  }
  if (!policy.allowedWorkflowRefs.includes(evidence.workflowRef)) {
    violations.push({
      code: 'E_WORKFLOW_REF_NOT_ALLOWED',
      field: 'evidence.workflowRef',
      message: 'evidence.workflowRef (tự khai) không thuộc policy.allowedWorkflowRefs.',
    });
  }
  if (!policy.allowedIssuers.includes(evidence.issuer)) {
    violations.push({
      code: 'E_ISSUER_NOT_ALLOWED',
      field: 'evidence.issuer',
      message: 'evidence.issuer (tự khai) không thuộc policy.allowedIssuers.',
    });
  }
  if (evidence.environmentId !== policy.environmentId) {
    violations.push({
      code: 'E_ENVIRONMENT_ID_MISMATCH',
      field: 'evidence.environmentId',
      message: 'evidence.environmentId không khớp policy.environmentId.',
    });
  }
  if (!policy.allowedApproverProviders.includes(evidence.approverProvider)) {
    violations.push({
      code: 'E_APPROVER_PROVIDER_NOT_ALLOWED',
      field: 'evidence.approverProvider',
      message: 'evidence.approverProvider không thuộc policy.allowedApproverProviders.',
    });
  }
  if (!policy.allowedApproverSubjectIds.includes(evidence.approverSubjectId)) {
    violations.push({
      code: 'E_APPROVER_NOT_ALLOWED',
      field: 'evidence.approverSubjectId',
      message: 'evidence.approverSubjectId không thuộc policy.allowedApproverSubjectIds.',
    });
  }
  if (policy.revokedApproverSubjectIds.includes(evidence.approverSubjectId)) {
    violations.push({
      code: 'E_APPROVER_REVOKED',
      field: 'evidence.approverSubjectId',
      message: 'evidence.approverSubjectId nằm trong policy.revokedApproverSubjectIds.',
    });
  }

  // Stage 5 — commit + optional bindings (P4: chỉ mismatch khi cả hai bên non-null) + review record.
  if (evidence.commitSha !== observations.expectedCommitSha) {
    violations.push({
      code: 'E_COMMIT_SHA_MISMATCH',
      field: 'evidence.commitSha',
      message: 'evidence.commitSha không khớp observations.expectedCommitSha.',
    });
  }

  if (evidence.workflowSha === null && policy.requireEvidenceWorkflowSha) {
    violations.push({
      code: 'E_WORKFLOW_SHA_MISSING',
      field: 'evidence.workflowSha',
      message: 'evidence.workflowSha là null nhưng policy.requireEvidenceWorkflowSha=true.',
    });
  }
  if (facts.verifiedWorkflowSha === null && policy.requireAttestedWorkflowShaBinding) {
    violations.push({
      code: 'E_WORKFLOW_SHA_NOT_ATTESTED',
      field: 'facts.verifiedWorkflowSha',
      message: 'facts.verifiedWorkflowSha là null nhưng policy.requireAttestedWorkflowShaBinding=true.',
    });
  }
  if (
    evidence.workflowSha !== null &&
    facts.verifiedWorkflowSha !== null &&
    evidence.workflowSha !== facts.verifiedWorkflowSha
  ) {
    violations.push({
      code: 'E_WORKFLOW_SHA_MISMATCH',
      field: 'evidence.workflowSha',
      message: 'evidence.workflowSha không khớp facts.verifiedWorkflowSha (đã xác minh mật mã).',
    });
  }

  const attestedRunId = facts.verifiedRunId;
  const attestedRunAttempt = facts.verifiedRunAttempt;
  if ((attestedRunId === null || attestedRunAttempt === null) && policy.requireAttestedRunBinding) {
    violations.push({
      code: 'E_RUN_BINDING_NOT_ATTESTED',
      field: 'facts.verifiedRunId',
      message: 'facts.verifiedRunId/verifiedRunAttempt thiếu nhưng policy.requireAttestedRunBinding=true.',
    });
  }
  if (attestedRunId !== null && attestedRunId !== evidence.runId) {
    violations.push({
      code: 'E_RUN_ID_MISMATCH',
      field: 'evidence.runId',
      message: 'evidence.runId không khớp facts.verifiedRunId (đã xác minh mật mã).',
    });
  }
  if (attestedRunAttempt !== null && attestedRunAttempt !== evidence.runAttempt) {
    violations.push({
      code: 'E_RUN_ATTEMPT_MISMATCH',
      field: 'evidence.runAttempt',
      message: 'evidence.runAttempt không khớp facts.verifiedRunAttempt (đã xác minh mật mã).',
    });
  }
  const runBindingVerified =
    attestedRunId !== null &&
    attestedRunAttempt !== null &&
    attestedRunId === evidence.runId &&
    attestedRunAttempt === evidence.runAttempt;

  // reviewRecordDigest — CHỈ A<->A internal consistency, KHÔNG phải authenticity (xem header
  // approval-review-record.contract.ts).
  const expectedReviewRecordDigest = computeReviewRecordDigest(buildNormalizedReviewRecord(evidence));
  if (evidence.reviewRecordDigest !== expectedReviewRecordDigest) {
    violations.push({
      code: 'E_REVIEW_RECORD_DIGEST_MISMATCH',
      field: 'evidence.reviewRecordDigest',
      message: 'evidence.reviewRecordDigest không khớp digest tính lại từ normalized review record.',
    });
  }

  // Stage 6 — exact bytes
  if (observations.evidenceSha256 !== facts.subjectDigest) {
    violations.push({
      code: 'E_SUBJECT_DIGEST_MISMATCH',
      field: 'observations.evidenceSha256',
      message: 'observations.evidenceSha256 (exact bytes trên đĩa) không khớp facts.subjectDigest (bundle).',
    });
  }
  if (observations.evidenceSha256 !== computeApprovalEvidenceDigest(evidence)) {
    violations.push({
      code: 'E_EVIDENCE_BYTES_NOT_CANONICAL',
      field: 'observations.evidenceSha256',
      message: 'observations.evidenceSha256 không khớp digest canonical tính lại từ evidence — file trên đĩa không phải canonical bytes.',
    });
  }

  // Stage 7 — time. Biến số theo Final Design Closure §6.
  const tLo = Date.parse(facts.verifiedTimeNotBefore);
  const tHi = Date.parse(facts.verifiedTimeNotAfter);
  const evalMs = Date.parse(evaluationTime);
  const issuedMs = Date.parse(evidence.issuedAt);
  const notBeforeMs = Date.parse(evidence.notBefore);
  const notAfterMs = Date.parse(evidence.notAfter);
  const maxAgeMs = policy.maximumEvidenceAgeMs;
  const skewMs = policy.allowedClockSkewMs;
  const windowCapMs = policy.maximumVerifiedTimeWindowMs;

  if (!policy.acceptedVerifiedTimeSources.includes(facts.verifiedTimeSource)) {
    violations.push({
      code: 'E_VERIFIED_TIME_SOURCE_NOT_ACCEPTED',
      field: 'facts.verifiedTimeSource',
      message: 'facts.verifiedTimeSource không thuộc policy.acceptedVerifiedTimeSources.',
    });
  }

  // P5 — ordering -> source semantics -> độ rộng window; chỉ lỗi ĐẦU TIÊN trong bộ ba nổ.
  if (tLo > tHi) {
    violations.push({
      code: 'E_VERIFIED_TIME_WINDOW_INVALID',
      field: 'facts.verifiedTimeNotBefore',
      message: 'facts.verifiedTimeNotBefore muộn hơn facts.verifiedTimeNotAfter — window không hợp lệ.',
    });
  } else {
    const requiresPointInTime =
      facts.verifiedTimeSource === 'rfc3161-tsa' || facts.verifiedTimeSource === 'rekor-signed-entry-timestamp';
    if (requiresPointInTime && tLo !== tHi) {
      violations.push({
        code: 'E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION',
        field: 'facts.verifiedTimeSource',
        message: 'Nguồn thời gian dạng điểm (TSA/Rekor SET) đòi verifiedTimeNotBefore === verifiedTimeNotAfter.',
      });
    } else if (tHi - tLo > windowCapMs) {
      violations.push({
        code: 'E_VERIFIED_TIME_WINDOW_TOO_WIDE',
        field: 'facts.verifiedTimeNotAfter',
        message: 'Độ rộng verified time window vượt policy.maximumVerifiedTimeWindowMs.',
      });
    }
  }

  if (evalMs < tLo - skewMs) {
    violations.push({
      code: 'E_EVALUATION_TIME_BEFORE_ATTESTATION',
      field: 'evaluationTime',
      message: 'evaluationTime đứng trước verified attestation window quá mức skew cho phép.',
    });
  }

  if (evalMs - tLo > maxAgeMs) {
    violations.push({
      code: 'E_EVIDENCE_EXPIRED',
      field: 'evaluationTime',
      message: 'Tuổi evidence (evaluationTime - verifiedTimeNotBefore) vượt policy.maximumEvidenceAgeMs.',
    });
  }

  if (tLo <= tHi && (issuedMs < tLo - skewMs || issuedMs > tHi + skewMs)) {
    violations.push({
      code: 'E_ISSUED_AT_OUTSIDE_VERIFIED_WINDOW',
      field: 'evidence.issuedAt',
      message: 'evidence.issuedAt nằm ngoài [verifiedTimeNotBefore - skew, verifiedTimeNotAfter + skew].',
    });
  }

  if (evalMs < notBeforeMs - skewMs || evalMs > notAfterMs + skewMs) {
    violations.push({
      code: 'E_OUTSIDE_PRODUCER_VALIDITY_WINDOW',
      field: 'evaluationTime',
      message: 'evaluationTime nằm ngoài [evidence.notBefore - skew, evidence.notAfter + skew].',
    });
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }

  const effectiveExpiresAt = new Date(Math.min(tLo + maxAgeMs, notAfterMs + skewMs)).toISOString();

  const success: ApprovalEvidencePolicySuccess = Object.freeze({
    ok: true,
    manifestId: evidence.manifestId,
    manifestChecksum: evidence.manifestChecksum,
    targetEnvironment: evidence.targetEnvironment,
    evidenceSha256: observations.evidenceSha256,
    attestedRepositoryId: facts.verifiedRepositoryId,
    attestedRepositoryOwnerId: facts.verifiedRepositoryOwnerId,
    attestedWorkflowRef: facts.verifiedWorkflowRef,
    verifiedTimeNotBefore: facts.verifiedTimeNotBefore,
    verifiedTimeNotAfter: facts.verifiedTimeNotAfter,
    verifiedTimeSource: facts.verifiedTimeSource,
    effectiveExpiresAt,
    approverSubjectId: evidence.approverSubjectId,
    evidenceRunId: evidence.runId,
    evidenceRunAttempt: evidence.runAttempt,
    attestedRunId,
    attestedRunAttempt,
    runBindingVerified,
  });

  return success;
}
