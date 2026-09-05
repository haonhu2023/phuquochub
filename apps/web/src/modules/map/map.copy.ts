import type { Locale } from '@/lib/locale';

// Từ điển copy nhỏ cho các chuỗi hiển thị trực tiếp trên MapView (không phải nội dung DB — tên
// địa điểm/khu vực luôn là dữ liệu thật, không dịch ở tầng UI). Cùng nguyên tắc `home.copy.ts`:
// một object phẳng theo locale, không rải `locale === 'en' ? ... : ...` trong component.
export interface MapCopy {
  errorStatus: string;
  emptyStatus: string;
  resetLabel: string;
  clusterAriaLabel: (count: number) => string;
}

const vi: MapCopy = {
  errorStatus: 'Không tải được địa điểm. Di chuyển bản đồ để thử lại.',
  emptyStatus: 'Không có địa điểm nào trong khu vực này.',
  resetLabel: 'Về Phú Quốc',
  clusterAriaLabel: (count) => `${count} địa điểm — bấm để phóng to`,
};

const en: MapCopy = {
  errorStatus: 'Could not load places. Move the map to try again.',
  emptyStatus: 'No places in this area.',
  resetLabel: 'Reset to Phú Quốc',
  clusterAriaLabel: (count) => `${count} places — click to zoom in`,
};

export function getMapCopy(locale: Locale): MapCopy {
  return locale === 'en' ? en : vi;
}
