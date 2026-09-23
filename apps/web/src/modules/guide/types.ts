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

export interface RichTextParagraph {
  type: 'p' | 'list';
  text?: string;
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
  imageUrl?: string;
  attribution?: string | null;
  licenseUrl?: string | null;
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
  status: GuideArticleStatus;
  contentVersion: number;
  updatedAt: string;
  publishedAt: string | null;
  blocks: GuideBlock[];
}
