import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateAddressPrecision } from './real-estate-listings.enums';

// `ward` LUÔN công khai. `address_text`/`lat`/`lng` CHỈ vào response khi `addressPrecision='exact'`
// — đây là nơi DUY NHẤT quyết định việc đó; không phải một bước ẩn ở UI (task requirement nguyên
// văn: "Chọn khu vực thì API public không trả tọa độ/địa chỉ riêng" — chặn ở tầng dữ liệu).
function publicLocationFields(row: RealEstateListing) {
  if (row.addressPrecision !== RealEstateAddressPrecision.EXACT) {
    return { address_precision: row.addressPrecision, address_text: null, lat: null, lng: null };
  }
  return {
    address_precision: row.addressPrecision,
    address_text: row.addressText,
    lat: row.lat !== null ? Number(row.lat) : null,
    lng: row.lng !== null ? Number(row.lng) : null,
  };
}

function baseFields(row: RealEstateListing) {
  return {
    id: row.id,
    poster_role: row.posterRole,
    transaction_type: row.transactionType,
    property_type: row.propertyType,
    title: row.title,
    ward: row.ward,
    ...publicLocationFields(row),
    area_sqm: row.areaSqm !== null ? Number(row.areaSqm) : null,
    price: row.price !== null ? Number(row.price) : null,
    price_currency: row.priceCurrency,
    rent_period: row.rentPeriod,
    sale_price_basis: row.salePriceBasis,
    deposit_amount: row.depositAmount !== null ? Number(row.depositAmount) : null,
    utilities_note: row.utilitiesNote,
    furniture_status: row.furnitureStatus,
    move_in_date: row.moveInDate,
    lease_term_months: row.leaseTermMonths,
    legal_status_note: row.legalStatusNote,
    description: row.description,
    contact_method: row.contactMethod,
    contact_value: row.contactValue,
    deal_status: row.dealStatus,
    expires_at: row.expiresAt,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toRealEstateListingPublicView(row: RealEstateListing) {
  return baseFields(row);
}

// "Tin của tôi": chủ tin thấy TOÀN BỘ vị trí đã nhập (kể cả khi address_precision='area' — họ cần
// xem lại/sửa chính dữ liệu của mình) cộng status/review_note (lý do từ chối — DUY NHẤT field phản
// hồi của tính năng này, cùng lý do job_listings không ẩn review_note khỏi chủ tin).
export function toRealEstateListingSenderView(row: RealEstateListing) {
  return {
    ...baseFields(row),
    address_text: row.addressText,
    lat: row.lat !== null ? Number(row.lat) : null,
    lng: row.lng !== null ? Number(row.lng) : null,
    status: row.status,
    review_note: row.reviewNote,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export function toRealEstateListingModeratorView(row: RealEstateListing) {
  return {
    ...toRealEstateListingSenderView(row),
    created_by: row.createdBy,
    reviewer_id: row.reviewerId,
  };
}

// Màn hình quản lý TOÀN BỘ tin (Gói B, 17/10/2026) — cùng lý do JobListing's toJobListingAdminView().
export function toRealEstateListingAdminView(row: RealEstateListing, creator: { email: string; display_name: string } | null) {
  return {
    ...toRealEstateListingModeratorView(row),
    creator_email: creator?.email ?? null,
    creator_display_name: creator?.display_name ?? null,
  };
}
