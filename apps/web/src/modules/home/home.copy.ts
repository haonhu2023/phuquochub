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
  title: 'Khám phá Phú Quốc theo cách dễ hơn',
  lede: 'Địa điểm, ăn uống, vui chơi và trải nghiệm được tổng hợp một chỗ — kèm nguồn thông tin rõ ràng và cập nhật.',
  searchPlaceholder: 'Bạn muốn tìm gì ở Phú Quốc?',
  searchAriaLabel: 'Từ khoá tìm kiếm',
  searchButton: 'Tìm',
  intentLabel: 'Gợi ý nhanh:',
  intentShortcuts: [
    { href: '/explore', label: 'Đi đâu hôm nay' },
    { href: '/restaurants', label: 'Ăn gì' },
    { href: '/beaches', label: 'Bãi biển' },
    { href: '/attractions', label: 'Vui chơi' },
    { href: '/tours', label: 'Tour' },
  ],
  trustSignal: 'Thông tin rõ nguồn, dễ kiểm tra.',
  categoriesTitle: 'Bạn đang tìm gì?',
  categoriesAllLink: 'Tất cả địa điểm →',
  categories: [
    { href: CATEGORY_HREFS[0], name: 'Khách sạn', hint: 'Nơi lưu trú' },
    { href: CATEGORY_HREFS[1], name: 'Nhà hàng', hint: 'Ăn uống' },
    { href: CATEGORY_HREFS[2], name: 'Tour', hint: 'Trải nghiệm có hướng dẫn' },
    { href: CATEGORY_HREFS[3], name: 'Điểm tham quan', hint: 'Nơi nên ghé' },
    { href: CATEGORY_HREFS[4], name: 'Bãi biển', hint: 'Biển và bờ cát' },
    { href: CATEGORY_HREFS[5], name: 'Sự kiện', hint: 'Đang và sắp diễn ra' },
  ],
  smartTitle: 'Khám phá theo nhu cầu',
  smartSubtitle: 'Gợi ý nhanh dựa trên vị trí thực tế — chỉ hoạt động khi bạn đồng ý chia sẻ vị trí.',
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
  mapTitle: 'Xem trên bản đồ',
  mapDesc: 'Duyệt địa điểm theo vị trí thực tế trên bản đồ Phú Quốc — bãi biển, nhà hàng, khách sạn và nhiều hơn nữa.',
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
  eyebrow: 'Your Phú Quốc discovery assistant',
  title: 'Discover Phú Quốc, made simple',
  lede: 'Places, food, activities and experiences in one spot — with clear sourcing and content that keeps getting updated.',
  searchPlaceholder: 'What are you looking for in Phú Quốc?',
  searchAriaLabel: 'Search keyword',
  searchButton: 'Search',
  intentLabel: 'Quick picks:',
  intentShortcuts: [
    { href: '/explore', label: 'Where to go today' },
    { href: '/restaurants', label: 'Where to eat' },
    { href: '/beaches', label: 'Beaches' },
    { href: '/attractions', label: 'Things to do' },
    { href: '/tours', label: 'Tours' },
  ],
  trustSignal: 'Source-backed information, easy to double-check.',
  categoriesTitle: 'What are you looking for?',
  categoriesAllLink: 'All places →',
  categories: [
    { href: CATEGORY_HREFS[0], name: 'Hotels', hint: 'Places to stay' },
    { href: CATEGORY_HREFS[1], name: 'Restaurants', hint: 'Food & drink' },
    { href: CATEGORY_HREFS[2], name: 'Tours', hint: 'Guided experiences' },
    { href: CATEGORY_HREFS[3], name: 'Attractions', hint: 'Worth a visit' },
    { href: CATEGORY_HREFS[4], name: 'Beaches', hint: 'Sea and sand' },
    { href: CATEGORY_HREFS[5], name: 'Events', hint: 'Happening now and soon' },
  ],
  smartTitle: 'Discover by need',
  smartSubtitle: 'A quick suggestion based on your real location — only if you allow sharing it.',
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
  mapTitle: 'Explore the map',
  mapDesc: 'Browse places by real location on the Phú Quốc map — beaches, restaurants, hotels and more.',
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
