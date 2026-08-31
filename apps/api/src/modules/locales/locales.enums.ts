// Enum cluster `supported_locales` — khớp ADR-020 §"Decision 1" + hợp đồng 11_LANGUAGES.
// Locale set bản thân là DỮ LIỆU (owner decision #3): các enum này chỉ mô tả CƠ CHẾ (hướng viết,
// vai trò, trạng thái vòng đời), KHÔNG liệt kê mã locale nào — thêm một ngôn ngữ mới không bao giờ
// cần sửa các enum dưới đây.

export enum LocaleDirection {
  LTR = 'ltr',
  RTL = 'rtl',
}

// source_default: locale nguồn (đúng một, tiếng Việt — owner decision #2). target_primary: locale
// hoạt động thứ hai trở đi đã ACTIVE (tiếng Anh trước tiên). target_future: dành cho các locale còn
// PLANNED trong 11_LANGUAGES, chưa có role hoạt động.
export enum LocaleRole {
  SOURCE_DEFAULT = 'source_default',
  TARGET_PRIMARY = 'target_primary',
  TARGET_FUTURE = 'target_future',
}

// MAP-033: một locale PLANNED không bao giờ được coi là public/production — ràng buộc này được
// migration thực thi lại ở mức CHECK constraint (ck_locale_planned_not_public), enum này chỉ mô tả
// giá trị hợp lệ ở tầng ứng dụng.
export enum LocaleStatus {
  ACTIVE = 'active',
  PLANNED = 'planned',
  INACTIVE = 'inactive',
}
