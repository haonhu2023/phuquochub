// Hợp đồng response cluster Place (khớp api/openapi.yaml PlaceCard/Place) — nguồn sự thật
// DUY NHẤT cho cả apps/api và apps/web. Trước đây mỗi bên tự khai báo một bản (GAP-11).
//
// Enum biểu diễn bằng UNION CHUỖI, không phải TS enum, vì hai lý do:
//  1. type-only ⇒ web không phải nạp object enum runtime vào bundle client;
//  2. thành viên string enum của apps/api (place.enums.ts) GÁN ĐƯỢC vào union tương ứng,
//     nên backend vẫn dùng enum của mình mà không cần ép kiểu.
// Giá trị phải khớp đúng place.enums.ts và các ENUM trong migration InitPlaces.

/** Toạ độ trả về cho client (đã trích từ geography(Point,4326)). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type PlaceStatusValue = 'draft' | 'pending' | 'published' | 'archived';

export type PriceRangeValue = 'free' | 'low' | 'mid' | 'high';

export type VerificationStatusValue =
  | 'pending'
  | 'verified'
  | 'official'
  | 'community_verified'
  | 'expired'
  | 'rejected';

export type FaqStatusValue = 'pending' | 'published' | 'hidden';

/**
 * Thẻ Place cho danh sách/bản đồ/tìm kiếm.
 *
 * F-17 đã được xử lý theo quyết định OD-F-17 (2026-07-23):
 *  - `status` GIỮ LẠI và nay đã được khai trong openapi.yaml `PlaceCard`. Đây là trạng thái
 *    XUẤT BẢN (không phải giờ mở cửa), dùng đúng enum PlaceStatus vốn đã công khai qua schema
 *    `Place`; runtime vẫn luôn phát trường này nên payload không đổi.
 *  - `score` ĐÃ GỠ khỏi hợp đồng công khai: không endpoint nào từng phát nó qua PlaceCard
 *    (`toPlaceCard` không hề nhận row có score), và một con số không định nghĩa được
 *    (thang đo, khoảng giá trị, tính ổn định, ngữ nghĩa null) thì không được công bố.
 *    Điểm ts_rank NỘI BỘ vẫn còn ở `PlaceCardRow.score` và được SearchService dùng cho
 *    hợp đồng `SearchResult` riêng — nó có mục đích xếp hạng rõ ràng và không rò ra PlaceCard.
 *    Muốn công khai score trong tương lai cần một quyết định owner RIÊNG.
 */
export interface PlaceCard {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  short_description: string | null;
  price_range: PriceRangeValue | null;
  cover_image_url: string | null;
  /** numeric(2,1) ở DB; mapper đã đổi sang number trước khi trả về. */
  rating_avg: number | null;
  rating_count: number;
  verification_status: VerificationStatusValue;
  status: PlaceStatusValue;
  location: GeoPoint;
  /** Chỉ có ở kết quả /geo/nearby (mét). */
  distance_m?: number;
}

export interface PlaceContact {
  id: string;
  contact_type: string;
  value: string;
  label: string | null;
  is_primary: boolean;
  verification_status: VerificationStatusValue;
  display_order: number;
}

export interface PlacePrice {
  id: string;
  service_name: string;
  amount: number;
  currency: string;
  unit: string | null;
  is_free: boolean;
  valid_from: string | null;
  valid_to: string | null;
  verification_status: VerificationStatusValue;
}

/**
 * Cơ sở pháp lý để hiển thị một tệp media (khớp enum DB `media_license_type`).
 * `null` ở `PlaceMedia.license_type` nghĩa là CHƯA AI XÉT — khác `'unknown'` (đã xét, không truy
 * được nguồn gốc).
 */
export type MediaLicenseTypeValue =
  | 'owner_provided'
  | 'user_submitted'
  | 'open_license'
  | 'public_domain'
  | 'stock_license'
  | 'unknown';

export interface PlaceMedia {
  id: string;
  type: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  alt_text: string | null;
  status: string;
  /**
   * Dòng ghi công phải hiển thị cạnh ảnh khi giấy phép yêu cầu (CC BY/BY-SA).
   *
   * Ba trường licence này thuộc hợp đồng CÔNG KHAI có chủ ý — không phải dữ liệu nội bộ: với
   * `license_type = 'open_license'` thì hiển thị credit + link giấy phép LÀ điều kiện để được
   * dùng ảnh. Client không đọc được chúng thì không thể tuân thủ.
   */
  attribution: string | null;
  license_type: MediaLicenseTypeValue | null;
  license_url: string | null;
}

export interface PlaceFaq {
  id: string;
  question: string;
  answer: string;
  sort_order: number | null;
  is_ai_generated: boolean;
  status: FaqStatusValue;
}

