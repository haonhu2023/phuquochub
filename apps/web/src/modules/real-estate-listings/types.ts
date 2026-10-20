import type { RichDoc } from '@phuquochub/shared-types';

// Khớp apps/api/src/modules/real-estate-listings (enums.ts/dto/real-estate-listings.dto.ts/
// real-estate-listings.mapper.ts). Taxonomy cố định — không free text.
export const REAL_ESTATE_PROPERTY_TYPES = ['room', 'apartment', 'house', 'land', 'retail'] as const;
export type RealEstatePropertyType = (typeof REAL_ESTATE_PROPERTY_TYPES)[number];

export const REAL_ESTATE_PROPERTY_TYPE_LABELS: Record<RealEstatePropertyType, string> = {
  room: 'Phòng trọ',
  apartment: 'Căn hộ',
  house: 'Nhà',
  land: 'Đất',
  retail: 'Mặt bằng',
};

const REAL_ESTATE_PROPERTY_TYPE_LABELS_EN: Record<RealEstatePropertyType, string> = {
  room: 'Room',
  apartment: 'Apartment',
  house: 'House',
  land: 'Land',
  retail: 'Retail space',
};

export function realEstatePropertyTypeLabel(type: RealEstatePropertyType, locale: 'vi' | 'en'): string {
  return locale === 'en' ? REAL_ESTATE_PROPERTY_TYPE_LABELS_EN[type] : REAL_ESTATE_PROPERTY_TYPE_LABELS[type];
}

export const REAL_ESTATE_TRANSACTION_TYPES = ['rent', 'sale'] as const;
export type RealEstateTransactionType = (typeof REAL_ESTATE_TRANSACTION_TYPES)[number];

export const REAL_ESTATE_TRANSACTION_TYPE_LABELS: Record<RealEstateTransactionType, string> = {
  rent: 'Cho thuê',
  sale: 'Mua bán',
};

const REAL_ESTATE_TRANSACTION_TYPE_LABELS_EN: Record<RealEstateTransactionType, string> = {
  rent: 'For rent',
  sale: 'For sale',
};

export function realEstateTransactionTypeLabel(type: RealEstateTransactionType, locale: 'vi' | 'en'): string {
  return locale === 'en' ? REAL_ESTATE_TRANSACTION_TYPE_LABELS_EN[type] : REAL_ESTATE_TRANSACTION_TYPE_LABELS[type];
}

export const REAL_ESTATE_POSTER_ROLES = ['owner', 'broker'] as const;
export type RealEstatePosterRole = (typeof REAL_ESTATE_POSTER_ROLES)[number];
export const REAL_ESTATE_POSTER_ROLE_LABELS: Record<RealEstatePosterRole, string> = {
  owner: 'Chủ nhà/chủ đất',
  broker: 'Môi giới',
};

const REAL_ESTATE_POSTER_ROLE_LABELS_EN: Record<RealEstatePosterRole, string> = {
  owner: 'Owner',
  broker: 'Broker',
};

export function realEstatePosterRoleLabel(role: RealEstatePosterRole, locale: 'vi' | 'en'): string {
  return locale === 'en' ? REAL_ESTATE_POSTER_ROLE_LABELS_EN[role] : REAL_ESTATE_POSTER_ROLE_LABELS[role];
}

export const REAL_ESTATE_ADDRESS_PRECISIONS = ['area', 'exact'] as const;
export type RealEstateAddressPrecision = (typeof REAL_ESTATE_ADDRESS_PRECISIONS)[number];

export const REAL_ESTATE_RENT_PERIODS = ['month', 'year'] as const;
export type RealEstateRentPeriod = (typeof REAL_ESTATE_RENT_PERIODS)[number];
export const REAL_ESTATE_RENT_PERIOD_LABELS: Record<RealEstateRentPeriod, string> = {
  month: '/tháng',
  year: '/năm',
};

export const REAL_ESTATE_SALE_PRICE_BASES = ['total', 'per_sqm'] as const;
export type RealEstateSalePriceBasis = (typeof REAL_ESTATE_SALE_PRICE_BASES)[number];
export const REAL_ESTATE_SALE_PRICE_BASIS_LABELS: Record<RealEstateSalePriceBasis, string> = {
  total: 'Giá tổng',
  per_sqm: 'Giá/m²',
};

