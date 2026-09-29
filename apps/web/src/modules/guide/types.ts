// Guide CMS model (guide-articles API) — the ONLY guide data model. Candidate A (an in-repo seed,
// no CMS/API) was retired 2026-09-22 (G-A, launch-readiness pass): the public guide route now
// always reads GET /guide-articles/:slug (GuideArticlesService.getPublished()), never a seed file.

export interface FaqItem {
  question: string;
  answer: string;
}

// `heading` optional — most callers let the section wrapper own the heading; the editor form
// (GuideArticleEditorView) leaves it blank by default.
export interface PlaceCollectionContent {
  heading?: string;
  placeSlugs: string[];
  emptyStateText: string;
}

export type GuideArticleStatus = 'draft' | 'published';

/** Real Media.status values (media.enums.ts MediaStatus) — surfaced 2026-09-27 so the editor can
 *  tell "still pending review" apart from "broken image": the resolved `imageUrl`/`heroImageUrl`
 *  are built from a stable path that 404s for anything not `published`. */
export type MediaModerationStatus = 'pending' | 'published' | 'hidden' | 'rejected';

export type GuideBlockType =
  | 'section_heading'
  | 'rich_text'
  | 'place_collection'
  | 'callout'
  | 'faq'
  | 'image_with_rights';

export interface SectionHeadingContent {
  text: string;
}

/** Một đoạn định dạng trong dòng (2026-09-29) — cấu trúc, KHÔNG phải một token markup cần diễn
 *  giải ở tầng đọc: renderer chỉ bọc `text` bằng `<strong>`/`<em>` theo hai cờ này. */
export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface RichTextParagraph {
  type: 'p' | 'list' | 'heading2' | 'heading3' | 'blockquote';
  /** Bài cũ (trước 2026-09-29) chỉ có trường này, không có `runs` — vẫn hợp lệ nguyên vẹn. */
  text?: string;
  /** Có mặt khi đoạn văn có định dạng đậm/nghiêng trong dòng; khi có, ưu tiên hơn `text` khi render. */
  runs?: RichTextRun[];
  items?: string[];
}

export interface RichTextContent {
  paragraphs: RichTextParagraph[];
}

export interface CalloutContent {
  variant: 'info' | 'warning' | 'tip';
  text: string;
}

export interface FaqContent {
  items: FaqItem[];
}

export interface ImageWithRightsContent {
  mediaId: string;
  caption?: string;
  /** Văn bản thay thế cho screen reader — tách khỏi `caption` (chú thích hiển thị công khai).
   *  Thêm 2026-09-27, JSONB nên không cần migration. Renderer dùng `alt || caption` để ảnh cũ
   *  (chưa từng có `alt`) vẫn có văn bản thay thế hợp lý thay vì rỗng. */
  alt?: string | null;
  imageUrl?: string;
  attribution?: string | null;
  licenseUrl?: string | null;
  /** Real Media.status, resolved by the API — see GuideArticlesService.resolveImageBlockContent()'s
   *  comment. `undefined` for content that predates this field (treat as unknown, not "fine"). */
  mediaStatus?: MediaModerationStatus | null;
}

export interface GuideBlock {
  id: string;
  position: number;
  blockType: GuideBlockType;
  content:
    | SectionHeadingContent
    | RichTextContent
    | PlaceCollectionContent
    | CalloutContent
    | FaqContent
    | ImageWithRightsContent
    | Record<string, unknown>;
  needsDecision: boolean;
  decisionNote: string | null;
}

export interface GuideArticleDetail {
  id: string;
  slug: string;
  locale: string;
  title: string;
  intro: string | null;
  heroMediaId: string | null;
  heroImageUrl: string | null;
  heroMediaStatus?: MediaModerationStatus | null;
  status: GuideArticleStatus;
  contentVersion: number;
  updatedAt: string;
  publishedAt: string | null;
  blocks: GuideBlock[];
}
