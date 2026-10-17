export enum RealEstateListingStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  CLOSED = 'closed',
}

// Độc lập với RealEstateListingStatus — "còn giao dịch" khác "đã duyệt" (xem §13u).
export enum RealEstateDealStatus {
  AVAILABLE = 'available',
  RENTED = 'rented',
  SOLD = 'sold',
}

export enum RealEstatePosterRole {
  OWNER = 'owner',
  BROKER = 'broker',
}

export enum RealEstateTransactionType {
  RENT = 'rent',
  SALE = 'sale',
}

// Taxonomy cố định — không free text.
export enum RealEstatePropertyType {
  ROOM = 'room',
  APARTMENT = 'apartment',
  HOUSE = 'house',
  LAND = 'land',
  RETAIL = 'retail',
}

export enum RealEstateAddressPrecision {
  AREA = 'area',
  EXACT = 'exact',
}

export enum RealEstateRentPeriod {
  MONTH = 'month',
  YEAR = 'year',
}

export enum RealEstateSalePriceBasis {
  TOTAL = 'total',
  PER_SQM = 'per_sqm',
}

export enum RealEstateFurnitureStatus {
  UNFURNISHED = 'unfurnished',
  SEMI_FURNISHED = 'semi_furnished',
  FURNISHED = 'furnished',
}

export const REAL_ESTATE_LISTING_STATUS_LABELS: Record<RealEstateListingStatus, string> = {
  [RealEstateListingStatus.DRAFT]: 'Nháp',
  [RealEstateListingStatus.PENDING]: 'Đang chờ duyệt',
  [RealEstateListingStatus.PUBLISHED]: 'Đang đăng',
  [RealEstateListingStatus.REJECTED]: 'Bị từ chối',
  [RealEstateListingStatus.CLOSED]: 'Đã đóng',
};

export const REAL_ESTATE_DEAL_STATUS_LABELS: Record<RealEstateDealStatus, string> = {
  [RealEstateDealStatus.AVAILABLE]: 'Còn giao dịch',
  [RealEstateDealStatus.RENTED]: 'Đã cho thuê',
  [RealEstateDealStatus.SOLD]: 'Đã bán',
};

// Gói C phần 2/2 (17/10/2026) — vòng đời bản dịch tiếng Anh, cùng khuôn JobListingTranslationStatus
// (xem ghi chú đầy đủ ở đó): vocabulary chung nhưng state machine RIÊNG, độc lập hoàn toàn với
// RealEstateListingStatus.
export enum RealEstateListingTranslationStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
}
