# PhuQuocHub — Kế hoạch Sprint (Sprint Plan)

> **Vai trò tài liệu:** kế hoạch triển khai theo **Scrum** — ánh xạ [roadmap.md](./roadmap.md) (giai đoạn) thành các **Sprint** thực thi cụ thể. Tài liệu **chỉ thiết kế/quản lý**, không chứa mã nguồn. Kiến trúc giữ nguyên theo [architecture.md](../architecture/architecture.md); tài liệu này **không** thay đổi kiến trúc.
>
> **Nguồn liên quan:** [roadmap.md](./roadmap.md) · [decision-register.md](../99-decisions/decision-register.md) · [architecture.md](../architecture/architecture.md)

---

## 1. Mục tiêu Sprint (Sprint Goal — nguyên tắc)

- Mỗi Sprint có **một Goal duy nhất, đo được**, ánh xạ tới một giai đoạn trong [roadmap.md](./roadmap.md).
- Ưu tiên **dữ liệu lõi trước, tính năng phụ sau** (roadmap §Ưu tiên & Nguyên tắc).
- Chỉ triển khai bằng kiến trúc đã chốt trong [architecture.md](../architecture/architecture.md) — Modular Monolith, Next.js + NestJS, PostgreSQL/PostGIS, Redis, MinIO, BullMQ, ORM **TypeORM**.
- Không khóa schema/API khi ADR liên quan còn **Proposed** (xem §7 Blocker và [decision-register.md](../99-decisions/decision-register.md)).

## 2. Phạm vi (Scope)

**Trong phạm vi kế hoạch này:**
- Chia nhỏ 5 giai đoạn roadmap (0→4) thành các Sprint có Goal/Task/Estimate/Dependency/Deliverable/DoD.
- Nhóm Sprint theo **Wave** (§4) để làm rõ mốc bàn giao lớn.
- Quản lý **Backlog** (§5), **Trạng thái** (§6), **Dependencies** (§6.x trong mỗi Sprint + sơ đồ), **Blocker** (§7).

**Ngoài phạm vi:**
- Không sinh mã nguồn (theo quy ước `docs/`).
- Không sửa kiến trúc, contract dữ liệu/API — chỉ **triển khai** thiết kế đã có.
- Không đặt phòng/thanh toán, mobile native (theo [vision.md §7 Out of scope](./vision.md)).

**Giả định lập kế hoạch:**

| Hạng mục | Giá trị |
|---|---|
| Độ dài Sprint | 2 tuần |
| Đơn vị estimate | Story Point (Fibonacci: 1,2,3,5,8,13) |
| Velocity mục tiêu | ~22 SP/sprint |
| Ceremonies | Planning · Daily · Review · Retro |

## 3. Danh sách Sprint (Sprint List)

Mỗi Sprint gồm: **Goal · Task+Estimate · Dependency · Deliverable · Definition of Done**.
Cột giai đoạn ánh xạ tới [roadmap.md](./roadmap.md).

### Sprint 0 — Foundation (Nền móng) · *Roadmap Giai đoạn 0*

**Goal:** Môi trường dev chạy được, CI xanh, khung monorepo sẵn sàng để build feature.

| Task | Est |
|---|---|
| Khởi tạo monorepo Turborepo (`apps/web`, `apps/api`, `packages/shared-types\|ui\|config\|utils`) | 3 |
| `docker-compose`: PostgreSQL+PostGIS, Redis, MinIO | 3 |
| Cấu hình ESLint/Prettier/TSConfig chung + Husky (theo [coding-standard.md](../standards/coding-standard.md)) | 2 |
| NestJS bootstrap: core module (config validate, logger, database TypeORM, redis) | 5 |
| Next.js bootstrap + App Router skeleton `(public)/(auth)/(dashboard)` | 3 |
| Health check FE↔API + `/health` (DB, Redis) | 2 |
| CI pipeline cơ bản (lint + build + test) | 3 |

- **Dependency:** Không.
- **Deliverable:** Repo chạy `docker compose up` + `turbo dev`; API `/health` xanh; CI xanh.
- **Definition of Done:** Dev mới clone & chạy được theo README ≤ 30 phút; pipeline CI pass trên PR mẫu.

### Sprint 1 — Auth & RBAC + Data core · *Roadmap Giai đoạn 1*

**Goal:** Đăng nhập/phân quyền hoạt động; schema nền tảng (User/Role/Permission/Category) migrate được.

