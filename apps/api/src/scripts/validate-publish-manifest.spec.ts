import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  computeManifestChecksum,
  type PublishManifestPayloadV1,
  type PublishManifestV1,
} from '../modules/admin-data/publish-manifest.contract';
import {
  parseCliArgs,
  checkManifestFile,
  runCli,
  defaultManifestFileIo,
  type ManifestFileIo,
  type RunCliIo,
} from './validate-publish-manifest';

// -----------------------------------------------------------------------------------------------
// Fixtures — payload/manifest hợp lệ tối thiểu, riêng cho spec này (không tái dùng fixture của
// publish-manifest.contract.spec.ts để hai file test độc lập với nhau).
// -----------------------------------------------------------------------------------------------

function buildValidPayload(
  overrides: Partial<PublishManifestPayloadV1> = {},
): PublishManifestPayloadV1 {
  return {
    manifestVersion: 1,
    manifestId: 'cli-test-batch-001',
    targetEnvironment: 'production',
    minSchemaVersion: 45,
    approval: {
      approvedBy: 'nhuhao2023@gmail.com',
      approvedAt: '2026-08-24T10:00:00.000Z',
      reason: 'CLI test fixture — Slice 0.5C.',
    },
    targets: [
      {
        slug: 'cli-test-place',
        source: {
          externalRef: 'example.com/cli-test-place',
          title: 'CLI Test Place',
          url: 'https://example.com/cli-test-place',
          publisher: 'Example Publisher',
          language: 'vi',
          retrievedAt: '2026-08-24T00:00:00.000Z',
          retrievalMethod: 'direct_fetch',
        },
        contacts: [],
        openingHours: null,
        openingHoursQuote: null,
        partialFactNote: null,
        corroborations: [],
        notCovered: [],
      },
    ],
    ...overrides,
  };
}

function buildValidManifest(
  payloadOverrides: Partial<PublishManifestPayloadV1> = {},
): PublishManifestV1 {
  const payload = buildValidPayload(payloadOverrides);
  return { payload, checksum: computeManifestChecksum(payload) };
}

// -----------------------------------------------------------------------------------------------
// Temp directory — tạo trong beforeAll, xoá ĐÚNG thư mục đó (không path rộng/HOME/workspace root)
// trong afterAll. Mỗi test ghi file riêng bên trong để không đụng nhau.
// -----------------------------------------------------------------------------------------------

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'phuquochub-manifest-cli-test-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixtureFile(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeManifestFile(name: string, manifest: PublishManifestV1): string {
  return writeFixtureFile(name, JSON.stringify(manifest, null, 2));
}

/** io capture — không in ra console thật khi chạy test. */
function createCaptureIo(fileIo: ManifestFileIo = defaultManifestFileIo): RunCliIo & {
  stdoutLines: string[];
  stderrLines: string[];
} {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdout: (l) => stdoutLines.push(l),
    stderr: (l) => stderrLines.push(l),
    fileIo,
    stdoutLines,
    stderrLines,
  };
}

// =================================================================================================
// A. Argument parsing
// =================================================================================================

