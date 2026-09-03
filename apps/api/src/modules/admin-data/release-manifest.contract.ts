import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import { isValidCanonicalTimestamp } from '../../common/canonical-timestamp';

/**
 * RELEASE MANIFEST CONTRACT (2026-09-02, data-SSOT remediation Phase 3) — artifact bất biến, có
 * checksum, mà MỘT PLACE RELEASE dùng chung cho các sub-batch của nó (facts batch, translation
 * batch...). Cùng khuôn với `publish-manifest.contract.ts` (Slice 0.5B, 2026-08-24): payload/
 * checksum tách rời (xem "RANH GIỚI SELF-HASH" ở file đó — nguyên tắc giống hệt, không lặp lại toàn
 * bộ giải thích ở đây), pure function, không DB, không I/O, không CLI.
 *
 * KHÁC `publish-manifest.contract.ts` ở một điểm cố ý: file đó gói MỘT LOẠI dữ kiện
 * (`VerifiedFactTarget[]`, dành cho `VerifiedFactsIngestionService`). File này gói NHIỀU sub-batch
 * THUỘC CÙNG MỘT RELEASE của một place — hôm nay chỉ `MultilingualPlaceImportService` tiêu thụ nó
 * (kind='translation'), nhưng hình dạng `subBatches[]` chừa chỗ cho một facts-import sub-batch chạy
 * cùng release mà không cần định nghĩa lại toàn bộ manifest.
 *
 * CÙNG CẢNH BÁO CHECKSUM như publish-manifest.contract.ts: checksum chứng minh NỘI DUNG không đổi
 * kể từ khi tính — KHÔNG chứng minh `approval.approvedBy` là người thật, KHÔNG tra RBAC, KHÔNG phải
 * xác thực danh tính.
 */

export const SUPPORTED_RELEASE_MANIFEST_VERSIONS = [1] as const;
export type SupportedReleaseManifestVersion = (typeof SUPPORTED_RELEASE_MANIFEST_VERSIONS)[number];

export type ReleaseSubBatchKind = 'facts' | 'translation';
export const RELEASE_SUB_BATCH_KINDS: readonly ReleaseSubBatchKind[] = ['facts', 'translation'];

export type IdentityResolutionStatus = 'MATCHED' | 'HOLD_IDENTITY_CONFLICT' | 'CREATE_THROUGH_APPROVED_IMPORT';
export const IDENTITY_RESOLUTION_STATUSES: readonly IdentityResolutionStatus[] = [
  'MATCHED',
  'HOLD_IDENTITY_CONFLICT',
  'CREATE_THROUGH_APPROVED_IMPORT',
];

export type GateStatus = 'PASS' | 'FAIL' | 'NOT_EVALUATED';
export const GATE_STATUSES: readonly GateStatus[] = ['PASS', 'FAIL', 'NOT_EVALUATED'];

export type PreflightStatus = 'PASS' | 'FAIL' | 'NOT_RUN';
export const PREFLIGHT_STATUSES: readonly PreflightStatus[] = ['PASS', 'FAIL', 'NOT_RUN'];

export interface ReleaseManifestApproval {
  /** Định danh người phê duyệt. KHÔNG được dùng để cấp quyền — chỉ là văn bản mô tả provenance. */
  approvedBy: string;
  /** ISO-8601 canonical. */
  approvedAt: string;
  /** Vì sao release này được duyệt — bắt buộc có nội dung. */
  reason: string;
}

/** Một sub-batch (facts hoặc translation) thuộc release này. */
export interface ReleaseSubBatchRef {
  kind: ReleaseSubBatchKind;
  /** Khoá idempotency của RIÊNG sub-batch này — khác `manifestId`/`releaseItemId` cấp release. */
  idempotencyKey: string;
  /** sha256 hex của payload sub-batch (vd `sourceChecksum` phía multilingual-import.contract.ts). */
  payloadDigest: string;
}

/** Phần NỘI DUNG được checksum — không chứa field `checksum` của chính nó. */
export interface ReleaseManifestPayloadV1 {
  releaseManifestVersion: 1;
  /** "queue_item_id hoặc release_item_id" — định danh MỘT release cho MỘT place. */
  releaseItemId: string;
  /** vd "place:vinwonders-phu-quoc" — xem identity-resolution-manifest, KHÔNG phải staging/production UUID. */
  canonicalKey: string;
  slug: string;
  targetEnvironment: string;
  identityResolutionStatus: IdentityResolutionStatus;
  policyStatus: GateStatus;
  preflightStatus: PreflightStatus;
  /** sha256 hex trên tập evidence (05_Evidence_Archive rows) mà release này dựa vào. */
  evidenceDigest: string;
  approval: ReleaseManifestApproval;
  subBatches: readonly ReleaseSubBatchRef[];
}

export interface ReleaseManifestV1 {
  payload: ReleaseManifestPayloadV1;
  /** SHA-256 hex (64 ký tự thường) của `canonicalJson(payload)`. */
  checksum: string;
}