export const REAL_ESTATE_FURNITURE_STATUSES = ['unfurnished', 'semi_furnished', 'furnished'] as const;
export type RealEstateFurnitureStatus = (typeof REAL_ESTATE_FURNITURE_STATUSES)[number];
export const REAL_ESTATE_FURNITURE_STATUS_LABELS: Record<RealEstateFurnitureStatus, string> = {
  unfurnished: 'Không nội thất',
  semi_furnished: 'Nội thất cơ bản',
  furnished: 'Đầy đủ nội thất',
};

export const REAL_ESTATE_LISTING_STATUSES = ['draft', 'pending', 'published', 'rejected', 'closed'] as const;
export type RealEstateListingStatus = (typeof REAL_ESTATE_LISTING_STATUSES)[number];
export const REAL_ESTATE_LISTING_STATUS_LABELS: Record<RealEstateListingStatus, string> = {
  draft: 'Nháp',
  pending: 'Đang chờ duyệt',
  published: 'Đang đăng',
  rejected: 'Bị từ chối',
  closed: 'Đã đóng',
};

// ĐỘC LẬP với status (mục VI "phân biệt kiểm duyệt với còn giao dịch") — xem §13u.
export const REAL_ESTATE_DEAL_STATUSES = ['available', 'rented', 'sold'] as const;
export type RealEstateDealStatus = (typeof REAL_ESTATE_DEAL_STATUSES)[number];
export const REAL_ESTATE_DEAL_STATUS_LABELS: Record<RealEstateDealStatus, string> = {
  available: 'Còn giao dịch',
  rented: 'Đã cho thuê',
  sold: 'Đã bán',
};

