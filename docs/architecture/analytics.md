# PhuQuocHub — Kiến trúc Phân tích (Analytics Architecture)

> **Trạng thái: OUTLINE (khung).** Tài liệu **kiến trúc đo lường/product analytics** — chiến lược thu thập sự kiện, phân tích, dashboard & thực nghiệm. *Không* code. Đây là **tầng kiến trúc/sản phẩm**, bổ sung cho **tầng dữ liệu** đã có ở [data/modules/analytics.md](../data/modules/analytics.md) (aggregate-first: PageView/PlaceView/SearchAnalytics/PopularPlace/TrendingKeyword). Liên quan: [search.md §9–10](./search.md), [ai-architecture.md §5.5/§7](../ai/ai-architecture.md), [growth.md](../product/growth.md), [admin.md P13](../product/admin.md), [deployment.md §12](./deployment.md).

---

## 0. Nguyên tắc chung *(khung)*

- **Privacy-first / aggregate-first** — không lưu log hành vi cá nhân dài hạn; tổng hợp theo mốc thời gian; ước lượng unique bằng HLL ([analytics.md §1,5](../data/modules/analytics.md)).
- **Event schema chuẩn** — quy ước tên/thuộc tính sự kiện nhất quán (một nguồn định nghĩa).
- **Không PII trong sự kiện/log**; tuân [security.md](./security.md).
- **Dashboard phân quyền** — chỉ số hiển thị theo vai trò (RBAC).
- **Đo để hành động** — mỗi chỉ số gắn quyết định (không "vanity metrics").

> Mỗi mục dưới là **khung** (phạm vi sẽ triển khai), chưa viết chi tiết.

---

## 1. Event Tracking
- Quy ước **event schema** (tên, thuộc tính, ngữ cảnh), kênh thu (client beacon phi chặn), buffer → rollup. Nối [analytics.md §2](../data/modules/analytics.md). *(khung)*

## 2. User Analytics
- Người dùng hoạt động (DAU/WAU/MAU), nguồn traffic, hành trình, thiết bị/ngôn ngữ — **không hồ sơ cá nhân**. *(khung)*

## 3. Search Analytics
- Truy vấn, **zero-result rate**, CTR, trending — đọc từ [search.md §10](./search.md) & `search_queries_agg`. *(khung)*

## 4. SEO Analytics
- Organic traffic, index coverage, thứ hạng từ khóa, **Core Web Vitals** (RUM/CrUX) — nối [seo.md](./seo.md). *(khung)*

## 5. Business Analytics
- Số liệu cơ sở (view/unique/rating theo cơ sở, scope Managed) cho chủ cơ sở — từ `place_views_agg`. *(khung)*

## 6. Community Analytics
- Sức khỏe cộng đồng: bài/bình luận/vote, tỷ lệ trả lời, toxicity, retention người đóng góp — nối [growth.md §16](../product/growth.md). *(khung)*

## 7. AI Analytics
- Chi phí/token, tỷ lệ fallback, **tỷ lệ đầu ra AI được duyệt**, chất lượng — nối [ai-architecture.md §5.5](../ai/ai-architecture.md). *(khung)*

## 8. Dashboard
- Khung dashboard theo vai trò (chi tiết ở Phần B); nguồn đọc **bảng tổng hợp/xếp hạng** (không quét log thô). *(khung)*

## 9. KPI
- Cây KPI gắn North Star ([vision.md §8](../overview/vision.md)): độ phủ tri thức, sức sống cộng đồng, độ phủ bản đồ, niềm tin, hệ sinh thái API. *(khung)*

## 10. Alert
- Ngưỡng cảnh báo trên chỉ số (zero-result tăng, chi phí AI, toxicity, sụt traffic) → kênh alert; nối [deployment.md §12](./deployment.md). *(khung)*

## 11. A/B Testing
- Khung thực nghiệm: giả thuyết, phân nhóm, chỉ số mục tiêu, ý nghĩa thống kê; áp cho ranking/UX/growth. *(khung)*

## 12. Funnel
- Phễu chuyển đổi theo mục tiêu (khám phá → xem Place → đóng góp/đăng ký/claim); điểm rơi. *(khung)*

## 13. Retention
- Giữ chân theo nhóm hành vi (người đọc, người đóng góp, chủ cơ sở); D1/D7/D30. *(khung)*

## 14. Cohort
- Phân tích theo cohort (thời điểm gia nhập/nguồn/khu vực) để so sánh hành vi theo thời gian. *(khung)*

## 15. Conversion
- Chuyển đổi mục tiêu (đăng ký, đóng góp đầu tiên, claim cơ sở, referral kích hoạt); tỷ lệ & thời gian. *(khung)*

---

## Phần B — Dashboard theo vai trò

> Mỗi dashboard nêu **khung**: mục tiêu + nhóm chỉ số chính; **hiển thị theo RBAC**; đọc bảng đã tổng hợp. *(chi tiết sau)*

- **Founder** — bức tranh chiến lược: North Star, tăng trưởng người dùng, độ phủ nội dung, retention/cohort, sức khỏe tổng thể. *(khung)*
- **Admin** — vận hành hệ thống & nội dung: traffic/SEO, hàng chờ & SLA kiểm duyệt, chi phí AI, sức khỏe hạ tầng (nối [admin.md P13](../product/admin.md)). *(khung)*
- **Business** — chủ cơ sở (scope Managed): view/unique/rating cơ sở, review cần phản hồi, độ tươi dữ liệu. *(khung)*
- **Moderator** — an toàn nội dung: hàng chờ, báo cáo, toxicity, thời gian xử lý, cờ AI. *(khung)*

---

## Điểm cần quyết định sau (open questions) *(khung)*

- Chuẩn **event schema** & danh mục sự kiện lõi cho MVP.
- Công cụ đo phía client (tự xây beacon vs công cụ ngoài) đảm bảo **privacy**.
- Khung **A/B testing** (hạ tầng phân nhóm, ý nghĩa thống kê).
- Định nghĩa **cohort/retention** chuẩn (mốc D1/D7/D30, đơn vị nhóm).
- Ranh giới dữ liệu **Business dashboard** (không lộ dữ liệu cá nhân khách).
- Thực thể/bảng đo lường mới (nếu cần) — **CHƯA phê duyệt**; hỏi trước khi bổ sung vào [docs/data/](../data/database.md).

---

*Tài liệu liên quan: [data/modules/analytics.md](../data/modules/analytics.md), [search.md](./search.md), [seo.md](./seo.md), [ai-architecture.md](../ai/ai-architecture.md), [growth.md](../product/growth.md), [admin.md](../product/admin.md), [deployment.md](./deployment.md), [rbac.md](../security/rbac.md), [vision.md](../overview/vision.md).*
