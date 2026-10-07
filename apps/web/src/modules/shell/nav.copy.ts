import type { Locale } from '@/lib/locale';

// Nhãn điều hướng CHUNG cho header + footer (Phase 4/15) — route/nhãn PHẢI khớp trang duyệt CÓ
// THẬT dưới `app/[locale]/(public)/**`, không tạo lối vào tới trang chưa tồn tại. Bộ 6 mục header
// theo yêu cầu sản phẩm (Khám phá/Ăn uống/Lưu trú/Vui chơi/Bãi biển/Bản đồ) ánh xạ tới đúng 6 route
// đã có: /explore, /restaurants, /hotels, /attractions, /beaches, /map. Footer bổ sung các route
// còn lại (places/tours/events) — không mục nào trong đây trỏ tới trang không tồn tại.
export interface NavItem {
  href: string;
  label: string;
}

export interface NavCopy {
  headerItems: NavItem[];
  footerExploreItems: NavItem[];
  /** "Sống tại Phú Quốc" — nhóm cư dân (tuyển dụng/bất động sản), TÁCH khỏi "Khám phá" (mục VII:
   *  "Tuyển dụng/bất động sản ở nhóm cư dân", không gộp vào các lối vào hướng du khách). */
  residentItems: NavItem[];
  residentTitle: string;
  footerAboutTitle: string;
  footerExploreTitle: string;
  footerLanguageTitle: string;
  searchLabel: string;
  menuOpenLabel: string;
  menuCloseLabel: string;
  languageSwitchLabel: string;
  skipToContentLabel: string;
}

const VI: NavCopy = {
  headerItems: [
    { href: '/explore', label: 'Khám phá' },
    { href: '/restaurants', label: 'Ăn uống' },
    { href: '/hotels', label: 'Lưu trú' },
    { href: '/attractions', label: 'Vui chơi' },
    { href: '/beaches', label: 'Bãi biển' },
    { href: '/map', label: 'Bản đồ' },
  ],
  footerExploreItems: [
    { href: '/places', label: 'Địa điểm' },
    { href: '/restaurants', label: 'Nhà hàng' },
    { href: '/hotels', label: 'Khách sạn' },
    { href: '/tours', label: 'Tour' },
    { href: '/beaches', label: 'Bãi biển' },
    { href: '/map', label: 'Bản đồ' },
  ],
  residentItems: [
    { href: '/jobs', label: 'Tuyển dụng' },
    { href: '/real-estate', label: 'Bất động sản' },
  ],
  residentTitle: 'Sống tại Phú Quốc',
  footerAboutTitle: 'PhuQuocHub',
  footerExploreTitle: 'Khám phá',
  footerLanguageTitle: 'Ngôn ngữ',
  searchLabel: 'Tìm kiếm',
  menuOpenLabel: 'Mở menu',
  menuCloseLabel: 'Đóng menu',
  languageSwitchLabel: 'Đổi ngôn ngữ',
  skipToContentLabel: 'Bỏ qua, đến nội dung chính',
};

const EN: NavCopy = {
  headerItems: [
    { href: '/explore', label: 'Explore' },
    { href: '/restaurants', label: 'Food' },
    { href: '/hotels', label: 'Stay' },
    { href: '/attractions', label: 'Things to do' },
    { href: '/beaches', label: 'Beaches' },
    { href: '/map', label: 'Map' },
  ],
  footerExploreItems: [
    { href: '/places', label: 'Places' },
    { href: '/restaurants', label: 'Restaurants' },
    { href: '/hotels', label: 'Hotels' },
    { href: '/tours', label: 'Tours' },
    { href: '/beaches', label: 'Beaches' },
    { href: '/map', label: 'Map' },
  ],
  residentItems: [
    { href: '/jobs', label: 'Jobs' },
    { href: '/real-estate', label: 'Real Estate' },
  ],
  residentTitle: 'Living in Phú Quốc',
  footerAboutTitle: 'PhuQuocHub',
  footerExploreTitle: 'Explore',
  footerLanguageTitle: 'Language',
  searchLabel: 'Search',
  menuOpenLabel: 'Open menu',
  menuCloseLabel: 'Close menu',
  languageSwitchLabel: 'Switch language',
  skipToContentLabel: 'Skip to main content',
};

export function getNavCopy(locale: Locale): NavCopy {
  return locale === 'en' ? EN : VI;
}
