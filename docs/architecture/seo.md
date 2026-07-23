# PhuQuocHub — Kiến trúc SEO (SEO Architecture)

> **Trạng thái: OUTLINE (khung).** Tài liệu **kiến trúc SEO** — *không* viết bài SEO, *không* code. Định hình chiến lược & thành phần SEO; chi tiết bổ sung sau. Nền tảng SEO chung đã nêu ở [wireframes.md §5](../product/wireframes.md); dữ liệu SEO ở [places.md §8 `place_seo`](../data/modules/places.md). Liên quan: [architecture.md](./architecture.md), [search.md](./search.md), [database.md](../data/database.md).

---

## 1. Mục tiêu

- **Vì sao cần SEO Architecture:** *(khung)* — nội dung do cộng đồng tạo ở quy mô lớn cần **cấu trúc URL, schema, sitemap, canonical** nhất quán để index đúng, tránh trùng lặp, và nổi bật trên kết quả tìm kiếm địa phương (Phú Quốc).
- **Mục tiêu dài hạn:** *(khung)* — trở thành nguồn được **Google ưu tiên** cho truy vấn về Phú Quốc (địa điểm, khách sạn, ẩm thực, tour, sự kiện); tối đa **organic traffic** bền vững; hỗ trợ song ngữ vi/en.

## 2. Nguyên tắc chung *(khung)*

- **SSR/SSG** cho trang công khai; trang cá nhân/admin `noindex`.
- **Một nguồn schema** (từ `place_seo` + fallback tự sinh); nhãn AI rõ ràng.
- **Song ngữ vi/en** với `hreflang`; URL/slug sạch, canonical chuẩn.
- **Mobile-first + Core Web Vitals**; ảnh/video tối ưu.
- Phân biệt **trang indexable** (landing danh mục/khu vực, chi tiết) vs **noindex** (kết quả tìm động, khu riêng tư).

---

## Phần A — 20 thành phần SEO

> Mỗi mục là **khung** (heading + phạm vi sẽ triển khai), chưa viết chi tiết.

1. **URL Structure** — quy ước slug, phân cấp đường dẫn theo loại/khu vực, ổn định & không đổi khi rename. *(khung)*
2. **Internal Linking** — liên kết chéo (địa điểm gần, cùng danh mục, breadcrumb, related), phân bổ link equity. *(khung)*
3. **Sitemap** — sitemap index + sitemap con theo loại; cập nhật khi publish/archive. *(khung)*
4. **Robots** — `robots.txt` + meta robots; chặn khu riêng tư/kết quả động; cho phép landing. *(khung)*
5. **Canonical** — chuẩn hóa URL, chống trùng (tham số lọc, phân trang, song ngữ). *(khung)*
6. **Breadcrumb** — phân cấp điều hướng + `BreadcrumbList` JSON-LD. *(khung)*
7. **Schema.org (JSON-LD)** — chiến lược structured data theo loại thực thể (Phần B). *(khung)*
8. **Open Graph / Twitter Card** — OG title/description/image (cover) cho chia sẻ mạng xã hội. *(khung)*
9. **Image SEO** — `alt`, tên file, kích thước/định dạng (WebP/AVIF), lazy-load, `srcset`. *(khung)*
10. **Video SEO** — `VideoObject`, thumbnail, transcript/caption, nhúng an toàn. *(khung)*
11. **FAQ Schema** — `FAQPage` từ `place_faqs` (chỉ FAQ đã duyệt). *(khung)*
12. **Review Schema** — `Review`/`AggregateRating` (chỉ review published; tránh spam markup). *(khung)*
13. **Business Schema** — `LocalBusiness` cho cơ sở đã claim/verified. *(khung)*
14. **Event Schema** — `Event` (startDate/endDate/location/eventStatus). *(khung)*
15. **Hotel Schema** — `Hotel`/`LodgingBusiness` (amenityFeature, starRating, priceRange). *(khung)*
16. **hreflang** — cặp vi/en + `x-default`; đồng bộ canonical. *(khung)*
17. **RSS** — feed nội dung mới (bài viết/sự kiện) cho subscriber & khám phá. *(khung)*
18. **News Sitemap** — cho nội dung tin/sự kiện nhạy thời gian (nếu áp dụng). *(khung)*
19. **Image Sitemap** — cho gallery ảnh địa điểm (tăng index ảnh). *(khung)*
20. **Core Web Vitals** — LCP/INP/CLS: ngân sách hiệu năng, ảnh/priority, cache/CDN (Cloudflare). *(khung)*

---

## Phần B — SEO riêng theo loại

> Mỗi loại nêu **khung**: chiến lược render · schema chính · canonical/hreflang · meta trọng tâm · thuộc sitemap nào. *(chi tiết sau)*

- **Place** — render SSR theo slug; schema `TouristAttraction`/`LocalBusiness` + `FAQPage` + `BreadcrumbList`; sitemap địa điểm + image sitemap. *(khung)*
- **Hotel** — `Hotel`/`LodgingBusiness` (starRating, amenityFeature, priceRange); lọc "lưu trú gần…". *(khung)*
- **Restaurant** — `Restaurant` (servesCuisine, menu, priceRange, openingHours). *(khung)*
- **Tour** — `TouristTrip`/`Trip` (itinerary, offers); lộ trình. *(khung)*
- **Event** — `Event` (startDate/endDate, eventStatus); news/RSS; trạng thái theo thời gian. *(khung)*
- **Community** — `DiscussionForumPosting`/`QAPage`; canonical theo slug; RSS. *(khung)*
- **Business** — `LocalBusiness` (verified); trang công khai của cơ sở; NAP nhất quán. *(khung)*
- **Guide** — nội dung biên tập (bài hướng dẫn): `Article`/`HowTo` + breadcrumb; internal linking tới Place. *(khung)*

---

## Điểm cần quyết định sau (open questions) *(khung)*

- Quy ước **URL/slug** cuối cùng (có tiền tố loại/khu vực không; xử lý song ngữ).
- Chiến lược **canonical** cho trang lọc/phân trang & song ngữ.
- Trang nào **indexable** vs **noindex** (ranh giới landing danh mục/khu vực vs kết quả động).
- Áp dụng **News Sitemap/RSS** tới đâu (chỉ Event/Community?).
- **Ngân sách Core Web Vitals** & cơ chế đo (RUM/CrUX) — nối [deployment.md §12](./deployment.md).
- Chính sách **Review/FAQ schema** để tránh bị phạt markup lạm dụng.

---

*Tài liệu liên quan: [wireframes.md §5](../product/wireframes.md), [places.md §8](../data/modules/places.md), [discovery.md](../product/discovery.md), [engagement.md](../product/engagement.md), [search.md](./search.md), [architecture.md](./architecture.md), [deployment.md](./deployment.md), [database.md](../data/database.md), [vision.md](../overview/vision.md).*
