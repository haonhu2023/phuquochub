import type { Locale } from './locale';

// SEO v2 — từ điển title/description/H1 CHUNG cho mọi "trang duyệt" (hub page) công khai. Trước
// bản này, MỌI trang trong danh sách dưới đây có `const TITLE`/`const DESCRIPTION` tiếng Việt cứng
// ở module scope, dùng y nguyên bất kể `/vi` hay `/en` — canonical vẫn đổi đúng theo locale
// (`localizedHref`) nhưng nội dung <title>/<h1>/mô tả thì không. Cùng mẫu `home.copy.ts`: một
// object phẳng theo locale, tránh rải ternary trong từng route.
//
// Đây là các trang DANH MỤC/DUYỆT — giá trị chính của chúng là cấu trúc điều hướng + mô tả +
// bộ lọc, không phải văn bản dài đặc thù từng địa điểm. Tên riêng của từng địa điểm hiển thị bên
// trong danh sách (vd "Bãi Sao") giữ nguyên tiếng Việt ở CẢ hai locale — đó là danh từ riêng, không
// phải nội dung cần dịch, cùng cách một bài viết tiếng Anh vẫn giữ nguyên tên riêng nước ngoài.

export interface HubPageCopy {
  title: string;
  description: string;
  h1: string;
}

export type HubPageKey =
  | 'places'
  | 'restaurants'
  | 'hotels'
  | 'tours'
  | 'attractions'
  | 'beaches'
  | 'events'
  | 'explore'
  | 'map';

const VI: Record<HubPageKey, HubPageCopy> = {
  places: {
    title: 'Địa điểm Phú Quốc — Toàn bộ danh sách',
    description: 'Toàn bộ địa điểm tại Phú Quốc: nhà hàng, khách sạn, bãi biển, điểm tham quan và tour, có thể lọc theo danh mục và khu vực.',
    h1: 'Địa điểm Phú Quốc',
  },
  restaurants: {
    title: 'Nhà hàng Phú Quốc — Ăn gì ở Phú Quốc',
    description: 'Danh sách nhà hàng, quán ăn ở Phú Quốc — lọc theo mức giá, ẩm thực, sắp xếp theo đánh giá.',
    h1: 'Nhà hàng Phú Quốc',
  },
  hotels: {
    title: 'Khách sạn Phú Quốc — Nơi lưu trú',
    description: 'Danh sách khách sạn, resort ở Phú Quốc — lọc theo khu vực và mức giá.',
    h1: 'Khách sạn Phú Quốc',
  },
  tours: {
    title: 'Tour & trải nghiệm Phú Quốc',
    description: 'Danh sách tour, hoạt động và trải nghiệm có hướng dẫn tại Phú Quốc.',
    h1: 'Tour & trải nghiệm Phú Quốc',
  },
  attractions: {
    title: 'Điểm tham quan Phú Quốc — Nơi nên ghé',
    description: 'Danh sách điểm tham quan, vui chơi tại Phú Quốc — lọc theo khu vực.',
    h1: 'Điểm tham quan Phú Quốc',
  },
  beaches: {
    title: 'Bãi biển Phú Quốc — Khám phá các bãi biển',
    description: 'Danh sách bãi biển ở Phú Quốc — lọc theo khu vực và mức giá, sắp xếp theo đánh giá.',
    h1: 'Bãi biển Phú Quốc',
  },
  events: {
    title: 'Sự kiện Phú Quốc — Đang và sắp diễn ra',
    description: 'Sự kiện đang diễn ra và sắp diễn ra tại Phú Quốc.',
    h1: 'Sự kiện Phú Quốc',
  },
  explore: {
    title: 'Khám phá Phú Quốc — Danh sách và bản đồ',
    description: 'Khám phá địa điểm tại Phú Quốc song song trên danh sách và bản đồ, lọc theo danh mục và khu vực.',
    h1: 'Khám phá Phú Quốc',
  },
  map: {
    title: 'Bản đồ Phú Quốc — Địa điểm theo vị trí',
    description: 'Bản đồ tương tác các địa điểm tại Phú Quốc — bãi biển, nhà hàng, khách sạn, điểm tham quan theo vị trí thực tế.',
    h1: 'Bản đồ Phú Quốc',
  },
};

const EN: Record<HubPageKey, HubPageCopy> = {
  places: {
    title: 'Phú Quốc Places — Full Directory',
    description: 'Every place in Phú Quốc: restaurants, hotels, beaches, attractions and tours, filterable by category and area.',
    h1: 'Phú Quốc Places',
  },
  restaurants: {
    title: 'Phú Quốc Restaurants — Where to Eat',
    description: 'Restaurants and eateries in Phú Quốc — filter by price and cuisine, sorted by rating.',
    h1: 'Phú Quốc Restaurants',
  },
  hotels: {
    title: 'Phú Quốc Hotels — Where to Stay',
    description: 'Hotels and resorts in Phú Quốc — filter by area and price.',
    h1: 'Phú Quốc Hotels',
  },
  tours: {
    title: 'Phú Quốc Tours & Experiences',
    description: 'Guided tours, activities and experiences in Phú Quốc.',
    h1: 'Phú Quốc Tours & Experiences',
  },
  attractions: {
    title: 'Phú Quốc Attractions — Things to Do',
    description: 'Attractions and things to do in Phú Quốc — filter by area.',
    h1: 'Phú Quốc Attractions',
  },
  beaches: {
    title: 'Phú Quốc Beaches — Explore the Coastline',
    description: 'Beaches in Phú Quốc — filter by area and price, sorted by rating.',
    h1: 'Phú Quốc Beaches',
  },
  events: {
    title: 'Phú Quốc Events — Happening Now and Soon',
    description: 'Events happening now and coming up in Phú Quốc.',
    h1: 'Phú Quốc Events',
  },
  explore: {
    title: 'Explore Phú Quốc — List and Map',
    description: 'Explore places in Phú Quốc side by side in a list and on the map, filterable by category and area.',
    h1: 'Explore Phú Quốc',
  },
  map: {
    title: 'Phú Quốc Map — Places by Location',
    description: 'An interactive map of places in Phú Quốc — beaches, restaurants, hotels and attractions by real location.',
    h1: 'Phú Quốc Map',
  },
};

export function getHubPageCopy(locale: Locale, key: HubPageKey): HubPageCopy {
  return locale === 'en' ? EN[key] : VI[key];
}
