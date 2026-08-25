import { createHash } from 'crypto';
import { isCanonicalDecimalString } from '../../common/canonical-decimal-string';
import { canonicalJson } from '../../common/canonical-json';
import { isValidCanonicalTimestamp } from '../../common/canonical-timestamp';

/**
 * APPROVAL EVIDENCE CONTRACT (2026-08-25, Slice 0.5D1) — schema + validator THUẦN cho
 * `approval-evidence.json`, artifact thứ hai trong chuỗi bốn artifact tách rời của Slice 0.5D.
 *
 * Xem thiết kế đầy đủ (§7, §15, cả hai Amendment):
 * docs/delivery/reports/APPROVAL-AUDIT-EVIDENCE-DESIGN-2026-08-25.md
 *
 * File này CHỈ định nghĩa và validate ARTIFACT — không DB, không network, không I/O, không gọi
 * GitHub, không ký, không verify attestation, không cấp quyền. Đây là ranh giới D1 mà report đã
 * chốt (§15 "Ranh giới CUỐI CÙNG của 0.5D1"):
 *
 *   D1 CHỈ: validate structure · reject unknown keys (closed schema) · validate canonical
 *   type/format · serialize deterministic bytes · compute digest của exact bytes đó.
 *
 *   D1 KHÔNG: tự tạo identity (0.5D3) · gọi GitHub/network/DB · tạo bundle · ký · verify
 *   attestation (0.5D4) · cấp quyền/RBAC · chống replay một mình (0.5E) · hứa xác thực những thứ
 *   nó không thể xác thực.
 *
 * Một evidence "hợp lệ theo 0.5D1" nghĩa là ĐÚNG HÌNH DẠNG VÀ ĐỦ TRƯỜNG — KHÔNG nghĩa là đã được
 * xác thực. Đúng ranh giới mà 0.5B/0.5C đã thiết lập cho manifest (không nhầm content integrity
 * với authenticated approval).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * KHÔNG CÓ WRAPPER TYPE — VÀ VÌ SAO (khác `publish-manifest.contract.ts`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `publish-manifest.contract.ts` có HAI type (`...PayloadV1` được băm, và `...V1 = {payload,
 * checksum}` chứa checksum của chính payload đó) vì file đó CẦN mang theo checksum của nội dung
 * nó tự mô tả. `approval-evidence.json` KHÔNG có nhu cầu đó: digest của chính file này (subject
 * digest của attestation) sống ở BÊN NGOÀI file, trong detached attestation bundle (0.5D3/0.5D4),
 * và KHÔNG BAO GIỜ được ghi vào bên trong payload — làm vậy là self-reference không tính được
 * (thêm digest đổi bytes, đổi digest; Amendment 1 mắc đúng lỗi này ở `attestedArtifactDigest` và
 * Amendment 2 đã sửa). Vì vậy `ApprovalEvidencePayloadV1` VỪA là schema VỪA là toàn bộ nội dung
 * `approval-evidence.json` — không có type bọc ngoài nào khác.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TIMESTAMP BOUNDARY — ĐỌC TRƯỚC KHI DÙNG FILE NÀY Ở BẤT KỲ ĐÂU KHÁC
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `reviewObservedAt` KHÔNG PHẢI "thời điểm người dùng bấm Approve". GitHub review-history API
 * (`GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals`) có ĐÚNG 4 thuộc tính top-level:
 * `environments`, `state`, `user`, `comment` — KHÔNG có timestamp nào ở cấp approval.
 * `environment.created_at`/`updated_at` mô tả TÀI NGUYÊN environment, không phải review event.
 * `reviewObservedAt` chỉ có nghĩa: "thời điểm protected workflow QUAN SÁT thấy API trả
 * state=approved". Cận trên của "người bấm lúc nào"; cận dưới KHÔNG xác định được từ API này.
 *
 * `issuedAt`/`notBefore`/`notAfter` là GIÁ TRỊ PRODUCER TỰ KHAI, không tự chứng minh thời gian.
 * D2 (policy evaluator, CHƯA triển khai) PHẢI đối chiếu chúng với "verified attestation time" lấy
 * từ chính attestation bundle (Fulcio cert validity / Rekor SET / RFC 3161 TSA) — KHÔNG được tin
 * độc lập các trường này. Cửa sổ hiệu lực 24 giờ (OD-3) là hard cap của D2, tính từ verified
 * attestation time, KHÔNG phải từ các trường trong payload này.
 *
 * KHÔNG có trường `approvedAt` trong contract này (khác `PublishManifestApproval.approvedAt` của
 * 0.5B, vốn CHỈ là content-integrity metadata do người soạn manifest tự gõ — không đổi ý nghĩa).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NUMERIC ID BOUNDARY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * GitHub ID có thể vượt giới hạn an toàn của JavaScript `number` (2^53) trong tương lai.
 * `repositoryId`, `repositoryOwnerId`, `runId`, `environmentId`, `approverSubjectId` là CHUỖI THẬP
 * PHÂN CANONICAL — KHÔNG parse thành `number` ở bất kỳ đâu trong file này (tránh mất độ chính
 * xác). Đây là CĂN CỨ CẤP QUYỀN — `approverLogin`/`repositoryFullName`/`environmentName` chỉ để
 * hiển thị, KHÔNG được verifier hay D2 dùng để cấp quyền.
 */

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
/** SHA-1 hex 40 ký tự — format git commit SHA hiện tại (repo chưa dùng SHA-256 object format). */
const GIT_SHA_HEX_RE = /^[0-9a-f]{40}$/;
/** `owner/repo` — hình dạng hợp lý cho field DISPLAY-ONLY; numeric ID mới là authority (§ trên). */
const REPOSITORY_FULL_NAME_RE = /^[^/\s]+\/[^/\s]+$/;

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

