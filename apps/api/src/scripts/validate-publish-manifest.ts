import { readFileSync } from 'fs';
import { validateManifest } from '../modules/admin-data/publish-manifest.contract';

// OFFLINE PUBLISH MANIFEST VALIDATOR — Slice 0.5C (2026-08-24). Đọc ĐÚNG một file JSON trên đĩa,
// parse và kiểm bằng `validateManifest()` (publish-manifest.contract.ts) — KHÔNG viết validator
// song song. File này CỐ Ý không import bất kỳ thứ gì từ '@nestjs/*', 'typeorm', '../app.module',
// data-source, hay bất kỳ *.service.ts nào: `validateManifest()` vốn đã là hàm THUẦN (không DB,
// không network, không filesystem bên trong nó), nên toàn bộ CLI này chỉ cần `fs.readFileSync` +
// `JSON.parse` + gọi hàm đó. Nhập AppModule ở đây sẽ tái tạo đúng lỗi CI đã sửa cho
// backfill-administrative-data.ts/expire-overdue-verifications.ts (ConfigModule.forRoot() đòi
// JWT_ACCESS_SECRET/JWT_REFRESH_SECRET ngay khi import) — và sai mục đích: giá trị của một
// "dry-run validator (offline)" (roadmap 0.5C, design report §12) đến từ việc KHÔNG CÓ khả năng
// kết nối gì cả, không phải từ việc kết nối rồi tự kiềm chế.
//
// `assertNotProduction()` (backfill-administrative-data.ts) KHÔNG được gọi và KHÔNG cần gọi ở
// đây: guard đó bảo vệ ba script CÓ khả năng ghi DB thật (xem design report §2.2). CLI này không
// bao giờ mở NestFactory.createApplicationContext(), không có DataSource, không có pg client
// trong toàn bộ import graph — không có gì để guard đó gate. Gọi nó sẽ là no-op gây hiểu lầm rằng
// script có khả năng chạm production.
//
// RANH GIỚI: manifest hợp lệ ("PUBLISH_MANIFEST_VALID") chỉ có nghĩa nội dung ĐÚNG CẤU TRÚC và
// checksum KHỚP nội dung — xem cảnh báo đầy đủ ở đầu publish-manifest.contract.ts. Nó KHÔNG xác
// thực danh tính approvedBy (0.5D, chưa triển khai), KHÔNG đối chiếu minSchemaVersion với migration
// DB thật (0.5E, chưa triển khai), và KHÔNG cấp quyền publish bất cứ gì.
//
// Usage:
//   npm run admin:validate-publish-manifest -- --manifest=<path-to-json>
//   npm run admin:validate-publish-manifest -- --help

const USAGE = `Cách dùng:
  npm run admin:validate-publish-manifest -- --manifest=<path-to-json>
  npm run admin:validate-publish-manifest -- --help

Đọc ĐÚNG MỘT file JSON manifest trên đĩa, parse và kiểm bằng validateManifest()
(apps/api/src/modules/admin-data/publish-manifest.contract.ts). Hoàn toàn offline: không kết nối
database, không gọi network, không khởi tạo ứng dụng NestJS. Không ghi hoặc sửa file manifest,
không tự tính lại checksum để "sửa" manifest, không xác thực danh tính approvedBy, không cấp
quyền publish.

Exit code:
  0  --help, hoặc manifest hợp lệ (PUBLISH_MANIFEST_VALID)
  1  file không đọc được / JSON không hợp lệ / manifest không hợp lệ (PUBLISH_MANIFEST_INVALID)
  2  lỗi tham số dòng lệnh (usage error)`;

/** Kết quả parse argv — discriminated union, không throw. */
export type CliArgsResult =
  | { readonly kind: 'help' }
  | { readonly kind: 'validate'; readonly manifestPath: string }
  | { readonly kind: 'usage-error'; readonly message: string };

/**
 * THUẦN — không đọc file, không có side effect. Chỉ hỗ trợ đúng dạng `--manifest=<path>` (không
 * positional path mơ hồ, không dò file mặc định, không đọc từ biến môi trường/stdin — đúng yêu
 * cầu "Không hỗ trợ positional path mơ hồ").
 */
export function parseCliArgs(argv: readonly string[]): CliArgsResult {
  if (argv.includes('--help')) {
    return { kind: 'help' };
  }

  const MANIFEST_PREFIX = '--manifest=';
  let manifestPath: string | undefined;
  const unknown: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith(MANIFEST_PREFIX)) {
      if (manifestPath !== undefined) {
        return { kind: 'usage-error', message: 'Chỉ được truyền --manifest đúng một lần.' };
      }
      manifestPath = arg.slice(MANIFEST_PREFIX.length);
    } else {
      unknown.push(arg);
    }
  }

  if (unknown.length > 0) {
    return {
      kind: 'usage-error',
      message: `Tham số không nhận dạng được: ${unknown.join(', ')}`,
    };
  }

  if (manifestPath === undefined) {
    return { kind: 'usage-error', message: 'Thiếu --manifest=<path-to-json>.' };
  }

  if (manifestPath.trim().length === 0) {
    return { kind: 'usage-error', message: '--manifest không được để trống.' };
  }

  return { kind: 'validate', manifestPath };
}

