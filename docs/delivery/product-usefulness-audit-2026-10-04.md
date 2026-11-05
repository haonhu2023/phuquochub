# PhuQuocHub — Kiểm kê giá trị sử dụng và bản xem local, Đợt 1 (cập nhật 04/10/2026, lượt 2)

Trạng thái theo từng phần, không gộp:
- **Kiểm kê:** xong cho phần đọc được qua public API, route công khai và source. Chưa đọc được: `restaurants/{slug}/details` (cần đăng nhập), hồ sơ quyền ảnh (cần phiên quản trị).
- **Đề xuất nội dung:** Novotel đủ để trình owner quyết định; Ra Khơi và Bãi Sao bị chặn ở một số trường bởi nguồn.
- **Render local:** xong cho bốn route (hotel Novotel, nhà hàng Ra Khơi, place Bãi Sao, place Novotel) bằng fixture có nhãn. Đây không phải dữ liệu production.
- **RouteGuard:** sửa xong, kiểm thử xong trong phạm vi nêu ở mục 4. Chưa đăng nhập bằng tài khoản thật, chưa gửi đề xuất vào API thật.
- **Chưa deploy, chưa ghi production, chưa commit, chưa publish, chưa migration.**

## 0. Phạm vi, SHA, môi trường

- Repo `D:\Projects\PhuQuocHub`, nhánh `owner-dashboard-patch-0a636dd`.
- **HEAD hiện tại (05/10/2026):** `b91e92ce7baf547b757d425eea0f30ceac8cd848`. Đây là candidate Web, đã build thành `phuquochub-web:b91e92c…` và đã kiểm trên image (mục 13). HEAD ngày 04/10 là `82fb23c…` (lịch sử).
- **Production (đọc 05/10/2026, chỉ đọc):** pin `WEB_IMAGE_TAG` và `API_IMAGE_TAG` đều là `f0c65b716c39a41de4948c695d4383f2cfa47f1f`. Chưa deploy `b91e92c`.
- **RouteGuard, routing, fixture:** đã nằm trong commit `b91e92c`, không còn là WIP cho gói này.
- **Production read:** chỉ GET công khai (HTML route và JSON public API), không credential, không endpoint ghi. Thời điểm: 13:34–14:30 UTC, 04/10/2026.
- **Bài nháp thật `ffe8f569-7f5d-4626-8088-a66f5d476f3c`:** không đọc, không sửa.
- **Local:** web dev server `localhost:3000`; render stub `127.0.0.1:4000` (chỉ GET; một POST synthetic cho gửi đề xuất; mọi ghi khác 405; không gọi ra ngoài).

## 1. Đính chính so với lượt 1

| Nhận định trước | Hiệu chỉnh sau khi xem đúng route |
|---|---|
| "Dương Bào nằm trong Dương Tơ" (suy ra cấp hành chính) | **Suy luận không đủ căn cứ.** Nguồn chỉ có cụm nguyên văn "Duong Bao Duong To Area". Không suy ra cấp hành chính từ cụm này. Giữ nguyên văn. |
| "Trang khách sạn thiếu tiện ích, hạng sao, giờ nhận phòng" | **Sai, do kiểm tra sai route.** `/vi/hotels/{slug}` hiển thị đủ loại hình, hạng sao + nguồn, giờ nhận/trả khi có dữ liệu, tiện nghi, liên hệ. Chỉ `/vi/places/{slug}` (route chung) không hiển thị các trường này. |
| "Thiếu wiring" chung | **Thiếu wiring có điều kiện, đã xác định đúng phạm vi:** route chung `/vi/places/{slug}` là điểm vào của danh sách `/vi/places` (50 mục, gồm cả khách sạn và nhà hàng) và trang chủ `DiscoverPlaces`. Từ điểm vào này, khách sạn/nhà hàng không thấy dữ liệu chuyên biệt đang có. Xem mục 2. |
| "Ảnh placeholder do dữ liệu/ảnh" | Không tái hiện được trên trình duyệt thường; nguyên nhân quan sát được là môi trường Browser pane chặn tải ảnh khác origin. Xem mục 5. |
| "Dữ liệu Bãi Sao còn ghi chú nội bộ" | Đã sửa trong fixture; câu nội bộ đã chuyển sang ghi chú nguồn, không nằm trong mô tả hiển thị. |
| Fixture khách sạn có nhãn "(tự công bố)" trong tiêu đề nguồn | **Đã sửa:** tiêu đề nguồn trung tính; phân loại đặt ở `sources.type` (xem mục 6). |
| Bản đầu của RouteGuard double-encode tiếng Việt | **Đã phát hiện và sửa** trong lượt này (mục 4.2). Kiểm thử lượt 1 không bắt được lỗi này vì chỉ kiểm URL đăng nhập. |

## 2. Route công khai khách thực sự dùng

Nguồn xác định: `apps/web/src/modules/*/…Card.tsx` (href của thẻ), `src/app/[locale]/(public)/*/page.tsx`, và comment trong `places/[slug]/page.tsx` ("Hotel/Restaurant/Tour … có trang chi tiết riêng").

| Điểm vào (danh sách) | Thẻ link tới | Route chi tiết | Endpoint đọc | Trường hiển thị |
|---|---|---|---|---|
| `/vi/hotels` | `HotelCard` → `/hotels/{slug}` | `/vi/hotels/[slug]` | `GET /api/hotels/{slug}?locale=` → `data.hotel_details`, `amenities`, `rooms`, `contacts`, `media` | Loại hình; hạng sao + nguồn; giờ nhận/trả; tiện nghi; liên hệ; phòng (nếu có) |
| `/vi/restaurants` | `RestaurantCard` → `/restaurants/{slug}` | `/vi/restaurants/[slug]` | `GET /api/restaurants/{slug}?locale=` → `cuisines`, `restaurant_details`; menu: `GET /api/restaurants/{id}/menu` (cần **UUID**) | Ẩm thực; "đặc sản Phú Quốc" (khi `is_local_specialty`); menu |
| `/vi/beaches` | `BeachCard` → `/places/{slug}` | **không có** `/beaches/[slug]` (xác nhận trong `beaches/error.tsx`) | `GET /api/places/{slug}` | Mô tả, khu vực, bản đồ |
| `/vi/places` (50 mục) và trang chủ `DiscoverPlaces` | `PlaceCard` → `/places/{slug}` | `/vi/places/[slug]` (chung) | `GET /api/places/{slug}` | Mô tả, địa chỉ, khu vực, liên hệ, ảnh. **Không** có hotel_details, amenities, cuisines |

Kết luận cấu trúc: có hai đường vào cho khách sạn và nhà hàng. Đường chuyên biệt đúng; đường chung không dùng dữ liệu chuyên biệt. Đây là vấn đề chọn route và cần owner quyết định (mục 9, quyết định 7), không phải thiếu code hiển thị.

## 3. Ba trang mẫu (current → proposed)

Quy ước ảnh: **CURRENT** = production public đọc qua HTML; **PROPOSED** = fixture local có nhãn, không publish.

### 3.1 Novotel — route khách sạn `/vi/hotels/novotel-phu-quoc`