/**
 * Dải phiên bản evidence mà CODE HIỆN TẠI hiểu được. Chỉ có `1` — cùng quy ước
 * `SUPPORTED_MANIFEST_VERSIONS` ở publish-manifest.contract.ts.
 */
export const SUPPORTED_EVIDENCE_VERSIONS = [1] as const;
export type SupportedEvidenceVersion = (typeof SUPPORTED_EVIDENCE_VERSIONS)[number];

/** V1 chỉ hỗ trợ GitHub. Mở đường cho provider khác (vd offline-key disaster-recovery) ở version sau. */
export const SUPPORTED_APPROVER_PROVIDERS = ['github'] as const;
export type ApproverProvider = (typeof SUPPORTED_APPROVER_PROVIDERS)[number];

/**
 * Payload approval evidence V1 — VỪA là schema VỪA là toàn bộ nội dung `approval-evidence.json`
 * (xem "KHÔNG CÓ WRAPPER TYPE" ở đầu file). PHẲNG có chủ đích: không trường nào ở đây là object
 * lồng — mọi field đều scalar, nên việc kiểm "unknown key" (closed schema, §Phase 5) chỉ cần một
 * lượt duyệt `Object.keys()` cấp cao nhất, không cần đệ quy.
 */
export interface ApprovalEvidencePayloadV1 {
  // ---- Nhóm A: contract/policy --------------------------------------------------------------
  evidenceVersion: 1;
  policyVersion: number;

  // ---- Nhóm A: manifest binding --------------------------------------------------------------
  manifestId: string;
  manifestChecksum: string;
  targetEnvironment: string;

  // ---- Nhóm A + D: repository/workflow (D3 lấy từ GitHub) ------------------------------------
  /** Chuỗi thập phân canonical — ID ổn định, KHÔNG dùng tên repo (mutable). */
  repositoryId: string;
  /** Chuỗi thập phân canonical. */
  repositoryOwnerId: string;
  commitSha: string;
  /** `owner/repo/.github/workflows/x.yml@refs/heads/branch` — chống commit/action bị đổi. */
  workflowRef: string;
  /** Digest/commit của chính workflow file NẾU lấy được. `null` tường minh khi runtime không cấp
   *  — không bịa giá trị để lấp chỗ trống. */
  workflowSha: string | null;
  /** Chuỗi thập phân canonical — run sinh evidence. */
  runId: string;
  /** Phạm vi nhỏ ⇒ integer dương là đủ (không cần chuỗi thập phân). Bắt buộc — phân biệt rerun:
   *  nếu evidence chỉ bind runId, không phân biệt được approval của attempt nào. */
  runAttempt: number;

