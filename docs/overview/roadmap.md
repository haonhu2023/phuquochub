# PhuQuocHub — Lộ trình phát triển (Roadmap)

> Lộ trình theo giai đoạn, ưu tiên đưa nền tảng dữ liệu lõi ra sớm rồi mở rộng cộng đồng. Mốc thời gian mang tính định hướng, điều chỉnh theo nguồn lực.

## Giai đoạn 0 — Nền móng (Foundation)
**Mục tiêu:** Dựng khung dự án chạy được ở môi trường dev.

- [ ] Khởi tạo monorepo (Turborepo): `apps/web`, `apps/api`, `packages/*`.
- [ ] `docker-compose`: PostgreSQL + PostGIS, Redis.
- [ ] Cấu hình ESLint/Prettier/TSConfig chung, Husky.
- [ ] Kết nối NestJS ↔ Postgres (TypeORM) + Redis.
- [ ] Kết nối Next.js ↔ API (health check).
- [ ] CI cơ bản (lint + build + test).

**Kết quả:** Môi trường dev chạy được, pipeline CI xanh.

## Giai đoạn 1 — MVP Dữ liệu địa điểm (Core Data)
**Mục tiêu:** Có kho địa điểm và bản đồ hoạt động.

- [ ] Module `auth` (đăng ký, đăng nhập, JWT, RBAC).
- [ ] Module `users`, `categories`.
- [ ] Module `places` + PostGIS (CRUD, index không gian).
- [ ] Module `geo` (`nearby`, `bbox`, geocode qua Nominatim).
- [ ] Frontend: bản đồ MapLibre + OSM, danh sách & chi tiết địa điểm.
- [ ] Tìm kiếm cơ bản (Postgres FTS + không dấu).
- [ ] Seed dữ liệu địa điểm ban đầu (import từ OSM).

**Kết quả:** Người dùng xem địa điểm trên bản đồ, tìm kiếm, xem chi tiết.

## Giai đoạn 2 — Cộng đồng & Đóng góp (Community)
**Mục tiêu:** Người dùng đóng góp và làm giàu dữ liệu.

- [ ] Module `reviews` (đánh giá, rating trung bình).
- [ ] Module `media` (upload ảnh, object storage, resize job).
- [ ] Module `contributions` + luồng kiểm duyệt (moderation).
- [ ] Vai trò contributor/moderator, hàng chờ duyệt.
- [ ] Module `community` (bài viết, bình luận cơ bản).
- [ ] Cache Redis cho địa điểm hot & kết quả tìm kiếm.

**Kết quả:** Dữ liệu tăng trưởng nhờ cộng đồng, có kiểm soát chất lượng.

## Giai đoạn 3 — Trải nghiệm & Mở rộng (Experience)
**Mục tiêu:** Nâng chất lượng trải nghiệm và độ phủ.

- [ ] PWA: cài đặt, cache offline bản đồ/địa điểm.
- [ ] Module `notifications` (đóng góp được duyệt, phản hồi).
- [ ] Bộ lọc nâng cao, gợi ý địa điểm theo vị trí.
- [ ] Trang thống kê / dữ liệu mở (open data dashboard).
- [ ] Đa ngôn ngữ (vi/en).
- [ ] Tối ưu SEO (SSG cho trang địa điểm).

**Kết quả:** Trải nghiệm nhanh, phủ rộng, thân thiện du khách quốc tế.

## Giai đoạn 4 — Nền tảng mở & Quy mô (Platform & Scale)
**Mục tiêu:** Trở thành hạ tầng dữ liệu mở, sẵn sàng quy mô lớn.

- [ ] **Public API** cho nhà phát triển bên thứ ba (API key, quota).
- [ ] Chuyển tìm kiếm sang Meilisearch/Elasticsearch.
- [ ] Read replica Postgres, horizontal scale API.
- [ ] Tách module tải cao (search/media) nếu cần.
- [ ] Cơ chế đồng bộ hai chiều với OpenStreetMap (đóng góp ngược).
- [ ] Phân tích dữ liệu / báo cáo cho chính quyền, nghiên cứu.

**Kết quả:** Nền tảng mở, bền vững, được hệ sinh thái sử dụng.

## Các hạng mục xuyên suốt (Cross-cutting)

- **Bảo mật:** rà soát định kỳ, rate limiting, kiểm thử bảo mật.
- **Quan sát (Observability):** logging tập trung, metrics, health check.
- **Tài liệu:** cập nhật `docs/` mỗi khi đổi contract/kiến trúc.
- **Kiểm thử:** duy trì coverage cho logic lõi.
- **Sao lưu:** backup định kỳ Postgres + object storage.

## Ưu tiên & Nguyên tắc

1. **Dữ liệu lõi trước, tính năng phụ sau.**
2. **Chất lượng dữ liệu > số lượng** (kiểm duyệt ngay từ giai đoạn 2).
3. **Không tối ưu/scale sớm** — chỉ khi có tín hiệu thực tế.
4. **Mở và tái sử dụng** — API và dữ liệu mở là mục tiêu dài hạn.

---

*Tài liệu liên quan: [vision.md](./vision.md), [architecture.md](../architecture/architecture.md)*
