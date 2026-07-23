# PhuQuocHub — Wireframe & UX (Tổng quan)

> Tài liệu **chỉ thiết kế wireframe** — không React, không HTML, không CSS. Sơ đồ ASCII chỉ để mô tả bố cục (low-fidelity). Đây là **index** + **quy ước UX dùng chung**; chi tiết từng trang ở 3 file nhóm bên dưới.

## 1. Index — 13 trang

| # | Trang | Nhóm | Tài liệu |
|---|---|---|---|
| P1 | Trang chủ | Khám phá | [discovery.md](./discovery.md) |
| P2 | Place | Khám phá | [discovery.md](./discovery.md) |
| P3 | Hotel | Khám phá | [discovery.md](./discovery.md) |
| P4 | Restaurant | Khám phá | [discovery.md](./discovery.md) |
| P5 | Tour | Khám phá | [discovery.md](./discovery.md) |
| P6 | Event | Khám phá | [discovery.md](./discovery.md) |
| P7 | Search | Khám phá | [discovery.md](./discovery.md) |
| P8 | Business | Tương tác | [engagement.md](./engagement.md) |
| P9 | Community | Tương tác | [engagement.md](./engagement.md) |
| P10 | Profile | Tương tác | [engagement.md](./engagement.md) |
| P11 | Admin | Quản trị | [admin.md](./admin.md) |
| P12 | AI (Trợ lý người dùng) | Khám phá | [discovery.md](./discovery.md) |
| P13 | Dashboard (vận hành) | Quản trị | [admin.md](./admin.md) |

> 12 trang theo yêu cầu thiết kế = P1–P10 + **P12 (AI)** + **P13 (Dashboard)**; **P11 (Admin)** là console thao tác đi kèm P13.

## 2. Khuôn mô tả (mỗi trang gồm 9 mục)

**Mục tiêu · Đối tượng sử dụng (Người dùng) · Thành phần giao diện · Thứ tự hiển thị · Luồng thao tác · CTA · Responsive · SEO · Accessibility.**

> So với yêu cầu 8 mục (Mục tiêu · Đối tượng · Thành phần · Thứ tự hiển thị · CTA · Responsive · SEO · Accessibility), tài liệu **giữ thêm** mục *Luồng thao tác* để không mất ngữ cảnh vận hành.

## 3. Khung giao diện chung (App Shell)

```
┌───────────────────────────────────────────────┐
│  HEADER: logo · tìm kiếm · vi/en · avatar/login│  ← landmark <header>/<nav>
├───────────────────────────────────────────────┤
│  (breadcrumb khi ở trang con)                  │
│                                                │
│  NỘI DUNG TRANG                                │  ← landmark <main>
│                                                │
├───────────────────────────────────────────────┤
│  FOOTER: giới thiệu · dữ liệu mở/OSM · liên hệ │  ← landmark <footer>
└───────────────────────────────────────────────┘
```

- **Điều hướng chính:** Khám phá (bản đồ/danh mục) · Cộng đồng · Đóng góp · (đăng nhập) Hồ sơ.
- **Bản đồ** (MapLibre/OSM) là công dân hạng nhất, xuất hiện ở nhiều trang.
- **Badge tin cậy:** hiển thị trạng thái xác minh (`official/verified/community`) và **nguồn** (provenance) cạnh dữ liệu — khớp [verification.md](../data/modules/verification.md), [source.md](../data/modules/source.md).
- **Nhãn AI:** nội dung do AI sinh luôn có nhãn rõ ("AI tóm tắt — chờ/đã duyệt").

## 4. Responsive — nguyên tắc chung

| Breakpoint | Bố cục |
|---|---|
| Mobile `< 640px` | 1 cột; header rút gọn; bản đồ ở **tab** riêng; thanh hành động **sticky** dưới |
| Tablet `640–1024px` | 1–2 cột linh hoạt |
| Desktop `> 1024px` | 2 cột (nội dung + bản đồ/panel sticky); mật độ cao |

- **Mobile-first** (PWA); ảnh `lazy-load`, `srcset`; cursor pagination cho infinite scroll.

## 5. SEO — nền tảng chung

- **SSR/SSG** cho trang công khai (Place/Hotel/… render sẵn); trang cá nhân/admin `noindex`.
- Meta lấy từ `place_seo` (fallback tự sinh) — xem [places.md](../data/modules/places.md) §8.
- **JSON-LD schema.org** theo loại: `TouristAttraction`, `Hotel`, `Restaurant`, `TouristTrip`, `Event`, `LocalBusiness`, `FAQPage`, `BreadcrumbList`, `DiscussionForumPosting`.
- URL **slug** sạch, `canonical`, `hreflang` vi/en, `sitemap.xml`, breadcrumb, OG/Twitter image (cover).

## 6. Accessibility — nền tảng chung (WCAG 2.1 AA)

- Landmark rõ (`header/nav/main/footer`), **skip-to-content**, thứ bậc heading đúng.
- **Bàn phím đầy đủ**, focus nhìn thấy; tương phản ≥ 4.5:1; `prefers-reduced-motion`.
- Ảnh có `alt`/`alt_text`; bản đồ luôn có **danh sách thay thế** (không phụ thuộc chuột).
- Form có nhãn + thông báo lỗi; cập nhật động dùng `aria-live`; rating sao truy cập được.

---

*Tài liệu liên quan: [discovery.md](./discovery.md), [engagement.md](./engagement.md), [admin.md](./admin.md), [api.md](../api/api.md), [rbac.md](../security/rbac.md), [workflow.md](../workflow/workflow.md)*
