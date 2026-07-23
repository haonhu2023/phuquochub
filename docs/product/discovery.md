# PhuQuocHub — Wireframe: Nhóm Khám phá (Discovery)

> Wireframe low-fidelity (không code). Gồm: **Trang chủ, Place, Hotel, Restaurant, Tour, Event, Search, AI (Trợ lý).** Quy ước chung ở [wireframes.md](./wireframes.md). Mỗi trang mô tả theo khuôn: *Mục tiêu · Đối tượng · Thành phần · **Thứ tự hiển thị** · Luồng · **CTA** · Responsive · SEO · Accessibility.*

---

## P1 — Trang chủ (Home)

```
[ Header: logo · [ 🔍 Tìm địa điểm, món ăn, tour… ] · 📍Gần tôi · vi/en · Login ]
[ Chips danh mục: Bãi biển · Ẩm thực · Lưu trú · Tour · Di tích · Sự kiện ]
┌───────────────── Bản đồ Phú Quốc (preview) ─────────────────┐
│  • pin cụm địa điểm            [ Mở bản đồ đầy đủ → ]        │
└─────────────────────────────────────────────────────────────┘
[ 🔥 Nổi bật tuần (carousel PopularPlace) ]
[ 📈 Đang được tìm (TrendingKeyword chips) ]  [ 🌤 Thời tiết đảo ]
[ Bộ sưu tập: "Bãi đẹp" · "Ăn gì" · "Lặn biển" ]
[ 💬 Cộng đồng nổi bật ]      [ CTA: Đóng góp địa điểm / Đăng ký ]
```
- **Mục tiêu:** cửa ngõ khám phá Phú Quốc — tìm kiếm, bản đồ, danh mục, nội dung nổi bật/đang lên, dẫn vào cộng đồng & đóng góp.
- **Người dùng:** Guest, du khách, người dân (mọi vai trò đọc).
- **Thành phần giao diện:** thanh tìm kiếm + "gần tôi", chips danh mục, preview bản đồ, carousel **PopularPlace**, chips **TrendingKeyword**, widget thời tiết, bộ sưu tập chủ đề, khối cộng đồng, CTA đóng góp/đăng ký.
- **Thứ tự hiển thị:** header + tìm kiếm → chips danh mục → preview bản đồ → 🔥 Nổi bật tuần → 📈 Đang được tìm + 🌤 thời tiết → bộ sưu tập chủ đề → 💬 cộng đồng nổi bật → CTA đóng góp/đăng ký → footer. (Ưu tiên mobile: search sticky trên cùng, bản đồ thu thành nút, phần còn lại xếp dọc theo mức quan trọng.)
- **Luồng thao tác:** gõ tìm → Search (P7); chọn danh mục → danh sách lọc; chọn địa điểm nổi bật → Place (P2); "Gần tôi" → xin định vị → kết quả bản đồ.
- **CTA:** *Chính* — ô "Tìm kiếm" + "📍 Gần tôi". *Phụ* — "Đóng góp địa điểm", "Đăng ký / Đăng nhập", "Mở bản đồ đầy đủ", chip TrendingKeyword.
- **Responsive:** mobile 1 cột, search sticky trên, bản đồ thu gọn thành nút; desktop hero + lưới.
- **SEO:** SSG; `WebSite` + `Organization` schema (kèm SearchAction), title/description đảo Phú Quốc, hreflang vi/en.
- **Accessibility:** skip-link; carousel điều khiển bằng bàn phím + nút prev/next; search có nhãn; preview bản đồ có link "danh sách địa điểm".

---

## P2 — Trang Place (chi tiết địa điểm — lõi)