| Task | Est |
|---|---|
| Migration nền tảng: `users`, `roles`, `permissions`, `role_permissions` (ADR-007) | 5 |
| Module `auth`: đăng ký, đăng nhập, JWT access+refresh, thu hồi (theo [auth.md](../security/auth.md)) | 8 |
| RolesGuard + PermissionGuard (deny-by-default) theo [rbac.md](../security/rbac.md) | 5 |
| Module `users` (hồ sơ, gán role) + `categories` CRUD | 5 |
| FE: trang đăng nhập/đăng ký + lưu session + route guard | 3 |

- **Dependency:** Sprint 0.
- **Deliverable:** Người dùng đăng ký/đăng nhập; endpoint có permission enforcement; seed role mặc định.
- **Definition of Done:** Test enforcement (403 khi thiếu permission); refresh token thu hồi được; e2e đăng nhập pass.

### Sprint 2 — Places (module lõi) + PostGIS · *Roadmap Giai đoạn 1*

**Goal:** CRUD Place có tọa độ, lưu vết phiên bản; nền cho mọi thực thể.

| Task | Est |
|---|---|
| **Chốt ADR-002/003** (decision, không code) — mở khóa schema Place-extension | 2 |
| Migration `places` + PostGIS `geometry`, GiST index (theo [places.md](../data/modules/places.md)) | 5 |
| Bảng phụ: `media` (ADR-009), `contacts` (ADR-005), `price_history` (ADR-006) | 5 |
| `wiki_revisions` — lưu vết chỉnh sửa (ADR-014) | 5 |
| Module `places` CRUD + phân tầng `verification_status` (ADR-008) | 5 |
| FE: trang chi tiết + danh sách Place (chưa map) | 3 |

- **Dependency:** Sprint 1; **ADR-002/003 Accepted** ([decision-register.md](../99-decisions/decision-register.md)).
- **Deliverable:** Tạo/sửa/xem Place; mọi sửa sinh revision; media/contact/price gắn được.
- **Definition of Done:** Data-dictionary khớp migration; revision khôi phục được; test CRUD + provenance.

### Sprint 3 — Geo & Map & Search cơ bản · *Roadmap Giai đoạn 1*

**Goal:** Bản đồ hoạt động, tìm theo vị trí và từ khóa cơ bản.

| Task | Est |
|---|---|
| Module `geo`: `nearby` (`ST_DWithin`), `bbox`, geocode qua Nominatim | 8 |
| Search cơ bản: Postgres FTS + unaccent (tiếng Việt không dấu) — theo [search.md](../architecture/search.md) | 5 |
| FE: MapLibre + OSM tiles (MapTiler/self-host), marker + clustering | 5 |
| FE: ô tìm kiếm + kết quả list/map đồng bộ | 3 |
| Seed dữ liệu Place ban đầu (import OSM) | 3 |

- **Dependency:** Sprint 2.
- **Deliverable:** Xem địa điểm trên bản đồ, "gần tôi", tìm kiếm không dấu.
- **Definition of Done:** Query không gian có index (EXPLAIN dùng GiST); tìm "phú quốc"≡"phu quoc"; map render < 2s.

### Sprint 4 — Contributions & Moderation · *Roadmap Giai đoạn 2*

**Goal:** Cộng đồng đề xuất dữ liệu, moderator duyệt trước khi công khai.

| Task | Est |
|---|---|
| Module `contributions`: đề xuất tạo/sửa Place → hàng chờ `pending` (WF-14) | 8 |
| Máy trạng thái `draft→pending→published→archived` + audit | 5 |
| Module moderation: queue duyệt/từ chối, gắn lý do (theo [moderation.md](../workflow/moderation.md)) | 5 |
| Vai trò contributor/moderator + permission tương ứng | 2 |
| FE: form đóng góp + console kiểm duyệt (P11) | 5 |

- **Dependency:** Sprint 2 (revisions), Sprint 1 (RBAC).
- **Deliverable:** Đóng góp cộng đồng có kiểm soát; nội dung published mới hiển thị công khai.
- **Definition of Done:** Nội dung `pending` không lộ public; mọi quyết định duyệt có audit + revision; test luồng WF.

### Sprint 5 — Reviews & Media pipeline · *Roadmap Giai đoạn 2*

**Goal:** Đánh giá sao + ảnh; pipeline media (upload/resize) qua object storage.

| Task | Est |
|---|---|
| Module `reviews`: rating + nội dung, tính điểm TB, chống trùng (theo [review.md](../product/modules/review.md)) | 8 |
| Module `media`: upload MinIO/S3, BullMQ resize/optimize job | 8 |
| Chống review giả cơ bản (rate limit, 1 review/user/place, cờ nghi ngờ) | 3 |
| FE: viết review + gallery ảnh trên trang Place | 3 |

