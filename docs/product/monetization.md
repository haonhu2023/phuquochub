# PhuQuocHub — Chiến lược Kiếm tiền: Tiếp thị liên kết (Affiliate Marketing) quốc tế

> **Trạng thái: PROPOSAL.** Chiến lược kinh doanh tổng thể vẫn ở mức đề xuất (chưa đăng ký network/chưa launch); **mô hình dữ liệu kỹ thuật đã được phê duyệt để thiết kế** ([ADR-023](../99-decisions/ADR-023-affiliate-link-model.md), §6, §12). Tài liệu **chiến lược sản phẩm/kinh doanh**, không code, tiếng Việt. Mục tiêu: tạo doanh thu cho PhuQuocHub qua **tiếp thị liên kết với các chương trình nước ngoài** (du lịch, bảo hiểm, eSIM…) mà **không phá vỡ** phạm vi hiện tại (không đặt phòng/thanh toán — [vision.md §7](../overview/vision.md)) và không đánh đổi niềm tin cộng đồng ([vision.md §5-6](../overview/vision.md)). Liên quan: [growth.md](growth.md), [business.md](modules/business.md), [hotel.md](modules/hotel.md), [tour.md](modules/tour.md), [place.md](modules/place.md), [seo.md](../architecture/seo.md), [data-collection.md](../architecture/data-collection.md).

---

## 1. Vì sao affiliate quốc tế, và vì sao hợp với PhuQuocHub

- **Không cần xây booking/thanh toán** — PhuQuocHub chỉ **giới thiệu + điều hướng (redirect)** sang đối tác (Booking.com, Agoda, Klook…), đối tác xử lý đặt chỗ/thanh toán. Điều này **khớp 100%** với giới hạn phạm vi giai đoạn đầu (*"ngoài phạm vi: đặt phòng, đặt tour, thanh toán"* — [vision.md §7](../overview/vision.md)) — tức **kiếm tiền trước khi đủ lực xây transaction layer**.
- **Tận dụng nội dung đã/sắp có** — các trang [Hotel](modules/hotel.md), [Tour](modules/tour.md), [Restaurant](modules/restaurant.md), [Place](modules/place.md) vốn đã có **intent mua cao** (khách tìm "ở đâu/chơi gì ở Phú Quốc" là đang có ý định chi tiêu) — affiliate chỉ là **một lớp mỏng thêm vào nội dung đã tồn tại**, không cần sản phẩm mới.
- **Vì sao "nước ngoài" tốt hơn mạng trong nước:**
  - Trả **USD/EUR** (qua Payoneer/Wise), hoa hồng % cao hơn mạng affiliate nội địa cho cùng ngách du lịch.
  - Khách **quốc tế** đặt Phú Quốc qua Booking/Agoda/Klook nhiều hơn qua nền tảng Việt Nam → network nước ngoài **có sẵn demand** đúng ngách.
  - Cookie dài (7–365 ngày tuỳ network) → khách đọc bài ở PhuQuocHub, đặt sau vài ngày vẫn tính hoa hồng.
  - Không cạnh tranh trực tiếp với doanh nghiệp local trên PhuQuocHub ([vision.md §4.3](../overview/vision.md) — *"không bị lấn át bởi quảng cáo"*): affiliate là link ra ngoài tới OTA quốc tế, **không phải quảng cáo chèn giữa doanh nghiệp local với nhau**.

## 2. Nguyên tắc chung *(bắt buộc tuân thủ)*

1. **Không đánh đổi niềm tin cộng đồng** — affiliate **không** len vào Review/Community thật, **không** ảnh hưởng xếp hạng tìm kiếm/Business Reward (*"không bán thứ hạng"* — [growth.md §14](growth.md)).
2. **Minh bạch (disclosure) bắt buộc** — mọi link liên kết phải có nhãn rõ "Liên kết đối tác/Sponsored", đúng điều khoản từng network và chuẩn quốc tế (FTC-style), không che giấu.
3. **Không thay thế thông tin cộng đồng** — giá/giờ/liên hệ cộng đồng nhập ([Price](modules/hotel.md), [Contact](modules/place.md)) **giữ nguyên là dữ liệu tri thức**; affiliate link là **lớp riêng, tách biệt** (xem §6).
4. **Chất lượng trước doanh thu** — chỉ gắn link cho cơ sở/tour thật, đang hoạt động; không spam link vào nội dung không liên quan.
5. **Tuân thủ pháp luật & thuế** — kê khai thu nhập nước ngoài đúng quy định (chi tiết §8).

