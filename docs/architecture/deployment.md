# PhuQuocHub — Triển khai & Hạ tầng (Deployment Architecture)

> **Mục đích:** thiết kế **kiến trúc triển khai/DevOps** — cách đóng gói, đưa lên các môi trường, vận hành, sao lưu và giám sát. Tài liệu này vẫn là **thiết kế mục tiêu đầy đủ** (VPS Hostinger, Cloudflare, PgBouncer, Prometheus/Grafana…) — phần lớn CHƯA triển khai. Kiến trúc ứng dụng ở [architecture.md](./architecture.md); công nghệ ở [tech-stack.md](./tech-stack.md); quy trình nhánh ở [coding-standard.md §10](../standards/coding-standard.md).
>
> **Trạng thái triển khai (PLACE-026, 2026-07-24 — OD2-2..9).** Phần "repository-supported" của
> §6-§9/§11 đã có code thật, đã kiểm chứng chạy được thật (không phải giả lập):
> - `apps/api/Dockerfile`, `apps/web/Dockerfile` — build production đa giai đoạn, **đã build +
>   chạy thật** kết nối Postgres/Redis thật, `/api/health` trả 200.
> - `docker-compose.prod.yml` — ráp api+web+postgres+redis+minio dạng "giống production", cục bộ.
> - WAL archiving (§11.1) — `infrastructure/docker/postgres/wal-archive.sh` +
>   `postgresql.prod.conf`, **đã kiểm chứng thật**: `archive_mode=on`, WAL segment thật được sao
>   lưu sau `pg_switch_wal()`. Đích lưu là **thư mục cục bộ** (biến `WAL_ARCHIVE_DIR`) — CHƯA trỏ
>   tới đích offsite thật (§11.1 khuyến nghị R2/Backblaze) vì session này không có credential.
> - `.github/workflows/ci.yml` job `docker-build` — build + validate hai image tự động trong CI.
>   Bước đẩy lên GHCR (§6.8, OD2-7) dùng `GITHUB_TOKEN` có sẵn — **CHƯA được một lần chạy CI thật
>   xác nhận** vì repo này chưa có git remote trong session.
> - Map tile provider (§14, OD2-8) — `apps/web/src/modules/map/MapView.tsx` đọc
>   `NEXT_PUBLIC_MAP_TILE_URL`, mặc định giữ nguyên OpenStreetMap hiện tại; đổi sang MapTiler thật
>   chỉ cần set biến môi trường, không cần sửa code.
>
> **CHƯA triển khai (cần owner cung cấp credential/tài khoản thật, không thể giả lập trong
> session):** VPS Hostinger thật (§6.1, OD2-2), bucket R2/MinIO production thật (§6.6, OD2-3), đích
> offsite backup thật + mã hoá (§11.2/11.3, OD2-5), tài khoản MapTiler thật (§14, OD2-8), Cloudflare
> (§6.7), PgBouncer (§6.4), và toàn bộ Prometheus/Grafana/Sentry (§12). Xem
> `docs/delivery/reports/PLACE-026-deployment-pipeline-report.md` cho chi tiết đầy đủ.
>
> **Trạng thái triển khai (PLACE-028, 2026-07-24 — OD2-12 rate limiting + OD2-13 CORS).** Bootstrap
> API (`apps/api/src/main.ts`) đã có, **đã kiểm chứng thật**:
> - **Rate limiting:** `@nestjs/throttler` — giới hạn toàn cục qua `RATE_LIMIT_TTL`/`RATE_LIMIT_LIMIT`
>   (mặc định 100 req/60s), giới hạn riêng nghiêm ngặt hơn cho `/api/auth/login`+`/api/auth/register`
>   qua `RATE_LIMIT_AUTH_TTL`/`RATE_LIMIT_AUTH_LIMIT` (mặc định 10 req/60s), `/api/health` được miễn
>   trừ (`@SkipThrottle`). **Chỉ in-memory, một instance** — chưa phải "hai lớp (CF + Redis)" như
>   thiết kế mục tiêu ở [security.md §1](./security.md) mô tả; khi API chạy nhiều instance/hàng ngang
>   cần chuyển sang `ThrottlerStorageRedisService` (đã tương thích sẵn với `@nestjs/throttler`, chưa
>   triển khai — không cần thiết ở quy mô một instance hiện tại).
> - **CORS:** allow-list tường minh qua `CORS_ALLOWED_ORIGINS` (thay cho `origin: true` trước đây);
>   **bắt buộc và fail-fast khi khởi động** nếu thiếu lúc `NODE_ENV=production`; `CORS_CREDENTIALS`
>   mặc định `false` (xác thực dùng bearer token qua header `Authorization`, không dùng cookie).
> - `TRUST_PROXY_HOPS` (mặc định `0`) — chưa có reverse proxy thật đứng trước API nên header
>   `X-Forwarded-*` chưa được tin cậy; tăng giá trị này khi nginx/Cloudflare thật được triển khai.
> - Domain production thật **CHƯA được cung cấp** — `CORS_ALLOWED_ORIGINS` trong
>   `docker-compose.prod.yml` hiện trỏ về `http://localhost:3000` (khớp cổng service `web` cục bộ),
>   PHẢI đổi thành domain thật trước khi triển khai thật. Xem
>   `docs/delivery/reports/PLACE-028-api-bootstrap-hardening-report.md` cho chi tiết đầy đủ.

