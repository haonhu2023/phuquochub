# PhuQuocHub — Kiến trúc hệ thống (Architecture)

## 1. Tổng quan

PhuQuocHub áp dụng kiến trúc **Modular Monolith** trong một **Monorepo**, với frontend Next.js và backend NestJS chia sẻ types chung. Dữ liệu địa lý lưu trong PostgreSQL + PostGIS, cache bằng Redis, bản đồ dựa trên OpenStreetMap.

```
┌─────────────────────────────────────────────────────────────┐
│                    NGƯỜI DÙNG (Web / PWA)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│                    FRONTEND — Next.js                        │
│    App Router · SSR/SSG · React Query · MapLibre (OSM)       │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST API
┌───────────────────────────▼─────────────────────────────────┐
│                    BACKEND — NestJS                          │
│  Auth · Places · Geo · Reviews · Community · Media · Search  │
└──────┬───────────────┬──────────────┬──────────────┬────────┘
       │               │              │              │
 ┌─────▼─────┐   ┌─────▼─────┐  ┌─────▼──────┐  ┌────▼──────┐
 │PostgreSQL │   │   Redis   │  │  Object    │  │ OSM /     │
 │+ PostGIS  │   │  (cache)  │  │  Storage   │  │ Nominatim │
 └───────────┘   └───────────┘  └────────────┘  └───────────┘
```

## 2. Nguyên tắc kiến trúc

1. **Module hóa:** Mỗi domain nghiệp vụ là một module độc lập, có ranh giới rõ ràng.
2. **Chia sẻ contract:** Types/DTO dùng chung giữa FE và BE qua `packages/shared-types` để tránh lệch API.
3. **Tách hạ tầng khỏi nghiệp vụ:** Database, Redis, config nằm ở tầng `core`, module nghiệp vụ không phụ thuộc trực tiếp vào hạ tầng.
4. **Ưu tiên mở:** OpenStreetMap thay vì bản đồ độc quyền.
5. **Không tối ưu sớm:** Monolith trước, microservice sau.

## 3. Cấu trúc Monorepo

```
phuquochub/
├── apps/
│   ├── web/            # Next.js frontend
│   └── api/            # NestJS backend
├── packages/
│   ├── shared-types/   # DTO, enum, interface dùng chung
│   ├── ui/             # Design system / component library
│   ├── config/         # ESLint, TSConfig, Prettier chung
│   └── utils/          # Hàm tiện ích chung
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── k8s/
├── docs/
└── turbo.json
```

## 4. Frontend (Next.js)

- **App Router**: tách route công khai `(public)`, xác thực `(auth)`, khu đăng nhập `(dashboard)`.
- **Tổ chức theo module** trong `src/modules/` (places, map, community, reviews, search, auth).
- **State**: React Query cho server-state, Zustand cho client-state.
- **Bản đồ**: MapLibre GL JS render tiles OSM. Không dùng OSM tile server công cộng cho production tải cao — dùng nhà cung cấp (MapTiler/Stadia) hoặc tự host.

## 5. Backend (NestJS)

### Các module nghiệp vụ
| Module | Trách nhiệm |
|---|---|
| `auth` | Đăng nhập, JWT, OAuth, refresh token. |
| `users` | Hồ sơ, vai trò (role), phân quyền. |
| `places` | Địa điểm (POI) — module lõi. |
| `geo` | Truy vấn không gian (PostGIS), geocoding (Nominatim). |
| `categories` | Phân loại địa điểm. |
| `reviews` | Đánh giá, rating. |
| `community` | Bài viết, thảo luận. |
| `media` | Upload ảnh, object storage. |
| `search` | Tìm kiếm văn bản + không gian. |
| `contributions` | Đóng góp dữ liệu + kiểm duyệt (moderation). |
| `notifications` | Thông báo. |

### Tầng hạ tầng (`core`)
- `database/` — cấu hình ORM, migrations.
- `redis/` — cache service, kết nối Redis.
- `config/` — nạp và validate biến môi trường.
- `logger/` — logging tập trung.

### Tầng dùng chung (`common`)
- Decorators, Guards (RolesGuard, ThrottlerGuard), Interceptors (logging, cache, transform), Filters (exception), Pipes (validation).

## 6. Dữ liệu & Lưu trữ

- **PostgreSQL + PostGIS**: nguồn sự thật; cột `geometry` cho tọa độ; truy vấn `ST_DWithin`, `ST_Contains`, `ST_Distance`.
- **Redis**: cache-aside, session/refresh token, rate limiting, hàng đợi job (BullMQ), pub/sub cho WebSocket.
- **Object Storage** (S3/MinIO): ảnh và media — không lưu file nhị phân trong Postgres.

## 7. Chiến lược cache

```
Request → Redis hit? ──Yes──► trả về
              │ No
              └─► Query PostGIS → ghi Redis (TTL) → trả về
```
- Cache-aside cho dữ liệu đọc nhiều ghi ít (địa điểm, danh mục).
- Invalidate khi cập nhật/kiểm duyệt.
- Có thể dùng geohash làm key cho truy vấn bản đồ theo vùng.

## 8. Background Jobs

- Dùng **BullMQ** trên Redis.
- Xử lý: resize/optimize ảnh, đồng bộ dữ liệu OSM, gửi email/thông báo, tính toán thống kê.

## 9. Bảo mật (Security)

**Tổng quan:** xác thực bằng JWT (access ngắn hạn + refresh thu hồi được), phân quyền theo **RBAC + Permission** (deny by default, không hardcode), rate limiting và validation đầu vào ở tầng biên/API.

Thiết kế chi tiết tách riêng — xem:
- **Kiến trúc bảo mật & cưỡng chế phân quyền:** [security.md](./security.md)
- **Vai trò & permission (RBAC):** [rbac.md](../security/rbac.md)

## 10. Khả năng mở rộng (Scaling path)

1. **Giai đoạn 1**: Monolith 1 instance + Postgres + Redis.
2. **Giai đoạn 2**: Horizontal scale API (stateless) sau load balancer; read replica cho Postgres.
3. **Giai đoạn 3**: Tách module tải cao (ví dụ `search`, `media`) thành service riêng khi cần.
4. **Tìm kiếm**: Postgres FTS → Meilisearch/Elasticsearch khi dữ liệu lớn.

## 11. Quyết định công nghệ cần chốt

| Hạng mục | Lựa chọn đề xuất | Ghi chú |
|---|---|---|
| ORM | **TypeORM** | Hỗ trợ kiểu `geometry` PostGIS tốt hơn Prisma. |
| Monorepo tool | **Turborepo** | Nhẹ, đủ dùng. |
| API style | **REST** | GraphQL cân nhắc sau cho truy vấn phức tạp. |
| Tile provider | MapTiler / tự host | OSM public tiles cấm dùng production tải cao. |

---

*Tài liệu liên quan: [database.md](../data/database.md), [api.md](../api/api.md), [vision.md](../overview/vision.md)*
