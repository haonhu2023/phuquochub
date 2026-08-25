import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canonicalJson } from '../../common/canonical-json';
import {
  SUPPORTED_MANIFEST_VERSIONS,
  computeManifestChecksum,
  validateManifest,
  type PublishManifestPayloadV1,
  type PublishManifestV1,
} from './publish-manifest.contract';
import { VERIFIED_FACTS_ROUND1, type VerifiedFactTarget } from './verified-facts.manifest';

function buildTarget(overrides: Partial<VerifiedFactTarget> = {}): VerifiedFactTarget {
  return {
    slug: 'test-place',
    source: {
      externalRef: 'example.com/test-place',
      title: 'Test Place — trang chính thức',
      url: 'https://example.com/test-place',
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
    ...overrides,
  };
}

function buildPayload(overrides: Partial<PublishManifestPayloadV1> = {}): PublishManifestPayloadV1 {
  return {
    manifestVersion: 1,
    manifestId: 'batch-2026-08-24-001',
    targetEnvironment: 'production',
    minSchemaVersion: 45,
    approval: {
      approvedBy: 'nhuhao2023@gmail.com',
      approvedAt: '2026-08-24T10:00:00.000Z',
      reason: 'Slice 0.5B — fixture kiểm thử hợp đồng manifest.',
    },
    targets: [buildTarget()],
    ...overrides,
  };
}

function buildManifest(payloadOverrides: Partial<PublishManifestPayloadV1> = {}): PublishManifestV1 {
  const payload = buildPayload(payloadOverrides);
  return { payload, checksum: computeManifestChecksum(payload) };
}

describe('publish-manifest.contract', () => {
  // -------------------------------------------------------------------------
  // 1. Manifest V1 hợp lệ được chấp nhận
  // -------------------------------------------------------------------------
  it('manifest V1 hợp lệ (tự dựng) → ok:true', () => {
    const result = validateManifest(buildManifest());
    expect(result.ok).toBe(true);
  });

  it('manifest hợp lệ dựng từ VERIFIED_FACTS_ROUND1 (Sun World + VinWonders) → ok:true', () => {
    const payload = buildPayload({ targets: VERIFIED_FACTS_ROUND1 });
    const manifest: PublishManifestV1 = { payload, checksum: computeManifestChecksum(payload) };

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Thứ tự khoá khác nhau trong payload → cùng checksum
  // -------------------------------------------------------------------------
  it('đổi THỨ TỰ KHOÁ trong payload → checksum KHÔNG đổi (canonicalJson chuẩn hoá đúng)', () => {
    const p1 = buildPayload();
    // Cùng nội dung, khai lại object theo thứ tự khoá NGƯỢC — insertion order thật sự khác nhau
    // ở runtime (không chỉ khác về mặt hình thức trong mã nguồn).
    const p2: PublishManifestPayloadV1 = {
      targets: p1.targets,
      approval: { reason: p1.approval.reason, approvedAt: p1.approval.approvedAt, approvedBy: p1.approval.approvedBy },
      minSchemaVersion: p1.minSchemaVersion,
      targetEnvironment: p1.targetEnvironment,
      manifestId: p1.manifestId,
      manifestVersion: p1.manifestVersion,
    };

    expect(computeManifestChecksum(p2)).toBe(computeManifestChecksum(p1));
  });

  // -------------------------------------------------------------------------
  // 2b. Encoding tường minh (2026-08-25, Gate B) — computeManifestChecksum() PHẢI khớp bit-for-bit
  // với một phép tính SHA-256 ĐỘC LẬP trên `Buffer.from(canonicalJson(payload), 'utf8')`. Đây là
  // semantic test (tính lại digest bằng tay), KHÔNG phải source-text scan — nguồn thật của bằng
  // chứng là giá trị digest, không phải có xuất hiện chuỗi "utf8" trong source hay không.
  // -------------------------------------------------------------------------
  it('checksum KHỚP CHÍNH XÁC với SHA-256 tính độc lập trên Buffer UTF-8 tường minh của canonicalJson(payload)', () => {
    const payload = buildPayload();
    const expected = createHash('sha256')
      .update(Buffer.from(canonicalJson(payload), 'utf8'))
      .digest('hex');

    expect(computeManifestChecksum(payload)).toBe(expected);
    expect(computeManifestChecksum(payload)).toMatch(/^[0-9a-f]{64}$/); // 64 hex = SHA-256, không đổi thuật toán
  });

  it('payload chứa Unicode thật (dấu tiếng Việt, chữ Hàn, chữ Nga) → checksum vẫn khớp digest tính độc lập bằng Buffer UTF-8 (chứng minh xử lý đúng byte ngoài ASCII)', () => {
    const payload = buildPayload({
      approval: {
        approvedBy: 'nhuhao2023@gmail.com',
        approvedAt: '2026-08-24T10:00:00.000Z',
        reason: 'Phê duyệt thử nghiệm — 한국어 텍스트 그리고 русский текст, đủ dấu: ă â ê ô ơ ư đ.',
      },
    });
    const expected = createHash('sha256')
      .update(Buffer.from(canonicalJson(payload), 'utf8'))
      .digest('hex');

    expect(computeManifestChecksum(payload)).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // 3. Giá trị thay đổi → checksum thay đổi
  // -------------------------------------------------------------------------
  it('đổi GIÁ TRỊ trong targets → checksum đổi', () => {
    const p1 = buildPayload();
    const p2 = buildPayload({ targets: [buildTarget({ slug: 'other-place' })] });

    expect(computeManifestChecksum(p2)).not.toBe(computeManifestChecksum(p1));
  });

  // -------------------------------------------------------------------------
  // 4-7. Sửa từng trường approval/targetEnvironment SAU khi checksum đã tính → mismatch bị phát hiện
  // -------------------------------------------------------------------------
  it('sửa approval.approvedBy SAU khi có checksum → validateManifest phát hiện checksum mismatch', () => {
    const m = buildManifest();
    const tampered: PublishManifestV1 = {
      ...m,
      payload: { ...m.payload, approval: { ...m.payload.approval, approvedBy: 'ke-mao-danh' } },
    };

    const result = validateManifest(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  it('sửa approval.approvedAt SAU khi có checksum → validateManifest phát hiện checksum mismatch', () => {
    const m = buildManifest();
    const tampered: PublishManifestV1 = {
      ...m,
      payload: { ...m.payload, approval: { ...m.payload.approval, approvedAt: '2099-01-01T00:00:00.000Z' } },
    };

    const result = validateManifest(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  it('sửa approval.reason SAU khi có checksum → validateManifest phát hiện checksum mismatch', () => {
    const m = buildManifest();
    const tampered: PublishManifestV1 = {
      ...m,
      payload: { ...m.payload, approval: { ...m.payload.approval, reason: 'lý do khác' } },
    };

    const result = validateManifest(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  it('sửa targetEnvironment SAU khi có checksum → validateManifest phát hiện checksum mismatch', () => {
    const m = buildManifest();
    const tampered: PublishManifestV1 = {
      ...m,
      payload: { ...m.payload, targetEnvironment: 'staging' },
    };

    const result = validateManifest(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8-9. Thiếu / rỗng approval metadata
  // -------------------------------------------------------------------------
  it('thiếu payload.approval → bị từ chối', () => {
    const payload = buildPayload();
    const withoutApproval = { ...payload } as Record<string, unknown>;
    delete withoutApproval.approval;
    const manifest = {
      payload: withoutApproval,
      checksum: computeManifestChecksum(withoutApproval as unknown as PublishManifestPayloadV1),
    };

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('approval'))).toBe(true);
  });

  it.each(['approvedBy', 'reason'] as const)('approval.%s rỗng → bị từ chối', (field) => {
    const manifest = buildManifest({ approval: { ...buildPayload().approval, [field]: '   ' } });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes(field))).toBe(true);
  });

  it('approval.approvedBy là placeholder chung chung ("owner") → bị từ chối', () => {
    const manifest = buildManifest({ approval: { ...buildPayload().approval, approvedBy: 'owner' } });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('placeholder'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 10. approvedAt không hợp lệ — sai hình dạng
  // -------------------------------------------------------------------------
  it.each(['2026-08-24', 'không phải ngày', '2026-13-45T00:00:00Z', '2026-08-24T10:00:00Z', ''])(
    'approval.approvedAt="%s" (sai hình dạng canonical) → bị từ chối',
    (bad) => {
      const manifest = buildManifest({ approval: { ...buildPayload().approval, approvedAt: bad } });

      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('approvedAt'))).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // Regression 2026-08-24: Date.parse() một mình KHÔNG bắt được ngày không tồn tại — nó ROLLOVER
  // âm thầm ("2026-02-30" → "2026-03-02") thay vì từ chối. Bốn ca này xác nhận trực tiếp bằng
  // Node runtime của máy chạy test (không đoán), xem comment isValidCanonicalTimestamp().
  // -------------------------------------------------------------------------
  it.each([
    '2026-02-30T00:00:00.000Z', // tháng 2/2026 chỉ có 28 ngày — Date.parse rollover thành 2026-03-02
    '2025-02-29T00:00:00.000Z', // 2025 KHÔNG nhuận — Date.parse rollover thành 2025-03-01
    '2026-04-31T00:00:00.000Z', // tháng 4 chỉ có 30 ngày — Date.parse rollover thành 2026-05-01
  ])('approval.approvedAt="%s" (ngày KHÔNG tồn tại trên lịch, Date.parse rollover) → bị từ chối', (bad) => {
    const manifest = buildManifest({ approval: { ...buildPayload().approval, approvedAt: bad } });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('approvedAt'))).toBe(true);
  });

  it('approval.approvedAt="2024-02-29T00:00:00.000Z" (29/02 của năm NHUẬN THẬT) → được chấp nhận', () => {
    const manifest = buildManifest({
      approval: { ...buildPayload().approval, approvedAt: '2024-02-29T00:00:00.000Z' },
    });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // source.retrievedAt phải chịu ĐÚNG mức kiểm như approval.approvedAt — trước bản sửa này,
  // retrievedAt chỉ được kiểm "không rỗng", không kiểm lịch.
  // -------------------------------------------------------------------------
  it.each([
    '2026-02-30T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z',
    'không phải ngày',
    '2026-08-24T10:00:00Z', // thiếu mili-giây — không đúng canonical
  ])('source.retrievedAt="%s" (không hợp lệ) → bị từ chối', (bad) => {
    const manifest = buildManifest({
      targets: [buildTarget({ source: { ...buildTarget().source, retrievedAt: bad } })],
    });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('retrievedAt'))).toBe(true);
  });

  it('source.retrievedAt="2024-02-29T00:00:00.000Z" (29/02 của năm NHUẬN THẬT) → được chấp nhận', () => {
    const manifest = buildManifest({
      targets: [buildTarget({ source: { ...buildTarget().source, retrievedAt: '2024-02-29T00:00:00.000Z' } })],
    });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 11. Version không hỗ trợ
  // -------------------------------------------------------------------------
  it('manifestVersion không nằm trong SUPPORTED_MANIFEST_VERSIONS → bị từ chối', () => {
    const manifest = buildManifest({ manifestVersion: 2 as unknown as 1 });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('manifestVersion'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 12. targets rỗng
  // -------------------------------------------------------------------------
  it('payload.targets rỗng → bị từ chối', () => {
    const manifest = buildManifest({ targets: [] });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('targets'))).toBe(true);
  });

  it('slug trùng trong targets → bị từ chối', () => {
    const manifest = buildManifest({
      targets: [buildTarget({ slug: 'sun-world-hon-thom' }), buildTarget({ slug: 'sun-world-hon-thom' })],
    });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('trùng'))).toBe(true);
  });

  it('retrievalMethod lạ (không phải direct_fetch/search_index) → bị từ chối', () => {
    const manifest = buildManifest({
      targets: [
        buildTarget({
          source: { ...buildTarget().source, retrievalMethod: 'guess' as never },
        }),
      ],
    });

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('retrievalMethod'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 13. Checksum sai định dạng
  // -------------------------------------------------------------------------
  it.each(['not-a-hash', 'a'.repeat(63), 'A'.repeat(64), ''])(
    'checksum="%s" sai định dạng → bị từ chối',
    (badChecksum) => {
      const payload = buildPayload();
      const manifest = { payload, checksum: badChecksum };

      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('checksum'))).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // 14. Checksum mismatch (đúng định dạng, sai giá trị)
  // -------------------------------------------------------------------------
  it('checksum đúng ĐỊNH DẠNG nhưng KHÔNG khớp payload → bị từ chối', () => {
    const payload = buildPayload();
    const real = computeManifestChecksum(payload);
    // Đổi ký tự đầu sang một hex khác — vẫn đúng định dạng 64-hex, chỉ sai giá trị.
    const flipped = (real[0] === '0' ? '1' : '0') + real.slice(1);
    const manifest = { payload, checksum: flipped };

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 15. Không mutate input
  // -------------------------------------------------------------------------
  it('validateManifest KHÔNG mutate input (hợp lệ lẫn không hợp lệ)', () => {
    const validManifest = buildManifest();
    const validSnapshot = JSON.parse(JSON.stringify(validManifest));
    validateManifest(validManifest);
    expect(validManifest).toEqual(validSnapshot);

    const invalidManifest = buildManifest({ approval: { ...buildPayload().approval, approvedBy: '' } });
    const invalidSnapshot = JSON.parse(JSON.stringify(invalidManifest));
    validateManifest(invalidManifest);
    expect(invalidManifest).toEqual(invalidSnapshot);
  });

  // -------------------------------------------------------------------------
  // 17. Thứ tự MẢNG targets là dữ liệu, không phải nhiễu
  // -------------------------------------------------------------------------
  it('đổi THỨ TỰ các phần tử trong targets → checksum đổi', () => {
    const a = buildTarget({ slug: 'a' });
    const b = buildTarget({ slug: 'b' });
    const p1 = buildPayload({ targets: [a, b] });
    const p2 = buildPayload({ targets: [b, a] });

    expect(computeManifestChecksum(p2)).not.toBe(computeManifestChecksum(p1));
  });

  // -------------------------------------------------------------------------
  // Bảo vệ threat #11 — không chứa khoá giống secret
  // -------------------------------------------------------------------------
  it('payload chứa một khoá tên giống secret/credential → bị từ chối', () => {
    const payload = buildPayload();
    const withSecret = { ...payload, apiKey: 'shhh' } as unknown as PublishManifestPayloadV1;
    const manifest = { payload: withSecret, checksum: computeManifestChecksum(withSecret) };

    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('secret'))).toBe(true);
  });

  it('manifest hợp lệ dựng từ VERIFIED_FACTS_ROUND1 KHÔNG bị false-positive bởi bộ quét secret-key', () => {
    const payload = buildPayload({ targets: VERIFIED_FACTS_ROUND1 });
    const manifest: PublishManifestV1 = { payload, checksum: computeManifestChecksum(payload) };

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 18. File contract phải tự ghi rõ ranh giới authenticity — kiểm tra bằng đọc chính mã nguồn,
  // để việc này không lặng lẽ bị xoá trong một lần sửa sau này mà không ai để ý.
  // -------------------------------------------------------------------------
  it('mã nguồn contract phải nói rõ checksum KHÔNG phải xác thực danh tính (yêu cầu owner)', () => {
    const src = readFileSync(join(__dirname, 'publish-manifest.contract.ts'), 'utf8');

    expect(src).toMatch(/KHÔNG PHẢI XÁC THỰC DANH TÍNH/);
    expect(src).toMatch(/KHÔNG được dùng (làm căn cứ )?CẤP QUYỀN/);
  });

  // -------------------------------------------------------------------------
  // Cấu trúc export
  // -------------------------------------------------------------------------
  it('SUPPORTED_MANIFEST_VERSIONS chỉ chứa 1 (chưa có V2 thật)', () => {
    expect(SUPPORTED_MANIFEST_VERSIONS).toEqual([1]);
  });
});
