export enum GuideArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum GuideBlockType {
  SECTION_HEADING = 'section_heading',
  RICH_TEXT = 'rich_text',
  PLACE_COLLECTION = 'place_collection',
  CALLOUT = 'callout',
  FAQ = 'faq',
  IMAGE_WITH_RIGHTS = 'image_with_rights',
}

// Chuyên mục cẩm nang (2026-09-29) — chủ đề bài viết, KHÁC `categories` (loại địa điểm: nhà hàng/
// khách sạn/bãi biển...). Một tập đóng nhỏ do đội nội dung quản lý, cùng tiền lệ
// GuideArticleStatus/GuideBlockType (Postgres enum thật, không phải bảng riêng) — khối lượng bài
// cẩm nang nhỏ, không cần một bảng categories thứ hai chỉ để chứa vài chục dòng. `tags` (xem
// entity) NGƯỢC LẠI là mảng chuỗi tự do — không đóng thành enum vì thẻ cần mở rộng không cần
// migration.
export enum GuideArticleCategory {
  KINH_NGHIEM = 'kinh_nghiem',
  AM_THUC = 'am_thuc',
  LUU_TRU = 'luu_tru',
  DI_CHUYEN = 'di_chuyen',
  LICH_TRINH = 'lich_trinh',
  VUI_CHOI = 'vui_choi',
}
