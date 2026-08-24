import { canonicalJson } from './canonical-json';

// Di chuyển nguyên vẹn từ verified-facts.manifest.spec.ts (2026-08-24, Slice 0.5B) khi hàm
// canonicalJson() dời sang common/ — xem comment trong canonical-json.ts vì sao. Bốn test dưới
// đây là bằng chứng chống regression: publish-manifest.contract.ts giờ cũng phụ thuộc đúng hành
// vi này để tính checksum, nên đây không còn là test riêng của ingestion nữa mà là hợp đồng
// hành vi CHUNG cho mọi nơi dùng canonicalJson().
describe('canonicalJson — nền tảng của tính idempotent (và của checksum manifest)', () => {
  it('hai object khác thứ tự khoá cho ra CÙNG chuỗi', () => {
    const manifestOrder = { timezone: 'Asia/Ho_Chi_Minh', is_24h: false, regular: { mon: [], tue: [] } };
    const postgresOrder = { is_24h: false, regular: { tue: [], mon: [] }, timezone: 'Asia/Ho_Chi_Minh' };
    expect(canonicalJson(manifestOrder)).toBe(canonicalJson(postgresOrder));
  });

  it('khác GIÁ TRỊ thì vẫn khác chuỗi (không chuẩn hoá quá tay)', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it('giữ nguyên thứ tự MẢNG (thứ tự phần tử là dữ liệu, không phải nhiễu)', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('null/undefined không làm sập', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });
});