```
[ Breadcrumb: Trang chủ / Bãi biển / Bãi Sao ]
┌──────── Gallery ảnh ────────┐  ┌── Panel thông tin (sticky) ──┐
│  ▢ ▢ ▢  (+ xem tất cả)      │  │ ✅ Official · ⭐4.6 (312)     │
└─────────────────────────────┘  │ 📍 Địa chỉ · 🕒 Đang mở       │
[ H1: Tên · badge xác minh · danh mục ]        │ 💰 Giá · ☎ Liên hệ           │
[ Tabs: Tổng quan · Ảnh · Đánh giá · Hỏi đáp ] │ [ Chỉ đường ] [ Lưu ] [ Chia sẻ ]│
[ Mô tả (kèm badge Nguồn) ]                    │  Bản đồ mini + pin           │
[ 🤖 AI tóm tắt (đã duyệt) ]                   └──────────────────────────────┘
[ Bảng giá / vé ] [ FAQ ] [ Lịch sử phiên bản → ]
[ Đánh giá: phân bố sao · [Viết đánh giá] · list review ]
[ Địa điểm gần đây ]        [ Đề xuất chỉnh sửa · Báo sai · Claim nếu là chủ ]
```
- **Mục tiêu:** trang tri thức đầy đủ, đáng tin cho một địa điểm (Wikipedia + Maps): thông tin, bản đồ, ảnh, đánh giá, **nguồn gốc & xác minh**.
- **Người dùng:** du khách (đọc), người dân/Contributor (sửa), Business Owner (claim/quản lý).
- **Thành phần giao diện:** gallery, H1 + **badge xác minh**, panel thông tin sticky (địa chỉ, giờ *đang mở*, giá, liên hệ), bản đồ + chỉ đường, mô tả kèm **badge Nguồn**, **AI tóm tắt (có nhãn)**, bảng vé, FAQ, khối đánh giá + rating, link **lịch sử phiên bản**, địa điểm gần đây, nút **Đề xuất sửa / Báo sai / Claim**.
- **Thứ tự hiển thị:** breadcrumb → gallery + panel thông tin (sticky) → H1 + badge xác minh + danh mục → tabs → mô tả (badge nguồn) → 🤖 AI tóm tắt (đã duyệt) → bảng giá/vé → FAQ → khối đánh giá → địa điểm gần đây → khối đóng góp/claim. (Mobile: gallery → H1 → panel rút gọn → nội dung; thanh hành động sticky dưới.)
- **Luồng thao tác:** xem → Lưu/Chia sẻ → đọc review → Viết đánh giá (cần đăng nhập, [WF-11](../workflow/moderation.md)) → Đề xuất sửa ([WF-06](../workflow/contribution.md)) → Báo sai ([WF-10](../workflow/contribution.md)).
- **CTA:** *Chính* — "Chỉ đường", "Lưu", "Viết đánh giá". *Phụ* — "Chia sẻ", "Đề xuất chỉnh sửa", "Báo sai", "Claim nếu là chủ", "Xem lịch sử phiên bản".
- **Responsive:** mobile xếp dọc + **thanh hành động sticky dưới** (Chỉ đường/Lưu/Đánh giá); desktop 2 cột (nội dung + panel/bản đồ sticky).
- **SEO:** SSR theo `slug`; meta từ `place_seo`; JSON-LD `TouristAttraction`/`LocalBusiness` + `FAQPage` + `BreadcrumbList`; canonical; OG cover.
- **Accessibility:** gallery điều khiển bàn phím + `alt_text`; bản đồ có danh sách thay thế; rating sao đọc được; thứ bậc heading; badge nguồn có text (không chỉ màu).

---

## P3 — Trang Hotel (Place chuyên biệt)

```
[ như Place, phần trên ]
[ ⭐ Hạng sao · Tiện ích: 🏊 🍳 🅿 📶 (lưới) ]
[ Loại phòng: Tên · Sức chứa · Tiện ích · Giá tham khảo ]  (bảng)
[ Ghi chú: Giai đoạn đầu KHÔNG đặt phòng — chỉ thông tin ]
[ Bản đồ · Gần biển/khu vực · Đánh giá ]
```
- **Mục tiêu:** giới thiệu cơ sở lưu trú (hạng, tiện ích, loại phòng, vị trí) để khám phá — chưa đặt phòng.
- **Người dùng:** du khách tìm chỗ ở; Business Owner/Manager cập nhật.
- **Thành phần giao diện:** kế thừa Place + hạng sao, lưới tiện ích, bảng loại phòng (sức chứa/giá tham khảo), nhãn "không đặt phòng", vị trí trên bản đồ.
- **Thứ tự hiển thị:** (kế thừa phần trên của Place) → hạng sao + lưới tiện ích → bảng loại phòng (sức chứa/giá tham khảo) → nhãn "không đặt phòng" → bản đồ/khu vực (gần biển) → đánh giá. (Mobile: bảng phòng → thẻ.)
- **Luồng thao tác:** lọc theo sao/tiện ích/giá từ Search → xem phòng → chỉ đường/lưu → đánh giá.
- **CTA:** *Chính* — "Chỉ đường", "Lưu". *Phụ* — "Xem tất cả tiện ích", "Chia sẻ", "Viết đánh giá", *(giai đoạn sau)* "Đặt phòng — sắp có".
- **Responsive:** bảng phòng → thẻ (card) trên mobile.
- **SEO:** JSON-LD `Hotel`/`LodgingBusiness` (amenityFeature, starRating), giá dạng `priceRange`.
- **Accessibility:** lưới tiện ích có nhãn text; bảng phòng dùng header cột đúng.

