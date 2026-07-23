# PhuQuocHub — Ngăn xếp công nghệ (Tech Stack)

> **Mục đích:** liệt kê các công nghệ được chọn cho từng tầng và **lý do lựa chọn**, làm nơi tra cứu quyết định kỹ thuật. Đây là khung (outline) — bổ sung chi tiết & so sánh phương án sau.

## 1. Các mục chính

### 1.1 Frontend
- Next.js (App Router), React, TypeScript.
- MapLibre GL JS (bản đồ OSM), React Query, Zustand.
- Hệ thống UI (Tailwind + design tokens — cần chốt).

### 1.2 Backend
- NestJS, TypeScript.
- ORM: TypeORM (hỗ trợ PostGIS `geometry`).
- Validation: class-validator / DTO.

### 1.3 Dữ liệu & lưu trữ
- PostgreSQL 15+ với PostGIS.
- Redis (cache, session, hàng đợi BullMQ, buffer analytics).
- Object Storage (S3/MinIO) cho media.
- (Tương lai) Meilisearch/Elasticsearch cho tìm kiếm quy mô lớn.

### 1.4 Hạ tầng & DevOps
- Monorepo: Turborepo.
- Docker / docker-compose; nginx reverse proxy.
- CI/CD (cần chốt: GitHub Actions).
- Chi tiết triển khai: [deployment.md](./deployment.md).

### 1.5 Bảng quyết định công nghệ
- Tổng hợp lựa chọn + lý do + phương án thay thế (mở rộng bảng ở [architecture.md](./architecture.md) §11).

## 2. Ghi chú — nội dung bổ sung sau

- [ ] Ghi rõ **phiên bản** từng công nghệ.
- [ ] So sánh phương án đã cân nhắc (TypeORM vs Prisma, MapLibre vs Leaflet, Turborepo vs Nx…).
- [ ] Tiêu chí đánh giá & rủi ro của mỗi lựa chọn.
- [ ] Danh sách thư viện phụ thuộc chính và giấy phép.

---

*Tài liệu liên quan: [architecture.md](./architecture.md), [deployment.md](./deployment.md), [coding-standard.md](../standards/coding-standard.md)*
