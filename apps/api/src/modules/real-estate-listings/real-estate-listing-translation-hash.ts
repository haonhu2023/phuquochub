import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import { RealEstateListing } from './entities/real-estate-listing.entity';

// Gói C phần 2/2 — cùng lý do JobListingsTranslation's job-listing-translation-hash.ts (xem ghi
// chú đầy đủ ở đó). Field nguồn CẦN kiểm cho real_estate_listings (KHÁC job_listings — schema
// khác):
//   - 4 trường dịch: title/description/utilities_note/legal_status_note.
//   - Dữ kiện "điều kiện giao dịch" thường được nhắc tới trong câu chữ: poster_role/
//     transaction_type/property_type/ward/area_sqm/price/price_currency/rent_period/
//     sale_price_basis/deposit_amount/furniture_status/move_in_date/lease_term_months.
// CHỦ Ý LOẠI: address_text (địa chỉ — KHÔNG dịch, giữ nguyên, không bao giờ đổi nghĩa khi dịch);
// contact_method/contact_value (không xuất hiện trong văn xuôi); expires_at/deal_status (có cơ chế
// riêng, không phải lỗi dịch).
function sourceFields(row: Pick<
  RealEstateListing,
  | 'title'
  | 'description'
  | 'utilitiesNote'
  | 'legalStatusNote'
  | 'posterRole'
  | 'transactionType'
  | 'propertyType'
  | 'ward'
  | 'areaSqm'
  | 'price'
  | 'priceCurrency'
  | 'rentPeriod'
  | 'salePriceBasis'
  | 'depositAmount'
  | 'furnitureStatus'
  | 'moveInDate'
  | 'leaseTermMonths'
>) {
  return {
    title: row.title,
    description: row.description,
    utilitiesNote: row.utilitiesNote,
    legalStatusNote: row.legalStatusNote,
    posterRole: row.posterRole,
    transactionType: row.transactionType,
    propertyType: row.propertyType,
    ward: row.ward,
    areaSqm: row.areaSqm,
    price: row.price,
    priceCurrency: row.priceCurrency,
    rentPeriod: row.rentPeriod,
    salePriceBasis: row.salePriceBasis,
    depositAmount: row.depositAmount,
    furnitureStatus: row.furnitureStatus,
    moveInDate: row.moveInDate,
    leaseTermMonths: row.leaseTermMonths,
  };
}

export type RealEstateListingTranslationSourceRow = Parameters<typeof sourceFields>[0];

export function computeRealEstateListingSourceHash(row: RealEstateListingTranslationSourceRow): string {
  const bytes = Buffer.from(canonicalJson(sourceFields(row)), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export function isRealEstateListingTranslationStale(
  storedSourceHash: string,
  currentRow: RealEstateListingTranslationSourceRow,
): boolean {
  return storedSourceHash !== computeRealEstateListingSourceHash(currentRow);
}

// Gói D điểm 4 (18/10/2026, owner yêu cầu rõ) — cùng cơ chế job-listing-translation-hash.ts's
// criticalFields() (xem ghi chú đầy đủ ở đó): hash HẸP chỉ phủ "địa điểm/giá/điều kiện giao dịch"
// (BĐS không có khái niệm "ca làm") để biết CHÍNH XÁC khi nào cần ẩn/fallback bản dịch thay vì chỉ
// cảnh báo chung.
//   - "địa điểm": ward (address_text vốn đã KHÔNG dịch, không cần theo dõi riêng ở đây).
//   - "giá": price/priceCurrency/rentPeriod/salePriceBasis/depositAmount.
//   - "điều kiện giao dịch": transactionType/propertyType/areaSqm/furnitureStatus/moveInDate/
//     leaseTermMonths.
// CHỦ Ý LOẠI posterRole — "ai đăng" (chủ nhà/môi giới), không phải một điều kiện giao dịch, cùng lý
// do loại employerName/employerRole bên job_listings.
function criticalFields(row: Pick<
  RealEstateListing,
  | 'ward'
  | 'price'
  | 'priceCurrency'
  | 'rentPeriod'
  | 'salePriceBasis'
  | 'depositAmount'
  | 'transactionType'
  | 'propertyType'
  | 'areaSqm'
  | 'furnitureStatus'
  | 'moveInDate'
  | 'leaseTermMonths'
>) {
  return {
    ward: row.ward,
    price: row.price,
    priceCurrency: row.priceCurrency,
    rentPeriod: row.rentPeriod,
    salePriceBasis: row.salePriceBasis,
    depositAmount: row.depositAmount,
    transactionType: row.transactionType,
    propertyType: row.propertyType,
    areaSqm: row.areaSqm,
    furnitureStatus: row.furnitureStatus,
    moveInDate: row.moveInDate,
    leaseTermMonths: row.leaseTermMonths,
  };
}

export type RealEstateListingTranslationCriticalFieldsRow = Parameters<typeof criticalFields>[0];

export function computeRealEstateListingCriticalFieldsHash(row: RealEstateListingTranslationCriticalFieldsRow): string {
  const bytes = Buffer.from(canonicalJson(criticalFields(row)), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export function isRealEstateListingTranslationCriticallyStale(
  storedCriticalHash: string | null,
  currentRow: RealEstateListingTranslationCriticalFieldsRow,
): boolean {
  if (storedCriticalHash == null) return false;
  return storedCriticalHash !== computeRealEstateListingCriticalFieldsHash(currentRow);
}