---

## 1. Mục tiêu & phạm vi

- Triển khai **modular monolith** (Next.js + NestJS) một cách **đơn giản, rẻ, tin cậy** trên **Hostinger VPS**, có đường **nâng cấp quy mô** khi cần.
- **Bốn môi trường** rõ ràng: `Local · Development · Staging · Production` với **parity** (giống nhau tối đa).
- **Tự động hóa** build/test/deploy qua **GitHub Actions**; **Cloudflare** ở biên (DNS/CDN/TLS/WAF).
- **An toàn dữ liệu** (backup + DR có kiểm thử) và **quan sát được** (metrics/logs/alerts).
- **Mục tiêu dung lượng MVP (1–2 năm):** ~**100.000 người dùng/tháng**, **10.000 địa điểm**, **1 triệu ảnh**, **100.000 review** — đọc nhiều, ghi ít; sẵn sàng **scale ngang** về sau.

**Ngoài phạm vi (giai đoạn đầu):** Kubernetes, multi-region, auto-scaling đám mây (nêu ở lộ trình §14).

## 2. Nguyên tắc DevOps

1. **Parity môi trường.** Cùng một **Docker image** chạy qua các môi trường; chỉ khác **cấu hình** (env/secret).
2. **Immutable & versioned.** Image gắn tag theo commit SHA/semver; deploy = đổi tag, không sửa tại chỗ.
3. **Infra as config.** Cấu hình hạ tầng nằm trong repo (`infrastructure/`), review qua PR.
4. **Secrets tách khỏi code.** Không commit secret; nạp qua env/secret store; `.env.example` làm khuôn.
5. **Zero-downtime khi có thể.** Health check + rolling/blue-green ở mức container; migration tương thích ngược.
6. **Backup phải phục hồi được.** Diễn tập khôi phục định kỳ; RPO/RTO rõ ràng.
7. **Least privilege.** Firewall chặt; DB/Redis/MinIO **không lộ ra Internet**; SSH key-only.
8. **Quan sát được.** Mọi dịch vụ có health check, metrics, log tập trung, cảnh báo sớm.

## 3. Bốn môi trường — tổng quan

| Môi trường | Mục đích | Hạ tầng | Nguồn deploy | Dữ liệu | Domain (ví dụ) |
|---|---|---|---|---|---|
| **Local** | Lập trình & thử nhanh | `docker-compose` máy dev (hot reload) | thủ công | seed nhỏ, giả lập | `localhost` |
| **Development** | Tích hợp liên tục nhánh `develop` | container stack trên VPS dùng chung | **auto** từ `develop` | ephemeral, seed/anonymized | `dev.phuquochub.*` |
| **Staging** | Bản sao **giống production** để nghiệm thu | prod-like, tài nguyên nhỏ hơn | từ `release/*`/tag RC | prod-like **ẩn danh hóa** | `staging.phuquochub.*` |
| **Production** | Phục vụ người dùng thật | **Hostinger VPS** + Cloudflare | **manual approval** từ `main` | dữ liệu thật (backup + PITR) | `phuquochub.*` |

- **Tối ưu chi phí ban đầu:** `Development` + `Staging` có thể **cùng trú trên một VPS** (hai compose project tách biệt, subdomain & mạng riêng); `Production` **VPS riêng**. Tách hẳn khi tải tăng (§14).
- **Khác biệt chỉ ở cấu hình** (log level, domain/CORS, quota, khóa provider, feature flag) — **không** khác code.

## 4. Kiến trúc từng môi trường

> Mỗi môi trường mô tả theo: **Mục đích · Thành phần · Dịch vụ sử dụng · Cấu hình đề xuất · Luồng triển khai · Backup · Rollback.**

