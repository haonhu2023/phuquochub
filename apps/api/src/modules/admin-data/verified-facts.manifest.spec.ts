import {
  CONFIDENCE_BY_RETRIEVAL,
  RELIABILITY_BY_RETRIEVAL,
  VERIFIED_FACTS_ROUND1,
} from './verified-facts.manifest';
import { canonicalJson } from './verified-facts-ingestion.service';

// Regression cho §5 mục 6–7: provenance của Sun World và evidence strength của VinWonders phải
// đúng NHƯ research report, không được "làm tròn lên".

describe('VERIFIED_FACTS_ROUND1 — provenance & evidence strength', () => {
  const sunWorld = VERIFIED_FACTS_ROUND1.find((t) => t.slug === 'sun-world-hon-thom')!;
  const vinWonders = VERIFIED_FACTS_ROUND1.find((t) => t.slug === 'vinwonders-phu-quoc')!;

  it('manifest chỉ chứa đúng 2 place đã được owner phê duyệt', () => {
    expect(VERIFIED_FACTS_ROUND1).toHaveLength(2);
    expect(VERIFIED_FACTS_ROUND1.map((t) => t.slug).sort()).toEqual([
      'sun-world-hon-thom',
      'vinwonders-phu-quoc',
    ]);
  });

  // --- (6) Sun World: provenance ---------------------------------------------------------
  describe('Sun World — provenance', () => {
    it('nguồn là trang chính thức, lấy bằng direct_fetch', () => {
      expect(sunWorld.source.url).toBe('https://sunworld.vn/hon-thom');
      expect(sunWorld.source.publisher).toBe('Sun World (Sun Group)');
      expect(sunWorld.source.retrievalMethod).toBe('direct_fetch');
    });

    it('giữ đúng 2 số điện thoại đã phê duyệt, mỗi số có trích dẫn', () => {
      expect(sunWorld.contacts.map((c) => c.value)).toEqual(['0886 045 888', '1800 1000']);
      for (const c of sunWorld.contacts) {
        expect(c.quote).toContain(c.value);
      }
    });

    // Bất biến #4 của manifest: biết giờ ĐÓNG nhưng không biết giờ MỞ ⇒ KHÔNG dựng opening_hours.
    it('KHÔNG dựng opening_hours vì nguồn chỉ nêu giờ đóng — dữ kiện một phần đi vào partialFactNote', () => {
      expect(sunWorld.openingHours).toBeNull();
      expect(sunWorld.partialFactNote).toContain('17:00');
      expect(sunWorld.partialFactNote).toMatch(/giờ MỞ cửa .*KHÔNG được nêu/i);
    });

    // Bất biến #3: website doanh nghiệp KHÔNG phải nguồn của dữ liệu hành chính.
    it('dữ kiện hành chính chỉ là corroboration, KHÔNG phải một fact được ghi', () => {
      expect(sunWorld.corroborations.join(' ')).toContain('Đặc khu Phú Quốc');
      expect(sunWorld.corroborations.join(' ')).toContain('administrative-backfill.manifest.ts');
      // Không có trường nào trong manifest cho phép ghi province/admin_area.
      expect(Object.keys(sunWorld)).not.toContain('province');
      expect(Object.keys(sunWorld)).not.toContain('adminArea');
    });
  });

  // --- (7) VinWonders: evidence strength -------------------------------------------------
  describe('VinWonders — evidence strength', () => {
    it('đánh dấu search_index (trang trả 403 cho direct fetch)', () => {
      expect(vinWonders.source.retrievalMethod).toBe('search_index');
      expect(vinWonders.source.url).toContain('vinwonders.com');
    });

    it('search_index có reliability/confidence THẤP HƠN direct_fetch — không làm tròn lên', () => {
      expect(RELIABILITY_BY_RETRIEVAL.search_index).toBeLessThan(RELIABILITY_BY_RETRIEVAL.direct_fetch);
      expect(CONFIDENCE_BY_RETRIEVAL.search_index).toBeLessThan(CONFIDENCE_BY_RETRIEVAL.direct_fetch);
    });

    it('opening_hours dựng đủ 7 ngày 09:00–19:30 đúng trích dẫn nguồn', () => {
      const regular = vinWonders.openingHours!.regular as Record<string, Array<{ open: string; close: string }>>;
      expect(Object.keys(regular).sort()).toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);
      for (const day of Object.values(regular)) {
        expect(day).toEqual([{ open: '09:00', close: '19:30' }]);
      }
      expect(vinWonders.openingHoursQuote).toContain('09:00 – 19:30');
    });

    it('giờ phân khu con KHÔNG bị nhét vào regular (schema không có khái niệm đó)', () => {
      expect(vinWonders.notCovered.join(' ')).toContain('phân khu');
      expect(JSON.stringify(vinWonders.openingHours)).not.toContain('17:30');
    });
  });
});

// canonicalJson là thứ giữ cho ingestion idempotent — Postgres jsonb chuẩn hoá thứ tự khoá.
describe('canonicalJson — nền tảng của tính idempotent', () => {
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
