/**
 * VERIFIED FACTS MANIFEST — Launch Batch Round 1 (2026-08-23).
 *
 * Các DỮ KIỆN đã được owner phê duyệt để xuất bản, kèm NGUỒN của từng dữ kiện. Tách khỏi cơ chế ghi
 * (`verified-facts-ingestion.service.ts`) có chủ đích — cùng khuôn `administrative-backfill.manifest.ts`:
 * dữ kiện phải review được trong code review mà không phải đọc logic.
 *
 * BỐN BẤT BIẾN:
 *
 *  1. KHÔNG dữ kiện nào ở đây nếu nguồn không nói ra nó TƯỜNG MINH. Thiếu thì BỎ TRỐNG, không đoán.
 *
 *  2. `retrievalMethod` PHẢI trung thực và ĐIỀU KHIỂN mức tin cậy ghi xuống CSDL:
 *     `direct_fetch` = đã mở và trích dẫn được trang → reliability 90 (mặc định official_website).
 *     `search_index` = domain chính thức nhưng trang trả HTTP 403 cho fetch tự động, nội dung đến
 *     từ chỉ mục tìm kiếm → reliability 75, confidence 70. KHÔNG được nâng bằng direct_fetch:
 *     `sources.reliability` + `source_attributions.confidence` + `sources.metadata.retrieval_method`
 *     là ba chỗ CSDL hiện có để diễn đạt "bằng chứng yếu hơn", dùng đúng chúng thay vì làm tròn lên.
 *
 *  3. KHÔNG ghi dữ liệu HÀNH CHÍNH (province/admin_area) từ nguồn doanh nghiệp. Hai lý do độc lập:
 *     (a) Bằng chứng thực tế 2026-08-23: website CHÍNH THỨC của Sailing Club Phú Quốc đăng
 *         "Duong To ward, Phu Quoc City, Kien Province" — cả hai tên đều đã bị thay thế. Nguồn
 *         doanh nghiệp đáng tin cho GIỜ/ĐIỆN THOẠI, KHÔNG đáng tin cho ĐỊA GIỚI HÀNH CHÍNH.
 *     (b) Kiến trúc hiện tại ĐÃ CÓ đường thẩm quyền cao hơn cho đúng việc này:
 *         `administrative-backfill.manifest.ts` dùng `SourceType.GOVERNMENT` (Nghị quyết
 *         1654/NQ-UBTVQH15, reliability 95) và `sun-world-hon-thom` NẰM TRONG danh sách đó.
 *     Việc sunworld.vn cũng ghi "Đặc khu Phú Quốc, An Giang" là CHỨNG THỰC ĐỘC LẬP cho văn bản
 *     pháp luật — ghi lại như một quan sát (`corroborations`), KHÔNG dùng làm nguồn của dữ kiện.
 *
 *  4. Dữ kiện chỉ có MỘT PHẦN thì KHÔNG dựng thành trường có cấu trúc. Sun World: trang chỉ nói
 *     "Đóng cửa lúc 17:00", KHÔNG nói mấy giờ mở. Không có ô nào trong schema `opening_hours` diễn
 *     đạt được "biết giờ đóng, chưa biết giờ mở" mà không bịa giờ mở — nên `openingHours` để `null`
 *     và dữ kiện một-phần đó được lưu ở `partialFactNote` (đi vào `source_attributions.note`,
 *     KHÔNG vào `places.opening_hours`). Nhờ vậy audit VẪN báo `opening_hours` là MISSING cho Sun
 *     World — đúng, vì ta thật sự chưa biết đủ giờ mở cửa.
 */

export type RetrievalMethod = 'direct_fetch' | 'search_index';

/** Mức tin cậy suy ra TỪ cách lấy được nội dung — xem bất biến #2. */
export const RELIABILITY_BY_RETRIEVAL: Readonly<Record<RetrievalMethod, number>> = {
  direct_fetch: 90,
  search_index: 75,
};
export const CONFIDENCE_BY_RETRIEVAL: Readonly<Record<RetrievalMethod, number>> = {
  direct_fetch: 90,
  search_index: 70,
};

export interface VerifiedFactSource {
  /** Khoá dedupe (SourcesRepository.findByTypeAndExternalRef). */
  externalRef: string;
  title: string;
  url: string;
  publisher: string;
  language: string;
  /** Thời điểm ta THỰC SỰ lấy nội dung — không phải ngày trang được xuất bản. */
  retrievedAt: string;
  retrievalMethod: RetrievalMethod;
}

export interface VerifiedContactFact {
  contactType: 'PHONE' | 'HOTLINE';
  value: string;
  label: string | null;
  isPrimary: boolean;
  /** Trích dẫn nguyên văn phần trang nói ra số này. */
  quote: string;
}