| Field (endpoint) | CURRENT (production) | PROPOSED (local fixture) | Nguồn | Trạng thái |
|---|---|---|---|---|
| `address` (`/hotels/{slug}`) | "Bãi Trường, Dương Tơ, TP. Phú Quốc" | Nguyên văn: "Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special Zone, 922273 An Giang Province, Vietnam" | `https://www.novotelphuquoc.com/` (đọc trực tiếp) | **Chờ owner.** Không chuẩn hóa, không suy cấp hành chính |
| `hotel_details.star_rating` | null (không hiển thị) | **5** | `https://www.novotelphuquoc.com/` (☆☆☆☆☆, đọc trực tiếp) và `https://all.accor.com/hotel/9770/index.en.shtml` ("5 stars") | Tự công bố của chuỗi. **Chờ owner** |
| `hotel_details.star_rating_source` | null | `{title: "Trang chính thức của Novotel Phú Quốc Resort (novotelphuquoc.com)", url: "https://www.novotelphuquoc.com/", verified_at: null}`; khi ghi thật, `sources.type` nên là `official_website` | như trên | Tiêu đề trung tính (đã sửa) |
| `hotel_details.check_in` / `check_out` | null (không hiển thị) | `15:00` / `12:00` | **`https://all.accor.com/hotel/9770/index.en.shtml`** (đọc trực tiếp). Đối chiếu identity: mã 9770, email `H9770@accor.com` và số điện thoại `+84 297 6260 999` khớp với trang của khách sạn. Trang khách sạn **không** nêu giờ | Chưa ghi. **Chờ owner.** Xem khoảng trống §6.3 |
| `amenities` (`/hotels/{id}/amenities`) | 4: Hồ bơi · Nhà hàng · Lối ra biển · Spa (hiển thị) | giữ nguyên | DB | Đã hiển thị đúng trên route khách sạn |
| `contacts` | HOTLINE `+842976260999`; EMAIL `H9770@accor.com` (hiển thị) | giữ nguyên | novotelphuquoc.com, all.accor.com | Khớp |
| `opening_hours` | null | giữ null | — | Giờ "06:30–23:00" trên trang khách sạn là giờ bữa ăn trọn gói, **không** phải giờ mở cửa |
| `rooms` | 0 | giữ 0 | — | Không tạo giá phòng |
| `location`, `description`, `media` (5 ảnh) | giữ | giữ | | Không thay metadata quyền ảnh |

**Route chung `/vi/places/novotel-phu-quoc`** (điểm vào từ `/vi/places` và trang chủ): hiển thị địa chỉ, khu vực, liên hệ, mô tả; **không** hiển thị hạng sao, check-in/out, tiện nghi. Đây là phần thiếu wiring có điều kiện (mục 2).

Ảnh chụp (tên file trong `docs/delivery/evidence/product-usefulness-2026-10-04/`):
- `01-PROPOSED-fixture-hotel-novotel-desktop.jpg` — PROPOSED, route khách sạn, desktop.
- `02-PROPOSED-fixture-hotel-novotel-mobile375.jpg` — PROPOSED, 375px. Không tràn ngang (`scrollWidth = 375`).
- `05-CURRENT-production-hotel-novotel-desktop.jpg` — CURRENT production (read-only).

### 3.2 Ra Khơi — route nhà hàng `/vi/restaurants/nha-hang-ra-khoi`

| Field | CURRENT (production) | PROPOSED | Nguồn | Trạng thái |
|---|---|---|---|---|
| `cuisines` | Hải sản ("Ẩm thực: Hải sản") | giữ | DB | Khớp |
| `address` | "Đường 30/4, Dương Đông, TP. Phú Quốc" | giữ | DB | Foody.vn ghi "131Bis Đường 30 Tháng 4" — aggregator, **không** ghi |
| `opening_hours` | không có dữ liệu | **không ghi** | Foody.vn "09:00–22:00" — aggregator, trang ghi "hơn 3 tháng chưa có tương tác mới" | Không ingest; cần cơ sở xác nhận |
| `contacts` | không có | **không ghi** | Không tìm được số trên Foody | Cần cơ sở |
| `price_range` | null | **không ghi** | Foody.vn "50.000–200.000đ" — enum `free/low/mid/high`, không lưu được khoảng số | Cần owner chọn bậc |
| menu | rỗng | **không bịa** | — | Cần cơ sở |
| `media` | 0 | — | — | Cần ảnh có quyền |

Ảnh chụp: `03-PROPOSED-fixture-restaurant-ra-khoi-mobile375.jpg` (PROPOSED = CURRENT, không đổi nội dung).

Route chung `/vi/places/nha-hang-ra-khoi` tồn tại và không hiển thị cuisine.

### 3.3 Bãi Sao — route `/vi/places/bai-sao` (duy nhất; không có `/beaches/[slug]`)

| Field | CURRENT (production) | PROPOSED | Nguồn | Trạng thái |
|---|---|---|---|---|
| `description` | "…là một trong những bãi biển đẹp nhất Phú Quốc với cát trắng mịn và nước biển trong xanh." (không có nguồn) | "Bãi Sao là một bãi biển ở Phú Quốc. Điểm trên bản đồ là điểm tham chiếu đã duyệt, không phải lối vào. Thông tin về lối tiếp cận, bãi đỗ xe, phí và dịch vụ tại bãi, và điều kiện tắm biển hiện tại chưa được xác minh. Trước khi đi, nên kiểm tra trực tiếp với đơn vị quản lý hoặc nguồn chính thức." | Các số liệu "7 km, nước nông, khuất gió" là mô tả đang có trong DB, nguồn ghi là "nguồn du lịch tỉnh" — **không đọc lại được** (xem dưới) | Chờ owner chấp nhận hoặc chờ nguồn chính thức |
| `short_description` | "…nguồn du lịch tỉnh mô tả vùng nước khá nông…" | giữ | DB | |
| `address` | null | **không ghi** | Blog: "khoảng 2 km sau cổng JW Marriott" — lead | |
| phí, bãi đỗ, dịch vụ, cứu hộ | chưa có | **không khẳng định** | Blog: không thu phí vào bãi, có phí gửi xe — không ingest | |
| `location` | 10.0572576, 104.0363948 | giữ (đã duyệt) | owner | |
| `media` | 0 | — | — | Cần ảnh |

Nguồn chính thức không đọc được: `dulich.phuquoc.gov.vn/vi/baisao` có **chứng chỉ TLS hết hạn** (không bỏ qua cảnh báo); `vietnamtourism.gov.vn/en/post/17811` không trả nội dung đọc được.

Ảnh chụp: `04-PROPOSED-fixture-place-bai-sao-mobile375.jpg`.

**Ảnh cần bổ sung theo mục đích:**
- Tổng thể: toàn cảnh bãi cát và đường bờ, ban ngày.
- Lối tiếp cận: biển chỉ đường, đoạn đường trước cổng, chỗ đỗ xe.
- Dịch vụ thực tế: bãi đỗ xe, khu nước ngọt/vệ sinh, quầy dịch vụ — chỉ chụp cái có thật.
- Mỗi ảnh cần chủ quyền hoặc giấy phép và ngày chụp.

### 3.4 Điều kiện chặn và "owner cần bổ sung"

Không chặn render toàn trang vì một trường chưa xác minh: các trang đều render với trường thiếu ở trạng thái trung thực (không có dòng giá/giờ giả).

