# PhuQuocHub — Tài liệu thiết kế (Design Docs)

> **Mục đích:** đây là điểm vào (index) cho toàn bộ tài liệu thiết kế của PhuQuocHub. Tài liệu **chỉ thiết kế** (không chứa mã nguồn), viết bằng tiếng Việt, tổ chức theo chủ đề.

## 1. Cấu trúc thư mục `docs/`

```
docs/
├── README.md                 # Mục lục & bản đồ tài liệu (file này)
├── overview/                 # [00·Overview] Tầm nhìn, lộ trình, thuật ngữ
│   ├── vision.md
│   ├── roadmap.md
│   ├── sprint-plan.md        # Kế hoạch Sprint (Scrum) — Wave·Backlog·Trạng thái·Blocker·DoD
│   └── glossary.md
├── architecture/             # [01·Architecture] Kiến trúc, bảo mật, công nghệ, triển khai
│   ├── architecture.md
│   ├── security.md
│   ├── search.md             # Kiến trúc hệ thống Tìm kiếm (12 loại + ranking/index/cache/logging)
│   ├── data-collection.md    # Kiến trúc thu thập dữ liệu (outline: nguồn·chuẩn hóa·chống trùng·quality·lifecycle)
│   ├── seo.md                # Kiến trúc SEO (outline: 20 thành phần + SEO theo 8 loại)
│   ├── analytics.md          # Kiến trúc Analytics/đo lường (outline: event·funnel·retention·cohort·A/B + 4 dashboard) — khác data/modules/analytics.md (tầng dữ liệu)
│   ├── tech-stack.md
│   └── deployment.md
├── data/                     # [01·Architecture] Thiết kế dữ liệu
│   ├── database.md
│   ├── erd.md
│   ├── data-dictionary.md    # Từ điển dữ liệu tổng hợp (47 entity Accepted)
│   ├── migration-strategy.md # (Reserved for future) — chiến lược migration
│   └── modules/              # Thiết kế chi tiết từng nhóm thực thể
│       ├── places.md
│       ├── source.md
│       ├── verification.md
│       ├── business.md
│       └── analytics.md
├── api/                      # [API Documentation] REST API + đặc tả máy đọc
│   ├── api.md                # Thiết kế REST API 15 module (đa kênh)
│   └── openapi.yaml          # Đặc tả OpenAPI 3.1 (contract máy đọc)
├── security/                 # [01·Architecture] Phân quyền (RBAC) & xác thực
│   ├── rbac.md
│   └── auth.md
├── product/                  # [02·Product] Đặc tả sản phẩm & Wireframe/UX
│   ├── wireframes.md
│   ├── discovery.md
│   ├── engagement.md
│   ├── admin.md
│   ├── growth.md             # Growth & Community (outline: reputation·XP·badge·mission·leaderboard·community health)
│   └── modules/              # Product Spec 10 module (mục tiêu, tính năng, use case, luồng, nghiệp vụ, dữ liệu, quan hệ, KPI)
│       ├── README.md         # Index nhóm module + khuôn đặc tả + bản đồ phụ thuộc
│       ├── place.md          ├── event.md        ├── review.md
│       ├── hotel.md          ├── community.md     ├── search.md
│       ├── restaurant.md     ├── business.md      └── ai-assistant.md
│       └── tour.md
├── standards/                # [03·Development] Chuẩn phát triển
│   └── coding-standard.md
├── workflow/                 # [04·Workflows] Quy trình nghiệp vụ & kiểm duyệt
│   ├── workflow.md
│   ├── contribution.md
│   └── moderation.md
├── ai/                       # [05·AI] Kiến trúc AI
│   ├── README.md
│   └── ai-architecture.md    # 9 dịch vụ AI + 6 hạ tầng (vector/KB/prompt/model/cost/fallback)
└── 99-decisions/             # [99·Decisions] Nhật ký quyết định kiến trúc (ADR)
    ├── README.md             # Quy trình & trạng thái ADR
    ├── decision-register.md  # Sổ đăng ký trạng thái mọi ADR (nguồn chốt)
    ├── ADR-template.md
    └── ADR-001..016.md       # 16 ADR (place·extension·polymorphic·contact·price·rbac·verification·media·api-versioning·search·ai·prisma·revision·business·audit-log)
```

> Các nhóm **đánh số ([00]–[99])** là phân nhóm **logic** theo thứ tự đọc; thư mục vật lý trên đĩa dùng tên **không đánh số**. Nhóm **[99·Decisions]** đã có thư mục `99-decisions/` (ADR-001…016 + decision-register); **[05·AI]** đã có `ai/`.

## 2. Bản đồ tài liệu

> Sắp theo thứ tự nhóm logic: **00-overview · 01-architecture · 02-product · 03-development · 04-workflows · 05-ai · 99-decisions.**