export interface VerifiedFactTarget {
  slug: string;
  source: VerifiedFactSource;
  contacts: VerifiedContactFact[];
  /** `null` = nguồn KHÔNG nêu đủ để dựng lịch (bất biến #4). */
  openingHours: Record<string, unknown> | null;
  openingHoursQuote: string | null;
  /**
   * Dữ kiện MỘT PHẦN về giờ giấc: lưu vào `source_attributions.note` cho trường `opening_hours`,
   * KHÔNG ghi vào `places.opening_hours`. Giữ được provenance mà không tạo khẳng định sai.
   */
  partialFactNote: string | null;
  /** Quan sát chứng thực nguồn khác — KHÔNG ghi thành dữ kiện (bất biến #3). */
  corroborations: string[];
  notCovered: string[];
}

export const VERIFIED_FACTS_ROUND1: readonly VerifiedFactTarget[] = [
  {
    slug: 'sun-world-hon-thom',
    source: {
      externalRef: 'sunworld.vn/hon-thom',
      title: 'Sun World Hòn Thơm — trang chính thức',
      url: 'https://sunworld.vn/hon-thom',
      publisher: 'Sun World (Sun Group)',
      language: 'vi',
      retrievedAt: '2026-08-23T00:00:00.000Z',
      retrievalMethod: 'direct_fetch',
    },
    contacts: [
      { contactType: 'PHONE', value: '0886 045 888', label: 'Hòn Thơm', isPrimary: true, quote: '0886 045 888' },
      { contactType: 'HOTLINE', value: '1800 1000', label: 'Tổng đài Sun World', isPrimary: false, quote: '1800 1000' },
    ],
    openingHours: null,
    openingHoursQuote: null,
    partialFactNote:
      'Nguồn chính thức xác nhận ĐÓNG CỬA lúc 17:00 ("Đang mở cửa. Đóng cửa lúc 17:00"). Giờ MỞ cửa ' +
      'và lịch theo thứ KHÔNG được nêu — chưa đủ để dựng opening_hours, giữ MISSING.',
    corroborations: [
      'Trang ghi địa chỉ "Đặc khu Phú Quốc, An Giang" — CHỨNG THỰC ĐỘC LẬP cho Nghị quyết ' +
        '1654/NQ-UBTVQH15. KHÔNG ghi province/admin_area từ nguồn này: đường thẩm quyền cho dữ liệu ' +
        'hành chính là administrative-backfill.manifest.ts (SourceType.GOVERNMENT, reliability 95), ' +
        'và slug này đã nằm trong danh sách đó.',
    ],
    notCovered: ['opening_hours (chỉ có giờ đóng)', 'price_range / giá vé — NOT STATED trên trang'],
  },
  {
    slug: 'vinwonders-phu-quoc',
    source: {
      externalRef: 'vinwonders.com/phu-quoc',
      title: 'VinWonders Phú Quốc — giờ mở cửa & liên hệ (trang chính thức)',
      url: 'https://vinwonders.com/vi/wonderpedia/news/vinwonders-phu-quoc-gio-mo-cua/',
      publisher: 'VinWonders (Vingroup)',
      language: 'vi',
      retrievedAt: '2026-08-23T00:00:00.000Z',
      // vinwonders.com trả HTTP 403 cho mọi fetch tự động (đã thử cả /vi/ lẫn /en/). Owner phê
      // duyệt dùng nguồn này, nhưng mức tin cậy phải phản ánh đúng cách lấy được — xem bất biến #2.
      retrievalMethod: 'search_index',
    },
    contacts: [
      {
        contactType: 'HOTLINE',
        value: '1900 6677',
        label: 'Tổng đài VinWonders (nhánh 2)',
        isPrimary: true,
        quote: 'liên hệ bộ phận chăm sóc khách hàng của VinWonders Phú Quốc qua số điện thoại 1900 6677, nhánh 2',
      },
    ],
    openingHours: {
      timezone: 'Asia/Ho_Chi_Minh',
      is_24h: false,
      regular: {
        mon: [{ open: '09:00', close: '19:30' }],
        tue: [{ open: '09:00', close: '19:30' }],
        wed: [{ open: '09:00', close: '19:30' }],
        thu: [{ open: '09:00', close: '19:30' }],
        fri: [{ open: '09:00', close: '19:30' }],
        sat: [{ open: '09:00', close: '19:30' }],
        sun: [{ open: '09:00', close: '19:30' }],
      },
    },
    openingHoursQuote: 'Công viên mở cửa hằng ngày từ 09:00 – 19:30',
    partialFactNote: null,
    corroborations: [],
    notCovered: [
      'giờ riêng của từng phân khu (Thế giới phiêu lưu 10:00–18:00, Khu làng bí mật 10:00–17:30, ' +
        'Thế giới lốc xoáy 10:00–17:30) — schema opening_hours KHÔNG có khái niệm phân khu con',
      'giá vé',
    ],
  },
] as const;