| Thông tin | Bằng chứng dạng nào | Trường sẽ dùng | Lý do không tự xác nhận được |
|---|---|---|---|
| Giờ mở cửa Ra Khơi (hằng ngày) | Ảnh bảng giờ tại quán, hoặc xác nhận của cơ sở | `opening_hours` | Chỉ cơ sở biết; nguồn công khai hiện có là aggregator đã cũ |
| Số điện thoại/đặt bàn Ra Khơi | Xác nhận của cơ sở | `contacts` (HOTLINE) | Không có trong nguồn công khai đọc được |
| Địa chỉ Ra Khơi "131 bis" hay "Đường 30/4" | Ảnh biển hiệu hoặc cơ sở xác nhận | `address` | Hai nguồn không thống nhất; aggregator không đủ |
| Ảnh Ra Khơi (mặt tiền, không gian) có quyền | Ảnh do owner chụp hoặc giấy phép | `media` | Quyền ảnh chỉ người sở hữu xác nhận |
| Bậc giá Ra Khơi (`low/mid/high`) | Cảm nhận có căn cứ của owner | `price_range` | Enum không nhận khoảng số; owner chọn cách map |
| Phí, bãi đỗ, dịch vụ tại Bãi Sao | Xác nhận tại chỗ hoặc từ đơn vị quản lý bãi | `description` (đoạn về phí/dịch vụ) | Blog mâu thuẫn; nguồn chính thức không đọc được |
| Lối tiếp cận Bãi Sao | Ảnh/biển chỉ đường, hoặc khảo sát | `description` | Không có nguồn đọc được |
| Nguồn thay thế cho Bãi Sao | Bản đọc được của trang du lịch chính thức khi chứng chỉ được sửa | `description` | Chứng chỉ hết hạn ở nguồn hiện có |

## 4. RouteGuard: diff, kiểm thử và phạm vi chứng minh

### 4.1 Diff (tóm tắt; diff đầy đủ: `routeguard.diff.txt`)

- `apps/web/src/modules/auth/RouteGuard.tsx`: thay `encodeURIComponent(pathname)` bằng chuỗi đích đầy đủ = `pathname` + query đã chuẩn hóa qua `URLSearchParams`, encode **một lần**.
- `apps/web/src/modules/auth/RouteGuard.spec.tsx`: mock `usePathname`/`useRouter` đổi được; thêm bốn test: một test "giữ query" từ lượt 1, và ba test từ lượt 2: (1) pathname không query encode đúng một lần; (2) giá trị Unicode được bảo toàn qua một vòng decode; (3) đích luôn là đường dẫn nội bộ. Tổng spec: 6 test (2 cũ + 4 mới).
- Không đổi hook, không thêm `useSearchParams` (tránh yêu cầu Suspense ở layout dashboard), không đổi `login/page.tsx`.

### 4.2 Lỗi tìm thấy trong bản sửa lượt 1 và cách sửa

Bản lượt 1 truyền `window.location.search` (đã percent-encode) vào `encodeURIComponent` một lần nữa, sinh `%25C3%25BA`. Hậu quả: login nhận `next` chứa `Novotel%20Ph%C3%BA…` và `place_name` hiển thị chuỗi `%20` thô. Lượt 1 chỉ kiểm URL đăng nhập và không kiểm form sau đăng nhập, nên không bắt được lỗi. Bản hiện tại chuẩn hóa qua `URLSearchParams` rồi encode đúng một lần. Test Unicode mới sẽ thất bại trên bản cũ (kiểm bằng lập luận trên cách encode; **không** chạy lại trên bản cũ).

### 4.3 Kiểm thử đã chạy

| Hạng mục | Kết quả |
|---|---|
| `jest` RouteGuard + auth + place-edit-proposals + layout (`jest-routeguard-and-related.txt`) | **PASS: 11 suite, 85 test** |
| `RouteGuard.spec.tsx` riêng | PASS 6/6 (gồm 4 test mới) — *thuộc tổng 11 suite ở trên* |
| ESLint `RouteGuard.tsx`, `RouteGuard.spec.tsx` (`eslint-routeguard.txt`) | **PASS, exit 0** |
| Typecheck web `tsc --noEmit -p apps/web/tsconfig.json` (`tsc-web-final.txt`) | **PASS, exit 0** (chạy sau mọi chỉnh sửa) |
| Trình duyệt: CTA ẩn danh → login | PASS: `next` decode một lần ra `/dashboard/places/edit-proposals?place_id=…&place_name=Novotel+Ph%C3%BA+Qu%E1%BB%91c+Resort&place_slug=novotel-phu-quoc`; parse lại được `Novotel Phú Quốc Resort` |
| Trình duyệt: phiên **synthetic** cục bộ đặt trên trang login → redirect `next` | PASS: đến `/dashboard/places/edit-proposals?…`; form hiển thị "ĐỊA ĐIỂM: Novotel Phú Quốc Resort" |
| Trình duyệt: nhập synthetic + "Gửi đề xuất" tới **stub local** | PASS: "Đề xuất đã được gửi và đang chờ xem xét — Cảm ơn bạn đã đóng góp cho Novotel Phú Quốc Resort" |

### 4.4 Đã chứng minh và chưa chứng minh (tách bạch)

- **URL đăng nhập giữ đúng `next`:** đã chứng minh (trình duyệt + spec).
- **Form mở lại đúng địa điểm:** đã chứng minh, với phiên synthetic đặt cục bộ trên trang login (không phải đăng nhập bằng tài khoản thật; không có credential).
- **Người dùng nhập và gửi thành công:** **chỉ chứng minh luồng UI tới stub local** (`POST /api/places/{id}/edit-proposals` trả 201 synthetic, không lưu gì, log chỉ ghi tên trường). **Chưa chứng minh** ghi vào DB thật, quyền `PlaceEditProposal.Create`, CAS, hay hàng chờ dashboard của kiểm duyệt viên.
- **Pathname không query:** đã chứng minh (spec).
- **Giá trị Unicode, không encode/decode hai lần:** đã chứng minh (spec và trình duyệt).
- **Redirect chỉ nội bộ:** `next` luôn bắt đầu bằng pathname (`usePathname`), không thể đổi origin; `login/page.tsx` giữ `safeNext` (chỉ chấp nhận `/` và không `//`). Đã chứng minh bằng spec và đọc code; **login page không có spec riêng**.
- **useEffect/dependencies:** effect đọc `window.location.search` bên trong và giữ dependency `pathname`. Khi chưa đăng nhập, guard chuyển hướng ngay ở lần chạy đầu, nên thay đổi query khi cùng pathname không thể làm `next` cũ còn hiệu lực. Chưa có test cho trường hợp này; trường hợp không xảy ra trong luồng hiện tại.
- **Chưa chứng minh:** đăng nhập bằng tài khoản thật; ghi đề xuất vào API thật; hành vi trên production; trình duyệt khác ngoài Browser pane.

### 4.5 Trạng thái

Thay đổi RouteGuard (04/10) **chưa commit** và **không nằm trong image `82fb23c`**. Hiện đã nằm trong commit `b91e92c` và image `phuquochub-web:b91e92c…` (05/10).

## 5. Chẩn đoán ô ảnh placeholder

### 5.1 Quan sát

- Trang Novotel (`/vi/places/novotel-phu-quoc`): 5 `<img loading="lazy">`. Sau khi cuộn và chờ 4 giây: `complete = false`, `naturalWidth = 0`. Không có request media nào trong Resource Timing.
- Mã nguồn: `apps/web/src/modules/places/PlaceGallery.tsx` dùng thẻ `<img>` thường (`src = thumbnail_url ?? url`, có chú thích `eslint-disable … no-img-element`). `next.config.mjs` không có cấu hình `images`. Không có lỗi cấu hình Next Image.

### 5.2 Phép thử trong Browser pane

