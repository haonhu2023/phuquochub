import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import type { VerifiedFactTarget } from './verified-facts.manifest';

/**
 * PUBLISH MANIFEST CONTRACT (2026-08-24, Slice 0.5B) — artifact BẤT BIẾN, có checksum, mà một job
 * ghi production tương lai (Slice 0.5E, CHƯA tồn tại) sẽ đọc thay vì nhận tham số rời rạc.
 *
 * Xem thiết kế đầy đủ: docs/delivery/reports/PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md
 * (Phương án D — Hybrid). File NÀY chỉ định nghĩa và validate ARTIFACT — không DB, không I/O,
 * không CLI, không compose, không đọc biến môi trường. `assertNotProduction()` (ba script CLI
 * hiện có) KHÔNG bị đụng tới ở đây, và cũng không có gì ở đây làm yếu nó — file này chỉ mô tả một
 * cấu trúc dữ liệu, không tự chạy, không tự ghi.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * RANH GIỚI SELF-HASH — VÌ SAO CÓ HAI TYPE, KHÔNG PHẢI MỘT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `PublishManifestPayloadV1` là phần ĐƯỢC BĂM. `PublishManifestV1` = payload + checksum của CHÍNH
 * payload đó. Checksum KHÔNG BAO GIỜ băm một object đã chứa sẵn field `checksum` của chính nó —
 * làm vậy sẽ tự tham chiếu (checksum phụ thuộc vào checksum), và không có cách nào phát hiện một
 * checksum bị ghi đè sau khi tính. `computeManifestChecksum()` CHỈ nhận `PublishManifestPayloadV1`
 * làm tham số — không có overload nào nhận `PublishManifestV1` (kiểu học đã chặn nhầm lẫn này ở
 * biên dịch, không chỉ ở quy ước).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CHECKSUM BẢO VỆ GÌ, VÀ **KHÔNG** BẢO VỆ GÌ — ĐỌC TRƯỚC KHI DÙNG FILE NÀY Ở BẤT KỲ ĐÂU KHÁC
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Checksum (SHA-256 trên `canonicalJson(payload)`) chứng minh ĐÚNG MỘT điều: nội dung `payload`
 * ĐANG ĐƯỢC ĐỌC hôm nay giống hệt nội dung đã có tại thời điểm checksum được tính — bao gồm cả
 * `approval.approvedBy`/`approvedAt`/`reason`, vì ba trường đó nằm TRONG payload được băm. Đây là
 * TOÀN VẸN NỘI DUNG (content integrity), KHÔNG PHẢI XÁC THỰC DANH TÍNH (authentication).
 *
 * Checksum KHÔNG chứng minh:
 *   • `approval.approvedBy` thật sự LÀ người được ghi tên — bất kỳ ai có thể gõ bất kỳ chuỗi nào
 *     vào trường đó rồi tự tính checksum khớp. Không có chữ ký số, không có xác thực danh tính ở
 *     lớp này.
 *   • Người gọi `validateManifest()` có QUYỀN publish — validator này không tra RBAC, không tra
 *     `users`, không gọi DB. `approvedBy` TUYỆT ĐỐI KHÔNG được dùng làm căn cứ CẤP QUYỀN ở bất kỳ
 *     nơi nào tiêu thụ kết quả của file này.
 *   • Manifest đã từng thực sự được một con người REVIEW — chỉ chứng minh nội dung không đổi kể
 *     từ khi checksum được tính, không nói gì về việc ai đã nhìn thấy nó trước đó.
 *
 * Bằng chứng phê duyệt CÓ THẬT (ai/khi nào/vì sao, xác thực được, đối chiếu được với một hệ thống
 * danh tính) là phạm vi của một sub-slice SAU (0.5D, "Approval & audit evidence" — xem roadmap
 * trong design report §12), CHƯA triển khai. Đừng gọi checksum là "authenticated approval" ở bất
 * kỳ nơi nào — kể cả trong comment, log, hay thông báo lỗi.
 */