### 4.1 Local
- **Mục đích:** vòng lặp phát triển nhanh trên máy cá nhân; tái tạo môi trường giống production ở mức tối thiểu.
- **Thành phần:** `web` + `api` (+ `worker`) chạy hot-reload; Postgres+PostGIS, Redis, MinIO chạy trong container.
- **Dịch vụ sử dụng:** toàn bộ nội bộ (không Cloudflare, không TLS công khai); provider ngoài (AI, tile, weather) dùng **khóa dev/sandbox** hoặc mock.
- **Cấu hình đề xuất:** máy dev **≥ 8 GB RAM**, Docker Desktop/Engine; seed dữ liệu mẫu (danh mục + vài địa điểm OSM); `.env.local` từ `.env.example`; migration chạy thủ công.
- **Luồng triển khai:** developer khởi động stack thủ công (`compose up`), chạy migration + seed; đổi code → hot reload.
- **Backup:** **không cần** — dữ liệu ephemeral, seed **tái tạo được**; tránh lưu dữ liệu thật.
- **Rollback:** `git checkout` nhánh/commit trước; dựng lại container/volume (reset DB bằng seed) khi cần trạng thái sạch.

### 4.2 Development
- **Mục đích:** môi trường **tích hợp chung** để kiểm thử nhánh `develop`, demo nội bộ, chạy e2e.
- **Thành phần:** web/api/worker/nginx + Postgres/Redis/MinIO (container) trên VPS dùng chung (project compose `dev`).
- **Dịch vụ sử dụng:** Cloudflare (subdomain `dev.*`, có thể bảo vệ bằng Access/Basic-Auth); provider **khóa dev**; GitHub Actions tự deploy.
- **Cấu hình đề xuất:** tài nguyên nhỏ (**2 vCPU / 4 GB RAM / 60–80 GB SSD** chia sẻ với Staging); log level `debug`; quota/rate-limit thấp; feature flag bật thử nghiệm.
- **Luồng triển khai:** merge vào `develop` → CI build image (tag SHA) → **tự động** deploy lên Dev → smoke test.
- **Backup:** **tối thiểu** (ephemeral) — không cam kết; có thể snapshot DB thỉnh thoảng để tiện debug; media dev không cần bền.
- **Rollback:** redeploy **image SHA trước** (tự động/1 lệnh); reset dữ liệu bằng seed nếu hỏng.

### 4.3 Staging
- **Mục đích:** **bản sao production** để nghiệm thu trước phát hành (UAT), thử migration, **diễn tập DR**.
- **Thành phần:** giống Production về cấu trúc (web/api/worker/nginx + Postgres/Redis/MinIO), tài nguyên nhỏ hơn.
- **Dịch vụ sử dụng:** Cloudflare (`staging.*`, hạn chế truy cập); provider **khóa staging**; GitHub Actions deploy từ `release/*`/tag RC.
- **Cấu hình đề xuất:** **2 vCPU / 8 GB RAM / 120–160 GB SSD** (hoặc chung VPS với Dev); cấu hình **giống prod** (log `info`, quota gần prod); dữ liệu **prod-like ẩn danh hóa**.
- **Luồng triển khai:** tạo `release/*`/tag RC → CI build → deploy Staging → **migration + UAT + smoke/e2e** → duyệt phát hành.
- **Backup:** snapshot định kỳ; **đây là nơi kiểm thử quy trình restore** (khôi phục dump prod ẩn danh để xác nhận DR chạy).
- **Rollback:** redeploy image RC trước; nếu migration lỗi → chạy `down`/forward-fix và restore snapshot Staging.

### 4.4 Production
- **Mục đích:** phục vụ người dùng thật, ưu tiên **ổn định · an toàn dữ liệu · zero-downtime**.
- **Thành phần:** Cloudflare → Hostinger VPS (nginx → web/api/worker) → Postgres+PostGIS/Redis/MinIO; backup offsite; monitoring (sơ đồ §5).
- **Dịch vụ sử dụng:** Cloudflare (DNS/CDN/TLS Full-Strict/WAF/rate-limit biên); provider **khóa prod**; GitHub Actions deploy có **phê duyệt thủ công**; giám sát + alert.
- **Cấu hình đề xuất:** xem **Infrastructure Sizing (§10)** — khởi điểm **4 vCPU / 16 GB RAM / 200 GB NVMe** (media offload R2) hoặc đĩa lớn nếu tự host MinIO; PgBouncer; WAL archiving bật.
- **Luồng triển khai:** merge `main`/tag → CI build & scan → **manual approval** → deploy blue-green (health check pass mới chuyển traffic) → migration expand→contract → smoke test → theo dõi.
- **Backup:** đầy đủ theo **Disaster Recovery (§11)** — Postgres (dump + WAL/PITR), MinIO (versioning + offsite), config, source.
- **Rollback:** chuyển nginx về container **image tag trước** (blue-green, tức thời); dữ liệu: PITR tới thời điểm trước sự cố nếu cần; smoke test fail → **tự rollback**.

