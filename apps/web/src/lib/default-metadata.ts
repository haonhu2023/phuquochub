import type { Metadata } from 'next';
import { getSiteUrl } from './site';

// Metadata mặc định dùng CHUNG cho mọi root layout (PR A tách `app/layout.tsx` thành 3 root độc
// lập — `[locale]/layout.tsx`, `(auth)/layout.tsx`, `(dashboard)/layout.tsx` — vì Next.js App
// Router không cho một root layout duy nhất nhận `params.locale` khi route hiện tại không có
// segment đó (`/dashboard`, `/login`...). Hằng số này giữ đúng giá trị `app/layout.tsx` cũ, chỉ
// đổi CHỖ khai báo để dùng lại được ở cả 3 nơi thay vì lặp lại y hệt 3 lần.
// SEO v2 (Phase 16): mô tả cũ ("Wikipedia + Reddit + Google Maps cho Phú Quốc") mô tả sản phẩm
// bằng cách so sánh với ba nền tảng khác, không nói được PhuQuocHub THỰC SỰ LÀ GÌ hay giá trị
// riêng của nó — và không phải thứ một người dùng thật sự tìm kiếm. Thay bằng một câu mô tả đúng ý
// định tìm kiếm của trang chủ. Đây là NỀN cho `(auth)`/`(dashboard)` (không có locale, luôn tiếng
// Việt — khớp `html lang="vi"` tĩnh của hai layout đó) và là ĐIỂM KHỞI ĐẦU mà
// `[locale]/layout.tsx` ghi đè `title`/`description` theo locale qua `generateMetadata`.
export const DEFAULT_METADATA: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'PhuQuocHub — Cẩm nang du lịch & khám phá Phú Quốc',
  description:
    'Khám phá địa điểm, nhà hàng, bãi biển, khách sạn, tour và trải nghiệm tại Phú Quốc với bản đồ và thông tin rõ nguồn.',
};