---

## P4 — Trang Restaurant (Place chuyên biệt)

```
[ như Place, phần trên · Ẩm thực · 🕒 Đang mở · 💰 Khoảng giá ]
[ Thực đơn: mục → món (tên · giá · tag) ]  [ Ảnh món ]
[ Đặc sản Phú Quốc · Bản đồ · Đánh giá ]
```
- **Mục tiêu:** giới thiệu menu, đặc sản, giá, giờ mở cửa, vị trí để thu hút thực khách.
- **Người dùng:** du khách tìm chỗ ăn; chủ nhà hàng cập nhật menu.
- **Thành phần giao diện:** menu theo mục, tag ẩm thực/khẩu phần, chỉ báo **đang mở** (suy từ `opening_hours`), ảnh món, khoảng giá, bản đồ, đánh giá.
- **Thứ tự hiển thị:** (Place phần trên + Ẩm thực + 🕒 đang mở + 💰 khoảng giá) → thực đơn theo mục → ảnh món → đặc sản Phú Quốc → bản đồ → đánh giá. (Mobile: menu dạng accordion.)
- **Luồng thao tác:** lọc `cuisine/open_now/price` từ Search → xem menu → chỉ đường → đánh giá + ảnh món.
- **CTA:** *Chính* — "Chỉ đường", "Lưu", "Viết đánh giá + ảnh món". *Phụ* — "Xem menu đầy đủ", "Chia sẻ", "Gọi hotline".
- **Responsive:** menu dạng accordion trên mobile.
- **SEO:** JSON-LD `Restaurant` (servesCuisine, menu, priceRange, openingHours).
- **Accessibility:** accordion menu ARIA; ảnh món có `alt`.

---

## P5 — Trang Tour

```
[ như Place, phần trên · Loại (lặn/câu/trekking) · ⏱ Thời lượng · 💰 Giá ]
┌──── Lộ trình trên bản đồ (điểm dừng) ────┐  [ Lịch khởi hành: ngày · chỗ · giá ]
│ ①→②→③  polyline                        │  [ Nhà tổ chức (verified) ]
└──────────────────────────────────────────┘  [ Đánh giá ]
```
- **Mục tiêu:** giới thiệu tour với lộ trình trực quan, lịch khởi hành, giá, uy tín nhà tổ chức.
- **Người dùng:** du khách lên kế hoạch; Tour operator (partner) quản lý.
- **Thành phần giao diện:** loại tour, thời lượng, **lộ trình vẽ trên bản đồ (điểm dừng có tọa độ)**, lịch/giá theo ngày, thông tin nhà tổ chức + badge xác minh, đánh giá.
- **Thứ tự hiển thị:** (Place phần trên + loại + ⏱ thời lượng + 💰 giá) → lộ trình trên bản đồ + danh sách điểm dừng (text) → lịch khởi hành + giá → nhà tổ chức (verified) → đánh giá. (Mobile: bản đồ lộ trình full-width, danh sách điểm dừng bên dưới.)
- **Luồng thao tác:** lọc `type/duration/price` → xem lộ trình → xem lịch → liên hệ/đánh giá.
- **CTA:** *Chính* — "Liên hệ nhà tổ chức", "Lưu". *Phụ* — "Xem lịch khởi hành", "Chia sẻ", *(giai đoạn sau)* "Đặt tour — sắp có".
- **Responsive:** bản đồ lộ trình full-width trên mobile, danh sách điểm dừng bên dưới.
- **SEO:** JSON-LD `TouristTrip`/`Trip` (itinerary, offers).
- **Accessibility:** lộ trình có **danh sách điểm dừng dạng text** song song bản đồ.

---

## P6 — Trang Event