  // ---- Nhóm A + D: environment/review ---------------------------------------------------------
  /** Chuỗi thập phân canonical — pin theo ID, KHÔNG theo tên (environmentName chỉ display). */
  environmentId: string;
  /** Chỉ chấp nhận literal `'approved'` — giá trị khác nghĩa là evidence KHÔNG được sinh. */
  reviewState: 'approved';
  /** V1 chỉ `'github'`. */
  approverProvider: ApproverProvider;
  /** Chuỗi thập phân canonical — `user.id` từ review-history API. CĂN CỨ CẤP QUYỀN DUY NHẤT. */
  approverSubjectId: string;
  /** Thời điểm workflow QUAN SÁT thấy API trả state=approved — XEM "TIMESTAMP BOUNDARY" ở đầu
   *  file. KHÔNG phải lúc người dùng bấm Approve. */
  reviewObservedAt: string;
  /** Digest của NORMALIZED review record (chỉ gồm environmentId/state/approverSubjectId/comment)
   *  — đây là dữ liệu D2 policy thực sự dùng, KHÔNG phải hash của raw API response. */
  reviewRecordDigest: string;
  /** Digest exact raw bytes của review-history API response — AUDIT-ONLY, CẤM dùng làm identity
   *  authority (raw response có thể đổi formatting/thứ tự khoá/thêm field giữa các phiên bản API). */
  rawReviewResponseDigest: string;

  // ---- Nhóm A: lý do + phát hành ---------------------------------------------------------------
  /** Đúng MỘT trong hai: nội dung comment duyệt trực tiếp, hoặc digest nếu không muốn lộ ra
   *  archive. Không được có cả hai, không được thiếu cả hai (xem validateApprovalEvidence). */
  reason?: string;
  reasonDigest?: string;
  /** Danh tính workflow phát hành evidence. */
  issuer: string;
  /** Producer tự khai — D2 chỉ được dùng sau khi đối chiếu với verified attestation time trong
   *  một clock-skew nhỏ (đề xuất ±5 phút ở report). KHÔNG dùng độc lập. */
  issuedAt: string;
  /** Producer ĐỀ NGHỊ — không tự cấp quyền. D2 áp hard cap 24h của riêng nó bất kể giá trị này. */
  notBefore: string;
  notAfter: string;

  // ---- Nhóm B: display-only (KHÔNG dùng cấp quyền) ---------------------------------------------
  repositoryFullName: string;
  environmentName: string;
  /** CHỈ hiển thị — verifier/D2 CẤM dùng để cấp quyền. `approverSubjectId` mới là authority. */
  approverLogin: string;
}

export interface ApprovalEvidenceValidationSuccess {
  ok: true;
  /** CHÍNH object `input` đã truyền vào, chỉ thu hẹp kiểu — validator KHÔNG mutate, KHÔNG chuẩn
   *  hoá, KHÔNG tự điền giá trị thiếu (cùng quy ước ManifestValidationSuccess). */
  payload: ApprovalEvidencePayloadV1;
}
export interface ApprovalEvidenceValidationFailure {
  ok: false;
  /** Toàn bộ lỗi tìm thấy, không dừng ở lỗi đầu tiên. Không chứa giá trị nhạy cảm — chỉ tên
   *  trường/đường dẫn và mô tả lỗi (cùng quy ước ManifestValidationFailure). */
  errors: string[];
}
export type ApprovalEvidenceValidationResult =
  ApprovalEvidenceValidationSuccess | ApprovalEvidenceValidationFailure;