## 3. Mạng tiếp thị liên kết nước ngoài phù hợp ngách Phú Quốc

| Nhóm | Network | Hoa hồng (tham khảo) | Cookie | Thanh toán | Khớp module |
|---|---|---|---|---|---|
| Khách sạn/lưu trú | **Booking.com Partner Hub** | ~25–40% phần hoa hồng Booking thu (CPA) | 30 ngày | Chuyển khoản | [Hotel](modules/hotel.md) |
| Khách sạn/lưu trú | **Agoda Affiliate (CJ/Partnerize)** | 3–7% giá trị đặt phòng | 1 ngày (session) – cần CTA mạnh | Payoneer/chuyển khoản | [Hotel](modules/hotel.md) |
| Khách sạn/lưu trú | **Trip.com Partner** | 3–5% | 30 ngày | Chuyển khoản | [Hotel](modules/hotel.md) |
| Tour/hoạt động | **Klook Affiliate** | 3–8% | 30 ngày | Payoneer | [Tour](modules/tour.md) |
| Tour/hoạt động | **GetYourGuide Partner** | 6–8% | 30 ngày | Payoneer/Wise | [Tour](modules/tour.md) |
| Tour/hoạt động | **Viator / TripAdvisor Affiliate** | 7–8% | 14–30 ngày | Payoneer | [Tour](modules/tour.md) |
| Di chuyển ra đảo/liên tỉnh | **12Go.asia Affiliate** | 5–9% | 30 ngày | Payoneer/Wise | [Place](modules/place.md) (giao thông) |
| Chuyến bay | **Skyscanner / WayAway / Kiwi.com** | CPA/CPC nhỏ nhưng volume lớn | 30 ngày | Wise | Bài "đi Phú Quốc bằng gì" |
| Thuê xe | **DiscoverCars / RentalCars** | 30–70% margin thuê xe | 30–45 ngày | Chuyển khoản | [Place](modules/place.md) (thuê xe máy/ô tô) |
| Bảo hiểm du lịch | **SafetyWing / Heymondo** | 10–20% | 30–60 ngày | Payoneer/PayPal | Bài "chuẩn bị đi Phú Quốc" |
| eSIM/internet | **Airalo / Holafly / Saily** | 10–20% | 30 ngày | PayPal/Payoneer | Bài "eSIM cho khách quốc tế đến Phú Quốc" |
| Đồ dùng du lịch | **Amazon Associates (US/global)** | 1–10% theo ngành hàng | 24h | Chuyển khoản/thẻ | Bài "đồ cần mang khi đi biển" |

> Thứ tự ưu tiên đăng ký: **Booking Partner Hub → Agoda → Klook → GetYourGuide → 12Go → SafetyWing** (dễ được duyệt, khớp traffic Phú Quốc nhất, đã có sẵn nội dung Hotel/Tour để gắn link ngay).

## 4. Map affiliate vào sản phẩm hiện có

| Trang/nội dung PhuQuocHub | Vị trí gắn affiliate | Network ưu tiên |
|---|---|---|
| Trang [Hotel](modules/hotel.md) (chi tiết cơ sở lưu trú) | Box "Xem giá & đặt qua đối tác" dưới thông tin phòng | Booking.com, Agoda |
| Trang [Tour](modules/tour.md) | Box "Đặt tour qua đối tác" dưới lộ trình/giá tham khảo | Klook, GetYourGuide, Viator |
| Trang [Place](modules/place.md) loại bãi biển/di tích | Box gợi ý "Tour tới đây" + "Thuê xe đến đây" | Klook/GetYourGuide, DiscoverCars |
| Bài kinh nghiệm/Wikipedia-style ("Phú Quốc mùa nào đẹp", "đi lại thế nào") | Inline link theo chủ đề | 12Go, Skyscanner, SafetyWing, Airalo |
| [Community](modules/community.md) hỏi đáp | **Không** gắn affiliate trực tiếp vào câu trả lời cộng đồng — chỉ gợi ý "xem thêm" liên kết tới trang Hotel/Tour đã có box affiliate | — |

## 5. Vị trí hiển thị & UX (giữ chuẩn minh bạch)