- **Dependency:** Sprint 2, Sprint 0 (MinIO), Redis/BullMQ.
- **Deliverable:** Người dùng đánh giá & up ảnh; rating TB cập nhật; ảnh được tối ưu.
- **Definition of Done:** Job resize chạy async & retry; không lưu binary trong Postgres; test rating aggregate.

### Sprint 6 — Business (claim & quản lý) + Community · *Roadmap Giai đoạn 2*

**Goal:** Chủ cơ sở claim Place; thảo luận cộng đồng cơ bản.

| Task | Est |
|---|---|
| Migration `business_claims` + `business_members` (ADR-015) | 5 |
| Luồng claim + duyệt quyền quản lý (scope Managed) theo [contribution.md](../workflow/contribution.md) | 5 |
| Module `community`: bài viết/thảo luận gắn `place_id`, comment cơ bản | 8 |
| Upvote/downvote + điểm uy tín cơ bản (theo [community.md](../product/modules/community.md)) | 3 |
| FE: dashboard chủ cơ sở (P13) + trang thảo luận | 5 |

- **Dependency:** Sprint 2, Sprint 4 (moderation), Sprint 1 (RBAC).
- **Deliverable:** Chủ cơ sở nhận & quản lý trang đã verified; cộng đồng thảo luận + vote.
- **Definition of Done:** Claim phải qua duyệt; member scope đúng permission; test vote & reputation.

### Sprint 7 — AI Assistant (human-in-the-loop) · *Roadmap Giai đoạn 3*

**Goal:** AI sinh bản nháp (summary/dịch/kiểm spam), output luôn `pending`.

| Task | Est |
|---|---|
| Hạ tầng AI: model selection, prompt library, cost control, fallback (theo [ai-architecture.md](../ai/ai-architecture.md)) | 8 |
| Dịch vụ Summary + Translation (vi/en) sinh bản nháp cho Place | 5 |
| Moderation-assist: chấm điểm spam/nội dung cho review & community | 5 |
| Đưa mọi output AI vào queue `pending` cho người duyệt | 3 |

- **Dependency:** Sprint 4 (moderation queue), Sprint 2.
- **Deliverable:** Nút "AI gợi ý summary/dịch"; đề xuất AI hiện trong hàng chờ duyệt.
- **Definition of Done:** Không output AI nào tự publish; có cost logging + fallback khi model lỗi; test human-in-the-loop.

### Sprint 8 — Experience: PWA · i18n · SEO · Notifications · *Roadmap Giai đoạn 3*

**Goal:** Trải nghiệm nhanh, song ngữ, SEO tốt, thông báo.

| Task | Est |
|---|---|
| PWA: cài đặt, cache offline map/place | 5 |
| Đa ngôn ngữ vi/en (UI + nội dung song ngữ) | 5 |
| SEO: SSG trang Place, sitemap, schema.org, hreflang (theo [seo.md](../architecture/seo.md)) | 8 |
| Module `notifications` (đóng góp được duyệt, phản hồi) | 3 |

- **Dependency:** Sprint 3 (map), Sprint 4 (contributions).
- **Deliverable:** App cài như PWA; trang Place SEO-ready song ngữ; thông báo hoạt động.
- **Definition of Done:** Lighthouse PWA/SEO ≥ 90; sitemap hợp lệ; test i18n fallback.

### Sprint 9 — Platform & Scale (Public API) · *Roadmap Giai đoạn 4*

**Goal:** Mở API cho bên thứ ba; sẵn sàng scale đọc.

| Task | Est |
|---|---|
| **Chốt ADR-010** (API versioning) → áp dụng cho public API | 2 |
| Public API + API key + quota/rate limit (theo [api.md](../api/api.md), [openapi.yaml](../api/openapi.yaml)) | 8 |
| Redis cache-aside cho Place hot & search; invalidation khi cập nhật | 5 |
| Read replica Postgres + observability (metrics, logging tập trung) | 5 |
| Portal/docs sinh từ `openapi.yaml` | 3 |

- **Dependency:** Sprint 3, 5, 6; **ADR-010 Accepted**.
- **Deliverable:** Đối tác gọi API bằng key có quota; cache giảm tải; dashboard quan sát.
- **Definition of Done:** OpenAPI lint CI xanh; quota enforce được; cache hit-rate đo được; test rate-limit.