| Nhóm | Tài liệu | Vai trò |
|---|---|---|
| **00 · Overview** | [vision.md](overview/vision.md) | Tầm nhìn, ba trụ cột, personas, trust model |
| 00 · Overview | [roadmap.md](overview/roadmap.md) | Lộ trình phát triển theo giai đoạn |
| 00 · Overview | [sprint-plan.md](overview/sprint-plan.md) | **Kế hoạch Sprint (Scrum)** — ánh xạ roadmap→Sprint; Wave·Backlog·Trạng thái·Dependencies·Blocker·DoD·Next Sprint |
| 00 · Overview | [glossary.md](overview/glossary.md) | Thuật ngữ & định nghĩa chung |
| **01 · Architecture** | [architecture.md](architecture/architecture.md) | Kiến trúc tổng thể (modular monolith) |
| 01 · Architecture | [security.md](architecture/security.md) | Kiến trúc bảo mật & cưỡng chế phân quyền (RBAC enforcement) |
| 01 · Architecture | [search.md](architecture/search.md) | Kiến trúc **Tìm kiếm** (keyword/semantic/geo/nearby/AI… + ranking·scoring·index·caching·logging·analytics) |
| 01 · Architecture | [data-collection.md](architecture/data-collection.md) | **Kiến trúc thu thập dữ liệu** *(outline)* — nguồn·chuẩn hóa·chống trùng·data quality·lifecycle·KPI·roadmap |
| 01 · Architecture | [seo.md](architecture/seo.md) | **Kiến trúc SEO** *(outline)* — 20 thành phần (URL·sitemap·schema·hreflang·CWV…) + SEO theo 8 loại thực thể |
| 01 · Architecture | [analytics.md](architecture/analytics.md) | **Kiến trúc Analytics/đo lường** *(outline)* — event tracking·funnel·retention·cohort·A/B + dashboard Founder/Admin/Business/Moderator *(khác [data analytics](data/modules/analytics.md) tầng dữ liệu)* |
| 01 · Architecture | [tech-stack.md](architecture/tech-stack.md) | Công nghệ & lý do lựa chọn |
| 01 · Architecture | [deployment.md](architecture/deployment.md) | Triển khai, hạ tầng, CI/CD |
| 01 · Architecture | [database.md](data/database.md) | Thiết kế CSDL nền tảng + danh mục thực thể |
| 01 · Architecture | [erd.md](data/erd.md) | Sơ đồ quan hệ thực thể tổng hợp |
| 01 · Architecture | [places.md](data/modules/places.md) | Nhóm thực thể Địa điểm (Place + phụ trợ) |
| 01 · Architecture | [source.md](data/modules/source.md) | Entity Source (nguồn gốc) + phiên bản |
| 01 · Architecture | [verification.md](data/modules/verification.md) | Entity Verification (xác minh dữ liệu) |
| 01 · Architecture | [business.md](data/modules/business.md) | Entity Business — `business_claims` + `business_members` (sở hữu cơ sở, ADR-015) |
| 01 · Architecture | [analytics.md](data/modules/analytics.md) | Nhóm Analytics (thống kê, aggregate-first) |
| 01 · Architecture | [data-dictionary.md](data/data-dictionary.md) | **Từ điển dữ liệu** tổng hợp 47 entity Accepted (cột/kiểu/FK/index/cascade) |
| 01 · Architecture | [rbac.md](security/rbac.md) | Phân quyền theo vai trò (Role/Permission) |
| 01 · Architecture | [auth.md](security/auth.md) | Xác thực & phiên đăng nhập |
| **API Documentation** | [api.md](api/api.md) | Thiết kế REST API **15 module** — Web · Mobile · Public · Partner |
| API Documentation | [openapi.yaml](api/openapi.yaml) | Đặc tả **OpenAPI 3.1** (contract máy đọc — sinh client/SDK/portal/mock) |
| **02 · Product** | [modules/README.md](product/modules/README.md) | **Product Spec** — index 10 module, khuôn đặc tả 9 mục, bản đồ phụ thuộc |
| 02 · Product | [modules/place.md](product/modules/place.md) | Spec **Place** (địa điểm — thực thể lõi) |
| 02 · Product | [modules/hotel.md](product/modules/hotel.md) · [restaurant.md](product/modules/restaurant.md) · [tour.md](product/modules/tour.md) | Spec **Hotel · Restaurant · Tour** (Place chuyên biệt) |
| 02 · Product | [modules/event.md](product/modules/event.md) · [community.md](product/modules/community.md) · [business.md](product/modules/business.md) | Spec **Event · Community · Business** |
| 02 · Product | [modules/review.md](product/modules/review.md) · [search.md](product/modules/search.md) · [ai-assistant.md](product/modules/ai-assistant.md) | Spec **Review · Search · AI Assistant** |
| 02 · Product | [wireframes.md](product/wireframes.md) | Tổng quan wireframe + index **13 trang** + quy ước UX chung (khuôn 9 mục: +Thứ tự hiển thị, +CTA) |
| 02 · Product | [discovery.md](product/discovery.md) | Wireframe 8 trang khám phá (Chủ, Place, Hotel, Restaurant, Tour, Event, Search, **AI**) |
| 02 · Product | [engagement.md](product/engagement.md) | Wireframe 3 trang tương tác (Business, Community, Profile) |
| 02 · Product | [admin.md](product/admin.md) | Wireframe **Admin** (P11 console kiểm duyệt) + **Dashboard** (P13 vận hành) theo RBAC |
| 02 · Product | [growth.md](product/growth.md) | **Growth & Community** *(outline)* — reputation·XP·level·badge·mission·challenge·Local Guide·referral·leaderboard·community health |
| **03 · Development** | [coding-standard.md](standards/coding-standard.md) | Chuẩn viết code, đặt tên, test, Git |
| **04 · Workflows** | [workflow.md](workflow/workflow.md) | Index 20 workflow + nhóm Tài khoản/Hệ thống |
| 04 · Workflows | [contribution.md](workflow/contribution.md) | Luồng đóng góp & làm giàu dữ liệu (claim, đề xuất sửa, AI, giá, ảnh) |
| 04 · Workflows | [moderation.md](workflow/moderation.md) | Luồng kiểm duyệt & an toàn (duyệt, review, report, AI kiểm ảnh) |
| **05 · AI** | [ai/README.md](ai/README.md) | Index nhóm AI |
| 05 · AI | [ai-architecture.md](ai/ai-architecture.md) | **Kiến trúc AI** — 9 dịch vụ (Summary·Translation·Recommendation·Moderation·Chat·RAG·Embedding·Prompt Library·Model Selection) + 6 hạ tầng (Vector DB·Knowledge Base·Prompt/Model Version·Cost Control·Fallback) |
| **99 · Decisions** | [99-decisions/README.md](99-decisions/README.md) | Quy trình & quy ước ADR (Proposed/Accepted/Superseded/Deprecated/Rejected) |
| 99 · Decisions | [decision-register.md](99-decisions/decision-register.md) | **Sổ đăng ký** trạng thái mọi ADR (nguồn chốt) — ADR-001…016 + template |