/** Dải phiên bản manifest mà CODE HIỆN TẠI hiểu được. Chỉ có `1` — thêm phần tử khi có V2 thật. */
export const SUPPORTED_MANIFEST_VERSIONS = [1] as const;
export type SupportedManifestVersion = (typeof SUPPORTED_MANIFEST_VERSIONS)[number];

/**
 * Bằng chứng phê duyệt Ở MỨC NỘI DUNG (xem cảnh báo authenticity phía trên — đây KHÔNG phải xác
 * thực danh tính). Cả ba trường đều nằm TRONG phần được checksum.
 */
export interface PublishManifestApproval {
  /** Định danh người phê duyệt. KHÔNG được dùng để cấp quyền — chỉ là văn bản mô tả provenance. */
  approvedBy: string;
  /** ISO-8601. */
  approvedAt: string;
  /** Vì sao lô này được duyệt — bắt buộc có nội dung, không chấp nhận placeholder rỗng. */
  reason: string;
}

/**
 * Phần NỘI DUNG được checksum — xem "RANH GIỚI SELF-HASH" phía trên. KHÔNG chứa field `checksum`.
 */
export interface PublishManifestPayloadV1 {
  manifestVersion: 1;
  /** Idempotency key cấp LÔ (phân biệt với khoá idempotent cấp-dữ-kiện mà
   *  `VerifiedFactsIngestionService` đã có sẵn — xem comment ở đó). */
  manifestId: string;
  /**
   * Môi trường mà manifest này CHỦ ĐỊNH publish tới (vd `"production"`). Nằm TRONG phần được
   * checksum để một runner sau này (0.5E) có thể đối chiếu giá trị khai báo ở đây với môi trường
   * NÓ THỰC SỰ đang chạy trước khi ghi bất cứ gì — không tin vào tham số dòng lệnh một mình.
   */
  targetEnvironment: string;
  /** Số migration tối thiểu mà schema đích phải có trước khi ghi lô này (tránh ghi vào cột chưa tồn tại). */
  minSchemaVersion: number;
  approval: PublishManifestApproval;
  /** TÁI DÙNG `VerifiedFactTarget` — KHÔNG định nghĩa lại một type dữ kiện thứ hai mâu thuẫn với
   *  `VerifiedFactsIngestionService`. */
  targets: readonly VerifiedFactTarget[];
}

/** Artifact hoàn chỉnh: payload + checksum của CHÍNH payload đó. */
export interface PublishManifestV1 {
  payload: PublishManifestPayloadV1;
  /** SHA-256 hex (64 ký tự thường) của `canonicalJson(payload)`. */
  checksum: string;
}

/**
 * Băm SHA-256 trên `canonicalJson(payload)`. TÁI DÙNG `canonicalJson()` (nay ở
 * `common/canonical-json.ts`) — KHÔNG viết hàm chuẩn hoá JSON thứ hai. `canonicalJson` tồn tại
 * chính vì `JSON.stringify` nhạy thứ tự khoá; một checksum không có tính chất đó sẽ đổi giá trị
 * mỗi khi ai đó viết lại manifest với khoá theo thứ tự khác — dù nội dung giống hệt.
 *
 * Nhận ĐÚNG `PublishManifestPayloadV1` — KHÔNG nhận `PublishManifestV1` (không thể băm một object
 * đã chứa checksum của chính nó, xem "RANH GIỚI SELF-HASH" ở đầu file).
 */