- Box affiliate là **thành phần UI riêng** (ví dụ `AffiliateBox`), **tách khỏi** nội dung do cộng đồng/chủ cơ sở nhập — không chèn vào văn bản mô tả, không trộn với Review thật.
- Nhãn bắt buộc, hiển thị rõ gần CTA: *"Liên kết đối tác — PhuQuocHub có thể nhận hoa hồng khi bạn đặt qua liên kết này, không ảnh hưởng đến giá bạn trả."*
- Link ra ngoài gắn `rel="sponsored nofollow noopener"` (chuẩn SEO/quy định search engine cho link tài trợ).
- **Không** để affiliate ảnh hưởng thứ tự hiển thị cơ sở trong tìm kiếm/bản đồ (giữ nguyên nguyên tắc *"không bán thứ hạng"* — [growth.md §14](growth.md)); cơ sở không tham gia affiliate vẫn hiển thị bình đẳng.

## 6. Kiến trúc kỹ thuật *(đã chốt — [ADR-023](../99-decisions/ADR-023-affiliate-link-model.md), 2026-11-13)*

> Cập nhật: schema đã được phê duyệt để thiết kế (không còn là outline chờ duyệt). Chi tiết cột/kiểu/index/quy tắc đầy đủ: [affiliate.md](../data/modules/affiliate.md). API contract: [api.md §25](../api/api.md). **Vẫn chưa triển khai** (chưa có migration/entity TypeORM thật) — chờ Giai đoạn 1 (§9).

- **3 thực thể mới, tách biệt hoàn toàn khỏi Price/Contact:** `affiliate_partners` (danh mục network), `affiliate_links` (gắn `place_id`+`partner_id`+`target_url`+`label`+`is_active`), `affiliate_link_clicks` (log click nội bộ, ẩn danh hoá IP bằng hash). Không FK ngược từ `places`/`price_history`/`contacts` — affiliate không chạm dữ liệu cộng đồng.
- **Endpoint redirect nội bộ** `GET /go/:linkId` (ngoài prefix `/api`): ghi 1 dòng `affiliate_link_clicks` → `302` sang `target_url`. Đo **CTR nội bộ** độc lập với dashboard network.
- **Kiểm tra link định kỳ** (nối [data-collection.md](../architecture/data-collection.md)): job quét `affiliate_links.is_active`, cảnh báo khi Place gắn link đã `archived` (BR-AF2).
- **Phân quyền quản lý — đã chốt:** **chỉ Administrator** (`AffiliateLink.Manage`, toàn cục, không scope Managed — [rbac.md §3.3](../security/rbac.md)) tạo/sửa/xoá. Business Owner/Manager **không** có quyền này ở giai đoạn này (có thể mở lại sau — xem §12).
- **Không** thêm field affiliate vào entity `Place`/`Hotel`/`Tour` hiện có — giữ schema hiện tại ổn định, affiliate là lớp phụ trợ có thể tắt/xoá không ảnh hưởng dữ liệu lõi.

## 7. Chiến lược nội dung & SEO quốc tế hoá

- **Song ngữ, ưu tiên tiếng Anh cho nhóm bài có affiliate** — khách quốc tế đặt Booking/Agoda/Klook bằng USD, network trả cao hơn cho traffic Âu-Mỹ-Úc. Nối [vision.md §3.1](../overview/vision.md) (song ngữ phục vụ khách quốc tế).
- **Ngách sâu, không cạnh tranh trực diện với OTA lớn:** bài "Top khách sạn gần Bãi Sao", "Lịch trình 4N3Đ Phú Quốc", "Đi Phú Quốc mùa nào đẹp" — nội dung **chi tiết theo địa phương** mà Booking/Agoda/TripAdvisor tự thân không đầu tư sâu như vậy.
- **Draft do [AI Assistant](modules/ai-assistant.md) sinh, con người kiểm duyệt** trước khi publish (giữ nguyên nguyên tắc human-in-the-loop toàn hệ thống).
- **Internal link** giữa bài kinh nghiệm ↔ trang Hotel/Tour có AffiliateBox, tăng điều hướng nội bộ và thời gian ở lại trang.
- Nối [seo.md](../architecture/seo.md): structured data `Product`/`Offer` cho các box affiliate (rich snippet giá tham khảo) — chi tiết kỹ thuật để seo.md bổ sung sau, không lặp lại ở đây.

## 8. Tuân thủ pháp lý & thuế *(quan trọng — đọc kỹ trước khi nhận doanh thu)*

