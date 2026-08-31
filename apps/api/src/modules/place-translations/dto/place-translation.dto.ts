import { TextFormat, TranslationMethod } from '../place-translations.enums';
import { RevisionOrigin } from '../../revisions/revision.enums';

// Hợp đồng gọi hàm nội bộ (không có controller ở giai đoạn nền tảng — xem place-translations.module.ts).
// Một item = một field/locale. `sourceText` là nội dung nguồn TẠI THỜI ĐIỂM dịch (dùng để tính
// source_text_hash qua computeSourceTextHash() trong service — caller không tự tính hash, tránh
// một caller khai khống hash không khớp text thật).
export interface PublishTranslationItem {
  fieldKey: string;
  localeCode: string;
  sourceLocaleCode: string;
  translatedText: string;
  sourceText: string;
  textFormat?: TextFormat;
  translationMethod: TranslationMethod;
  translationStatus: string;
  humanReviewStatus: string;
  qualityGate: string;
  isPublic: boolean;
  isProductionData: boolean;
  productionEligible: boolean;
  sourceId?: string | null;
  evidenceId?: string | null;
  importBatchId?: string | null;
}

// Một bundle = một hoặc nhiều item CÙNG một place, ghi trong MỘT giao dịch — nếu một item lỗi
// (constraint vi phạm, v.v.), toàn bộ bundle rollback (owner decision #6: không publish dở dang
// giữa các locale).
export interface PublishTranslationBundleInput {
  placeId: string;
  items: PublishTranslationItem[];
  origin: RevisionOrigin;
  editorId?: string | null;
  changeNote?: string | null;
}

export interface PublishRouteItem {
  placeId: string;
  localeCode: string;
  localizedSlug: string;
  fullPath: string;
  canonicalUrl: string;
  isCanonical?: boolean;
  isPublic: boolean;
  isProductionData: boolean;
  origin: RevisionOrigin;
  editorId?: string | null;
  changeNote?: string | null;
}

export interface PublishSeoItem {
  placeId: string;
  localeCode: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl: string;
  hreflangGroupId: string;
  robotsIndex: boolean;
  robotsFollow?: boolean;
  ogTitle?: string | null;
  ogDescription?: string | null;
  translationIdTitle?: string | null;
  translationIdDescription?: string | null;
  isPublic: boolean;
  isProductionData: boolean;
  origin: RevisionOrigin;
  editorId?: string | null;
  changeNote?: string | null;
}