/**
 * CLOSED SCHEMA (Phase 5) — danh sách ĐẦY ĐỦ và DUY NHẤT các khoá được phép ở cấp top-level.
 * Đây là artifact bảo mật (subject của một chữ ký) nên một khoá lạ lọt vào là rủi ro thật, không
 * phải chi tiết vặt — reject thẳng, không silently ignore.
 *
 * Cơ chế này CŨNG chặn `__proto__`/`constructor`/`prototype` như một hệ quả tự nhiên: `JSON.parse`
 * tạo các khoá đó thành OWN enumerable property (không set prototype ngầm — đây là hành vi đặc thù
 * của `JSON.parse`, khác object literal `{__proto__: 1}`), nên `Object.keys()` liệt kê được chúng,
 * và vì chúng không nằm trong tập dưới đây, validator từ chối như bất kỳ khoá lạ nào khác. Không
 * cần logic đặc biệt cho ba tên này — xem test "Closed schema" cho bằng chứng thực nghiệm.
 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'evidenceVersion',
  'policyVersion',
  'manifestId',
  'manifestChecksum',
  'targetEnvironment',
  'repositoryId',
  'repositoryOwnerId',
  'commitSha',
  'workflowRef',
  'workflowSha',
  'runId',
  'runAttempt',
  'environmentId',
  'reviewState',
  'approverProvider',
  'approverSubjectId',
  'reviewObservedAt',
  'reviewRecordDigest',
  'rawReviewResponseDigest',
  'reason',
  'reasonDigest',
  'issuer',
  'issuedAt',
  'notBefore',
  'notAfter',
  'repositoryFullName',
  'environmentName',
  'approverLogin',
]);

/**
 * Kiểm tra một `ApprovalEvidencePayloadV1` từ `unknown` (input chưa tin cậy — file trên đĩa, artifact
 * do 0.5D3 sinh…). THUẦN: không DB, không network, không filesystem, không đọc biến môi trường,
 * KHÔNG gọi `Date.now()` hay đọc đồng hồ hệ thống ở bất kỳ đâu — chỉ kiểm cấu trúc/định dạng/tính
 * nhất quán NỘI TẠI của chính payload. KHÔNG mutate input, KHÔNG chuẩn hoá/trim rồi ghi lại, KHÔNG
 * tự điền trường thiếu — trả TẤT CẢ lỗi tìm được, không dừng ở lỗi đầu tiên.
 *
 * Đây là kiểm tra CẤU TRÚC. Đây KHÔNG PHẢI xác thực danh tính, KHÔNG kiểm allow-list approver,
 * KHÔNG enforce cửa sổ 24 giờ, KHÔNG chống replay — những việc đó thuộc D2 (policy evaluator,
 * CHƯA triển khai) và D4 (offline verifier, CHƯA triển khai). Xem "TIMESTAMP BOUNDARY" ở đầu file.
 */