export function computeManifestChecksum(payload: PublishManifestPayloadV1): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export interface ManifestValidationSuccess {
  ok: true;
  /** CHÍNH object `input` đã truyền vào, chỉ thu hẹp kiểu — validator KHÔNG mutate, KHÔNG chuẩn
   *  hoá, KHÔNG tự điền giá trị thiếu. */
  manifest: PublishManifestV1;
}
export interface ManifestValidationFailure {
  ok: false;
  /** Toàn bộ lỗi tìm thấy, không dừng ở lỗi đầu tiên. Không chứa giá trị nhạy cảm — chỉ tên
   *  trường/đường dẫn và mô tả lỗi. */
  errors: string[];
}
export type ManifestValidationResult = ManifestValidationSuccess | ManifestValidationFailure;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// Đồng bộ THỦ CÔNG với RetrievalMethod (verified-facts.manifest.ts) — type đó chỉ tồn tại lúc
// biên dịch; validateManifest() nhận unknown nên cần một danh sách kiểm ở runtime.
const VALID_RETRIEVAL_METHODS: readonly string[] = ['direct_fetch', 'search_index'];
/**
 * TIMESTAMP CANONICAL của repo — CHÍNH XÁC hình dạng `Date.prototype.toISOString()`:
 * `YYYY-MM-DDTHH:mm:ss.sssZ` (đúng 3 chữ số mili-giây, chữ `Z` hoa, luôn UTC, KHÔNG offset dạng
 * `+HH:MM`). Không phải một lựa chọn tuỳ ý — đây là format DUY NHẤT mà mọi timestamp trong repo
 * đã dùng, không có ngoại lệ (`retrievedAt` của cả 3 target trong `verified-facts.manifest.ts` +
 * `administrative-backfill.manifest.ts` đều `'20XX-XX-XXT00:00:00.000Z'`). Chốt đúng format đó
 * làm canonical thay vì chấp nhận rộng hơn (thiếu mili-giây, có offset) để không phải đoán format
 * nào là "đúng" khi có nhiều biến thể hợp lệ cùng tồn tại.
 */
const CANONICAL_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Kiểm tra một chuỗi vừa ĐÚNG HÌNH DẠNG canonical VỪA là một MỐC THỜI GIAN CÓ THẬT trên lịch.
 *
 * LỖI ĐÃ SỬA (2026-08-24): chỉ dùng `Number.isNaN(Date.parse(value))` KHÔNG đủ — ECMA-262 Date
 * Time String Format tự "chuẩn hoá tràn" (rollover) các thành phần vượt giới hạn thay vì từ chối.
 * Xác nhận thật trên Node runtime của máy này (`process.version`, xem báo cáo commit này):
 *   "2026-02-30T00:00:00.000Z" → Date hợp lệ, tự đổi thành 2026-03-02 (KHÔNG NaN, KHÔNG lỗi)
 *   "2025-02-29T00:00:00.000Z" → tự đổi thành 2025-03-01 (2025 không nhuận, KHÔNG NaN)
 *   "2026-04-31T00:00:00.000Z" → tự đổi thành 2026-05-01 (tháng 4 chỉ có 30 ngày, KHÔNG NaN)
 *   "2024-02-29T00:00:00.000Z" → Date hợp lệ, ĐÚNG 29/02 (2024 là năm nhuận thật)
 *   tháng 13 (vd "...-13-01...")→ Invalid Date (`Number.isNaN(Date.parse())` = true, TRƯỜNG HỢP
 *   NÀY `Date.parse` một mình đã bắt đúng — nhưng ba trường hợp rollover ở trên thì không).
 *
 * CÁCH TRÁNH ROLLOVER: vòng lại `toISOString()` của chính Date vừa parse và so khớp CHÍNH XÁC
 * (character-for-character) với input gốc. Một mốc thời gian THẬT ở dạng canonical, sau khi
 * parse rồi format lại đúng canonical, PHẢI cho ra lại đúng chuỗi đó — không sai một ký tự. Một
 * ngày KHÔNG tồn tại (bị rollover) sẽ format lại thành MỘT NGÀY KHÁC, lộ ra ngay qua so sánh
 * chuỗi. Đây KHÔNG phải chuẩn hoá input (hàm chỉ trả `boolean`, KHÔNG trả giá trị đã sửa) — caller
 * vẫn dùng nguyên chuỗi gốc nếu hợp lệ, và từ chối thẳng nếu không, không âm thầm sửa gì.
 *
 * TẤT ĐỊNH, KHÔNG PHỤ THUỘC TIMEZONE MÁY CHẠY: `CANONICAL_UTC_TIMESTAMP_RE` buộc hậu tố `Z`
 * (UTC), và `toISOString()` LUÔN trả UTC bất kể timezone hệ thống — nên kết quả giống hệt nhau dù
 * chạy ở máy nào, múi giờ nào.
 */
function isValidCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === value;
}
// Placeholder rõ ràng KHÔNG PHẢI một người — chặn trường hợp hiển nhiên nhất, KHÔNG phải xác thực
// danh tính (xem cảnh báo checksum ở đầu file). So sánh không phân biệt hoa/thường.
const PLACEHOLDER_APPROVERS = new Set(['true', 'owner', 'admin', 'system']);
// Bảo vệ threat #11 (design report §7): manifest không được chứa khoá trông giống secret/credential.
const SECRET_LIKE_KEY_RE = /secret|password|token|key|credential/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Quét đệ quy TÊN KHOÁ (không phải giá trị) trong payload, trả về đường dẫn các khoá nghi vấn. */
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
 * Kiểm tra một `PublishManifestV1` từ `unknown` (input chưa tin cậy — file trên đĩa, chuỗi paste
 * tay…). THUẦN: không DB, không network, không filesystem, không đọc biến môi trường. KHÔNG mutate
 * input, KHÔNG chuẩn hoá/trim rồi ghi lại, KHÔNG tự điền trường thiếu — trả TẤT CẢ lỗi tìm được,
 * không dừng ở lỗi đầu tiên.
 *
 * Đây là kiểm tra NỘI DUNG và CẤU TRÚC. Đây KHÔNG phải kiểm tra quyền hạn hay danh tính — xem cảnh
 * báo ở đầu file về ranh giới của checksum/`approvedBy`.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
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
    // Không thể kiểm sâu hơn nếu payload không phải object — trả lỗi đã gom được (checksum + đây).
    return { ok: false, errors };
  }

  if (!(SUPPORTED_MANIFEST_VERSIONS as readonly unknown[]).includes(payload.manifestVersion)) {
    errors.push(
      `payload.manifestVersion không được hỗ trợ — chỉ chấp nhận: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}.`,
    );
  }

  if (!isNonEmptyString(payload.manifestId)) {
    errors.push('payload.manifestId phải là chuỗi không rỗng.');
  }

  if (!isNonEmptyString(payload.targetEnvironment)) {
    errors.push('payload.targetEnvironment phải là chuỗi không rỗng.');
  }

  if (
    !(
      typeof payload.minSchemaVersion === 'number' &&
      Number.isInteger(payload.minSchemaVersion) &&
      payload.minSchemaVersion > 0
    )
  ) {
    errors.push('payload.minSchemaVersion phải là số nguyên dương.');
  }

  if (!isPlainObject(payload.approval)) {
    errors.push('payload.approval phải là một object.');
  } else {
    const approval = payload.approval;
    if (!isNonEmptyString(approval.approvedBy)) {
      errors.push('payload.approval.approvedBy phải là chuỗi không rỗng.');
    } else if (PLACEHOLDER_APPROVERS.has(approval.approvedBy.trim().toLowerCase())) {
      errors.push(
        'payload.approval.approvedBy là một placeholder chung chung (vd "true"/"owner"/"admin"/' +
          '"system"), không phải định danh một người thật. (Đây chỉ chặn trường hợp rõ ràng nhất — ' +
          'KHÔNG phải xác thực danh tính, xem comment đầu file.)',
      );
    }
    if (!isNonEmptyString(approval.reason)) {
      errors.push('payload.approval.reason phải là chuỗi không rỗng.');
    }
    if (!isValidCanonicalTimestamp(approval.approvedAt)) {
      errors.push(
        'payload.approval.approvedAt phải là timestamp UTC canonical hợp lệ theo lịch thật ' +
          '(YYYY-MM-DDTHH:mm:ss.sssZ, đúng hình dạng Date.prototype.toISOString() — vd "31/04" ' +
          'hay "29/02" của năm không nhuận bị từ chối, không âm thầm chuẩn hoá sang ngày khác).',
      );
    }
  }

  if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
    errors.push('payload.targets phải là một mảng không rỗng.');
  } else {
    const seenSlugs = new Set<string>();
    payload.targets.forEach((rawTarget, i) => {
      if (!isPlainObject(rawTarget)) {
        errors.push(`payload.targets[${i}] phải là một object.`);
        return;
      }
      if (!isNonEmptyString(rawTarget.slug)) {
        errors.push(`payload.targets[${i}].slug phải là chuỗi không rỗng.`);
      } else {
        if (seenSlugs.has(rawTarget.slug)) {
          errors.push(
            `payload.targets[${i}].slug "${rawTarget.slug}" bị trùng — mỗi place chỉ được xuất ` +
              'hiện một lần trong một manifest.',
          );
        }
        seenSlugs.add(rawTarget.slug);
      }
      if (!isPlainObject(rawTarget.source)) {
        errors.push(`payload.targets[${i}].source phải là một object.`);
      } else {
        const source = rawTarget.source;
        if (!isNonEmptyString(source.url)) {
          errors.push(`payload.targets[${i}].source.url phải là chuỗi không rỗng.`);
        }
        if (!isNonEmptyString(source.externalRef)) {
          errors.push(`payload.targets[${i}].source.externalRef phải là chuỗi không rỗng.`);
        }
        // CÙNG mức chặt với approval.approvedAt (isValidCanonicalTimestamp) — retrievedAt là
        // bằng chứng "lấy dữ liệu lúc nào", một ngày không tồn tại trên lịch làm hỏng bằng chứng
        // đó y hệt một ngày phê duyệt không tồn tại.
        if (!isValidCanonicalTimestamp(source.retrievedAt)) {
          errors.push(
            `payload.targets[${i}].source.retrievedAt phải là timestamp UTC canonical hợp lệ ` +
              'theo lịch thật (YYYY-MM-DDTHH:mm:ss.sssZ).',
          );
        }
        if (
          !isNonEmptyString(source.retrievalMethod) ||
          !VALID_RETRIEVAL_METHODS.includes(source.retrievalMethod)
        ) {
          errors.push(
            `payload.targets[${i}].source.retrievalMethod phải là một trong: ` +
              `${VALID_RETRIEVAL_METHODS.join(', ')}.`,
          );
        }
      }
    });
  }

  const secretKeys = findSecretLikeKeys(payload);
  if (secretKeys.length > 0) {
    errors.push(
      `payload chứa khoá nghi là secret/credential, không được phép trong manifest: ${secretKeys.join(', ')}.`,
    );
  }

  // Chỉ đối chiếu checksum khi checksum TỰ NÓ đã đúng định dạng — so một checksum sai định dạng
  // với giá trị tính lại chỉ tạo thêm một lỗi thừa, không thêm thông tin.
  if (isNonEmptyString(checksum) && SHA256_HEX_RE.test(checksum)) {
    const recomputed = computeManifestChecksum(payload as unknown as PublishManifestPayloadV1);
    if (recomputed !== checksum) {
      errors.push(
        'checksum không khớp với nội dung payload — payload có thể đã bị sửa sau khi checksum ' +
          'được tính (xem cảnh báo authenticity ở đầu file: đây là bằng chứng TOÀN VẸN NỘI DUNG, ' +
          'không phải xác thực danh tính người sửa).',
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: input as unknown as PublishManifestV1 };
}