export interface RealEstateListingBaseView {
  id: string;
  poster_role: RealEstatePosterRole;
  transaction_type: RealEstateTransactionType;
  property_type: RealEstatePropertyType;
  title: string;
  ward: string | null;
  address_precision: RealEstateAddressPrecision;
  // address_text/lat/lng: null công khai khi address_precision='area' (API tự ẩn, không phải UI).
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  area_sqm: number | null;
  price: number | null;
  price_currency: string | null;
  rent_period: RealEstateRentPeriod | null;
  sale_price_basis: RealEstateSalePriceBasis | null;
  deposit_amount: number | null;
  utilities_note: string | null;
  // Gói D — khi KHÔNG null, nguồn sự thật của trường cùng tên trần (renderer dùng field này khi có,
  // xem RichDescriptionRenderer). NULL nếu tin chưa dùng rich text HOẶC vừa phát hiện lệch hash
  // (cơ chế chống rollback, xem apps/api/src/common/rich-text-field.ts).
  utilities_note_rich: RichDoc | null;
  furniture_status: RealEstateFurnitureStatus | null;
  move_in_date: string | null;
  lease_term_months: number | null;
  legal_status_note: string | null;
  legal_status_note_rich: RichDoc | null;
  description: string | null;
  description_rich: RichDoc | null;
  contact_method: string;
  contact_value: string;
  deal_status: RealEstateDealStatus;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// Gói C (17/10/2026) — `locale` phản ánh NỘI DUNG THỰC SỰ đã trả, không phải locale yêu cầu trong
// query (cùng lý do JobListingPublicView — xem ghi chú ở đó). Dùng cho CẢ danh sách (chỉ overlay
// `title`, không có `is_translation_stale`) lẫn chi tiết — `RealEstateListingPublicDetailView`
// dưới đây thêm `is_translation_stale` (chỉ có nghĩa — và chỉ backend trả — ở chi tiết MỘT tin).
export type RealEstateListingPublicView = RealEstateListingBaseView & { locale: 'vi' | 'en' };

export type RealEstateListingPublicDetailView = RealEstateListingPublicView & {
  is_translation_stale: boolean;
  // Gói D điểm 4 — 'critical_fact_mismatch' khi bản dịch đã duyệt mâu thuẫn với dữ kiện quan trọng
  // (địa điểm/giá/điều kiện giao dịch) đã đổi — response khi đó LUÔN có locale:'vi' (đã fallback).
  translation_hidden_reason: 'critical_fact_mismatch' | null;
};

export interface RealEstateListingSenderView extends RealEstateListingBaseView {
  status: RealEstateListingStatus;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface RealEstateListingModeratorView extends RealEstateListingSenderView {
  created_by: string;
  reviewer_id: string | null;
}

// Gói B (17/10/2026) — cùng lý do JobListingAdminView (xem ghi chú ở đó).
export interface RealEstateListingAdminView extends RealEstateListingModeratorView {
  creator_email: string | null;
  creator_display_name: string | null;
}

export interface UpsertRealEstateListingInput {
  poster_role: RealEstatePosterRole;
  transaction_type: RealEstateTransactionType;
  property_type: RealEstatePropertyType;
  title: string;
  ward?: string | null;
  address_precision?: RealEstateAddressPrecision;
  address_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  area_sqm?: number | null;
  price?: number | null;
  price_currency?: string | null;
  rent_period?: RealEstateRentPeriod | null;
  sale_price_basis?: RealEstateSalePriceBasis | null;
  deposit_amount?: number | null;
  utilities_note?: string | null;
  // Gói D — có mặt (object HOẶC null) = ghi đè authoritative; vắng mặt (undefined, không set key)
  // = "không đụng rich text", xem apps/api/src/common/rich-text-field.ts's applyRichTextField() cho
  // quy tắc đầy đủ (dùng chung cho cả ba trường dưới đây).
  utilities_note_rich?: RichDoc | null;
  furniture_status?: RealEstateFurnitureStatus | null;
  move_in_date?: string | null;
  lease_term_months?: number | null;
  legal_status_note?: string | null;
  legal_status_note_rich?: RichDoc | null;
  description?: string | null;
  description_rich?: RichDoc | null;
  contact_method: string;
  contact_value: string;
  expires_at?: string | null;
}

export type RealEstateDecision = 'approve' | 'reject';

export interface DecideRealEstateListingInput {
  decision: RealEstateDecision;
  note?: string;
}

export interface ListRealEstateListingsFilter {
  transaction_type?: RealEstateTransactionType;
  property_type?: RealEstatePropertyType;
  ward?: string;
  page?: number;
  limit?: number;
  locale?: 'vi' | 'en';
}

// Màn hình quản lý TOÀN BỘ tin (admin) — khác ListRealEstateListingsFilter (công khai, chỉ published).
export interface AdminListRealEstateListingsFilter {
  status?: RealEstateListingStatus;
  created_by?: string;
  page?: number;
  limit?: number;
}

// Gói C phần 2/2 (17/10/2026) — bản dịch tiếng Anh. Vòng đời RIÊNG, ĐỘC LẬP với RealEstateListingStatus
// (cùng khuôn JobListingTranslationView — xem ghi chú ở đó). Field dịch KHÁC job_listings (schema
// BĐS khác): title/description/utilities_note/legal_status_note.
export const REAL_ESTATE_LISTING_TRANSLATION_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const;
export type RealEstateListingTranslationStatus = (typeof REAL_ESTATE_LISTING_TRANSLATION_STATUSES)[number];

export const REAL_ESTATE_LISTING_TRANSLATION_STATUS_LABELS: Record<RealEstateListingTranslationStatus, string> = {
  draft: 'Nháp',
  pending: 'Đang chờ duyệt',
  published: 'Đã duyệt — đang hiện công khai',
  rejected: 'Bị từ chối',
};

export interface RealEstateListingTranslationView {
  id: string;
  real_estate_listing_id: string;
  locale: string;
  title: string | null;
  description: string | null;
  // Gói D — nguồn sự thật khi không null (vùng NHÁP). Bản dịch CHỈ `description` có rich text
  // (utilities_note/legal_status_note bản dịch ngoài phạm vi).
  description_rich: RichDoc | null;
  utilities_note: string | null;
  legal_status_note: string | null;
  status: RealEstateListingTranslationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  has_published: boolean;
  published_at: string | null;
  content_version: number;
  created_at: string;
  updated_at: string;
  is_stale: boolean | null;
  is_published_stale: boolean | null;
}

export interface RealEstateListingTranslationModeratorView extends RealEstateListingTranslationView {
  source_title: string;
  source_description: string | null;
  source_description_rich: RichDoc | null;
  source_utilities_note: string | null;
  source_utilities_note_rich: RichDoc | null;
  source_legal_status_note: string | null;
  source_legal_status_note_rich: RichDoc | null;
}

export interface UpsertRealEstateListingTranslationInput {
  title?: string | null;
  description?: string | null;
  description_rich?: RichDoc | null;
  utilities_note?: string | null;
  legal_status_note?: string | null;
  expected_content_version?: number;
}

export interface DecideRealEstateListingTranslationInput {
  decision: RealEstateDecision;
  note?: string;
  expected_content_version: number;
}