| Phép thử | Kết quả |
|---|---|
| `<img>` cùng origin (`/favicon.ico`) | load, 17 ms |
| `<img>` tới `https://phuquochub.com/api/media/{id}/file` | **error**, ~100 ms |
| `<img>` tới `https://media.phuquochub.com/...jpg` (URL S3 đã ký) | **error**, ~94 ms |
| Điều hướng cấp cao tới cùng URL S3 | **thành công**: `aff44868-…jpg (2048×1151)` |
| `fetch` mode CORS tới `phuquochub.com` | `Failed to fetch` |
| `fetch` mode `no-cors` | `opaque status=0` (có kết nối) |

### 5.3 Phép thử từ máy chủ (curl, chỉ đọc)

- `GET https://phuquochub.com/api/media/9c800b07-…/file` → **302** → `Location: https://media.phuquochub.com/phuquochub-prod/media/aff44868-….jpg?X-Amz-…&X-Amz-Expires=300…`
- Thực thi URL đã ký → **200**, `image/jpeg`, 422 035 byte.

### 5.4 Kết luận

- Nguồn ảnh **tồn tại và phục vụ đúng** (302 → 200).
- Mã ứng dụng **đúng**: `<img>` thường, không cấu hình Next Image gây lỗi.
- Trong Browser pane, **tài nguyên ảnh khác origin bị chặn** (lỗi nhanh ~100 ms, điều hướng cấp cao vẫn tải được). Đây là giới hạn của môi trường kiểm thử, không phải fixture, không phải thiếu endpoint, không phải quyền ảnh.
- **Chưa chứng minh** trên trình duyệt người dùng thật. Cần một lần kiểm tra trên Chrome thường trước khi kết luận dứt khoát.
- Ảnh có `license_type = null`: ghi "hồ sơ quyền chưa xác nhận". **Không đề nghị ẩn 13 ảnh** chỉ vì trường null. Trang công khai không hiển thị thông tin bản quyền, nên ảnh chưa rõ quyền hiện hiển thị bình thường — đây là quyết định chính sách (mục 9).

## 6. Semantics `star_rating_source_id`, `verified_at` và nhãn public

### 6.1 Code (đọc 04/10 tại HEAD `82fb23c`; `apps/api` không đổi đến `b91e92c`)

- `apps/api/src/modules/hotels/repositories/hotels.repository.ts` (`upsertDetails`): khi `star_rating` đổi và request có `star_rating_source_id` ≠ null → ghi `star_rating_verified_at = now()`; khi đổi mà không có nguồn → xóa cả nguồn lẫn `verified_at`.
- Bảng `sources` có `type` enum: `official_website`, `business_owner`, `government`, `press`, `field_survey`, `community`, `facebook`, `ai`, `other`… **Service không đọc `type`** để quyết định `verified_at`.
- Trang công khai `hotels/[slug]/page.tsx` hiển thị: `★…★ — Nguồn: <title>` (link nếu có url). **Không có** chữ "đã xác minh" hay "tự công bố" trên trang.

### 6.2 Phân biệt ba khái niệm

- **Cơ sở tự công bố:** `sources.type` = `official_website` hoặc `business_owner`. Novotel thuộc loại này.
- **Có nguồn:** tồn tại `star_rating_source_id`. Đây là điều kiện để service đặt `verified_at`.
- **Xác minh độc lập:** nguồn không do cơ sở công bố (ví dụ `government`, `press`, `field_survey`). **Chưa có** trường hay nhãn nào trong hệ thống phân biệt điều này; `verified_at` không đủ để chứng minh.

### 6.3 Nhãn có gây hiểu nhầm không?

- Trang hiển thị "Nguồn: <title>", không khẳng định "xác minh". Với tiêu đề trung tính, nhãn hiện tại **không** gây hiểu nhầm trực tiếp.
- **Khoảng trống thực sự:** giờ nhận/trả (`check_in`, `check_out`) hiển thị **không có nguồn** — schema không có `check_in_source`. Nếu ghi `15:00 / 12:00` từ Accor, trang sẽ hiện giờ đó mà không có bất kỳ nguồn nào. Đây là điểm cần owner quyết định trước khi ghi.
- **Đề xuất (chưa làm):** không mở rộng schema trong đợt này. Nếu owner muốn nhãn "tự công bố", thay đổi nhỏ là thêm hậu tố dựa trên `sources.type` ở tầng hiển thị; cần duyệt riêng.

## 7. Hành trình đóng góp: tóm tắt cập nhật

| Bước | Trạng thái | Bằng chứng |
|---|---|---|
| CTA "Đề xuất chỉnh sửa" trên `/vi/places/{slug}` | Có | trình duyệt ẩn danh |
| Chưa đăng nhập → login giữ `next` đầy đủ | **Đã sửa** (trước: mất `place_id`) | mục 4.3 |
| Sau đăng nhập → form đúng địa điểm | Đã chứng minh với phiên synthetic | mục 4.3 |
| Giữ nội dung đã nhập qua đăng nhập | Không có lưu nháp. **Không thêm** (không có lỗi cụ thể trong phạm vi) | code `ProposeEditView.tsx` |
| Xác nhận sau gửi | Có: "đã được gửi và đang chờ xem xét" | trình duyệt tới stub |
| Nơi người gửi xem trạng thái | **Không có.** `GET place-edit-proposals` và `/:id` yêu cầu `PlaceEditProposal.Moderate` | `place-edit-proposals.controller.ts` |
| Thông báo sau quyết định | Không có trong service đề xuất | `place-edit-proposals.service.ts` |
| Email | Không có trong module đề xuất (chưa rà toàn repo) | |

**Phần thiếu nhỏ nhất để người gửi biết kết quả:** một danh sách chỉ đọc "đề xuất của tôi" (endpoint GET lọc theo `proposer = user.sub`, cùng quyền `PlaceEditProposal.Create`, và một mục trong dashboard). Không cần email. Chưa triển khai (ngoài phạm vi lượt này).

**Đề xuất vị trí:** không thể đề xuất tọa độ qua luồng này (enum chỉ có `opening_hours`, `address`, `short_description`). Thêm cần migration — **chưa làm**, cần owner duyệt.

## 8. MVP cư dân

Chỉ là thiết kế, chưa mở rộng. Các mục 8.1–8.3 của lượt trước vẫn đúng, với hai điều chỉnh:
- **Danh bạ** dùng `places` + `contacts` + `categories`; không tạo bảng mới nếu đơn vị dịch vụ là một place.
- **Thông báo có hiệu lực** không dùng `events`. Cần bảng `notices` riêng — **không làm trong lượt này** theo phạm vi.
- **Đi lại:** `transport_routes` có sẵn nhưng 0 dòng public; chỉ hiển thị liên kết nguồn và thời điểm kiểm tra, không tạo lịch.

## 9. Quyết định owner (chỉ dữ liệu, quyền ảnh, hành động production)

