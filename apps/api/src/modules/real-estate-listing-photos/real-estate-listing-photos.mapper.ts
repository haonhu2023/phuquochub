import { RealEstateListingPhoto } from './entities/real-estate-listing-photo.entity';

// Hình dạng công khai/chủ tin GIỐNG NHAU — không có cột kiểm duyệt nào để ẩn khác nhau theo vai
// trò (khác OwnerPlacePhoto của media, nơi moderator thấy status/rejection_reason_code). `url` là
// URL ỔN ĐỊNH tới route /file tương ứng (public hoặc owner-file) — không phải signed URL, không
// bao giờ hết hạn, xem MediaUrlService.
export function toRealEstateListingPhotoView(row: RealEstateListingPhoto, fileUrl: (photoId: string) => string) {
  return {
    id: row.id,
    sort_order: row.sortOrder,
    url: fileUrl(row.id),
    created_at: row.createdAt.toISOString(),
  };
}
