# PhuQuocHub — Monorepo

> Wikipedia + Reddit + Google Maps cho Phú Quốc. Modular Monolith trong monorepo.
> Thiết kế chi tiết: [`docs/`](docs/README.md). ORM: **TypeORM** (theo [architecture.md](docs/architecture/architecture.md) §11).

## Trạng thái hiện thực

| Sprint | Nội dung | Trạng thái |
|---|---|---|
| **Sprint 0** | Foundation: monorepo, NestJS+TypeORM+Redis, Next.js, health-check, docker, CI | ✅ Code đã sinh — **Chưa verify do thiếu môi trường chạy** |
| **Sprint 1** | Auth (JWT access+refresh), RBAC (PDP/PEP deny-by-default), Users, Categories | ✅ Code đã sinh — **Chưa verify** |
| **Wave 1 (S2–S3, core)** | Places cluster + PostGIS/FTS, Contacts, Prices, Media(entity), Geo (nearby/bbox/geocode), Search (FTS unaccent) | ✅ Code đã sinh — **Chưa verify**; còn Verification/Source/WikiRevision + FE map |
| Wave 2+ | Hotel/Restaurant/Tour/Event, Notification, Report, Audit… | ⏳ Chưa bắt đầu |

### Endpoint Sprint 1 (prefix `/api`)

```
POST /api/auth/register  · /login · /refresh · /logout
GET  /api/users/me       · PATCH /api/users/me
GET  /api/users/:id      (public)
POST /api/users/:id/roles · DELETE /api/users/:id/roles/:roleId   (Role.Assign)
GET  /api/roles          (Role.Assign) · GET /api/permissions (Permission.Manage)
GET  /api/categories · /:id (public) · POST/PATCH/DELETE (Category.Manage)

# Wave 1 (Places/Geo/Search)
GET  /api/places · /:slug (public) · POST (Place.Create) · PATCH/:id (Place.Edit.Managed)
     DELETE/:id (Place.Archive) · POST /:id/approve (Place.Approve)
GET  /api/places/:id/contacts (public) · POST (Contact.Edit.Managed) · PATCH/DELETE /api/contacts/:id
GET  /api/places/:id/prices?history= (public) · POST (Price.Edit.Managed) · PATCH /api/prices/:id
GET  /api/geo/nearby · /bbox · /geocode (public)
GET  /api/search?q= · /search/suggest (public) · POST /search/reindex (Search.Reindex)
```

## Yêu cầu môi trường

- **Node.js ≥ 20** và **npm ≥ 10** (xem [.nvmrc](.nvmrc))
- **Docker** + Docker Compose (để chạy PostgreSQL/PostGIS, Redis, MinIO)

## Cấu trúc

```
apps/
├── api/    # NestJS + TypeORM + PostGIS + Redis (backend)
└── web/    # Next.js App Router (frontend)
packages/
├── shared-types/   # DTO/enum dùng chung FE↔BE
├── utils/          # tiện ích chung (slugify tiếng Việt…)
└── config/         # tsconfig/prettier presets
infrastructure/docker/postgres/init/   # SQL bật extension PostGIS
docs/    # tài liệu thiết kế (nguồn sự thật)
```

## Bắt đầu (local dev)

```bash
# 1) Cài dependencies (workspaces)
npm install

# 2) Tạo file env
cp .env.example .env

# 3) Bật hạ tầng (Postgres/PostGIS + Redis + MinIO)
docker compose up -d postgres redis minio

# 4) Chạy migration (bật extension PostGIS…)
npm run migration:run --workspace @phuquochub/api

# 5) Chạy dev (song song api + web qua turbo)
npm run dev
#   API:  http://localhost:4000/api/health
#   Web:  http://localhost:3000
```

## Lệnh kiểm chứng (build / test)

> ⚠️ Các lệnh dưới **chưa được chạy** trong môi trường sinh code (thiếu Node/Docker).
> Chạy trên máy có toolchain để xác minh.

```bash
npm run typecheck     # kiểm tra kiểu toàn workspace
npm run lint          # eslint
npm run build         # build tất cả (turbo)
npm test              # unit test (không cần DB)

# Test e2e (CẦN Postgres + Redis đang chạy):
docker compose up -d postgres redis
npm run migration:run --workspace @phuquochub/api
npm run test:e2e --workspace @phuquochub/api
```

## Ghi chú kỹ thuật (Sprint 0)

- **TypeORM** `synchronize=false` — mọi thay đổi schema qua migration (migration-first). Naming `SnakeNamingStrategy` (cột/bảng snake_case).
- Migration: `InitExtensions` (postgis/unaccent/pg_trgm/pgcrypto) → `InitRbacAndUsers` → `InitCategories` → `SeedRbac` (10 vai trò + permission + kế thừa DAG).
- **Repository Pattern:** service không chạm ORM trực tiếp, đi qua `*.repository.ts`.
- **RBAC:** guard toàn cục `JwtAuthGuard` (AuthN) → `PermissionsGuard` (AuthZ, deny-by-default); PDP suy quyền qua kế thừa DAG + wildcard + explicit deny (`authorization.service.ts`).
- Envelope response `{ success, data, meta }` / lỗi `{ success, error, meta }` (khớp [openapi.yaml](docs/api/openapi.yaml)); field response snake_case.
- `prisma/schema.prisma` là **artifact thiết kế cũ** — không dùng để sinh code (đã chọn TypeORM). Giữ lại để tham chiếu mô hình dữ liệu.

### Deviation / hoãn có chủ đích (Sprint 1)

- **Email verification & reset password (WF-03/04):** hoãn — cần entity token (CHƯA phê duyệt, thuộc Wave). Vì vậy `register` tạm đặt `is_active=true` (WF-01 mô tả `false` tới khi verify).
- **`user_roles.business_id → places`:** FK hoãn tới Sprint 2 (bảng `places` chưa tồn tại) — hiện là `uuid` không FK.
- Google OAuth (`/auth/google`) chưa hiện thực (Sprint sau).