| # | Quyết định | Loại | Ảnh hưởng nếu đồng ý |
|---|---|---|---|
| 1 | Ghi địa chỉ Novotel **nguyên văn** nguồn chính thức? | Dữ liệu (ghi production khi duyệt) | Trang hiển thị tiếng Anh; không có cấp hành chính được suy ra |
| 2 | Ghi hạng sao 5 (`sources.type = official_website`, tự công bố) lên production? | Dữ liệu + production | Route khách sạn hiện ★★★★★ kèm nguồn |
| 3 | Ghi giờ nhận/trả 15:00/12:00 (nguồn Accor, không có trường nguồn) lên production? | Dữ liệu + production | Giờ hiển thị không kèm nguồn; cần chấp nhận hoặc chờ thay đổi schema |
| 4 | Ảnh chưa rõ quyền (13 ảnh): tiếp tục hiển thị, hay ẩn cho đến khi xác nhận? | Quyền ảnh (chính sách) | Ẩn sẽ bỏ ảnh đang hiển thị; cần quyết định trước khi làm |
| 5 | Chấp nhận mô tả Bãi Sao dựa trên mô tả DB chưa đọc lại được nguồn, hay chờ nguồn chính thức? | Dữ liệu + production | Mô tả trung tính hiện tại có câu "cần đối chiếu" trong nguồn, không trong nội dung |
| 6 | Ra Khơi: owner xác nhận giờ, số điện thoại, địa chỉ, ảnh có quyền, bậc giá từ cơ sở (mục 3.4) | Dữ liệu | Không đủ thì Ra Khơi giữ trạng thái thiếu |
| 7 | Điểm vào khách sạn/nhà hàng từ `/vi/places`: chuyển hướng `/places/{slug}` sang route chuyên biệt (HTTP 308)? | **Production (đổi URL công khai, SEO)** | Khách vào từ danh sách chung sẽ đến trang chuyên biệt; canonical cần xem lại |
| 8 | Đưa thay đổi RouteGuard vào candidate sau này? | **Production khi phát hành** | Lỗi mất `place_id` khi đăng nhập được sửa; chưa có trên production |

Các hành động **không** cần duyệt từng bước kỹ thuật local (đã làm theo phạm vi): đọc source, đọc public API, render, sửa và kiểm thử local.

## 9A. Lượt 3: sửa đường dẫn tới trang chi tiết đúng (đã commit `b91e92c`, đã kiểm trên image synthetic 05/10; CHƯA DEPLOY)

**Vấn đề đã xác nhận:** `/vi/places` (50 mục) và trang chủ `DiscoverPlaces` link mọi địa điểm tới `/places/{slug}`. Dữ liệu public cho thấy 11 khách sạn, 7 nhà hàng và 3 tour nằm trong số này; trang chung không hiển thị hạng sao, giờ nhận phòng, tiện nghi, món ăn.

**Lựa chọn URL và lý do (dựa trên source và SEO hiện có):**
- `places.category_id` là NOT NULL và chỉ có một giá trị: không có trường hợp "nhiều category" cần ưu tiên.
- Trang chuyên biệt đã khai báo canonical riêng (`hotels/[slug]`, `restaurants/[slug]`); trang chung khai báo canonical `/places/{slug}`: hai tín hiệu canonical cho cùng nội dung.
- `sitemap.ts` liệt kê `/places/{slug}` cho TẤT CẢ địa điểm **và** `/hotels`, `/restaurants`, `/tours` cho cùng bản ghi: URL trùng.
- Vì vậy chọn: **308 cho đúng các category có trang chuyên biệt** (hotel, resort → hotels; restaurant → restaurants; tour → tours) và giữ route chung cho beach, attraction, market, cafe.
- Redirect nằm SAU khi `getPlace` trả về dữ liệu công khai, nên địa điểm chưa published vẫn 404, không bị lộ. Trang đích không redirect lại: không có vòng lặp.

**Thay đổi code (web, local):**
- `apps/web/src/modules/places/placeRoutes.ts` (mới): một nguồn duy nhất cho bảng category → route và cho `placeDetailPath`/`placeDetailHref`/`categorySlugOfPlace`.
- `apps/web/src/modules/categories/categoryName.ts`: thêm `categorySlugLookup` (cùng khuôn `categoryNameLookup`).
- `apps/web/src/modules/places/PlaceCard.tsx`: prop `categorySlug`; link qua `placeDetailHref`.
- `apps/web/src/app/[locale]/(public)/places/page.tsx` và `apps/web/src/modules/home/DiscoverPlaces.tsx`: truyền `categorySlug`.
- `apps/web/src/app/[locale]/(public)/places/[slug]/page.tsx`: `permanentRedirect` sau `getPlace`, ngoài try/catch.
- `apps/web/src/app/sitemap.ts`: bỏ entry `/places/{slug}` của đúng các địa điểm thuộc loại có route chuyên biệt; giữ entry chuyên biệt.

**Kiểm chứng thật (local, dev server + stub v2 synthetic/snapshot):**
- HTTP: `/vi/places/novotel-phu-quoc` → **308**, `location: /vi/hotels/novotel-phu-quoc`; `/en/places/nha-hang-ra-khoi` → **308**, `location: /en/restaurants/nha-hang-ra-khoi`; `/vi/places/bai-sao` → **200**; slug không tồn tại → **404**. Đích `/vi/hotels/…`, `/en/restaurants/…`, `/vi/restaurants/…` → 200, 0 hop.
- Trình duyệt: `/vi/places` có 50 link: 11 `/vi/hotels/`, 7 `/vi/restaurants/`, 3 `/vi/tours/`, 29 `/vi/places/` (= 10 bãi + 12 điểm tham quan + 4 chợ + 3 cafe). `/en/places`: 50 link, 0 link không có `/en/`. Bấm thẻ Novotel → `/vi/hotels/novotel-phu-quoc`, trang có ★ và "Nhận: 15:00". Trang chủ: link khách sạn/nhà hàng/tour đều chuyên biệt; `/places/` chỉ còn cho địa điểm không có trang chuyên biệt.
- Jest: `placeRoutes.spec.ts` (mới), `categoryName.spec.ts`, `PlaceCard.spec.tsx`, `sitemap.spec.ts`, `[slug]/page.spec.tsx` (44/44), `places/page.spec.tsx`, `DiscoverPlaces.spec.tsx`, và các spec home liên quan: PASS.
- Sửa test cũ: 4 test gate giá trên trang chung trước đây dùng category hotel/restaurant/tour; đã đổi sang category không có route chuyên biệt (attraction/market/cafe) để giữ đúng mục tiêu test. Ghi nhận đây là thay đổi test, không phải nới lỏng gate.
- ESLint: các file đã đổi, exit 0. Typecheck web (`tsc --noEmit`, sau mọi sửa runtime): exit 0.

**Chưa chứng minh:** deploy/production; sitemap thật (stub chỉ có một phần endpoint, nên sitemap được kiểm qua jest, không qua HTTP); redirect trên production (chưa có CDN/proxy kiểm tra); trang EN của khách sạn/nhà hàng vẫn nhận nội dung tiếng Việt từ stub (giới hạn stub, không phải lỗi route).

## 9B. Gói diff dữ liệu (CHƯA ÁP DỤNG, không ghi production)

Thời điểm đọc nguồn thật: **2026-10-04 14:50:09 UTC** (đọc lại trong lượt này, không dùng ngày đọc cũ).