- **Disclosure:** tuân thủ điều khoản disclosure của từng network (hầu hết network lớn — Amazon, Booking, Agoda — yêu cầu công khai quan hệ affiliate theo chuẩn tương đương FTC Mỹ) để tránh bị khoá tài khoản affiliate.
- **Thuế thu nhập cá nhân (Việt Nam) với thu nhập từ affiliate nước ngoài:**
  - Cá nhân cư trú tại Việt Nam có thu nhập từ affiliate nước ngoài **phải kê khai** là thu nhập từ hoạt động kinh doanh/dịch vụ (không phải lương), thường áp theo biểu thuế khoán cho cá nhân kinh doanh (tham khảo mức phổ biến ~**1,5–7% trên doanh thu** tuỳ loại hình dịch vụ — **cần xác nhận với cơ quan thuế/kế toán tại thời điểm triển khai** vì quy định thuế thương mại điện tử/affiliate xuyên biên giới có thể thay đổi).
  - Nếu doanh thu affiliate đủ lớn, nên **đăng ký hộ kinh doanh cá nhân** để có mã số thuế, xuất hoá đơn/kê khai hợp lệ, tránh rủi ro truy thu sau này.
  - **Lưu hồ sơ:** màn hình điều khoản affiliate đã accept, lịch sử thanh toán từ Payoneer/Wise — làm chứng từ khi kê khai.
- **Nhận tiền quốc tế:** mở **Payoneer** hoặc **Wise** (hỗ trợ nhận USD/EUR, rút về ngân hàng VN, phí thấp hơn chuyển khoản quốc tế truyền thống).
- **Cookie/quyền riêng tư:** nếu có traffic từ EU, cần banner consent cho cookie tracking của network affiliate (tối thiểu thông báo trong Chính sách quyền riêng tư của PhuQuocHub).
- *Khuyến nghị:* đây là tài liệu chiến lược, **không phải tư vấn pháp lý/thuế chính thức** — xác nhận với kế toán/luật sư thuế tại Việt Nam trước khi phát sinh doanh thu đáng kể.

## 9. Lộ trình triển khai (MVP → Scale)

### Giai đoạn 0 — Chuẩn bị (2–4 tuần)
- Đăng ký affiliate: Booking.com Partner Hub, Agoda, Klook, GetYourGuide, 12Go, SafetyWing.
- Mở Payoneer/Wise để nhận thanh toán.
- Soạn nhãn disclosure chuẩn + cập nhật Chính sách quyền riêng tư.
- Chọn **15–20 trang Hotel/Tour/Place** có traffic/intent cao nhất hiện có → gắn link **thủ công** (chưa cần entity mới) để đo thử CTR/conversion sớm.
- **KPI chuyển giai đoạn:** ≥1 network đã duyệt, ≥1 đơn chuyển đổi (conversion) thực tế ghi nhận trên dashboard network.

### Giai đoạn 1 — MVP kỹ thuật (song song viết nội dung)
- Thiết kế & xin phê duyệt entity `AffiliatePartner`/`AffiliateLink` (đưa vào [docs/data/](../data/database.md) sau khi duyệt) + endpoint redirect đo click.
- Gắn `AffiliateBox` theo category (Hotel → Booking+Agoda; Tour → Klook+GetYourGuide; bài giao thông → 12Go).
- Viết 10–20 bài kinh nghiệm song ngữ có affiliate, ưu tiên EN.
- **KPI chuyển giai đoạn:** CTR affiliate box ổn định đo được qua redirect endpoint; revenue tháng > 0 liên tục 2 tháng.

### Giai đoạn 2 — Tối ưu & mở rộng
- A/B test vị trí/CTA của AffiliateBox.
- Thêm network theo EPC thực tế (Viator, DiscoverCars, Airalo…).
- Dashboard nội bộ (click, ước tính revenue theo network) — nối [analytics.md](../architecture/analytics.md).
- **KPI chuyển giai đoạn:** revenue/1000 pageview tăng theo từng quý; ≥3 network hoạt động ổn định.

### Giai đoạn 3 — Scale
- Cá nhân hoá gợi ý affiliate qua [AI Assistant](modules/ai-assistant.md) (gợi ý khách sạn/tour phù hợp hồ sơ tìm kiếm, kèm link).
- Đánh giá hiệu suất network theo quý, loại network EPC thấp, thêm network mới.
- Xem xét mở rộng ngách lân cận (đảo/vùng du lịch khác) nếu mô hình hiệu quả.

