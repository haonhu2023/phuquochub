// Enum cluster WikiRevision — khớp data-dictionary §4 (`wiki_revisions`) + ADR-014.
// Thực thể phiên bản DUY NHẤT (retire `place_revisions`), polymorphic app-level.

// entity_type: giai đoạn đầu chỉ `place`; mở rộng `topic, area, business…`
// = THÊM giá trị enum (ADR-014) — không đổi schema. Chưa thêm khi entity đích chưa tồn tại.
//
// PLACE_TRANSLATION (ADR-020): mỗi bản dịch/route/seo đa ngôn ngữ là một entity riêng theo dõi
// revision qua bảng wiki_revisions dùng chung — KHÔNG tạo bảng revision riêng cho i18n.
export enum RevisionEntityType {
  PLACE = 'place',
  PLACE_TRANSLATION = 'place_translation',
}

// Kênh kỹ thuật phát sinh revision (khác `source_attributions` = bằng chứng nội dung).
export enum RevisionOrigin {
  COMMUNITY_EDIT = 'community_edit',
  OWNER_UPDATE = 'owner_update',
  MODERATOR_EDIT = 'moderator_edit',
  OSM_SYNC = 'osm_sync',
  AI_GENERATION = 'ai_generation',
  IMPORT = 'import',
}

// Vòng đời duyệt phiên bản (WF-06/07/08/09).
export enum RevisionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVERTED = 'reverted',
}