export function computeReleaseManifestChecksum(payload: ReleaseManifestPayloadV1): string {
  const bytes = Buffer.from(canonicalJson(payload), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export interface ManifestValidationSuccess {
  ok: true;
  manifest: ReleaseManifestV1;
}
export interface ManifestValidationFailure {
  ok: false;
  errors: string[];
}
export type ReleaseManifestValidationResult = ManifestValidationSuccess | ManifestValidationFailure;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const PLACEHOLDER_APPROVERS = new Set(['true', 'owner', 'admin', 'system']);
// Deliberately NOT a bare `key` substring match (unlike publish-manifest.contract.ts's identical-
// looking constant) — this schema's own legitimate vocabulary includes `idempotencyKey` and
// `canonicalKey`, both of which are structural identifiers, not credential holders, and a bare
// `key` match would flag every manifest this contract can ever produce. `secret`/`password`/
// `credential`/`token` remain broad on purpose (strong standalone signals); the compound terms
// cover the realistic ways an actual credential ends up named "...Key" (apiKey, accessKey, ...)
// without matching this file's own field names.
const SECRET_LIKE_KEY_RE = /secret|password|credential|token|apikey|accesskey|privatekey|clientkey|encryptionkey/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function findSecretLikeKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findSecretLikeKeys(v, `${path}[${i}]`));
  }
  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([k, v]) => {
      const here = path ? `${path}.${k}` : k;
      const hits = SECRET_LIKE_KEY_RE.test(k) ? [here] : [];
      return [...hits, ...findSecretLikeKeys(v, here)];
    });
  }
  return [];
}

/**
 * Kiểm tra một `ReleaseManifestV1` từ `unknown`. THUẦN — không DB, không network, không filesystem,
 * không đọc biến môi trường. Trả TẤT CẢ lỗi tìm được, không dừng ở lỗi đầu tiên.
 */
export function validateReleaseManifest(input: unknown): ReleaseManifestValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['manifest phải là một object.'] };
  }

  const checksum = input.checksum;
  if (!isNonEmptyString(checksum)) {
    errors.push('checksum phải là chuỗi.');
  } else if (!SHA256_HEX_RE.test(checksum)) {
    errors.push('checksum sai định dạng — cần đúng 64 ký tự hex viết thường (SHA-256).');
  }

  const payload = input.payload;
  if (!isPlainObject(payload)) {
    errors.push('payload phải là một object.');
    return { ok: false, errors };
  }

  if (!(SUPPORTED_RELEASE_MANIFEST_VERSIONS as readonly unknown[]).includes(payload.releaseManifestVersion)) {
    errors.push(
      `payload.releaseManifestVersion không được hỗ trợ — chỉ chấp nhận: ${SUPPORTED_RELEASE_MANIFEST_VERSIONS.join(', ')}.`,
    );
  }
  if (!isNonEmptyString(payload.releaseItemId)) {
    errors.push('payload.releaseItemId phải là chuỗi không rỗng.');
  }
  if (!isNonEmptyString(payload.canonicalKey)) {
    errors.push('payload.canonicalKey phải là chuỗi không rỗng.');
  }
  if (!isNonEmptyString(payload.slug)) {
    errors.push('payload.slug phải là chuỗi không rỗng.');
  }
  if (!isNonEmptyString(payload.targetEnvironment)) {
    errors.push('payload.targetEnvironment phải là chuỗi không rỗng.');
  }
  if (!IDENTITY_RESOLUTION_STATUSES.includes(payload.identityResolutionStatus as IdentityResolutionStatus)) {
    errors.push(`payload.identityResolutionStatus phải là một trong: ${IDENTITY_RESOLUTION_STATUSES.join(', ')}.`);
  }
  if (!GATE_STATUSES.includes(payload.policyStatus as GateStatus)) {
    errors.push(`payload.policyStatus phải là một trong: ${GATE_STATUSES.join(', ')}.`);
  }
  if (!PREFLIGHT_STATUSES.includes(payload.preflightStatus as PreflightStatus)) {
    errors.push(`payload.preflightStatus phải là một trong: ${PREFLIGHT_STATUSES.join(', ')}.`);
  }
  if (!isNonEmptyString(payload.evidenceDigest) || !SHA256_HEX_RE.test(payload.evidenceDigest as string)) {
    errors.push('payload.evidenceDigest phải là 64 ký tự hex sha256.');
  }

  if (!isPlainObject(payload.approval)) {
    errors.push('payload.approval phải là một object.');
  } else {
    const approval = payload.approval;
    if (!isNonEmptyString(approval.approvedBy)) {
      errors.push('payload.approval.approvedBy phải là chuỗi không rỗng.');
    } else if (PLACEHOLDER_APPROVERS.has(approval.approvedBy.trim().toLowerCase())) {
      errors.push(
        'payload.approval.approvedBy là một placeholder chung chung (vd "true"/"owner"/"admin"/"system"), ' +
          'không phải định danh một người thật.',
      );
    }
    if (!isNonEmptyString(approval.reason)) {
      errors.push('payload.approval.reason phải là chuỗi không rỗng.');
    }
    if (!isValidCanonicalTimestamp(approval.approvedAt)) {
      errors.push('payload.approval.approvedAt phải là timestamp UTC canonical hợp lệ theo lịch thật.');
    }
  }

  if (!Array.isArray(payload.subBatches) || payload.subBatches.length === 0) {
    errors.push('payload.subBatches phải là một mảng không rỗng.');
  } else {
    const seenKinds = new Set<string>();
    payload.subBatches.forEach((raw, i) => {
      if (!isPlainObject(raw)) {
        errors.push(`payload.subBatches[${i}] phải là một object.`);
        return;
      }
      if (!RELEASE_SUB_BATCH_KINDS.includes(raw.kind as ReleaseSubBatchKind)) {
        errors.push(`payload.subBatches[${i}].kind phải là một trong: ${RELEASE_SUB_BATCH_KINDS.join(', ')}.`);
      } else {
        if (seenKinds.has(raw.kind as string)) {
          errors.push(`payload.subBatches[${i}].kind "${raw.kind}" bị trùng — mỗi kind chỉ một sub-batch trong một release.`);
        }
        seenKinds.add(raw.kind as string);
      }
      if (!isNonEmptyString(raw.idempotencyKey)) {
        errors.push(`payload.subBatches[${i}].idempotencyKey phải là chuỗi không rỗng.`);
      }
      if (!isNonEmptyString(raw.payloadDigest) || !SHA256_HEX_RE.test(raw.payloadDigest as string)) {
        errors.push(`payload.subBatches[${i}].payloadDigest phải là 64 ký tự hex sha256.`);
      }
    });
  }

  const secretKeys = findSecretLikeKeys(payload);
  if (secretKeys.length > 0) {
    errors.push(`payload chứa khoá nghi là secret/credential, không được phép trong manifest: ${secretKeys.join(', ')}.`);
  }

  if (isNonEmptyString(checksum) && SHA256_HEX_RE.test(checksum)) {
    const recomputed = computeReleaseManifestChecksum(payload as unknown as ReleaseManifestPayloadV1);
    if (recomputed !== checksum) {
      errors.push('checksum không khớp với nội dung payload — payload có thể đã bị sửa sau khi checksum được tính.');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, manifest: input as unknown as ReleaseManifestV1 };
}