/**
 * Một nguồn đã được đối chiếu cho MỘT trường cụ thể của Place (Place Trust & Freshness Surface).
 *
 * Đọc từ `source_attributions(entity_type='place_field')` + `sources` — hai bảng đã tồn tại
 * (ADR-008/source.md §5), KHÔNG phải subsystem mới. `field` là tên cột đã đối chiếu (vd
 * `province`, `admin_area`); `null` nếu attribution không gắn field cụ thể. Mảng RỖNG (không phải
 * field này vắng mặt trên `PlaceDetail`) nghĩa là "chưa trường nào của place này được đối chiếu
 * nguồn" — client không được suy ra "đã kiểm tra nhưng không có nguồn".
 */
export interface PlaceTrustSource {
  field: string | null;
  publisher: string | null;
  title: string | null;
  url: string | null;
  retrieved_at: string | null;
}

/** Một khung giờ trong ngày. Cho phép khung qua đêm (22:00–02:00) — KHÔNG ép open < close. */
export interface OpeningHoursRange {
  open: string;
  close: string;
}

/** Ngày đặc biệt / lễ tết: hoặc đóng cửa, hoặc có khung giờ riêng. */
export interface OpeningHoursException {
  date: string;
  closed?: boolean;
  hours?: OpeningHoursRange[];
  note?: string;
}

/**
 * Cấu trúc `opening_hours` theo SSOT docs/data/modules/places.md §4.
 *
 * MỌI trường đều tùy chọn: places.md §4 không đánh dấu trường nào bắt buộc, và PLACE-006 đã
 * chốt điều đó ở tầng validation ghi (`{}` là hợp lệ). Kiểu này PHẢI không chặt hơn validator,
 * nếu không phía đọc sẽ mô tả sai dữ liệu mà phía ghi chấp nhận.
 *
 * Index signature giữ cho khoá lạ vẫn hợp lệ — khớp openapi.yaml:1777
 * (`additionalProperties: true`) và đúng quyết định số 1 của common/opening-hours.ts.
 * Ngày trong tuần dùng mã 3 chữ: mon/tue/wed/thu/fri/sat/sun; mảng rỗng = đóng cửa.
 */
export interface OpeningHours {
  timezone?: string;
  regular?: Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', OpeningHoursRange[]>>;
  is_24h?: boolean;
  exceptions?: OpeningHoursException[];
  note?: string;
  [key: string]: unknown;
}

/**
 * Place chi tiết — dạng ĐÃ QUA JSON (những gì client nhận).
 *
 * `created_at`/`updated_at` là chuỗi ISO: JSON không có kiểu Date. Bên apps/api,
 * toPlaceDetail() trả về Date và được serialize thành chuỗi ở tầng HTTP, nên kiểu trả về nội
 * bộ của mapper KHÁC kiểu trên dây — chủ ý, không phải trùng lặp. Xem finding F-17.
 */
export interface PlaceDetail extends PlaceCard {
  /**
   * Slug danh mục (`categories.slug`, vd 'attraction'/'beach'/'hotel'). CHỈ có ở chi tiết,
   * không có ở `PlaceCard`: `category_id` là UUID mà client không dùng được nếu không gọi
   * thêm `GET /categories`, trong khi trang chi tiết cần biết mình thuộc nhóm nào để điều
   * hướng về đúng trang duyệt. `null` nếu danh mục đã bị xoá khỏi bảng `categories`.
   */
  category_slug: string | null;
  address: string | null;
  /** NHÃN KHU VỰC (vd `Dương Đông`), KHÔNG phải đơn vị hành chính — xem `admin_area`. */
  ward: string | null;
  /** Tỉnh/thành hiện hành (vd `An Giang`) → schema.org `addressRegion`. `null` = chưa xác minh. */
  province: string | null;
  /** Đơn vị hành chính cấp xã hiện hành (vd `Đặc khu Phú Quốc`) → `addressLocality`. */
  admin_area: string | null;
  description: string | null;
  opening_hours: OpeningHours | null;
  osm_id: number | null;
  created_at: string;
  updated_at: string;
  /**
   * Lần cuối chuyển sang trạng thái tin cậy (`verified`/`official`/`community_verified`).
   * `null` = chưa từng đạt trạng thái tin cậy — KHÔNG suy ra ngày nào khi thiếu. Có thể vẫn mang
   * một ngày trong quá khứ dù `verification_status` hiện tại đã `expired`: đó là ngày lần xác
   * minh GẦN NHẤT còn hiệu lực, không bị xoá khi hết hạn (đúng ý nghĩa "kiểm tra lần cuối").
   */
  verified_at: string | null;
  contacts: PlaceContact[];
  prices: PlacePrice[];
  media: PlaceMedia[];
  faqs: PlaceFaq[];
  /** Nguồn đã đối chiếu cho các trường của place này. Mảng rỗng = chưa trường nào được đối chiếu. */
  trust_sources: PlaceTrustSource[];
}