```
[ Breadcrumb ]  [ Cover · Trạng thái: Sắp diễn ra ]
[ H1 tên sự kiện · 📅 Thời gian · ⏳ đếm ngược · 📍 địa điểm ]
[ [Thêm vào lịch] [Chỉ đường] [Chia sẻ] ]
[ Mô tả · Bản đồ · Địa điểm/nhà tổ chức liên quan · Đánh giá/Thảo luận ]
```
- **Mục tiêu:** thông tin sự kiện theo thời gian + vị trí, hỗ trợ lên lịch.
- **Người dùng:** du khách, người dân; nhà tổ chức (đăng/cập nhật).
- **Thành phần giao diện:** cover, **trạng thái theo thời gian** (sắp/đang/đã diễn ra), thời gian + đếm ngược, địa điểm bản đồ, **thêm vào lịch**, mô tả, liên kết Place/nhà tổ chức.
- **Thứ tự hiển thị:** breadcrumb → cover + trạng thái theo thời gian → H1 + 📅 thời gian + ⏳ đếm ngược + 📍 địa điểm → hàng nút hành động → mô tả → bản đồ → liên kết Place/nhà tổ chức → đánh giá/thảo luận. (Mobile: xếp dọc, nút hành động sticky.)
- **Luồng thao tác:** xem lịch sự kiện (calendar) → mở chi tiết → thêm vào lịch/chỉ đường → thảo luận.
- **CTA:** *Chính* — "Thêm vào lịch", "Chỉ đường". *Phụ* — "Quan tâm / Nhắc tôi", "Chia sẻ", "Thảo luận".
- **Responsive:** mobile dọc; nút hành động sticky.
- **SEO:** JSON-LD `Event` (startDate/endDate, location, eventStatus); quan trọng cho rich result.
- **Accessibility:** đếm ngược có text tương đương; ngày giờ máy đọc được; trạng thái không chỉ bằng màu.

---

## P7 — Trang Search (kết quả & bản đồ)

```
[ 🔍 truy vấn ................. ]  [ Sắp xếp ▾ ]  [ Bản đồ | Danh sách ]  (toggle mobile)
┌── Bộ lọc ──┐ ┌──── Danh sách kết quả (card) ────┐ ┌──── Bản đồ ────┐
│ Loại       │ │ [▢] Tên · ⭐ · 💰 · badge        │ │  • pin (hover  │
│ Giá        │ │ [▢] …                            │ │    ↔ card)     │
│ Đánh giá   │ │ … (infinite scroll / cursor)     │ │                │
│ Khu vực    │ └──────────────────────────────────┘ └────────────────┘
│ Đang mở    │   [ Trạng thái 0 kết quả → "Đóng góp địa điểm này?" ]
└────────────┘
```
- **Mục tiêu:** tìm & lọc tổng hợp (place/hotel/restaurant/tour/event/community) kết hợp bản đồ.
- **Người dùng:** mọi người dùng đang tìm kiếm.
- **Thành phần giao diện:** thanh tìm, **bộ lọc theo loại** (giá, rating, khu vực/phường, đang mở, tiện ích), danh sách card + **bản đồ đồng bộ** (hover card ↔ pin), sắp xếp, cursor pagination, **trạng thái 0 kết quả** gợi ý đóng góp.
- **Thứ tự hiển thị:** thanh truy vấn + sắp xếp + toggle Bản đồ/Danh sách → (desktop) bộ lọc trái · danh sách kết quả giữa · bản đồ phải → trạng thái 0 kết quả cuối danh sách. (Mobile: toggle Bản đồ/Danh sách, bộ lọc là drawer.)
- **Luồng thao tác:** nhập truy vấn (hỗ trợ **không dấu**) → lọc → hover/nhấp card → Place detail; 0 kết quả → CTA đóng góp ([WF-06/19](../workflow/contribution.md)).
- **CTA:** *Chính* — "Áp dụng bộ lọc", mở chi tiết kết quả (card/pin). *Phụ* — "Đổi Bản đồ/Danh sách", "Xóa lọc"; *(khi 0 kết quả)* "Đóng góp địa điểm này".
- **Responsive:** mobile **toggle Bản đồ/Danh sách**; desktop split đôi; bộ lọc là drawer trên mobile.
- **SEO:** trang kết quả động thường `noindex`; **trang danh mục/khu vực** (landing) mới SSG & indexable + canonical.
- **Accessibility:** bộ lọc có nhãn; kết quả cập nhật thông báo qua `aria-live`; parity bản đồ ↔ danh sách; bàn phím chọn pin.