## 4. Wave (Nhóm Sprint theo mốc bàn giao)

> Wave = nhóm Sprint tạo thành một mốc bàn giao lớn, ánh xạ tới giai đoạn [roadmap.md](./roadmap.md).

| Wave | Sprint | Roadmap | Mốc bàn giao (Milestone) |
|---|---|---|---|
| **W0 · Nền móng** | S0 | Giai đoạn 0 | Môi trường dev + CI xanh |
| **W1 · MVP Dữ liệu lõi** | S1 · S2 · S3 | Giai đoạn 1 | Xem/tìm/khám phá địa điểm trên bản đồ |
| **W2 · Cộng đồng & Đóng góp** | S4 · S5 · S6 | Giai đoạn 2 | Dữ liệu tăng trưởng có kiểm duyệt + review + business |
| **W3 · Trải nghiệm & Mở rộng** | S7 · S8 | Giai đoạn 3 | AI hỗ trợ + PWA/i18n/SEO |
| **W4 · Nền tảng mở & Quy mô** | S9 | Giai đoạn 4 | Public API + sẵn sàng scale |

## 5. Backlog

> Product Backlog cấp cao — nguồn kéo item vào Sprint Backlog mỗi lần Planning. Sắp theo ưu tiên roadmap.

### 5.1 Đã xếp Sprint (Committed)
Toàn bộ Task trong §3 (S0→S9) là Sprint Backlog đã cam kết theo thứ tự ưu tiên.

### 5.2 Chưa xếp Sprint (Product Backlog — chờ refinement)

| ID | Item | Nguồn | Ưu tiên |
|---|---|---|---|
| B-01 | Event module (thực thể theo thời gian) | [event.md](../product/modules/event.md) | Trung bình |
| B-02 | Hotel/Restaurant/Tour spec chuyên biệt (sau khi Place-extension chốt) | [hotel.md](../product/modules/hotel.md) · [restaurant.md](../product/modules/restaurant.md) · [tour.md](../product/modules/tour.md) | Trung bình |
| B-03 | Growth & Community (XP/badge/mission/leaderboard) | [growth.md](../product/growth.md) *(outline)* | Thấp |
| B-04 | Analytics dashboard (Founder/Admin/Business/Moderator) | [analytics.md](../architecture/analytics.md) *(outline)* | Thấp |
| B-05 | Data-collection pipeline (chuẩn hóa/chống trùng/quality) | [data-collection.md](../architecture/data-collection.md) *(outline)* | Thấp |
| B-06 | Chuyển search sang Meilisearch/Elasticsearch | roadmap Giai đoạn 4 | Thấp (khi có tín hiệu tải) |
| B-07 | Đồng bộ hai chiều OpenStreetMap (đóng góp ngược) | roadmap Giai đoạn 4 | Thấp |
| B-08 | Weather zone | ADR-004 *(Proposed)* | Chờ ADR |

> Refinement mỗi Sprint: chọn item từ 5.2, làm rõ acceptance criteria, estimate, rồi kéo lên §3.

## 6. Trạng thái (Status)

> Bảng theo dõi tiến độ. Cập nhật cuối mỗi Sprint Review. Thang: **Planned · In Progress · Done · Blocked**.

| Sprint | Wave | Roadmap | Trạng thái | Ghi chú |
|---|---|---|---|---|
| S0 Foundation | W0 | GĐ0 | **Code Generated** | Đã sinh code (monorepo/NestJS+TypeORM/Next/docker/CI). **Chưa verify do thiếu môi trường chạy** |
| S1 Auth & RBAC | W1 | GĐ1 | **Code Generated** | Auth JWT + RBAC PDP + Users + Categories (TypeORM/migration/repository). **Chưa verify do thiếu môi trường chạy**. Hoãn: email-verify/reset (cần token entity), FK business_id→places (Sprint 2) |
| S2 Places + PostGIS | W1 | GĐ1 | **Code Generated (core)** | Place cluster (place/faq/seo/ai_summary/media/contacts/price_history) + PostGIS/FTS migration + CRUD. **Chưa verify**. Còn: Verification/Source/WikiRevision (trust/provenance) + contribution flow (S4). ADR-002/003 ✅ *Accepted (2026-07-13)* — Place-extension schema đã chốt |
| S3 Geo/Map/Search | W1 | GĐ1 | **Code Generated (BE)** | Geo (nearby ST_DWithin/bbox/geocode Nominatim) + Search FTS unaccent. **Chưa verify**. FE MapLibre + seed OSM chưa làm |
| S4 Contributions/Moderation | W2 | GĐ2 | Planned | — |
| S5 Reviews/Media | W2 | GĐ2 | Planned | — |
| S6 Business/Community | W2 | GĐ2 | Planned | — |
| S7 AI Assistant | W3 | GĐ3 | Planned | — |
| S8 PWA/i18n/SEO | W3 | GĐ3 | Planned | — |
| S9 Public API/Scale | W4 | GĐ4 | **Blocked** | Chờ ADR-010 Accepted (xem §7) |