## 5. Sơ đồ hạ tầng Production

```
                    ┌───────────────────────────────┐
   Người dùng ─────►│         CLOUDFLARE            │  DNS · CDN · TLS · WAF · DDoS · cache biên
                    └───────────────┬───────────────┘
                                    │  HTTPS (Full-Strict, origin cert) — chỉ CF tới được VPS
             ┌──────────────────────▼───────────────────────────┐
             │            HOSTINGER VPS (Production)             │
             │  UFW: chỉ 443/80 (từ dải IP CF) + SSH hạn chế     │
             │   ┌──────────── Docker network: edge ─────────┐   │
             │   │  NGINX (reverse proxy · TLS origin · gzip │   │
             │   │        · rate-limit biên · định tuyến)    │   │
             │   └───────┬───────────────────────┬──────────┘   │
             │           ▼                       ▼               │
             │   ┌──────────────┐        ┌──────────────┐        │
             │   │ web (Next.js)│        │ api (NestJS) │──┐     │
             │   └──────────────┘        └──────────────┘  │worker (BullMQ)
             │   ┌──────── Docker network: internal (không publish) ────────┐
             │   ▼                    ▼                     ▼                │
             │ ┌───────────┐   ┌───────────┐        ┌──────────────┐        │
             │ │PostgreSQL │   │   Redis    │        │ MinIO        │        │
             │ │+PostGIS   │   │cache·queue │        │ Object Store │        │
             │ │+PgBouncer │   └───────────┘        └──────┬───────┘        │
             │ └─────┬─────┘                               │                │
             └───────┼─────────────────────────────────────┼────────────────┘
                     │ dump + WAL (PITR)                    │ versioning + sync
                     ▼                                      ▼
             ┌───────── OFFSITE BACKUP (nhà cung cấp khác: R2/Backblaze) ─────┐
             │  Postgres backups · MinIO snapshot · secrets · config          │
             └────────────────────────────────────────────────────────────────┘
   Quan sát:  healthchecks → Uptime · exporters → Prometheus/Grafana · logs tập trung · alerts
```

## 6. Thành phần hạ tầng

### 6.1 Hostinger VPS
- **Vai trò:** máy chủ chính chạy toàn bộ stack qua Docker.
- **An ninh:** **UFW** chỉ mở `80/443` (từ dải IP Cloudflare) + `SSH` (đổi cổng/giới hạn IP); **SSH key-only**, tắt password, `fail2ban`; unattended security updates; **ẩn IP gốc** sau Cloudflare.
- **Bố trí:** Production 1 VPS; Dev+Staging có thể chung một VPS khác.

### 6.2 Docker
- **Images:** `web`, `api`, `worker` (worker chung image `api`, khác lệnh); build **multi-stage**, tag **commit SHA**.
- **Registry:** GHCR/registry — VPS **pull** image đã build ở CI (không build trên prod).
- **Mạng:** `edge` (nginx/web/api) publish; `internal` (postgres/redis/minio) **không** publish cổng.
- **State:** container stateless; state ở **named volume** (Postgres/MinIO) tách rõ để backup.

### 6.3 Nginx
- Reverse proxy: kết thúc **TLS origin** (Cloudflare Origin cert), định tuyến `/`→web, `/api|/public|/partner`→api, `/health`; gzip/brotli, security headers, giới hạn upload, **rate-limit biên**; chỉ nhận traffic từ Cloudflare.

### 6.4 PostgreSQL (+ PostGIS)
- Nguồn sự thật; container + volume bền; extension `postgis`/`unaccent`/`pg_trgm` (+ `pgvector` tương lai); **PgBouncer** gộp kết nối; user app **quyền tối thiểu**; migration qua TypeORM (không `synchronize` prod); dump + **WAL/PITR**.

### 6.5 Redis
- cache-aside · session/refresh · rate-limit · **BullMQ queue** · buffer analytics · pub/sub. Có password, bind nội bộ, `maxmemory`+`allkeys-lru` cho cache; **AOF** cho phần queue cần bền.