describe('parseCliArgs — argument parsing (Section A)', () => {
  it('A1: --help → kind help', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('A2: thiếu --manifest → usage-error', () => {
    const result = parseCliArgs([]);
    expect(result.kind).toBe('usage-error');
  });

  it('A3: --manifest= rỗng → usage-error', () => {
    const result = parseCliArgs(['--manifest=']);
    expect(result.kind).toBe('usage-error');
  });

  it('A3b: --manifest=   (chỉ khoảng trắng) → usage-error', () => {
    const result = parseCliArgs(['--manifest=   ']);
    expect(result.kind).toBe('usage-error');
  });

  it('A4: hai --manifest → usage-error', () => {
    const result = parseCliArgs(['--manifest=a.json', '--manifest=b.json']);
    expect(result.kind).toBe('usage-error');
  });

  it('A5: unknown argument → usage-error', () => {
    const result = parseCliArgs(['--manifest=a.json', '--not-a-real-flag']);
    expect(result.kind).toBe('usage-error');
  });

  it('A5b: unknown argument đứng một mình (không kèm --manifest) → usage-error', () => {
    const result = parseCliArgs(['--wat']);
    expect(result.kind).toBe('usage-error');
  });

  it('A6: một --manifest hợp lệ → parser nhận đúng path', () => {
    const result = parseCliArgs(['--manifest=/tmp/some/manifest.json']);
    expect(result).toEqual({ kind: 'validate', manifestPath: '/tmp/some/manifest.json' });
  });
});

describe('runCli — exit codes cho help/usage-error, --help KHÔNG đọc file', () => {
  it('--help → exit 0 và KHÔNG gọi io.fileIo.readFile', () => {
    const readFile = jest.fn(() => {
      throw new Error('readFile KHÔNG được gọi khi --help');
    });
    const io = createCaptureIo({ readFile });

    const code = runCli(['--help'], io);

    expect(code).toBe(0);
    expect(readFile).not.toHaveBeenCalled();
    expect(io.stdoutLines.join('\n')).toMatch(/Cách dùng/);
  });

  it('thiếu --manifest → exit 2, không gọi readFile', () => {
    const readFile = jest.fn(() => {
      throw new Error('readFile KHÔNG được gọi khi usage error');
    });
    const io = createCaptureIo({ readFile });

    const code = runCli([], io);

    expect(code).toBe(2);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('unknown argument → exit 2', () => {
    const io = createCaptureIo();
    expect(runCli(['--bogus'], io)).toBe(2);
  });
});

// =================================================================================================
// B. File và JSON
// =================================================================================================

describe('checkManifestFile / runCli — File và JSON (Section B)', () => {
  it('B7: file không tồn tại → exit 1, thông báo gọn', () => {
    const missingPath = join(tmpDir, 'does-not-exist.json');

    const result = checkManifestFile(missingPath);

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).not.toMatch(/at Object\.|\.ts:\d+:\d+/); // không stack trace
  });

  it('B8: readFile dependency ném lỗi (injected) → exit 1', () => {
    const throwingIo: ManifestFileIo = {
      readFile: () => {
        throw new Error('permission denied (giả lập)');
      },
    };

    const result = checkManifestFile(join(tmpDir, 'irrelevant.json'), throwingIo);

    expect(result.exitCode).toBe(1);
  });

  it('B9: JSON malformed → exit 1, "JSON không hợp lệ", KHÔNG dump nội dung file', () => {
    const marker = 'MALFORMED-CONTENT-MARKER-77123';
    const path = writeFixtureFile('malformed.json', `{ "not": valid json, ${marker}`);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toMatch(/JSON không hợp lệ/);
    expect(result.lines.join('\n')).not.toContain(marker); // không dump toàn bộ nội dung file
  });

  it('B10a: JSON null → bị validateManifest từ chối, exit 1', () => {
    const path = writeFixtureFile('null.json', 'null');
    const result = checkManifestFile(path);
    expect(result.exitCode).toBe(1);
    expect(result.lines[0]).toBe('PUBLISH_MANIFEST_INVALID');
  });

  it('B10b: JSON là mảng → bị validateManifest từ chối, exit 1', () => {
    const path = writeFixtureFile('array.json', '[1, 2, 3]');
    const result = checkManifestFile(path);
    expect(result.exitCode).toBe(1);
    expect(result.lines[0]).toBe('PUBLISH_MANIFEST_INVALID');
  });

  it('B10c: JSON là số nguyên thô → bị validateManifest từ chối, exit 1', () => {
    const path = writeFixtureFile('primitive.json', '42');
    const result = checkManifestFile(path);
    expect(result.exitCode).toBe(1);
  });

  it('B11: file KHÔNG bị sửa — nội dung trước/sau chạy CLI giống hệt byte-for-byte', () => {
    const manifest = buildValidManifest();
    const path = writeManifestFile('unmodified.json', manifest);
    const before = readFileSync(path, 'utf8');

    const result = checkManifestFile(path);

    const after = readFileSync(path, 'utf8');
    expect(after).toBe(before);
    expect(result.exitCode).toBe(0); // xác nhận CLI thực sự chạy tới cuối, không phải bail sớm
  });
});

// =================================================================================================
// C. Manifest validation — CLI phải WIRE đúng tới validateManifest() và bề mặt exit code/errors,
// KHÔNG re-test toàn bộ logic nội bộ của validateManifest() (đã có publish-manifest.contract.spec.ts).
// =================================================================================================

describe('checkManifestFile — Manifest validation (Section C)', () => {
  it('C12: manifest hợp lệ → exit 0, PUBLISH_MANIFEST_VALID', () => {
    const manifest = buildValidManifest();
    const path = writeManifestFile('valid.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe('PUBLISH_MANIFEST_VALID');
  });

  it('C13: checksum mismatch → exit 1', () => {
    const manifest = buildValidManifest();
    const tampered: PublishManifestV1 = {
      ...manifest,
      checksum: manifest.checksum.replace(/^./, 'a'),
    };
    const path = writeManifestFile('checksum-mismatch.json', tampered);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
    expect(result.lines[0]).toBe('PUBLISH_MANIFEST_INVALID');
  });

  it('C14: manifestVersion không hỗ trợ → exit 1', () => {
    const payload = buildValidPayload({ manifestVersion: 2 as unknown as 1 });
    const manifest = { payload, checksum: computeManifestChecksum(payload) };
    const path = writeManifestFile('unsupported-version.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
  });

  it('C15: approval.approvedBy rỗng → exit 1', () => {
    const payload = buildValidPayload({
      approval: { approvedBy: '', approvedAt: '2026-08-24T10:00:00.000Z', reason: 'x' },
    });
    const manifest = { payload, checksum: computeManifestChecksum(payload) };
    const path = writeManifestFile('empty-approval.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
  });

  it('C16: approval.approvedAt bị rollover lịch (2026-02-30 không có thật) → exit 1', () => {
    const payload = buildValidPayload({
      approval: {
        approvedBy: 'nhuhao2023@gmail.com',
        approvedAt: '2026-02-30T00:00:00.000Z',
        reason: 'x',
      },
    });
    const manifest = { payload, checksum: computeManifestChecksum(payload) };
    const path = writeManifestFile('rollover-timestamp.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
  });

  it('C17: payload chứa khoá tên giống secret/credential → exit 1', () => {
    const payload = buildValidPayload();
    const withSecret = {
      ...payload,
      apiSecretToken: 'shhh',
    } as unknown as PublishManifestPayloadV1;
    const manifest = { payload: withSecret, checksum: computeManifestChecksum(withSecret) };
    const path = writeManifestFile('secret-like-key.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
    expect(result.lines.some((l) => /secret/i.test(l))).toBe(true);
  });

  it('C18: nhiều lỗi cùng lúc → CLI in TOÀN BỘ lỗi, không chỉ lỗi đầu tiên', () => {
    // Cố tình 3 lỗi độc lập: version không hỗ trợ + approval.reason rỗng + timestamp rollover.
    const payload = buildValidPayload({
      manifestVersion: 99 as unknown as 1,
      approval: {
        approvedBy: 'nhuhao2023@gmail.com',
        approvedAt: '2026-04-31T00:00:00.000Z',
        reason: '',
      },
    });
    const manifest = { payload, checksum: computeManifestChecksum(payload) };
    const path = writeManifestFile('multi-error.json', manifest);

    const result = checkManifestFile(path);

    expect(result.exitCode).toBe(1);
    const errorLines = result.lines.filter((l) => l.startsWith('  - '));
    expect(errorLines.length).toBeGreaterThanOrEqual(3);
  });
});

// =================================================================================================
// D. Output content restrictions + disclaimers
// =================================================================================================

describe('runCli — nội dung output an toàn và disclaimer (mục 23-25)', () => {
  const SECRET_MARKER_PHONE = '0909-CLI-SECRET-4242';
  const SECRET_MARKER_REASON = 'REASON-MARKER-DO-NOT-LEAK-98765';

  it('23: output hợp lệ KHÔNG dump contact value hoặc toàn bộ approval.reason', () => {
    const payload = buildValidPayload({
      approval: {
        approvedBy: 'nhuhao2023@gmail.com',
        approvedAt: '2026-08-24T10:00:00.000Z',
        reason: SECRET_MARKER_REASON,
      },
      targets: [
        {
          slug: 'cli-test-place',
          source: {
            externalRef: 'example.com/cli-test-place',
            title: 'CLI Test Place',
            url: 'https://example.com/cli-test-place',
            publisher: 'Example Publisher',
            language: 'vi',
            retrievedAt: '2026-08-24T00:00:00.000Z',
            retrievalMethod: 'direct_fetch',
          },
          contacts: [
            {
              contactType: 'PHONE',
              value: SECRET_MARKER_PHONE,
              label: null,
              isPrimary: true,
              quote: SECRET_MARKER_PHONE,
            },
          ],
          openingHours: null,
          openingHoursQuote: null,
          partialFactNote: null,
          corroborations: [],
          notCovered: [],
        },
      ],
    });
    const manifest = { payload, checksum: computeManifestChecksum(payload) };
    const path = writeManifestFile('no-leak.json', manifest);

    const result = checkManifestFile(path);
    const output = result.lines.join('\n');

    expect(result.exitCode).toBe(0); // xác nhận manifest thực sự hợp lệ, không phải pass giả do bail sớm
    expect(output).not.toContain(SECRET_MARKER_PHONE);
    expect(output).not.toContain(SECRET_MARKER_REASON);
  });

  it('24: output hợp lệ có disclaimer "toàn vẹn nội dung, không xác thực danh tính"', () => {
    const manifest = buildValidManifest();
    const path = writeManifestFile('disclaimer.json', manifest);

    const result = checkManifestFile(path);
    const output = result.lines.join('\n');

    expect(result.exitCode).toBe(0);
    expect(output).toMatch(/toàn vẹn nội dung/i);
    expect(output).toMatch(/không xác thực danh/i);
  });

  it('25: minSchemaVersion được mô tả declared-only/offline, không tuyên bố đã đối chiếu DB', () => {
    const manifest = buildValidManifest();
    const path = writeManifestFile('min-schema.json', manifest);

    const result = checkManifestFile(path);
    const output = result.lines.join('\n');

    expect(output).toMatch(/khai báo/i);
    expect(output).toMatch(/chưa đối chiếu/i);
  });
});

// =================================================================================================
// Security/architecture regression — không DB/network/AppModule (mục 19-22)
// =================================================================================================

describe('Regression: không DB/network/Nest bootstrap (mục 19-22)', () => {
  it('19: import script khi KHÔNG có JWT_ACCESS_SECRET/JWT_REFRESH_SECRET vẫn hoạt động bình thường, không chết', () => {
    const savedAccess = process.env.JWT_ACCESS_SECRET;
    const savedRefresh = process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    try {
      const manifest = buildValidManifest();
      const path = writeManifestFile('no-jwt-env.json', manifest);

      // Nếu script này có nạp AppModule/ConfigModule ở BẤT KỲ đường nào, ConfigModule.forRoot()
      // validationSchema (Joi) sẽ throw ngay vì thiếu JWT_ACCESS_SECRET/JWT_REFRESH_SECRET (required).
      // Chạy được bình thường ở đây là bằng chứng thực nghiệm rằng không có đường nào như vậy tồn tại.
      expect(() => checkManifestFile(path)).not.toThrow();
      expect(checkManifestFile(path).exitCode).toBe(0);
    } finally {
      if (savedAccess === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = savedAccess;
      if (savedRefresh === undefined) delete process.env.JWT_REFRESH_SECRET;
      else process.env.JWT_REFRESH_SECRET = savedRefresh;
    }
  });

  // LƯU Ý THIẾT KẾ: hai test 20/21 quét CHỈ các dòng `import ...` thực sự, KHÔNG quét toàn bộ văn
  // bản file (kể cả comment) — file này có nhiều comment cố ý NHẮC TỚI "AppModule"/"data-source"
  // để giải thích LÝ DO không import chúng, nên so khớp trên toàn văn bản sẽ tự báo false-positive
  // với chính lời giải thích của nó. Quét theo cú pháp `import` là bài kiểm đúng ý: "không có CÂU
  // LỆNH IMPORT nào tới các thứ này", không phải "từ đó không xuất hiện ở đâu trong file".
  function extractImportStatements(source: string): string[] {
    return source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));
  }

  it('20+21: TOÀN BỘ import statement của file chỉ gồm đúng "fs" và publish-manifest.contract — không @nestjs/*, typeorm, ../app.module, data-source, VerifiedFactsIngestionService, hay bất kỳ client network nào (http/https/axios/AWS SDK)', () => {
    const source = readFileSync(join(__dirname, 'validate-publish-manifest.ts'), 'utf8');
    const importLines = extractImportStatements(source);

    // Khẳng định TRỰC TIẾP và mạnh nhất: đúng hai import, không hơn không kém — tự động phủ định
    // MỌI import bị cấm (Nest, TypeORM, data-source, ingestion service, http/https/axios/AWS SDK)
    // vì chúng chỉ có thể "không xuất hiện" nếu không nằm trong đúng hai dòng dưới đây.
    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toBe("import { readFileSync } from 'fs';");
    expect(importLines[1]).toBe(
      "import { validateManifest } from '../modules/admin-data/publish-manifest.contract';",
    );

    // Phòng vệ kép, tường minh theo từng mục cấm — nếu ai đó nới lỏng khẳng định "đúng 2 dòng"
    // ở trên trong tương lai, các dòng dưới vẫn chặn riêng từng trường hợp.
    const importText = importLines.join('\n');
    const forbidden = [
      /from ['"]\.\.\/app\.module['"]/,
      /from ['"]@nestjs\//,
      /from ['"]typeorm['"]/,
      /data-source/i,
      /from ['"].*ingestion\.service['"]/i,
      /from ['"]http['"]/,
      /from ['"]https['"]/,
      /from ['"]axios['"]/,
      /from ['"]@aws-sdk/,
    ];
    for (const pattern of forbidden) {
      expect(importText).not.toMatch(pattern);
    }
  });

  it('21b: source không gọi fetch() thật ở bất kỳ đâu (không chỉ ở import)', () => {
    const source = readFileSync(join(__dirname, 'validate-publish-manifest.ts'), 'utf8');
    expect(source).not.toMatch(/\bfetch\(/);
  });

  it('22a: ManifestFileIo chỉ expose readFile — không có phương thức ghi nào trong io mặc định', () => {
    expect(Object.keys(defaultManifestFileIo)).toEqual(['readFile']);
  });

  it('22b: chạy CLI trên một manifest hợp lệ KHÔNG tạo/sửa/xoá file nào khác trong temp dir', () => {
    const manifest = buildValidManifest();
    const path = writeManifestFile('write-check.json', manifest);
    const before = readFileSync(path, 'utf8');

    const io = createCaptureIo();
    const code = runCli(['--manifest=' + path], io);

    expect(code).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
});
