export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum MediaProvider {
  UPLOAD = 'upload',
  YOUTUBE = 'youtube',
  VIMEO = 'vimeo',
}

export enum MediaStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
  REJECTED = 'rejected',
}

/**
 * Cơ sở pháp lý để PhuQuocHub hiển thị MỘT tệp (Place Information Foundation, 2026-08-18).
 *
 * Đây KHÔNG phải "nguồn thông tin" — nguồn đã có `sources` + `source_attributions` (media nằm sẵn
 * trong `SOURCE_ATTRIBUTION_ENTITY_TYPES`). Enum này trả lời một câu khác: *được phép dùng tệp này
 * theo cơ sở nào*. Giấy phép phải ở TỪNG TỆP chứ không ở `sources.license`, vì `sources` là danh
 * mục nguồn dùng lại — hai ảnh cùng từ Wikimedia Commons có thể mang CC BY-SA 2.0 và CC0.
 *
 * NULL (chưa xét) khác `UNKNOWN` (đã xét, không truy được nguồn gốc). Đừng dùng `UNKNOWN` làm mặc
 * định: nó khẳng định là đã có người kiểm tra.
 */
export enum MediaLicenseType {
  /** Chủ cơ sở / đơn vị vận hành cung cấp trực tiếp — cơ sở là sự đồng ý của họ. */
  OWNER_PROVIDED = 'owner_provided',
  /** Người dùng tải lên — cơ sở là giấy phép họ cấp cho nền tảng qua điều khoản sử dụng. */
  USER_SUBMITTED = 'user_submitted',
  /** Creative Commons và tương đương. BẮT BUỘC `attribution` + `licenseUrl` (CHECK ở CSDL). */
  OPEN_LICENSE = 'open_license',
  /** Không còn quyền tác giả / đã hiến tặng công cộng (CC0, PD) — không đòi ghi công. */
  PUBLIC_DOMAIN = 'public_domain',
  /** Ảnh mua theo hợp đồng stock — cơ sở là hợp đồng đã trả phí, thường không hiển thị credit. */
  STOCK_LICENSE = 'stock_license',
  /** Đã xét nhưng không truy được nguồn gốc/quyền → KHÔNG được xuất bản. */
  UNKNOWN = 'unknown',
}