export function validateApprovalEvidence(input: unknown): ApprovalEvidenceValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['approval evidence phải là một object.'] };
  }

  // Closed schema — kiểm TRƯỚC khi đọc field nào, để một khoá lạ luôn bị báo dù các field khác
  // có hợp lệ hay không.
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`khoá không được nhận dạng: "${key}".`);
    }
  }

  if (!(SUPPORTED_EVIDENCE_VERSIONS as readonly unknown[]).includes(input.evidenceVersion)) {
    errors.push(
      `evidenceVersion không được hỗ trợ — chỉ chấp nhận: ${SUPPORTED_EVIDENCE_VERSIONS.join(', ')}.`,
    );
  }

  if (!(
    typeof input.policyVersion === 'number' &&
    Number.isInteger(input.policyVersion) &&
    input.policyVersion > 0
  )) {
    errors.push('policyVersion phải là số nguyên dương.');
  }

  if (!isNonEmptyString(input.manifestId)) {
    errors.push('manifestId phải là chuỗi không rỗng.');
  }

  if (!isSha256Hex(input.manifestChecksum)) {
    errors.push('manifestChecksum sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).');
  }

  if (!isNonEmptyString(input.targetEnvironment)) {
    errors.push('targetEnvironment phải là chuỗi không rỗng.');
  }

  if (!isCanonicalDecimalString(input.repositoryId)) {
    errors.push(
      'repositoryId phải là chuỗi thập phân canonical (chỉ chữ số ASCII, dương, không leading zero).',
    );
  }
  if (!isCanonicalDecimalString(input.repositoryOwnerId)) {
    errors.push(
      'repositoryOwnerId phải là chuỗi thập phân canonical (chỉ chữ số ASCII, dương, không leading zero).',
    );
  }

  if (!isGitShaHex(input.commitSha)) {
    errors.push('commitSha sai định dạng — cần đúng 40 ký tự hex viết thường (SHA-1 git).');
  }

  if (!isNonEmptyString(input.workflowRef)) {
    errors.push('workflowRef phải là chuỗi không rỗng.');
  }

  if (input.workflowSha !== null && !isGitShaHex(input.workflowSha)) {
    errors.push('workflowSha phải là null hoặc đúng 40 ký tự hex viết thường (SHA-1 git).');
  }

  if (!isCanonicalDecimalString(input.runId)) {
    errors.push(
      'runId phải là chuỗi thập phân canonical (chỉ chữ số ASCII, dương, không leading zero).',
    );
  }

  if (!(
    typeof input.runAttempt === 'number' &&
    Number.isInteger(input.runAttempt) &&
    input.runAttempt > 0
  )) {
    errors.push('runAttempt phải là số nguyên dương.');
  }

  if (!isCanonicalDecimalString(input.environmentId)) {
    errors.push(
      'environmentId phải là chuỗi thập phân canonical (chỉ chữ số ASCII, dương, không leading zero).',
    );
  }

  if (input.reviewState !== 'approved') {
    errors.push(
      'reviewState phải đúng chuỗi "approved" — giá trị khác nghĩa evidence không hợp lệ để sinh.',
    );
  }

  if (
    typeof input.approverProvider !== 'string' ||
    !(SUPPORTED_APPROVER_PROVIDERS as readonly string[]).includes(input.approverProvider)
  ) {
    errors.push(
      `approverProvider không được hỗ trợ — V1 chỉ chấp nhận: ${SUPPORTED_APPROVER_PROVIDERS.join(', ')}.`,
    );
  }

  if (!isCanonicalDecimalString(input.approverSubjectId)) {
    errors.push(
      'approverSubjectId phải là chuỗi thập phân canonical (chỉ chữ số ASCII, dương, không leading zero).',
    );
  }

  if (!isValidCanonicalTimestamp(input.reviewObservedAt)) {
    errors.push(
      'reviewObservedAt phải là timestamp UTC canonical hợp lệ theo lịch thật (YYYY-MM-DDTHH:mm:ss.sssZ).',
    );
  }

  if (!isSha256Hex(input.reviewRecordDigest)) {
    errors.push('reviewRecordDigest sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).');
  }

  if (!isSha256Hex(input.rawReviewResponseDigest)) {
    errors.push(
      'rawReviewResponseDigest sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).',
    );
  }

  // reason XOR reasonDigest — đúng một trong hai, dùng hasOwnProperty (không dùng `in`, tránh
  // prototype chain) để phân biệt "không có khoá" với "có khoá nhưng giá trị rỗng/sai kiểu".
  const hasReason = Object.prototype.hasOwnProperty.call(input, 'reason');
  const hasReasonDigest = Object.prototype.hasOwnProperty.call(input, 'reasonDigest');
  if (hasReason && hasReasonDigest) {
    errors.push('chỉ được có MỘT trong hai: "reason" hoặc "reasonDigest", không được có cả hai.');
  } else if (hasReason) {
    if (!isNonEmptyString(input.reason)) {
      errors.push('reason phải là chuỗi không rỗng.');
    }
  } else if (hasReasonDigest) {
    if (!isSha256Hex(input.reasonDigest)) {
      errors.push('reasonDigest sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).');
    }
  } else {
    errors.push('phải có đúng một trong hai: "reason" hoặc "reasonDigest".');
  }

  if (!isNonEmptyString(input.issuer)) {
    errors.push('issuer phải là chuỗi không rỗng.');
  }

  if (!isValidCanonicalTimestamp(input.issuedAt)) {
    errors.push(
      'issuedAt phải là timestamp UTC canonical hợp lệ theo lịch thật (YYYY-MM-DDTHH:mm:ss.sssZ).',
    );
  }

  const notBeforeValid = isValidCanonicalTimestamp(input.notBefore);
  if (!notBeforeValid) {
    errors.push(
      'notBefore phải là timestamp UTC canonical hợp lệ theo lịch thật (YYYY-MM-DDTHH:mm:ss.sssZ).',
    );
  }
  const notAfterValid = isValidCanonicalTimestamp(input.notAfter);
  if (!notAfterValid) {
    errors.push(
      'notAfter phải là timestamp UTC canonical hợp lệ theo lịch thật (YYYY-MM-DDTHH:mm:ss.sssZ).',
    );
  }
  // Tính nhất quán NỘI TẠI (không phải wall-clock — không gọi Date.now()): một cửa sổ mà điểm bắt
  // đầu đứng SAU điểm kết thúc là malformed tự thân, bất kể "bây giờ" là lúc nào. Việc enforce cửa
  // sổ 24h so với THỜI GIAN THẬT là việc của D2 (dùng verified attestation time), KHÔNG phải ở đây.
  if (
    notBeforeValid &&
    notAfterValid &&
    new Date(input.notBefore as string) > new Date(input.notAfter as string)
  ) {
    errors.push('notBefore phải không muộn hơn notAfter (cửa sổ hiệu lực nội tại không hợp lệ).');
  }

  if (
    !isNonEmptyString(input.repositoryFullName) ||
    !REPOSITORY_FULL_NAME_RE.test(input.repositoryFullName)
  ) {
    errors.push(
      'repositoryFullName phải đúng hình dạng "owner/repo" (chỉ mang tính hiển thị/chẩn đoán).',
    );
  }

  if (!isNonEmptyString(input.environmentName)) {
    errors.push('environmentName phải là chuỗi không rỗng.');
  }

  if (!isNonEmptyString(input.approverLogin)) {
    errors.push('approverLogin phải là chuỗi không rỗng.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, payload: input as unknown as ApprovalEvidencePayloadV1 };
}

/**
 * Serialize deterministic — TÁI DÙNG `canonicalJson()` (không viết hàm chuẩn hoá JSON thứ hai,
 * cùng nguyên tắc `computeManifestChecksum()`). Quy tắc exact-byte (report §6):
 *   • UTF-8, không BOM — `JSON.stringify`/`canonicalJson()` không bao giờ phát BOM.
 *   • Không newline cuối file — `canonicalJson()` trả đúng output `JSON.stringify`, không có `\n`
 *     nối thêm; caller ghi file PHẢI ghi đúng chuỗi này, không để editor/tooling thêm newline.
 *   • Không pretty-print — khoá đã sắp xếp bởi `canonicalJson()`, không khoảng trắng thừa.
 *
 * D3 (CHƯA triển khai) phải ghi CHÍNH XÁC bytes mà hàm này trả ra file `approval-evidence.json`.
 * Bytes ghi ra đĩa == bytes được hash == bytes được attest == bytes D4 verifier đọc lại. D4 PHẢI
 * hash lại exact bytes trên đĩa, KHÔNG parse rồi re-serialize rồi hash (làm vậy che mất chính lớp
 * sai lệch mà exact-byte digest tồn tại để phát hiện).
 */
export function serializeApprovalEvidence(payload: ApprovalEvidencePayloadV1): string {
  return canonicalJson(payload);
}

/**
 * Băm SHA-256 trên bytes UTF-8 do `serializeApprovalEvidence()` trả ra — KHÔNG hash object bằng
 * một lời gọi `JSON.stringify` riêng ở đâu khác (sẽ lệch bytes với bytes thật sự bị ghi ra đĩa).
 *
 * ENCODING TƯỜNG MINH (2026-08-25, pre-push content gate): `Buffer.from(str, 'utf8')` được gọi
 * RIÊNG, tách khỏi `.update()` — KHÔNG dựa vào default encoding ngầm của `Hash.update(string)`
 * (Node mặc định 'utf8' khi không truyền `inputEncoding`, nhưng đó là hành vi PHẢI TRA DOCS mới
 * biết, không đọc được từ chính call site). Việc tạo `Buffer` tường minh có nghĩa: bytes được hash
 * chính là bytes một `Buffer.from(..., 'utf8')` độc lập cũng sẽ tạo ra — không phụ thuộc quy ước
 * ngầm của riêng hàm `.update()`.
 *
 * Digest này KHÔNG BAO GIỜ được ghi vào chính payload (xem "KHÔNG CÓ WRAPPER TYPE" ở đầu file) —
 * nó là subject digest sống trong detached attestation bundle (0.5D3), và là
 * `approvalEvidenceDigest` trong publication receipt (0.5E). Gọi hàm này chỉ để LẤY digest phục
 * vụ nơi khác dùng — không phải để "hoàn thiện" payload bằng cách nhét digest ngược vào nó.
 */
export function computeApprovalEvidenceDigest(payload: ApprovalEvidencePayloadV1): string {
  const bytes = Buffer.from(serializeApprovalEvidence(payload), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}
