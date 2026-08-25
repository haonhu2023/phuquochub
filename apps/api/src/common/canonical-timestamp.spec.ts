import { CANONICAL_UTC_TIMESTAMP_RE, isValidCanonicalTimestamp } from './canonical-timestamp';

// Trích xuất (2026-08-25, Slice 0.5D1) từ publish-manifest.contract.ts — xem comment trong
// canonical-timestamp.ts. Trước đây hành vi này chỉ được kiểm GIÁN TIẾP qua
// publish-manifest.contract.spec.ts (gọi validateManifest() rồi soi approval.approvedAt/
// source.retrievedAt). File này kiểm TRỰC TIẾP hàm thuần, không qua bất kỳ contract nào — cùng
// các trường hợp rollover/leap-year đã ghi trong comment gốc, cộng test hình dạng bổ sung.
describe('isValidCanonicalTimestamp', () => {
  it('canonical hợp lệ (có mili-giây, hậu tố Z hoa) → true', () => {
    expect(isValidCanonicalTimestamp('2026-08-24T10:00:00.000Z')).toBe(true);
  });

  it('29/02 của năm NHUẬN THẬT (2024) → true', () => {
    expect(isValidCanonicalTimestamp('2024-02-29T00:00:00.000Z')).toBe(true);
  });

  it('không phải string → false', () => {
    expect(isValidCanonicalTimestamp(123)).toBe(false);
    expect(isValidCanonicalTimestamp(null)).toBe(false);
    expect(isValidCanonicalTimestamp(undefined)).toBe(false);
    expect(isValidCanonicalTimestamp({})).toBe(false);
  });

  it('chuỗi rỗng → false', () => {
    expect(isValidCanonicalTimestamp('')).toBe(false);
  });

  it('thiếu mili-giây → false (không phải một biến thể được chấp nhận)', () => {
    expect(isValidCanonicalTimestamp('2026-08-24T10:00:00Z')).toBe(false);
  });

  it('offset +HH:MM thay vì Z → false', () => {
    expect(isValidCanonicalTimestamp('2026-08-24T10:00:00.000+07:00')).toBe(false);
  });

  it('z thường thay vì Z hoa → false (hình dạng phải khớp CHÍNH XÁC)', () => {
    expect(isValidCanonicalTimestamp('2026-08-24T10:00:00.000z')).toBe(false);
  });

  it('không phải ngày (chuỗi bất kỳ) → false', () => {
    expect(isValidCanonicalTimestamp('không phải ngày')).toBe(false);
  });

  it('tháng 13 → false (Date.parse tự bắt được, không cần round-trip)', () => {
    expect(isValidCanonicalTimestamp('2026-13-01T00:00:00.000Z')).toBe(false);
  });

  // Ba trường hợp ROLLOVER — lý do hàm này tồn tại thay vì chỉ dùng Number.isNaN(Date.parse()).
  it.each([
    ['2026-02-30T00:00:00.000Z', 'tháng 2/2026 chỉ có 28 ngày, rollover thành 2026-03-02'],
    ['2025-02-29T00:00:00.000Z', '2025 KHÔNG nhuận, rollover thành 2025-03-01'],
    ['2026-04-31T00:00:00.000Z', 'tháng 4 chỉ có 30 ngày, rollover thành 2026-05-01'],
  ])('ngày KHÔNG tồn tại trên lịch "%s" (%s) → false dù Date.parse không NaN', (bad) => {
    expect(isValidCanonicalTimestamp(bad)).toBe(false);
  });

  it('không mutate/chuẩn hoá input — chỉ trả boolean, không có giá trị "đã sửa" nào lộ ra', () => {
    const bad = '2026-02-30T00:00:00.000Z';
    const result = isValidCanonicalTimestamp(bad);
    expect(result).toBe(false);
    expect(bad).toBe('2026-02-30T00:00:00.000Z'); // input string bất biến (JS string vốn immutable)
  });

  it('tất định, không phụ thuộc timezone máy chạy (buộc hậu tố Z ở regex)', () => {
    // Không có cách trực tiếp đổi TZ trong Jest ở đây, nhưng khẳng định regex buộc UTC-only,
    // nên bất kỳ giá trị "hợp lệ" nào cũng đã tự loại trừ phụ thuộc múi giờ theo thiết kế.
    expect(CANONICAL_UTC_TIMESTAMP_RE.test('2026-08-24T10:00:00.000Z')).toBe(true);
    expect(CANONICAL_UTC_TIMESTAMP_RE.source).toContain('Z$');
  });
});