| Record ID | Field | Hiện tại (public) | Đề xuất (chính xác) | URL nguồn | Thời điểm đọc | Mức xác nhận | Cách ghi qua contract |
|---|---|---|---|---|---|---|---|
| 205d6950-ffb4-42cb-98ca-c8d155ad72af (Novotel) | `address` | "Bãi Trường, Dương Tơ, TP. Phú Quốc" | "Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special Zone, 922273 An Giang Province, Vietnam" (nguyên văn) | https://www.novotelphuquoc.com/ | 14:50Z | Nguồn chính thức của cơ sở (self-declared); không suy cấp hành chính; `ward` giữ "Dương Tơ" | Cập nhật place qua API edit hiện có có `content_version` (CAS); cần duyệt |
| 205d6950 (Novotel) | `hotel_details.star_rating` | null | 5 | https://www.novotelphuquoc.com/ (☆☆☆☆☆); https://all.accor.com/hotel/9770/index.en.shtml ("5 stars") | 14:50Z | **Tự công bố** (operator/chuỗi). KHÔNG phải xác minh độc lập | `PATCH /hotels/:id/details` với `star_rating` + `star_rating_source_id` trỏ tới một dòng `sources` (type `official_website`, url novotelphuquoc.com). Service sẽ đặt `star_rating_verified_at = now()`: vì vậy trước khi ghi cần owner chấp nhận nghĩa "có nguồn" của trường đó |
| 205d6950 (Novotel) | `hotel_details.check_in` | null | 15:00 | https://all.accor.com/hotel/9770/index.en.shtml ("Check-in: 3:00 PM"). novotelphuquoc.com (trang của khách sạn): không nêu giờ nhận phòng | 14:50Z | Chỉ có trên danh bạ chuỗi, cùng identity (mã 9770, email H9770@accor.com, điện thoại +84 297 6260 999 khớp). **Không có field nguồn** cho giờ | `PATCH /hotels/:id/details` `check_in: "15:00"` (HH:MM). Nguồn chỉ ghi trong hồ sơ này; không tự tuyên bố đã xác minh |
| 205d6950 (Novotel) | `hotel_details.check_out` | null | 12:00 | như trên ("Check-out: 12:00 PM") | 14:50Z | như trên | `PATCH … check_out: "12:00"` |
| 205d6950 (Novotel) | `contacts` | HOTLINE +842976260999; EMAIL H9770@accor.com | GIỮ (không đổi) | — | 14:50Z (khớp) | Khớp hai nguồn; fax +84 297 6260 888 KHÔNG thêm (không có loại FAX) | — |
| 5632e5b1-cc0a-49a4-a079-65b1d8fd1b85 (Bãi Sao) | `description` | câu quảng cáo không nguồn | "Bãi Sao là một bãi biển ở Phú Quốc. Điểm trên bản đồ là điểm tham chiếu đã duyệt, không phải lối vào. Thông tin về lối tiếp cận, bãi đỗ xe, phí và dịch vụ tại bãi, và điều kiện tắm biển hiện tại chưa được xác minh. Trước khi đi, nên kiểm tra trực tiếp với đơn vị quản lý hoặc nguồn chính thức." | — (không cần nguồn cho câu trung tính; không có dữ kiện định lượng) | — | Trung tính | `PATCH` place description qua API edit hiện có (CAS); cần duyệt |
| 5632e5b1 (Bãi Sao) | `location` | 10.0572576, 104.0363948 | GIỮ (đã duyệt) | — | — | Owner | — |
| 78bf8730-6ba4-4aa0-b0d2-da991c71bdb9 (Ra Khơi) | — | — | KHÔNG CÓ diff. Giữ cuisine `seafood`. Không thêm giờ/giá/SĐT/địa chỉ từ aggregator | — | — | — | Xem danh sách owner ở mục 3.4 |

**Lưu ý trung thực:** dòng `check_in`/`check_out` là đề xuất có nguồn nhưng nguồn không được lưu cùng field; nếu ghi, trang khách sạn sẽ hiện "Nhận: 15:00 · Trả: 12:00" không kèm nguồn. Đây là quyết định owner (mục 9, quyết định 3).

## 9C. Candidate và WIP (tách rõ)