/** Điểm nối duy nhất tới filesystem thật — tiêm được để test không cần tạo file thật nếu cần. */
export interface ManifestFileIo {
  readFile(path: string): string;
}

export const defaultManifestFileIo: ManifestFileIo = {
  readFile: (path) => readFileSync(path, 'utf8'),
};

export interface ManifestCheckResult {
  readonly exitCode: 0 | 1;
  /** Các dòng để in — KHÔNG chứa nội dung nhạy cảm (xem contract §checksum boundary). */
  readonly lines: readonly string[];
}

/**
 * Đọc + parse + validate một file manifest. THUẦN theo nghĩa không mutate bất cứ gì và không ghi
 * lại file — chỉ đọc. Không bao giờ dump toàn bộ nội dung file ra output (kể cả khi JSON malformed
 * hay manifest invalid) — chỉ in thông báo lỗi gọn từ `validateManifest()` hoặc tên lỗi chung.
 */
export function checkManifestFile(
  manifestPath: string,
  io: ManifestFileIo = defaultManifestFileIo,
): ManifestCheckResult {
  let raw: string;
  try {
    raw = io.readFile(manifestPath);
  } catch {
    return {
      exitCode: 1,
      lines: [`Không đọc được file manifest: ${manifestPath}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      exitCode: 1,
      lines: ['JSON không hợp lệ trong file manifest.'],
    };
  }

  const result = validateManifest(parsed);

  if (!result.ok) {
    return {
      exitCode: 1,
      lines: ['PUBLISH_MANIFEST_INVALID', ...result.errors.map((e) => `  - ${e}`)],
    };
  }

  const { manifest } = result;
  return {
    exitCode: 0,
    lines: [
      'PUBLISH_MANIFEST_VALID',
      `manifestId:        ${manifest.payload.manifestId}`,
      `manifestVersion:   ${manifest.payload.manifestVersion}`,
      `targetEnvironment: ${manifest.payload.targetEnvironment}`,
      // "declared-only" — CHƯA đối chiếu với migration DB thật (0.5E chưa triển khai).
      `minSchemaVersion:  ${manifest.payload.minSchemaVersion} (giá trị KHAI BÁO, offline — chưa đối chiếu với schema database thật)`,
      `targets:           ${manifest.payload.targets.length}`,
      `checksum:          ${manifest.checksum}`,
      '',
      'Lưu ý: checksum chỉ chứng minh TOÀN VẸN NỘI DUNG (content integrity) — KHÔNG xác thực danh',
      'tính người phê duyệt (approval.approvedBy) và KHÔNG cấp quyền publish. Xem chi tiết ranh',
      'giới ở publish-manifest.contract.ts.',
    ],
  };
}

export interface RunCliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly fileIo: ManifestFileIo;
}

export const defaultRunCliIo: RunCliIo = {
  // eslint-disable-next-line no-console -- CLI này chính là nơi phải in output, không có logger nào khác
  stdout: (line) => console.log(line),
  // eslint-disable-next-line no-console -- CLI này chính là nơi phải in output, không có logger nào khác
  stderr: (line) => console.error(line),
  fileIo: defaultManifestFileIo,
};

/**
 * Toàn bộ logic runCli() là ĐỒNG BỘ và THUẦN theo nghĩa không có side effect ngoài in ra `io` được
 * tiêm và đọc đúng một file qua `io.fileIo` — không network, không DB, không ghi file. Trả về exit
 * code thay vì tự gọi `process.exit()`, để `main()` là nơi DUY NHẤT chạm vào tiến trình thật.
 */
export function runCli(argv: readonly string[], io: RunCliIo = defaultRunCliIo): number {
  const parsed = parseCliArgs(argv);

  if (parsed.kind === 'help') {
    io.stdout(USAGE);
    return 0;
  }

  if (parsed.kind === 'usage-error') {
    io.stderr(parsed.message);
    io.stderr('');
    io.stderr(USAGE);
    return 2;
  }

  const result = checkManifestFile(parsed.manifestPath, io.fileIo);
  const sink = result.exitCode === 0 ? io.stdout : io.stderr;
  for (const line of result.lines) {
    sink(line);
  }
  return result.exitCode;
}

function main(): void {
  process.exitCode = runCli(process.argv.slice(2));
}

// `require.main === module` — chỉ chạy khi file được thực thi TRỰC TIẾP, không khi bị `import` bởi
// unit test (cùng quy ước với các script khác trong thư mục này).
if (require.main === module) {
  main();
}