---

## P12 — Trang AI (Trợ lý hỏi–đáp cho người dùng)

```
[ Header ]
[ H1: Hỏi PhuQuocHub AI · "Hỏi bất cứ điều gì về Phú Quốc" ]
┌──────────────── Khung hội thoại ─────────────────┐
│  🧑 Bãi nào đẹp ngắm hoàng hôn?                   │
│  🤖 Gợi ý: Bãi Trường, Bãi Ông Lang…             │
│     ┌ thẻ Place: ảnh · ⭐4.6 · [Chỉ đường][Lưu] ┐│
│     Nguồn: [Bãi Trường ↗] [Bãi Ông Lang ↗]       │
└───────────────────────────────────────────────────┘
[ Chips gợi ý: "Lịch trình 3 ngày" · "Ăn hải sản ở đâu" · "Tour lặn biển" ]
[ Ô nhập: [ Nhắn cho trợ lý… ] (Gửi) · 📍 đính vị trí ]
[ Nhãn: Trả lời do AI tạo — có thể chưa chính xác · dựa trên dữ liệu PhuQuocHub ]
```
- **Mục tiêu:** cổng hỏi–đáp **hội thoại tự nhiên** giúp du khách hỏi bằng ngôn ngữ đời thường và nhận gợi ý địa điểm/lịch trình **có dẫn nguồn Place**; hạ rào cản so với tìm bằng từ khóa; hiện thực slogan *"Muốn biết gì về Phú Quốc — hãy hỏi."*
- **Đối tượng sử dụng:** du khách (Guest/Member), người dân hỏi nhanh. Trả lời tức thời dựa trên **nội dung đã published**; nội dung AI ghi vào Place vẫn theo human-in-the-loop ([ai-assistant.md](./modules/ai-assistant.md)).
- **Thành phần giao diện:** khung hội thoại (bong bóng người/AI), **thẻ Place gắn trong câu trả lời** (ảnh, rating, Chỉ đường, Lưu), **trích nguồn** tới trang Place, chips gợi ý nhanh, ô nhập (text + đính vị trí), **nhãn minh bạch AI**, nút "Mở trên bản đồ", lịch sử hội thoại (khi đăng nhập), nút dừng khi đang sinh.
- **Thứ tự hiển thị:** H1 + mô tả → khung hội thoại (câu trả lời kèm thẻ Place + nguồn) → chips gợi ý → ô nhập (sticky dưới) → nhãn miễn trừ AI. (Mobile: hội thoại toàn màn hình, ô nhập sticky đáy.)
- **Luồng thao tác:** nhập câu hỏi (hoặc chọn chip) → AI trả lời + thẻ Place + nguồn → mở chi tiết/Chỉ đường/Lưu; nếu thiếu dữ liệu → AI gợi ý **đóng góp địa điểm** (nối tín hiệu Search 0-kết-quả, [WF-19](../workflow/contribution.md)).
- **CTA:** *Chính* — "Gửi câu hỏi"; trong câu trả lời "Chỉ đường" / "Lưu" / "Xem chi tiết". *Phụ* — chips gợi ý, "Mở trên bản đồ", "Đăng nhập để lưu hội thoại".
- **Responsive:** mobile hội thoại full + ô nhập sticky đáy; desktop khung hội thoại giữa (hẹp), gợi ý/lịch sử bên cạnh.
- **SEO:** phiên chat cá nhân hóa → `noindex`; có thể có **landing tĩnh** giới thiệu trợ lý (SSG, indexable). **Không** đưa truy vấn/PII vào URL (query gửi qua body).
- **Accessibility:** vùng hội thoại `aria-live="polite"` cho câu trả lời mới; ô nhập có nhãn; thẻ Place là danh sách truy cập bằng bàn phím; nhãn AI đọc được (không chỉ bằng màu); hỗ trợ **dừng/hủy** khi đang sinh; tôn trọng `prefers-reduced-motion` cho hiệu ứng gõ.

---

*Tài liệu liên quan: [wireframes.md](./wireframes.md), [engagement.md](./engagement.md), [admin.md](./admin.md), [api.md](../api/api.md) §21–§22, [places.md](../data/modules/places.md), [modules/ai-assistant.md](./modules/ai-assistant.md), [modules/search.md](./modules/search.md), [workflow.md](../workflow/workflow.md)*