### 6.6 MinIO / Object Storage
- Lưu media (S3-compatible) + volume bền; **presigned URL** upload; phục vụ qua **CDN Cloudflare** (immutable, hash key); **bucket versioning** + lifecycle; đường nâng cấp **Cloudflare R2/S3**.

### 6.7 Cloudflare
- DNS + Proxy (ẩn IP), **TLS** biên + Full-Strict tới origin, **CDN cache** cho asset & `GET /public` (theo `Cache-Control`/ETag — [api §8](../api/api.md)), **WAF + rate-limit biên + DDoS/Bot**; cache rules bypass `/api` động.

### 6.8 GitHub Actions
- CI/CD: lint→test→build→scan→push image→deploy→smoke (§7); secrets ở **GitHub Environments**; môi trường `production` **protected** (manual approval).

### 6.9 Backup & 6.10 Monitoring
- Chi tiết ở **§11 Disaster Recovery** và **§12 Monitoring**.

## 7. CI/CD Pipeline

**Nhánh ↔ môi trường** (khớp [coding-standard.md §10](../standards/coding-standard.md)):
```
feature/* ──PR──► develop ──auto──► DEVELOPMENT
                     │
                  release/* (tag RC) ──► STAGING (UAT)
                     │
                   main ──manual approval──► PRODUCTION
```

| Bước | Nội dung | Chặn? |
|---|---|---|
| Lint | ESLint/Prettier + typecheck | ✓ |
| Test | unit + integration (DB/redis test container) | ✓ |
| Build | build web/api + Docker image (tag SHA) | ✓ |
| Scan | quét lỗ hổng dependency & image (SCA) | theo mức |
| Push | đẩy image lên registry | — |
| Deploy | VPS pull + up image mới + **migration** | theo môi trường |
| Smoke | `/health` + luồng chính; fail → rollback | ✓ |

- **Migration gating:** chạy **trước** khi chuyển traffic; **tương thích ngược** (expand→migrate→contract) để zero-downtime.

## 8. Cấu hình & Secrets

- **12-factor:** cấu hình qua **biến môi trường**; mỗi môi trường một tập giá trị; `.env.example` liệt kê khóa (không giá trị thật).
- **Secrets:** GitHub Environments (CI/CD) + file bảo vệ quyền trên VPS; **không commit**; **xoay vòng** định kỳ (JWT, DB pass, API keys, CF/registry token).
- **Validate lúc khởi động** (`core/config`) — thiếu/sai → fail fast.

## 9. Luồng deploy & Zero-downtime

- **Blue-green ở mức container:** chạy container mới song song → health check pass → nginx chuyển upstream → dừng container cũ.
- **Health checks:** `/health` (liveness) + `/health/ready` (DB/Redis/MinIO OK).
- **Migration an toàn:** expand → migrate → contract.
- **Rollback:** deploy lại **image tag trước** (immutable) + migration forward-fix; smoke fail → tự rollback.

## 10. Infrastructure Sizing — MVP (1–2 năm)

> Định cỡ theo mục tiêu: **100k người dùng/tháng · 10k địa điểm · 1M ảnh · 100k review**. Đặc tính tải: **đọc nhiều, ghi ít**, phần lớn traffic công khai được **CDN/Redis hấp thụ**. Con số là **điểm khởi đầu có headroom**, tinh chỉnh theo đo thực tế; thiết kế **scale ngang** về sau (§14).

**Ước lượng tải (giả định):**
- 100k MAU → đỉnh đồng thời ~**150–300** phiên; sau CDN + cache, **RPS tới origin ~30–80** (đa số GET công khai đã cache ở Cloudflare).
- **DB:** 10k places + ~1M dòng metadata media + 100k reviews + revisions + bảng analytics tổng hợp → **cỡ vài GB–~20 GB** (kèm index/FTS/PostGIS) trong năm 1–2 → **working set nhỏ, vừa RAM**.
- **Media:** 1M ảnh × ~**300–800 KB** hiệu dụng (bản gốc + thumbnail, đã tối ưu) ≈ **~0.4–1 TB** → **yếu tố dung lượng lớn nhất** → khuyến nghị **offload Cloudflare R2/S3** để giữ đĩa VPS nhỏ.

**Bảng định cỡ đề xuất:**

