// Ảnh của tin bất động sản. Hình dạng GIỐNG NHAU cho cả kênh công khai (listPublic) và kênh chủ
// tin (listMine) — chỉ khác `url` trỏ tới route /file (công khai) hay /owner-file (chủ tin), xem
// RealEstateListingPhotosService ở backend. Không có trường trạng thái kiểm duyệt nào — ảnh hiển
// thị theo đúng trạng thái CỦA TIN nó thuộc về, không có hàng chờ duyệt ảnh riêng.
export interface RealEstateListingPhoto {
  id: string;
  sort_order: number;
  url: string;
  created_at: string;
}

export const MAX_REAL_ESTATE_LISTING_PHOTOS = 10;