## 10. KPI đo lường

- **CTR AffiliateBox** = click/pageview trang có box.
- **EPC (earnings per click)** theo từng network — đối chiếu dashboard network vs log redirect nội bộ.
- **Revenue/tháng** và **Revenue/1000 pageview** (so sánh theo thời gian, theo category Hotel/Tour/khác).
- **Tỷ lệ traffic quốc tế (EN) vs nội địa (VI)** — theo dõi vì ảnh hưởng trực tiếp tới EPC.
- **Tỷ lệ bài/trang có affiliate hoạt động** / tổng bài — tránh để quá nhiều link chết.

## 11. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Network đổi điều khoản/hoa hồng bất ngờ | Đa dạng hoá ≥3 network/ngách, không phụ thuộc 1 network duy nhất |
| Mất niềm tin cộng đồng nếu lạm dụng link | Giữ nguyên tắc §2, tách UI affiliate khỏi nội dung cộng đồng, giới hạn số lượng box/trang |
| Link hỏng do cơ sở đóng cửa | Job kiểm tra định kỳ (§6), nối vào lifecycle dữ liệu [data-collection.md](../architecture/data-collection.md) |
| Cạnh tranh SEO với chính OTA lớn | Đi ngách sâu theo địa phương (lịch trình, mẹo, so sánh) thay vì cạnh tranh từ khoá rộng |
| Rủi ro thuế/pháp lý nếu không kê khai | Theo §8 — đăng ký hộ kinh doanh khi doanh thu đủ lớn, lưu hồ sơ đầy đủ |

## 12. Điểm cần quyết định (đã chốt & còn mở)

**Đã chốt (2026-11-13):**
- ✅ **Quản lý affiliate link:** chỉ **Administrator** (tập trung); Business Owner **không** tự thêm link ở giai đoạn này — có thể mở lại sau khi mô hình tập trung chứng minh hiệu quả. Ảnh hưởng [business.md BR-B9](modules/business.md) — không đổi BR-B9 (Business Owner vẫn không có quyền mới nào ở Business module do quyết định này).
- ✅ **Thực thể `affiliate_partners`/`affiliate_links`/`affiliate_link_clicks`:** đã phê duyệt, đã thiết kế schema đầy đủ — [affiliate.md](../data/modules/affiliate.md), [ADR-023](../99-decisions/ADR-023-affiliate-link-model.md), [api.md §25](../api/api.md). **Chưa triển khai** (migration/entity thật chờ Giai đoạn 1, §9).
- ✅ **AI Assistant:** giữ ở **Giai đoạn 3** như roadmap ban đầu — không tích hợp sớm ở MVP.

**Còn mở:**
- **Ngưỡng doanh thu đăng ký hộ kinh doanh cá nhân:** tra cứu ban đầu (2026-11-13) cho thấy **thông tin mâu thuẫn** giữa các nguồn — có nguồn nói ngưỡng chịu thuế hộ kinh doanh nâng lên **1 tỷ đồng/năm** từ 1/1/2026, nguồn khác (cũ hơn) nói **500 triệu đồng/năm**; thuế khoán được thay bằng tự kê khai theo doanh thu thực tế theo Nghị định 68/2026/NĐ-CP, Thông tư 18/2026/TT-BTC. **Chưa xác minh được văn bản gốc** — bắt buộc đối chiếu trên Thư viện Pháp luật/Công báo hoặc hỏi kế toán/thuế thật trước khi áp dụng, đặc biệt phần thu nhập từ nền tảng/affiliate **nước ngoài** (chưa thấy hướng dẫn rõ ràng trong các nguồn đã tra).
- **Cách hiển thị nhãn disclosure tối ưu** (không làm xấu UX) — cần phối hợp với [wireframes.md](wireframes.md) khi tới lượt thiết kế UI `AffiliateBox` (Giai đoạn 1, §9); nội dung nhãn mặc định đã có ở §5, còn vị trí/kiểu hiển thị cụ thể chưa thiết kế.

---

*Tài liệu liên quan: [vision.md](../overview/vision.md) (phạm vi & trust model), [growth.md](growth.md), [business.md](modules/business.md), [hotel.md](modules/hotel.md), [tour.md](modules/tour.md), [place.md](modules/place.md), [seo.md](../architecture/seo.md), [data-collection.md](../architecture/data-collection.md), [analytics.md](../architecture/analytics.md).*
