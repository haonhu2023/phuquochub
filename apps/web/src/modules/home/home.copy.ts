import type { Locale } from '@/lib/locale';

// Từ điển copy CHO TRANG CHỦ — nơi DUY NHẤT chứa văn bản người dùng thấy trên trang chủ theo từng
// locale. Trước bản này, mọi chữ trên trang chủ là tiếng Việt cứng bất kể `/en` hay `/vi` (locale
// chỉ ảnh hưởng tới URL qua `localizedHref`, chưa từng ảnh hưởng tới NỘI DUNG). Một object phẳng
// theo locale — không rải rác `locale === 'en' ? ... : ...` khắp từng component — là lựa chọn nhỏ
// nhất còn dễ bảo trì cho quy mô hiện tại (một trang, một bộ copy); không kéo theo một thư viện
// i18n runtime cho một nhu cầu vẫn còn nhỏ.
//
// Không đổi tên danh mục/route ở đây — `href` PHẢI khớp `CategoryLinks.spec.tsx` và các route thật
// dưới `app/[locale]/(public)/**`.

export interface HomeCategoryEntry {
  href: string;
  name: string;
  hint: string;
}

export interface HomeIntentShortcut {
  href: string;
  label: string;
}

export interface HomeCopy {
  eyebrow: string;
  title: string;
  lede: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  searchButton: string;
  intentLabel: string;
  intentShortcuts: HomeIntentShortcut[];
  trustSignal: string;
  categoriesTitle: string;
  categoriesAllLink: string;
  categories: HomeCategoryEntry[];
  smartTitle: string;
  smartSubtitle: string;
  smartQuickLinks: HomeIntentShortcut[];
  nearbyCta: string;
  nearbyLoading: string;
  nearbyDenied: string;
  nearbyError: string;
  nearbyEmpty: string;
  nearbyPrivacyNote: string;
  discoverTitle: string;
  discoverMoreLink: string;
  discoverLoadingLabel: string;
  discoverError: string;
  discoverEmptyTitle: string;
  discoverEmptyBody: string;
  mapEyebrow: string;
  mapTitle: string;
  mapDesc: string;
  mapLink: string;
  mapCountLabel: (count: number) => string;
  trustTitle: string;
  trustPoints: Array<{ title: string; body: string }>;
  ownerTitle: string;
  ownerDesc: string;
  ownerLink: string;
}

const CATEGORY_HREFS = ['/hotels', '/restaurants', '/tours', '/attractions', '/beaches', '/events'] as const;

const vi: HomeCopy = {
  eyebrow: 'Trợ lý khám phá Phú Quốc',
  title: 'Đi đâu, ăn gì, chơi gì ở Phú Quốc?',
  lede: 'Tìm địa điểm, bãi biển, nhà hàng, khách sạn, tour và trải nghiệm trên một nền tảng được xây dựng từ dữ liệu có nguồn.',
  searchPlaceholder: 'Tìm bãi biển, nhà hàng, địa điểm, tour…',
  searchAriaLabel: 'Từ khoá tìm kiếm',
  searchButton: 'Tìm',
  intentLabel: 'Gợi ý nhanh:',
  intentShortcuts: [
    { href: '/beaches', label: 'Bãi biển' },
    { href: '/restaurants', label: 'Ăn uống' },
    { href: '/attractions', label: 'Vui chơi' },
    { href: '/tours', label: 'Tour' },
    { href: '/map', label: 'Bản đồ' },
  ],
  trustSignal: 'Thông tin rõ nguồn, dễ kiểm tra.',
  categoriesTitle: 'Bạn đang tìm gì?',
  categoriesAllLink: 'Tất cả địa điểm →',
  categories: [
    { href: CATEGORY_HREFS[0], name: 'Khách sạn', hint: 'Khách sạn và nơi ở phù hợp mọi chuyến đi' },
    { href: CATEGORY_HREFS[1], name: 'Nhà hàng', hint: 'Nhà hàng và món ngon khắp Phú Quốc' },
    { href: CATEGORY_HREFS[2], name: 'Tour', hint: 'Tour đảo và trải nghiệm có hướng dẫn' },
    { href: CATEGORY_HREFS[3], name: 'Điểm tham quan', hint: 'Điểm tham quan và hoạt động vui chơi' },
    { href: CATEGORY_HREFS[4], name: 'Bãi biển', hint: 'Bờ biển và điểm tắm đáng ghé' },
    { href: CATEGORY_HREFS[5], name: 'Sự kiện', hint: 'Sự kiện đang và sắp diễn ra' },
  ],
  smartTitle: 'Khám phá theo nhu cầu',
  smartSubtitle: 'Gợi ý khám phá nhanh — theo nhu cầu, hoặc theo vị trí thực tế nếu bạn đồng ý chia sẻ.',
  smartQuickLinks: [
    { href: '/restaurants', label: 'Ăn uống' },
    { href: '/beaches', label: 'Bãi biển' },
    { href: '/attractions', label: 'Vui chơi' },
    { href: '/tours', label: 'Tour & trải nghiệm' },
    { href: '/map', label: 'Xem bản đồ' },
  ],
  nearbyCta: 'Địa điểm gần bạn',
  nearbyLoading: 'Đang tìm địa điểm gần bạn…',
  nearbyDenied: 'Bạn chưa cho phép truy cập vị trí. Bạn vẫn có thể tìm kiếm hoặc duyệt theo danh mục ở trên.',
  nearbyError: 'Không lấy được vị trí hoặc không tải được kết quả. Thử lại sau.',
  nearbyEmpty: 'Không tìm thấy địa điểm nào gần vị trí hiện tại của bạn.',
  nearbyPrivacyNote: 'Vị trí của bạn chỉ dùng để tìm địa điểm gần đó, không được lưu lại.',
  discoverTitle: 'Khám phá Phú Quốc',
  discoverMoreLink: 'Xem thêm →',
  discoverLoadingLabel: 'Đang tải địa điểm nổi bật',
  discoverError:
    'Hiện chưa tải được danh sách địa điểm. Bạn vẫn có thể tìm kiếm hoặc duyệt theo danh mục ở trên.',
  discoverEmptyTitle: 'Chưa có địa điểm nào',
  discoverEmptyBody: 'Nội dung đang được cập nhật. Vui lòng quay lại sau.',
  mapEyebrow: 'Bản đồ',
  mapTitle: 'Khám phá Phú Quốc trên bản đồ',
  mapDesc: 'Xem địa điểm theo vị trí, tìm nơi gần bạn và khám phá từng khu vực của đảo.',
  mapLink: 'Mở bản đồ',
  mapCountLabel: (count) => `${count} địa điểm đã có trên bản đồ`,
  trustTitle: 'Vì sao chọn PhuQuocHub',
  trustPoints: [
    {
      title: 'Thông tin rõ nguồn',
      body: 'Mỗi địa điểm đi kèm nguồn tham chiếu, không phải nội dung tự bịa.',
    },
    {
      title: 'Dữ liệu được cập nhật',
      body: 'Nội dung được rà soát và bổ sung liên tục thay vì nhập một lần rồi bỏ quên.',
    },
    {
      title: 'Không che giấu thông tin đang xác minh',
      body: 'Dữ liệu chưa xác minh được ghi rõ là đang xác minh, không hiển thị như đã chắc chắn.',
    },
  ],
  ownerTitle: 'Bạn là chủ cơ sở?',
  ownerDesc: 'Xác nhận quyền quản lý để cập nhật thông tin, giờ mở cửa và liên hệ của cơ sở.',
  ownerLink: 'Xác nhận quyền quản lý',
};