## 7. Phụ thuộc & Blocker

### 7.1 Sơ đồ phụ thuộc Sprint (Dependencies)

```
S0 → S1 → S2 → S3 → S4 → S5
                   ↘   S6 → S7
                        ↘  S8 → S9
```

- S2 phụ thuộc S1; S3 phụ thuộc S2 (chuỗi MVP lõi — không đảo thứ tự).
- S6, S7, S8 phụ thuộc nhánh cộng đồng/kiểm duyệt (S4).
- S9 phụ thuộc S3 (map/search), S5 (media), S6 (business).

### 7.2 Blocker (P0 — phải gỡ trước khi Sprint liên quan bắt đầu)

> Nguồn chốt trạng thái ADR: [decision-register.md](../99-decisions/decision-register.md).

| Blocker | Ảnh hưởng | Trạng thái hiện tại | Cần hành động |
|---|---|---|---|
| **ADR-002** — Cách mở rộng Place (Hotel/Restaurant/Tour satellite; Event peer) | Khóa schema Place-extension | ✅ **Accepted (2026-07-13)** | Xong — gỡ chặn S2 |
| **ADR-003** — Không dùng quan hệ đa hình (arc; media +event_id) | Thiết kế FK/toàn vẹn | ✅ **Accepted (2026-07-13)** | Xong — gỡ chặn S2 |
| **ADR-010** — Chiến lược API versioning | Định dạng public API → **chặn S9** | Proposed | Chốt Accepted trước Sprint 9 |
| **ADR-004** — Weather zone | Chỉ ảnh hưởng B-08 (chưa xếp Sprint) | Proposed | Không chặn Sprint hiện tại |

> **Quy tắc gỡ blocker:** blocker là **quyết định kiến trúc** (ADR), giải quyết qua quy trình ADR — *không* sửa kiến trúc trong Sprint. Khi ADR chuyển Accepted → cập nhật §6 Trạng thái tương ứng.

## 8. Tiêu chí hoàn thành (Definition of Done)

### 8.1 DoD toàn cục (áp dụng mọi Sprint)
- [ ] Code review pass (≥ 1 reviewer).
- [ ] Unit test cho logic lõi; test luồng nghiệp vụ chính.
- [ ] Lint/typecheck xanh, CI xanh.
- [ ] Không hạ mức bảo mật (permission deny-by-default giữ nguyên — theo [security.md](../architecture/security.md)).
- [ ] Cập nhật `docs/` nếu có thay đổi contract dữ liệu/API (đồng bộ [data-dictionary.md](../data/data-dictionary.md) / [openapi.yaml](../api/openapi.yaml)).
- [ ] Sprint Goal đạt & demo được ở Review.

### 8.2 DoD theo Sprint
Mỗi Sprint có **Definition of Done riêng** ghi trong §3 (mục "Definition of Done" cuối mỗi Sprint). DoD Sprint = DoD toàn cục **+** tiêu chí riêng của Sprint đó.

## 9. Next Sprint

> Cửa sổ cận cảnh: Sprint kế tiếp cần chuẩn bị. Cập nhật mỗi Planning.

- **Sprint kế tiếp:** **Sprint 0 — Foundation** (chưa khởi động).
- **Chuẩn bị trước Planning:**
  - Xác nhận velocity thực tế & năng lực đội (điều chỉnh giả định §2 nếu cần).
  - Chuẩn bị **quyết định ADR-002/003** (đưa vào lịch trước Sprint 2) để không chặn W1.
  - Refine Backlog §5.2 các item ưu tiên "Trung bình" (B-01, B-02) cho các Sprint sau W1.
- **Rủi ро cần theo dõi:** tile provider bản đồ (MapTiler/self-host) cho S3; chi phí model AI cho S7.

---

*Tài liệu liên quan: [roadmap.md](./roadmap.md), [architecture.md](../architecture/architecture.md), [decision-register.md](../99-decisions/decision-register.md), [vision.md](./vision.md).*