- **Candidate Web hiện tại:** `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848` (commit `b91e92c`, index digest `sha256:f264dde6…21db79`). Chứa RouteGuard, routing chuyên biệt, sitemap và preview fix. Chi tiết: [release-web-candidate-2026-10-04.md](release-web-candidate-2026-10-04.md).
- **Candidate `82fb23c` (04/10):** chỉ còn là lịch sử; không dùng cho cutover.
- **Không còn WIP cho gói release.** Các file không thuộc gói (`apps/web/next-env.d.ts`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills/*`, `owner-captures/`, các file untracked khác) vẫn không commit và không được đưa vào patch.

## 10. Bằng chứng, cách chạy lại

### 10.1 Bằng chứng trong repo

Thư mục `docs/delivery/evidence/product-usefulness-2026-10-04/`:
- `01-PROPOSED-fixture-hotel-novotel-desktop.jpg`
- `02-PROPOSED-fixture-hotel-novotel-mobile375.jpg`
- `03-PROPOSED-fixture-restaurant-ra-khoi-mobile375.jpg`
- `04-PROPOSED-fixture-place-bai-sao-mobile375.jpg`
- `05-CURRENT-production-hotel-novotel-desktop.jpg`
- `jest-routeguard-and-related.txt`, `eslint-routeguard.txt`, `tsc-web-final.txt`
- `routeguard.diff.txt`
- `render-local/`: `render-stub.mjs`, `snapshot/` (bản sao JSON public đọc từ production ngày 04/10/2026, đã kiểm tra là envelope `success:true`), `proposed-v2/` (fixture đề xuất có nhãn)

Chỉ chứa dữ liệu public hoặc synthetic. Không có token, không có credential.

### 10.2 Chạy lại bản xem local

Chạy từ thư mục gốc repo, mỗi lệnh một terminal:

```bash
STUB_MODE=proposed node "D:/Projects/PhuQuocHub/docs/delivery/evidence/product-usefulness-2026-10-04/render-local/render-stub.mjs"
```

```bash
STUB_MODE=current node "D:/Projects/PhuQuocHub/docs/delivery/evidence/product-usefulness-2026-10-04/render-local/render-stub.mjs"
```

```bash
npm run dev --workspace=apps/web
```

Mở: `http://localhost:3000/vi/hotels/novotel-phu-quoc`, `http://localhost:3000/vi/restaurants/nha-hang-ra-khoi`, `http://localhost:3000/vi/places/bai-sao`, `http://localhost:3000/vi/places/novotel-phu-quoc`.

Lưu ý:
- Bộ render chỉ có ba place mẫu và hai trang chuyên biệt. Các place khác trả 404 từ stub.
- Chạy lại `current` và `proposed` cần khởi động lại stub. Nếu trang còn hiển thị dữ liệu cũ, mở URL với tham số `?r=…` để bỏ cache trình duyệt; nếu vẫn cũ, khởi động lại web dev server (cache fetch trong bộ nhớ).
- Dừng bằng Ctrl+C ở từng terminal.

## 11. Bảng test tổng hợp

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Public API và HTML production (chỉ đọc) | PASS | |
| Restaurant details (cần đăng nhập) | BLOCKED: 401 | Không có credential |
| Nguồn Novotel (novotelphuquoc.com, all.accor.com) | PASS | Đọc trực tiếp |
| Nguồn Bãi Sao chính thức | BLOCKED: chứng chỉ TLS hết hạn | Không bỏ qua |
| Render route khách sạn Novotel (desktop + 375px) | PASS | PROPOSED; CURRENT chụp trên production |
| Render route nhà hàng Ra Khơi (375px) | PASS | PROPOSED = CURRENT |
| Render route Bãi Sao (375px) | PASS | PROPOSED |
| Không tràn ngang 375px | PASS | `scrollWidth = 375` (khách sạn) |
| Ảnh placeholder | Không tái hiện trên trình duyệt người dùng; giới hạn Browser pane | Mục 5 |
| RouteGuard: jest 11 suite / 85 test | PASS | |
| RouteGuard: ESLint | PASS | exit 0 |
| Typecheck web | PASS | exit 0 |
| Trình duyệt: login `next` + form + gửi tới stub | PASS | Synthetic, không đăng nhập thật |
| Ghi đề xuất vào API/DB thật | NOT RUN | Không được phép ghi |
| HTTP trên image `b91e92c` (mạng `--internal`, 05/10) | 13/13 PASS | Stub synthetic; xem release mục 4.1 |
| Browser trên image `b91e92c` (mạng `--internal`, 05/10) | 11/11 PASS | Synthetic. Public: C1, C2, T1, E1, E2. Editor preview: P1–P6 (A, B, D) đạt. Chi tiết release mục 4.2 và 4.4 |
| Docker build `b91e92c` (04/10) | exit 0 | Không rebuild 05/10; xem `build-cmd.sh` và `build.log` trên VPS |

Không ghi "production đạt" từ bất kỳ kết quả nào.

## 12. Trạng thái repo (cuối lượt)

Xem kết quả `git status` ở phần trả lời cuối. Tóm tắt:
- Lượt 04/10 (lịch sử): `apps/web/src/modules/auth/RouteGuard.tsx`, `RouteGuard.spec.tsx`, tài liệu này, thư mục evidence. Các thay đổi này đã nằm trong commit `b91e92c` (05/10).
- `apps/web/next-env.d.ts`: vẫn bị dev server ghi lại từ lượt trước; chưa khôi phục vì là thay đổi chưa commit của owner.
- `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, các file untracked khác: không chạm.
- Không commit, push, stage, reset, stash, xóa.


---
---

## 13. Trạng thái kế hoạch sản phẩm (hiện hành, 05/10/2026)

**Không ghi release routing là hoàn thành toàn bộ kế hoạch.** Routing (mục 1, 5, 7) đã kiểm trên image candidate `b91e92c` bằng stub synthetic, nhưng **chưa deploy** và **chưa được owner nghiệm thu**.

**Cập nhật (05/10/2026):** owner đã xác nhận "Xem trước" hoạt động (phạm vi preview). Gói dữ liệu ba đề xuất A, B, C (địa chỉ Novotel, giờ nhận/trả Novotel, mô tả trung tính Bãi Sao) và checklist thu thập nằm trong `sample-pages-data-2026-10-05.md`; audit không lặp lại số liệu đó.

**Cập nhật cutover (05/10/2026 09:49Z):** Web `b91e92c…` đã lên production (pin `WEB_IMAGE_TAG`). API vẫn `f0c65b7…`. Các cột "Deploy" dưới đây phản ánh điều này; chi tiết ở release mục 11.

**Quy ước:** "Code/test" là bằng chứng trong repo hoặc trên image synthetic. "Deploy" là trên production. "Dữ liệu thật" là dữ liệu production đã đủ để trình owner. Số liệu production đọc 05/10 chỉ có ở mục 1; các mục khác dùng số liệu cũ, ghi rõ ngày.

| # | Mục | Code/test | Deploy | Dữ liệu thật đủ | Owner nghiệm thu | Còn thiếu và tiêu chí |
|---|---|---|---|---|---|---|
| 1 | Ba trang mẫu Novotel / Ra Khơi / Bãi Sao | Route và redirect kiểm trên image (HTTP E1–E4, D1–D2; browser C1–C2) với stub synthetic. Văn bản v3 có trong `content-pilot-3-pages-2026-10-03-v3.md` (mục A, B, C) | **Web đã lên prod 05/10**: redirect 308 Novotel/Ra Khơi và trang đích 200 qua domain công khai. Nội dung trang vẫn theo dữ liệu hiện có (chưa ghi dữ liệu mới) | Chưa. Novotel: nhiều trường chờ owner (địa chỉ, sao, check-in/out). Ra Khơi: thiếu giờ, liên hệ, địa chỉ chốt, bậc giá. Bãi Sao: nguồn chính thức không đọc được (TLS hết hạn) | Chưa | Owner duyệt văn bản v3 (A, B, C) và quyết định §9 (1–6). Ghi dữ liệu qua API có CAS và có nguồn (hiện **chưa ghi**). Hậu kiểm domain theo release mục 6 |
| 2 | Bản đồ và điểm tiếp cận cho cohort 15–20 địa điểm | **Không có trong repo.** `research-round-2-21-places.md` dừng ở danh sách 21 địa điểm, trạng thái NEEDS_REVIEW. Phase 2 mới làm batch 1 (5 địa điểm) | Không | Không. Chưa có điểm tiếp cận đã xác minh cho địa điểm nào trong cohort | Chưa | Owner duyệt cohort (2 địa điểm `cho-dem-phu-quoc`, `tour-3-dao-an-thoi` có câu hỏi cấu trúc). Hoàn thành evidence cho 15–20 địa điểm; mỗi địa điểm có tọa độ đã duyệt và điểm tiếp cận có nguồn, hoặc ghi rõ là chưa xác minh |
| 3 | Ảnh hữu ích và hồ sơ quyền | Ảnh hiển thị trên trang (Novotel 5 ảnh). Hồ sơ quyền ảnh nằm trong admin; **chưa đọc được trạng thái hồ sơ Novotel** | Không đổi ảnh | Không. 13 ảnh Novotel chưa rõ quyền; Bãi Sao và Ra Khơi chưa có ảnh có quyền | Chưa | Giữ nguyên ảnh hiện có; hồ sơ quyền được theo dõi riêng (quyết định owner). Ảnh mới cho Bãi Sao và Ra Khơi, mỗi ảnh có chủ quyền/giấy phép, ngày chụp và nguồn |
| 4 | Cẩm nang Bãi Trường / Bãi Sao | Bãi Trường: văn bản nháp (v3 mục E). Bãi Sao: **chưa hoàn thành** (v3 mục D). Cơ chế cẩm nang đã có; preview place_collection có fix trong `82fb23c` | Không. Không xuất bản | Không. Bãi Sao thiếu chỉ dẫn đường đi đối chiếu bản đồ, thông tin vé và gửi xe từ nguồn chính thức | Chưa | Owner duyệt v3 mục E. Bãi Sao: bổ sung nguồn cho đường đi, vé, gửi xe, điều kiện biển rồi mới đề nghị duyệt |
| 5 | Luồng góp ý và xem kết quả | Gửi đề xuất và login giữ `place_id`: có trong `b91e92c`; browser E1–E2 PASS trên image (synthetic, **không submit**). **Người gửi xem kết quả: chưa có** (GET hiện yêu cầu `PlaceEditProposal.Moderate`) | Không. `b91e92c` chưa lên prod | Không ghi thật | Chưa | Thiết kế và build "Góp ý của tôi" (mục 14). Release riêng vì cần API mới |
| 6 | MVP cư dân ba nhóm | **Chỉ là thiết kế** (§8). Chưa code | Không | Không. `transport_routes` có sẵn nhưng 0 dòng public. Thông báo có hiệu lực cần bảng `notices` mới | Chưa | Owner chọn ba nhóm và nguồn dữ liệu cho từng nhóm. Thiết kế được duyệt trước khi tạo bảng hay endpoint. **Không triển khai trong đợt này** |
| 7 | SEO và baseline đo hiệu quả | Sitemap kiểm trên image (S1 PASS: URL chuyên biệt có mặt, entry chung đã loại, XML hợp lệ). Jest sitemap có test; **chưa có assert cho tour** trong jest (đã kiểm trên HTTP) | Chưa | **Không có số liệu baseline** trong repo | Chưa | Owner cung cấp số liệu hiện tại (Search Console hoặc analytics) làm mốc. Đo lại sau 2–4 tuần từ cutover (đề xuất) |

---

## 14. "Góp ý của tôi" (thiết kế local, chưa code)

**Mục tiêu:** người gửi đề xuất chỉnh sửa đọc được trạng thái đề xuất của chính mình, và chỉ thế thôi. Không tạo moderation thứ hai.

### 14.1 Tái sử dụng (đã kiểm trong code)

- Bảng `place_edit_proposals` (`1720006700000-InitPlaceEditProposals.ts`). Enum `status`: `pending`, `approved`, `rejected`, `needs_changes`, `conflict`.
- Quyền: `PlaceEditProposal.Create` cấp cho `member` (`1720006800000-SeedPlaceEditProposalPermissions.ts`). `content_owner` có cả Create và Moderate.
- Service và repository hiện có. Thêm hai method đọc theo `proposer_id`; không thêm service mới.
- Mapper `toPlaceEditProposalView` trả `proposer_id`, `reviewer_id`, `review_note`. **Endpoint của người gửi không dùng mapper này nguyên bản** (xem 14.3).

### 14.2 Schema

- **Không cần migration cho MVP.** Mọi cột cần dùng đã có: `id`, `place_id`, `field_key`, `proposed_value`, `reason`, `status`, `created_at`, `reviewed_at`.
- Index hiện có: `(place_id)`, `(status)`, và unique partial `(place_id, field_key, proposer_id) WHERE status='pending'`. **Không có index theo `proposer_id`.** Bảng hiện nhỏ nên chưa cần. Khi cần, một migration additive: `CREATE INDEX … ON place_edit_proposals (proposer_id, created_at DESC)`. Migration này phải được duyệt riêng.
- Phản hồi công khai (`public_note`) là phần bổ sung sau, không nằm trong MVP. Chưa cần quyết định ngay.

### 14.3 Quyền đọc lịch sử theo người sở hữu

Quy tắc: người gọi chỉ đọc được dòng có `proposer_id = user.sub`. Lọc này nằm trong repository, không chỉ trong controller.

Hai phương án:

- **Phương án A (đề xuất cho MVP): đọc bằng `PlaceEditProposal.Create`.** Không migration.
  - Ai có quyền gửi mới đọc được lịch sử của mình.
  - Nếu quyền Create bị thu (ví dụ tài khoản bị gỡ quyền gửi), lịch sử cũng mất quyền đọc. Đây là hành vi chấp nhận được cho MVP nhưng phải ghi rõ cho owner.
  - `Moderate` không đổi. Không có đường đọc công khai.
  - Rủi ro chính là lọc sai `proposer_id`. Test quyền ở 14.6 là bắt buộc.
- **Phương án B: quyền riêng `PlaceEditProposal.ReadOwn`.** Cần migration seed (thêm permission, cấp cho `member` và `content_owner`).
  - Lịch sử vẫn đọc được khi quyền gửi đã bị thu.
  - Chọn B nếu owner muốn lịch sử tồn tại độc lập với quyền gửi.

### 14.4 Endpoint

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/me/place-edit-proposals?status=&limit=&cursor=` | `PlaceEditProposal.Create` (A) hoặc `ReadOwn` (B) | Lọc `proposer_id = user.sub` trong repository. `limit` mặc định 20, tối đa 50. Sắp xếp `created_at DESC, id DESC`. `cursor` là base64 của `created_at|id` |
| GET | `/me/place-edit-proposals/:id` | như trên | Không phải của mình → **404**, cùng body với id không tồn tại (không 403, không lộ sự tồn tại) |

- Không đổi `GET /place-edit-proposals` (vẫn `Moderate`). Không thêm route công khai nào.

**Dữ liệu trả về (một item):** `id`, `place` (`{ id, slug, name }`, join từ `places`, dữ liệu công khai), `field_key`, `proposed_value`, `reason`, `status`, `status_text`, `created_at`, `reviewed_at`.

- `status_text` do server sinh: `pending` → "Đang chờ xem xét"; `approved` → "Đã được chấp nhận"; `rejected` → "Chưa được chấp nhận"; `needs_changes` → "Cần chỉnh sửa và gửi lại"; `conflict` → "Dữ liệu gốc đã thay đổi, chưa áp dụng".
- **Không trả:** `proposer_id`, `reviewer_id`, `review_note`, `base_value_hash`, `locale_code`.

### 14.5 Trạng thái `needs_changes`

- Không có đường sửa trên cùng dòng. UI chỉ hướng dẫn gửi đề xuất mới. Partial unique index cho phép, vì dòng cũ không còn `pending`.
- Cần xác nhận trong service rằng không có endpoint nào cho người gửi sửa dòng đã được quyết định.

### 14.6 UI

- Route hiện có, cần phân biệt rõ:
  - `/dashboard/places/edit-proposals`: form gửi đề xuất (CTA trên trang địa điểm đích).
  - `/dashboard/edit-proposals`: hàng đợi duyệt của moderator (`PlaceEditProposalsQueueView`).
- Trang mới: `/dashboard/my-proposals`, nằm trong nhóm `(dashboard)` đã có `RouteGuard` (đăng nhập bắt buộc). Không trộn với hai trang trên.
- Mục trong `DashboardNav`, hiện khi người dùng có quyền gửi.
- Trạng thái: loading (skeleton), error (thông báo và nút thử lại), empty ("Bạn chưa gửi đề xuất nào", liên kết tới `/places`), danh sách có phân trang bằng cursor (nút "Xem thêm").
- Không hiển thị nút duyệt, `review_note`, hay tên người duyệt.

### 14.7 Test quyền sở hữu cần có

1. Không đăng nhập → 401.
2. Đăng nhập không có quyền gửi (và không có `ReadOwn` nếu chọn B) → 403.
3. Người A không thấy dòng của người B trong danh sách (fixture hai người dùng).
4. Người A `GET` id của người B → 404, cùng body với id không tồn tại.
5. Lọc `status`, `limit`, `cursor` không làm lộ dòng của người khác. Ví dụ: cursor lấy từ tài khoản A không được dùng để đọc dòng của B.
6. Response không chứa `proposer_id`, `reviewer_id`, `review_note`, `base_value_hash` (kiểm theo danh sách khóa).
7. `status` không hợp lệ → 400. `limit` > 50 → 400 hoặc giới hạn về 50 (chọn một, ghi trong spec). `cursor` không hợp lệ → 400.
8. Phân trang không trùng và không mất dòng khi nhiều dòng có cùng `created_at` (tie-breaker bằng id).
9. UI: loading, error, empty, có phân trang; không có nút duyệt.

### 14.8 Ngoài phạm vi

- Email hoặc thông báo (chưa có hệ thống email).
- Sửa đề xuất đã gửi.
- Moderation mới hoặc trang duyệt mới.
- Đọc công khai đề xuất.

### 14.9 Triển khai: không thuộc gói Web-only

- Endpoint mới nằm trong `apps/api`. Đợt này **không phải Web-only**: cần build và cutover API theo release riêng.
- Không đưa "Góp ý của tôi" vào gói cutover Web-only (release mục 6).
- Tiêu chí hoàn tất: test 14.7 pass; hai tài khoản synthetic trên local đạt đúng; owner nghiệm thu UI trên local; sau đó lập gói release API riêng.
