// GAP-11: các kiểu response của Place nay khai báo MỘT LẦN ở @phuquochub/shared-types,
// dùng chung với apps/api. File này chỉ còn là điểm re-export để mọi import sẵn có
// ('@/modules/places/types', '../types') giữ nguyên đường dẫn — không khai báo lại gì cả.
export type {
  GeoPoint,
  PlaceCard,
  PlaceContact,
  PlaceDetail,
  PlaceFaq,
  PlaceMedia,
  PlacePrice,
  PlaceStatusValue,
  PriceRangeValue,
  VerificationStatusValue,
  FaqStatusValue,
} from '@phuquochub/shared-types';
