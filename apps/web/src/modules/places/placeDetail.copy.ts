import type { Locale } from '@/lib/locale';

// X1 (launch-readiness pass, 2026-09-22) — G10: trang chi tiết địa điểm (`places/[slug]/page.tsx`)
// có phần thân (Giới thiệu/Thông tin/Liên hệ/Giá) hardcode tiếng Việt bất kể `/en` — cùng dạng vi
// phạm "no Vietnamese under /en" mà SEO v2 đã sửa cho footer/hub pages, còn sót lại ở trang chi
// tiết. Cùng quy ước `home.copy.ts`/`hub-pages.copy.ts`: một object phẳng theo locale, không rải
// `locale === 'en' ? ... : ...` khắp JSX.
export interface PlaceDetailCopy {
  sectionAbout: string;
  sectionInfo: string;
  labelAddress: string;
  labelWard: string;
  labelPrice: string;
  labelHours: string;
  noHoursInfo: string;
  weekHoursSummary: string;
  viewOnMap: string;
  sectionContact: string;
  sectionPrices: string;
  free: string;
  sectionFaq: string;
  viewSource: string;
  lastChecked: (dateLabel: string) => string;
  staleWithDate: (dateLabel: string) => string;
  staleNoDate: string;
  unverifiedNote: string;
}

const vi: PlaceDetailCopy = {
  sectionAbout: 'Giới thiệu',
  sectionInfo: 'Thông tin',
  labelAddress: 'Địa chỉ',
  labelWard: 'Khu vực',
  labelPrice: 'Mức giá',
  labelHours: 'Giờ mở cửa',
  noHoursInfo: 'Chưa có thông tin',
  weekHoursSummary: 'Giờ mở cửa cả tuần',
  viewOnMap: 'Xem trên bản đồ →',
  sectionContact: 'Liên hệ',
  sectionPrices: 'Giá dịch vụ',
  free: 'Miễn phí',
  sectionFaq: 'Câu hỏi thường gặp',
  viewSource: 'Xem nguồn',
  lastChecked: (dateLabel) => `Kiểm tra lần cuối: ${dateLabel}.`,
  staleWithDate: (dateLabel) => `Lần xác minh gần nhất: ${dateLabel} — thông tin có thể đã thay đổi từ đó.`,
  staleNoDate: 'Thông tin cần được kiểm tra lại.',
  unverifiedNote: 'Chưa xác minh — thông tin do cộng đồng đóng góp.',
};

const en: PlaceDetailCopy = {
  sectionAbout: 'About',
  sectionInfo: 'Information',
  labelAddress: 'Address',
  labelWard: 'Area',
  labelPrice: 'Price range',
  labelHours: 'Opening hours',
  noHoursInfo: 'No information yet',
  weekHoursSummary: 'Opening hours (full week)',
  viewOnMap: 'View on map →',
  sectionContact: 'Contact',
  sectionPrices: 'Prices',
  free: 'Free',
  sectionFaq: 'FAQ',
  viewSource: 'View source',
  lastChecked: (dateLabel) => `Last checked: ${dateLabel}.`,
  staleWithDate: (dateLabel) => `Last verified: ${dateLabel} — information may have changed since then.`,
  staleNoDate: 'This information should be double-checked.',
  unverifiedNote: 'Unverified — community-contributed information.',
};

export function getPlaceDetailCopy(locale: Locale): PlaceDetailCopy {
  return locale === 'en' ? en : vi;
}