export interface NonDryRunAllowed {
  allowed: true;
}
export interface NonDryRunBlocked {
  allowed: false;
  reasons: string[];
}
export type NonDryRunGateResult = NonDryRunAllowed | NonDryRunBlocked;

/**
 * Cổng chặn non-dry-run — GỌI SAU `validateReleaseManifest()` đã `ok:true`. Thực thi đúng danh sách
 * điều kiện task yêu cầu: approval PASS về mặt nội dung (không phải placeholder — xem cảnh báo
 * checksum ở đầu file, đây KHÔNG phải xác thực danh tính), policy=PASS, preflight=PASS, identity
 * resolution=MATCHED, và mọi sub-batch phải có idempotencyKey. KHÔNG kiểm tra source/evidence tồn
 * tại thật trong DB — đó là việc của caller (cần DB access, file này cố tình thuần không DB).
 */
export function assertNonDryRunAllowed(manifest: ReleaseManifestV1, subBatchKind: ReleaseSubBatchKind): NonDryRunGateResult {
  const reasons: string[] = [];
  const { payload } = manifest;

  if (payload.identityResolutionStatus !== 'MATCHED') {
    reasons.push(`identityResolutionStatus="${payload.identityResolutionStatus}" — must be MATCHED for a non-dry-run write.`);
  }
  if (payload.policyStatus !== 'PASS') {
    reasons.push(`policyStatus="${payload.policyStatus}" — must be PASS.`);
  }
  if (payload.preflightStatus !== 'PASS') {
    reasons.push(`preflightStatus="${payload.preflightStatus}" — must be PASS.`);
  }
  if (!isNonEmptyString(payload.approval.approvedBy) || PLACEHOLDER_APPROVERS.has(payload.approval.approvedBy.trim().toLowerCase())) {
    reasons.push('approval.approvedBy is missing or a placeholder — not real approval evidence.');
  }

  const subBatch = payload.subBatches.find((sb) => sb.kind === subBatchKind);
  if (!subBatch) {
    reasons.push(`No sub-batch of kind="${subBatchKind}" present in this release manifest.`);
  } else if (!isNonEmptyString(subBatch.idempotencyKey)) {
    reasons.push(`Sub-batch kind="${subBatchKind}" is missing its idempotencyKey.`);
  }

  return reasons.length === 0 ? { allowed: true } : { allowed: false, reasons };
}