| Thành phần | Đề xuất MVP | Lý do / Ghi chú |
|---|---|---|
| **VPS (Prod)** | 1 VPS, khởi điểm ~**KVM 4** | Monolith 1 instance đủ cho tải này; nâng gói khi đo thấy chạm ngưỡng |
| **CPU** | **4 vCPU** | ~2 cho api/worker (Node), phần còn lại cho Postgres/nginx; đỉnh RPS 30–80 dư sức |
| **RAM** | **16 GB** | Postgres ~4–6 GB (shared_buffers ~4 GB), Redis ~2–4 GB, app 2–4 GB, OS/đệm phần còn |
| **SSD** | **200 GB NVMe** (media ở R2) *hoặc* **≥1 TB** (tự host MinIO) | OS+Docker+Postgres+logs ~ <150 GB nếu media offload; media 0.4–1 TB nếu tự host |
| **PostgreSQL** | shared_buffers ~25% RAM (~4 GB), effective_cache_size ~50–75%, **PgBouncer** (pool ~100–200), work_mem tuned | Working set nhỏ → cache tốt; pooler tránh cạn kết nối; bật **WAL archiving** |
| **Redis** | **2–4 GB** maxmemory, `allkeys-lru` cho cache; tách logic cache vs **queue (AOF)** | Cache/session/queue tải nhẹ ở quy mô này |
| **Object Storage** | **~0.5–1 TB** (R2 khuyến nghị) + **versioning** + lifecycle | 1M ảnh; R2 rẻ + CDN + không tốn đĩa VPS; MinIO nếu muốn tự chủ |
| **Nginx** | 1 worker/core, tài nguyên **không đáng kể** | TLS origin + gzip + rate-limit; nhẹ |
| **Docker** | tổng images **<10–20 GB**, prune định kỳ | multi-stage image nhẹ; pull từ registry |
| **Cloudflare** | **Free/Pro**; cache rules cho asset & `/public` GET | CDN hấp thụ >80% traffic đọc → origin nhàn; WAF/DDoS kèm |
| **GitHub Actions** | gói **Free/Team**; build+test ~vài phút/lần | 2000 phút/tháng thường đủ; theo dõi minute-usage, cache dependency |
| **Dev + Staging** | chung 1 VPS ~**2 vCPU / 8 GB / 160 GB** | prod-like thu nhỏ; tách VPS khi cần |

**Sẵn sàng scale ngang (khi vượt ngưỡng):** API **stateless** → thêm instance sau load balancer; **read replica** Postgres cho đọc; media đã ở R2 (không ràng buộc VPS); **Meilisearch** cho search ([search.md §12](./search.md)); **Vector DB** cho AI ([ai-architecture.md](../ai/ai-architecture.md)).

## 11. Disaster Recovery (DR)

> Bốn nhóm cần bảo vệ, kèm **RPO** (mất tối đa bao nhiêu dữ liệu) và **RTO** (bao lâu khôi phục xong) + **lý do**.

### 11.1 Backup Database (PostgreSQL)
- **Cách:** `pg_dump` logic **hằng đêm** + **WAL archiving liên tục** → cho phép **PITR** (point-in-time recovery) tới gần thời điểm sự cố; đẩy bản sao **offsite** (R2/Backblaze), **mã hóa**.
- **Lưu giữ:** daily 7 · weekly 4 · monthly 6.
- **RPO ≤ 15 phút** (nhờ WAL) — *lý do:* dữ liệu quan hệ là **quan trọng nhất & không tái tạo được** (đóng góp, review, xác minh); WAL cho RPO nhỏ với chi phí thấp, tốt hơn nhiều so với chỉ dump 24h.

### 11.2 Backup Object Storage (media)
- **Cách:** **bucket versioning** (chống ghi đè/xóa nhầm) + **đồng bộ định kỳ/liên tục** sang lưu trữ ngoài; lifecycle dọn phiên bản cũ.
- **RPO ~24h** (đồng bộ hằng ngày) hoặc **gần 0** (bật replication liên tục — khuyến nghị nếu dùng R2) — *lý do:* media **lớn**, chủ yếu **append-only** (ít sửa/xóa) → versioning + đồng bộ là đủ an toàn; ảnh mất lẻ có thể được người dùng đăng lại, không "chết người" như DB.

### 11.3 Backup Configuration
- **Cách:** cấu hình hạ tầng (nginx, compose, env schema, cron backup) **trong Git**; **secrets** sao lưu **mã hóa** riêng (không trong Git); tài liệu vận hành cập nhật.
- **RPO ~ lần commit/đổi gần nhất** (≈ 0 với thay đổi đã commit) — *lý do:* config thay đổi ít, versioned tự nhiên qua Git; secrets cần kênh mã hóa riêng để vừa an toàn vừa khôi phục được.