### 2.1 Tài liệu bổ sung — vai trò · đối tượng · trạng thái

| Tài liệu | Vai trò | Đối tượng sử dụng | Trạng thái |
|---|---|---|---|
| [api/api.md](api/api.md) | Thiết kế REST API 15 module, đa kênh (Web/Mobile/Public/Partner) | Backend & Frontend devs, đối tác API | **Review** |
| [api/openapi.yaml](api/openapi.yaml) | Đặc tả OpenAPI 3.1 máy đọc — sinh client/SDK, portal, mock, lint CI | Devs, đối tác, tooling (Swagger/codegen) | **Draft** |
| [data/data-dictionary.md](data/data-dictionary.md) | Từ điển dữ liệu tổng hợp 47 entity Accepted (cột/kiểu/FK/index/cascade) | Data & Backend engineers, reviewers | **Review** |
| `docs/data/migration-strategy.md` *(Reserved for future)* | Chiến lược migration (plan/rollback/seed/versioning/data-compatibility) | Data engineers, DevOps | *Chưa tạo* |

> Thang trạng thái: **Draft** (mới, chưa rà soát) · **Review** (đang hoàn thiện/soát) · **Accepted** (đã chốt). Trạng thái từng ADR xem [decision-register.md](99-decisions/decision-register.md).

## 3. Thứ tự đọc gợi ý

1. `overview/vision.md` → hiểu mục tiêu & giá trị cốt lõi.
2. `architecture/architecture.md` → bức tranh kỹ thuật tổng thể.
3. `data/database.md` + `data/erd.md` → mô hình dữ liệu, rồi đi sâu `data/modules/*`.
4. `api/api.md`, `security/*`, `workflow/*` → hợp đồng, quyền và quy trình.
5. `standards/coding-standard.md`, `overview/roadmap.md` → khi bắt tay hiện thực.

## 4. Quy ước tài liệu

- **Chỉ thiết kế, không mã nguồn** (đoạn mã nếu có chỉ để minh họa quy ước/schema).
- Ngôn ngữ: tiếng Việt; thuật ngữ kỹ thuật giữ nguyên tiếng Anh khi phổ biến.
- Đặt tên DB: `snake_case`, bảng số nhiều.
- Mỗi tài liệu kết thúc bằng mục *"Tài liệu liên quan"* để liên kết chéo.
- Khi hoàn thành một phần thiết kế → cập nhật đúng tài liệu tương ứng (không tạo file trùng).

## 5. Ghi chú — nội dung bổ sung sau

- [ ] Sơ đồ điều hướng giữa các tài liệu (diagram).
- [ ] Bảng trạng thái hoàn thiện của từng tài liệu (draft / review / stable).
- [ ] Changelog tài liệu.

---

*Cập nhật index này mỗi khi thêm/di chuyển tài liệu trong `docs/`.*