const en: HomeCopy = {
  eyebrow: 'Your Phú Quốc discovery guide',
  title: 'Where to go, eat and explore in Phú Quốc',
  lede: 'Find places, beaches, restaurants, hotels, tours and experiences on a platform built from source-backed data.',
  searchPlaceholder: 'Search beaches, restaurants, places, tours…',
  searchAriaLabel: 'Search keyword',
  searchButton: 'Search',
  intentLabel: 'Quick picks:',
  intentShortcuts: [
    { href: '/beaches', label: 'Beaches' },
    { href: '/restaurants', label: 'Food' },
    { href: '/attractions', label: 'Things to do' },
    { href: '/tours', label: 'Tours' },
    { href: '/map', label: 'Map' },
  ],
  trustSignal: 'Source-backed information, easy to double-check.',
  categoriesTitle: 'What are you looking for?',
  categoriesAllLink: 'All places →',
  categories: [
    { href: CATEGORY_HREFS[0], name: 'Hotels', hint: 'Places to stay for every kind of trip' },
    { href: CATEGORY_HREFS[1], name: 'Restaurants', hint: 'Restaurants and local food across Phú Quốc' },
    { href: CATEGORY_HREFS[2], name: 'Tours', hint: 'Island tours and guided experiences' },
    { href: CATEGORY_HREFS[3], name: 'Attractions', hint: 'Attractions and things to do' },
    { href: CATEGORY_HREFS[4], name: 'Beaches', hint: 'Coastline and beaches worth visiting' },
    { href: CATEGORY_HREFS[5], name: 'Events', hint: 'Events happening now and soon' },
  ],
  smartTitle: 'Discover by need',
  smartSubtitle: 'Quick picks by need, or by your real location if you choose to share it.',
  smartQuickLinks: [
    { href: '/restaurants', label: 'Food' },
    { href: '/beaches', label: 'Beaches' },
    { href: '/attractions', label: 'Things to do' },
    { href: '/tours', label: 'Tours & experiences' },
    { href: '/map', label: 'View map' },
  ],
  nearbyCta: 'Places near you',
  nearbyLoading: 'Finding places near you…',
  nearbyDenied: "Location access wasn't allowed. You can still search or browse by category above.",
  nearbyError: "Couldn't get your location or load results. Please try again.",
  nearbyEmpty: 'No places found near your current location.',
  nearbyPrivacyNote: "Your location is only used to find nearby places — it isn't stored.",
  discoverTitle: 'Discover Phú Quốc',
  discoverMoreLink: 'See more →',
  discoverLoadingLabel: 'Loading featured places',
  discoverError: "We couldn't load places right now. You can still search or browse by category above.",
  discoverEmptyTitle: 'No places yet',
  discoverEmptyBody: 'Content is being added. Please check back soon.',
  mapEyebrow: 'Map',
  mapTitle: 'Explore Phú Quốc on the map',
  mapDesc: 'See places by location, find what is near you, and explore the island area by area.',
  mapLink: 'Open map',
  mapCountLabel: (count) => `${count} places already on the map`,
  trustTitle: 'Why PhuQuocHub',
  trustPoints: [
    {
      title: 'Sourced information',
      body: 'Every place links back to a reference source, not made-up content.',
    },
    {
      title: 'Data that keeps improving',
      body: 'Content is reviewed and expanded continuously, not entered once and forgotten.',
    },
    {
      title: "We don't hide what's still being verified",
      body: "Unverified data is clearly marked as being verified — never shown as if it were certain.",
    },
  ],
  ownerTitle: 'Are you a business owner?',
  ownerDesc: 'Claim your listing to update details, opening hours, and contact information.',
  ownerLink: 'Claim your listing',
};

export function getHomeCopy(locale: Locale): HomeCopy {
  return locale === 'en' ? en : vi;
}