### 11.4 Backup Source Code
- **Cách:** mã nguồn trên **GitHub** (đã dự phòng/hosted) + **image versioned** ở registry; (khuyến nghị) **mirror sang remote thứ hai**.
- **RPO ~ 0** (mỗi push) — *lý do:* Git phân tán vốn an toàn; image immutable ở registry cho phép **rollback tức thời** không cần build lại.

### 11.5 Mục tiêu tổng & quy trình
- **RPO tổng:** **≤ 15 phút** cho dữ liệu quan hệ (chi phối); ~24h/gần-0 cho media.
- **RTO mục tiêu:** **≤ 2–4 giờ** cho DR toàn phần (dựng VPS mới → restore Postgres PITR → trỏ/khôi phục media → deploy image → chuyển DNS Cloudflare). **Rollback ứng dụng: vài phút** (đổi image tag). — *lý do RTO:* media offload R2 ⇒ **không phải restore media** ⇒ RTO bị chi phối bởi khôi phục DB + deploy, giữ trong vài giờ.
- **Diễn tập:** khôi phục thử trên **Staging định kỳ (hằng quý)** — *backup chưa restore = chưa có backup*.
- **Kịch bản DR:** VPS mới → khôi phục DB (PITR) → media (đã ở R2, chỉ trỏ lại) → nạp secrets → deploy image tag hiện hành → đổi DNS.

## 12. Monitoring

> Bảy nhóm theo dõi; mỗi nhóm nêu **Metric · Log · Alert · Dashboard**. Nền tảng đề xuất: exporters → **Prometheus/Grafana** (hoặc **Netdata** nhẹ ở GĐ đầu), log tập trung (Loki/driver), **Sentry** cho lỗi, uptime ngoài.

### 12.1 Infrastructure (VPS/host/container)
- **Metric:** CPU, RAM, đĩa dùng/IO, mạng, load avg, số container up/restart, cert TLS hạn dùng.
- **Log:** syslog, docker daemon, nginx access/error.
- **Alert:** đĩa > 80%, RAM > 85% kéo dài, CPU bão hòa, container restart loop, **cert sắp hết hạn (<14 ngày)**.
- **Dashboard:** tổng quan host (tài nguyên + trạng thái container).

### 12.2 Database (PostgreSQL)
- **Metric:** kết nối đang dùng/tối đa, **cache hit ratio**, transactions/s, slow query, deadlock, bloat, **kích thước DB tăng**, **trạng thái WAL archive**, (tương lai) replication lag.
- **Log:** Postgres slow-query log, migration log, backup job log.
- **Alert:** kết nối gần max, cache hit < 95%, slow-query tăng đột biến, **WAL archive/backup FAIL**, đĩa DB thấp.
- **Dashboard:** postgres_exporter (kết nối, hit-rate, query time, size).

### 12.3 API (NestJS)
- **Metric:** RPS, **độ trễ p50/p95/p99**, tỉ lệ lỗi 4xx/5xx, theo endpoint, saturation.
- **Log:** request log có cấu trúc (**không PII**), exception log, **audit** hành động đặc quyền.
- **Alert:** **5xx tăng**, p95 vượt ngưỡng, availability giảm, /health fail.
- **Dashboard:** golden signals RED (Rate/Errors/Duration).

### 12.4 Queue (BullMQ)
- **Metric:** **độ sâu hàng đợi (backlog)**, tốc độ xử lý job, tỉ lệ job fail/retry, độ trễ job, số worker, dead-letter.
- **Log:** job log (payload đã sanitize), failed job.
- **Alert:** backlog tăng liên tục, tỉ lệ fail cao, **job stalled**, dead-letter tích tụ.
- **Dashboard:** hàng đợi (backlog/throughput/failures) theo loại job.

### 12.5 AI Services
- **Metric:** số request/tác vụ, **token & chi phí**, độ trễ, **tỉ lệ fallback**, tỉ lệ gắn cờ moderation, **tỉ lệ đầu ra AI được duyệt**, cache/`source_hash` hit.
- **Log:** AI job log (task, model, `prompt_version`, cost — **không PII**, có provenance).
- **Alert:** **chạm ngưỡng ngân sách/kill-switch**, provider lỗi/timeout tăng, fallback cao, **chi phí bất thường**.
- **Dashboard:** chi phí & chất lượng AI (cost / nội-dung-được-duyệt) — [ai-architecture.md §5.5](../ai/ai-architecture.md).

### 12.6 Search
- **Metric:** **độ trễ truy vấn p95**, CTR, **zero-result rate**, độ tươi/lag chỉ mục, cache hit, trạng thái reindex.
- **Log:** search log (tổng hợp, **không PII**), reindex log, engine error (Meilisearch khi có).
- **Alert:** zero-result rate tăng, độ trễ cao, **chỉ mục cũ/lag**, engine down.
- **Dashboard:** chất lượng tìm kiếm (từ Analytics — [search.md §10](./search.md), [analytics.md](../data/modules/analytics.md)).

### 12.7 Object Storage (MinIO/R2)
- **Metric:** **dung lượng dùng & tốc độ tăng**, request rate, tỉ lệ lỗi, số object/bucket, **replication lag**, lỗi presign/upload.
- **Log:** access/audit log của storage.
- **Alert:** **dung lượng > 80%**, **replication FAIL**, tỉ lệ lỗi/upload fail tăng.
- **Dashboard:** dung lượng & throughput lưu trữ.

> **Alert routing:** phân mức `warning`/`critical` → email/Telegram/Slack; sự cố `critical` (5xx, backup fail, đĩa đầy, kill-switch AI) báo ngay. Không log secret/PII ở bất kỳ nhóm nào.

## 13. Bảo mật hạ tầng (tóm tắt)

- **Biên:** Cloudflare WAF/DDoS/bot; ẩn IP gốc; TLS Full-Strict.
- **Mạng VPS:** UFW tối thiểu; DB/Redis/MinIO **chỉ nội bộ** (không publish).
- **Truy cập:** SSH key-only + fail2ban; user non-root; DB user quyền tối thiểu; secrets không commit, xoay vòng.
- **Ứng dụng:** rate-limit hai lớp (CF + Redis), validate đầu vào, security headers; cưỡng chế RBAC ở [security.md](./security.md), [rbac.md](../security/rbac.md).

## 14. Lộ trình mở rộng (Scaling path)

Khớp [architecture.md §10](./architecture.md):
1. **GĐ1 (hiện tại):** 1 VPS (monolith + Postgres + Redis + MinIO/R2) sau Cloudflare.
2. **GĐ2:** tách VPS Prod/Staging; **read replica** Postgres; scale ngang API (stateless) sau LB; media ở **R2**.
3. **GĐ3:** tách dịch vụ tải cao (`search`, `media`); managed Postgres/Redis; **Meilisearch/ES** ([search.md §12](./search.md)) & **Vector DB** ([ai-architecture.md](../ai/ai-architecture.md)); điều phối container khi thực sự cần.

## 15. Quyết định cần chốt trước khi lên Production

1. **Gói VPS Hostinger** cụ thể cho Prod (KVM 4 vs cao hơn) và **tách VPS Staging** ngay hay chung.
2. **Media:** **Cloudflare R2** (khuyến nghị — RTO nhanh, đĩa nhỏ) vs **tự host MinIO** (đĩa ≥1 TB).
3. **PITR:** bật **WAL archiving** từ đầu (RPO ≤15′) — xác nhận chi phí lưu WAL/offsite.
4. **Nơi lưu offsite backup** (R2/Backblaze/S3) + **mã hóa** + con số **RPO/RTO cam kết**.
5. **Bộ giám sát GĐ1:** Prometheus/Grafana (đầy đủ) vs Netdata (nhẹ); **kênh alert** (Telegram/Slack/email).
6. **Registry image** (GHCR vs khác) + chính sách prune; **mirror source** thứ hai hay không.
7. **Tile provider** bản đồ (MapTiler/tự host) — [architecture.md §11](./architecture.md).
8. **Zero-downtime:** blue-green ngay hay chấp nhận maintenance-window ngắn ở GĐ1.
9. **Ngưỡng ngân sách AI** & kill-switch (nếu bật dịch vụ AI ở GĐ đầu) — [ai-architecture.md §5.5](../ai/ai-architecture.md).

---

*Tài liệu liên quan: [architecture.md](./architecture.md), [tech-stack.md](./tech-stack.md), [security.md](./security.md), [search.md](./search.md), [ai-architecture.md](../ai/ai-architecture.md), [database.md](../data/database.md), [api.md](../api/api.md), [analytics.md](../data/modules/analytics.md), [coding-standard.md](../standards/coding-standard.md), [roadmap.md](../overview/roadmap.md).*
