# Checkpoint (cập nhật tại chỗ, không nối dài)

**Baseline production (21/10/2026, SAU cutover Giai đoạn 2):** API `312425a532319c9d4f69602193ac53f5e91b83c9` (`sha256:40d83193e4...`) · Web cùng commit (`sha256:1ab98f901e...`) · DB **105 migrations** (104→105, `AddListingReportStillValidLoop`). Rollback về API/Web `adcf76a12f90ce812e048253ee62c5fa4e661eaf` (`scripts/rollback.sh adcf76a12f90ce812e048253ee62c5fa4e661eaf`) nếu cần. **Giữ nguyên schema sau rollback — không revert migration, không restore DB** (giá trị enum mới thuần cộng thêm, app cũ không biết/không đụng tới).

### Giai đoạn 3 (21/10/2026, commit local `323770a`) — Nối "đặt chỗ" vào web — ĐÃ code + test + xác nhận dev, CHƯA deploy

Theo chiến lược [strategy-data-hub-2026-10-21.md](strategy-data-hub-2026-10-21.md) §Giai đoạn 3. MVP: giữ chỗ KHÔNG thanh toán — `bookings`/`availability` đã có API đầy đủ từ trước, phần thiếu là UI web (100% greenfield, 0 nơi nào trong `apps/web` từng gọi tới) + quyền quản lý cho CHỦ CƠ SỞ ĐÃ XÁC MINH (qua `business_claims`, đã migrate từ lâu — lý do cũ "chưa có bảng ownership" trong migration gán quyền ban đầu đã lỗi thời). **Có 1 migration mới** (`1720010400000-AddBookingManagedPermissions`, additive, seed 3 permission `.Managed` mới + grant cho `business_manager`, không đụng permission/grant cũ của `moderator`).

**Thiết kế trọng tâm:** Route `confirm`/`cancel` đổi permission yêu cầu từ `Booking.Confirm`/`Booking.Cancel` (trơn) sang `.Managed` — grant unscoped cũ của moderator (rank "any") vẫn tự thoả qua `grantSatisfies` (ADR-019 D6, any ≥ managed), nên KHÔNG cần sửa gì cho moderator. `BookingAuthzResolver` phân giải booking id → place id sở hữu nó (vì `:id` trên confirm/cancel là id của booking, không phải id của place — khác các route `.Managed` khác trong repo). `GET /bookings/mine` tự suy place id từ CHÍNH grant của người gọi rồi re-confirm qua PDP thật (`authz.canWithGrants`) trước khi tin — cùng khuôn `PlacesService.listMine()`, KHÔNG nhận bất kỳ id cơ sở nào từ client.

**Form phía khách TỐI GIẢN** (owner decision, đầu Giai đoạn 3): chỉ hỏi ngày giờ + số người + ghi chú — ẩn hẳn khái niệm items/giá (API vẫn yêu cầu `items[]`, web tự dựng 1 item nội bộ `{label: 'Giữ chỗ', quantity: 1, unit_price: 0}`). `BookingButton` gắn trên cả 3 trang chi tiết công khai hiện có (hotels/restaurants/tours — ADR-002, `entity_id = place_id` cùng giá trị). `MyBookingsView` ("Đặt chỗ của cơ sở tôi") là dashboard owner/manager xác nhận hoặc huỷ yêu cầu — theo mẫu `MyPlacesView` (không phải `MyJobListingsView`, vì sở hữu ở đây là theo CƠ SỞ qua `business_claims`, không phải theo người tạo nội dung).

**Kiểm (đơn vị):** API — `bookings.service.spec.ts`/`bookings.controller.spec.ts`/`bookings.repository.spec.ts`/`booking-authz.resolver.spec.ts`/migration spec đều pass (137 test trong module bookings). Web — `BookingButton.spec.tsx` (7 test)/`MyBookingsView.spec.tsx` (9 test)/`DashboardNav.spec.tsx`/3 page spec (hotels/restaurants/tours) đều pass. `npx eslint`/`npx tsc --noEmit` sạch cả hai phía trên toàn bộ file đụng tới. Full suite sau khi thêm Giai đoạn 3: **API 273 suite/4014 test pass** (3994→4014), **Web 185 suite/1909 test pass** (1890→1909) — không regression. e2e `authz-own-scope-hardening.e2e-spec.ts` (boot app thật, chạy `AuthorizationBootstrapValidator`) pass — xác nhận `BookingAuthzResolver` đăng ký đúng qua DI, không có handler `.Managed` nào thiếu `@AuthorizationContext`.

**Rehearsal trên dev DB + trình duyệt thật (không phải production):** áp migration `1720010400000` sạch lên dev DB (106 migration). Dựng 2 user synthetic thật qua `/auth/register` (chủ cơ sở + khách) — chủ cơ sở được gán quyền quản lý MỘT nhà hàng CÓ THẬT trong dev DB (Crab House Phú Quốc) bằng INSERT trực tiếp vào `user_roles` (dev DB only, bỏ qua luồng duyệt `business_claims` đầy đủ vì không phải trọng tâm xác nhận lần này — luồng đó đã có migration/test riêng từ trước). Qua trình duyệt thật (tiêm session localStorage cho từng vai): khách mở trang nhà hàng thật → bấm "Đặt chỗ" → điền 4 người → gửi → nhận đúng mã đặt chỗ thật qua `POST /bookings` thật, trạng thái "Chờ xác nhận". Đổi sang phiên chủ cơ sở → `/dashboard/bookings` hiện đúng booking vừa tạo (4 người, đúng mã) → bấm "Xác nhận" → trạng thái đổi thành "Đã xác nhận" ngay trên UI. Hậu kiểm ranh giới quyền qua HTTP thật: tạo booking thứ hai, **khách (không phải chủ cơ sở) gọi confirm → đúng `403`**; chủ cơ sở gọi → `201` (thành công). Dữ liệu test đã dọn sạch (booking + `user_roles` grant xoá hết; 2 user synthetic không xoá được do `audit_logs` bất biến — vô hại, chỉ ở dev DB, cùng tình trạng mọi giai đoạn trước).

**Chưa build/deploy lên production** — còn thiếu bước rehearsal trên Docker image production thật (build-args thật, môi trường cô lập, như Giai đoạn 1/2 đã làm) trước khi xin duyệt deploy.

### Cutover 312425a (21/10/2026) — Giai đoạn 2: Vòng lặp "còn đúng không?" cho tin tuyển dụng — THÀNH CÔNG, không cần rollback

Backup trước deploy: `phuquochub-20261021T033450Z.sql.gz` (SHA256 `387f6603...`, validated). Dry-run trước cutover: clean no-op (mọi service `Running/Waiting/Healthy`, không `Recreate` nào). `deploy.sh 312425a... ` chạy đủ 11 bước với `SKIP_BUILD=1` + `EXPECTED_API_IMAGE_ID`/`EXPECTED_WEB_IMAGE_ID` khớp đúng 2 image đã rehearsal (`40d83193e4.../1ab98f901e...`) — Step 7 áp ĐÚNG 1 migration mới (`AddListingReportStillValidLoop1720010300000`) lên DB production thật, Step 8 smoke-test image mới pass trước khi cutover, Step 9 cutover api+web, Step 9b ghi tag vào `.env`.

**Hậu kiểm:** `verify-release-pins.sh` → "all pins consistent". DB = **105 migrations** (104→105). `smoke-test.sh` qua domain thật (`https://phuquochub.com`) pass đủ (health/root redirect/`/vi`/404). 2 route mới xác nhận tồn tại và đúng yêu cầu xác thực trên domain thật: `GET /api/listing-reports/mine` và `POST /api/listing-reports/:id/confirm-still-valid` không có token → cả hai `401` (không phải `404`, không lộ dữ liệu). `/dashboard/job-listings` tải `200` không lỗi. **Không tạo dữ liệu test/giả nào trên production** — hậu kiểm hoàn toàn không-phá-hoại, đúng quy tắc đã thống nhất. Image rollback (`adcf76a`) còn giữ trên VPS.

### Giai đoạn 2 (21/10/2026, commit local `c8afe8e`) — Vòng lặp "còn đúng không?" cho tin tuyển dụng — chuẩn bị trước khi deploy (ĐÃ deploy, xem mục cutover ở trên)

Theo chiến lược [strategy-data-hub-2026-10-21.md](strategy-data-hub-2026-10-21.md) §Giai đoạn 2, áp dụng TRƯỚC cho tin tuyển dụng (chưa nối vào real-estate/địa điểm, dù backend đã đủ tổng quát để làm vậy). **Có 1 migration mới** (`1720010300000-AddListingReportStillValidLoop`, additive, `ALTER TYPE ... ADD VALUE` cho 2 lý do báo cáo mới `not_reachable`/`no_longer_available` + 1 trạng thái mới `self_confirmed`, không ALTER/DROP dữ liệu đang có).

**Thiết kế trọng tâm:** `self_confirmed` là trạng thái MỚI, KHÔNG tái dùng `resolved` — lời tự khai một phía của chính người đăng ("vẫn đang tuyển") có trọng lượng tin cậy khác hẳn quyết định độc lập của moderator qua `resolve()`. `listMineOpen(userId, targetType)` tự suy ra id tin của người gọi qua `listMine()` hiện có ở server, KHÔNG tin id tin do client gửi lên — tránh một người dùng dò/đọc báo cáo trên tin của người khác. `confirmStillValid` chỉ đóng báo cáo, KHÔNG tự đổi trạng thái tin.

**Kiểm (đơn vị):** API — `listing-reports.service.spec.ts`/`listing-reports.controller.spec.ts` 32/32 pass. Web — `MyJobListingsView.spec.tsx`/`ListingReportsQueueView.spec.tsx` 22/22 pass. `npx eslint`/`npx tsc --noEmit` sạch trên toàn bộ file đụng tới. Full suite (toàn bộ, không chỉ phần đụng tới) sau khi thêm Giai đoạn 2: **API 271 suite/3994 test pass** (3983→3994), **Web 183 suite/1890 test pass** (1885→1890) — không regression.

**Rehearsal trên dev DB thật (không phải production):** áp migration `1720010300000` sạch lên dev DB (105 migration, additive, đối chiếu bằng `typeorm migration:show` trước/sau). Dựng 2 user synthetic thật qua `/auth/register` (chủ tin + người báo) — KHÔNG dùng SQL cho đăng ký/đăng nhập. Tạo tin qua `POST /job-listings` → `submit` → publish trực tiếp bằng SQL (dev DB only, bỏ qua bootstrap vai trò moderator vì không phải trọng tâm xác nhận lần này). Báo cáo tạo qua ĐÚNG `POST /listing-reports` thật (không SQL) với lý do mới `not_reachable` → 201. `GET /listing-reports/mine`: chủ tin thấy đúng 1 báo cáo kèm chi tiết tin; người báo (không phải chủ) gọi cùng endpoint trả mảng RỖNG — đúng ranh giới quyền đã thiết kế. Xác nhận qua trình duyệt thật (dev server, đăng nhập bằng tài khoản chủ tin synthetic): vào `/dashboard/job-listings` → khối cảnh báo hiện đúng "1 người báo: Không liên hệ được" + nút "Xác nhận vẫn đang tuyển"; bấm nút → khối cảnh báo biến mất ngay. Hậu kiểm SQL: `listing_reports.status='self_confirmed'` (không phải `resolved`), `resolver_id` = chủ tin, `job_listings.status` KHÔNG đổi (vẫn `published`) — đúng thiết kế "chỉ đóng báo cáo, không tự đổi trạng thái tin". Dữ liệu test đã dọn (báo cáo + tin xoá sạch; 2 user synthetic không xoá được do `audit_logs` bất biến — vô hại, chỉ ở dev DB, cùng tình trạng đã gặp ở Giai đoạn 1).

**Rehearsal trên VPS production, môi trường cô lập (candidate image build-args thật, KHÔNG đụng container đang sống):** commit `312425a` (105 migration) đồng bộ lên cây nguồn VPS qua `sync-release-source.sh` (checksum khớp `316b3489...`), containers đang chạy xác nhận KHÔNG đổi trước/sau (vẫn `adcf76a`, cùng uptime). Build candidate image từ ĐÚNG cây đã đồng bộ: `phuquochub-api-migrate:candidate-312425a` (stage `build`), `phuquochub-api:candidate-312425a` (`sha256:40d83193e4...`), `phuquochub-web:candidate-312425a` (`sha256:1ab98f901e...`, build-args production thật — `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SITE_URL` production, route manifest 75 route, không trùng lặp route `job-listings` nào, đúng bài học cũ về stale page.tsx).

Dựng Postgres/Redis **cô lập hoàn toàn** (network/container riêng `phase2-rehearsal-*`, không volume, không publish cổng, không chung network với production) để áp 105 migration SẠCH TỪ ĐẦU bằng candidate migrate image — xác nhận đúng 105/105 migration, migration cuối là `AddListingReportStillValidLoop1720010300000`. Chạy candidate API image (`NODE_ENV=production`, build thật, không phải dev ts-node) nối vào DB/Redis cô lập này — `/api/health` trả `200` (`database: up`, `redis: up`). Test qua HTTP thật (không SQL cho đăng ký/báo cáo/xác nhận) trên CHÍNH candidate API: đăng ký 2 user thật → tạo tin → submit → publish bằng SQL (dev/rehearsal DB only) → `POST /listing-reports` (lý do `not_reachable`) → `201`; `GET /listing-reports/mine`: chủ tin thấy 1, người báo thấy 0; **người báo gọi `confirm-still-valid` → `403`** (đúng ranh giới quyền sở hữu); chủ tin gọi → `200`, status `self_confirmed`; `GET /mine` sau đó → 0; `job_listings.status` vẫn `published` (SQL hậu kiểm). Candidate web image boot-smoke trên cổng loopback-only (`127.0.0.1:18080`, không ra ngoài) → `/vi` trả `200`, container xoá ngay sau đó.

Dọn sạch sau rehearsal: 3 container cô lập + network + file tạm trên VPS đã xoá hết (`docker rm -f`/`docker network rm`, Postgres cô lập không có volume nên dữ liệu test biến mất cùng container — không cần dọn DB). Container production xác nhận LẦN NỮA không đổi sau khi dọn (vẫn `adcf76a`, cùng uptime). Candidate image (API/migrate/web, tag `candidate-312425a...`) giữ lại trên VPS để tái dùng cho `deploy.sh` (`SKIP_BUILD=1`, `EXPECTED_API_IMAGE_ID=sha256:40d83193e4...`, `EXPECTED_WEB_IMAGE_ID=sha256:1ab98f901e...`) khi được duyệt, tránh build lại một artifact khác với cái đã rehearsal.

**Đã deploy lên production (xem mục cutover 312425a ở trên)** — chủ owner duyệt rõ ràng trước khi chạy `deploy.sh` thật. Phạm vi CHỈ tin tuyển dụng — chưa sửa UI cho real-estate/địa điểm.

### Cutover adcf76a (21/10/2026) — Giai đoạn 1: Báo sai/Lưu tin mở rộng sang địa điểm/khách sạn/nhà hàng/tour — THÀNH CÔNG, không cần rollback

Theo chiến lược [strategy-data-hub-2026-10-21.md](strategy-data-hub-2026-10-21.md) §Giai đoạn 1 — xem chi tiết kỹ thuật ở mục ngay dưới đây (phần chuẩn bị, viết trước khi deploy). **Có 1 migration mới** (`AddPlaceListableTargetType1720010200000`, additive, `ALTER TYPE ... ADD VALUE`) nên dùng đúng quy trình gate đầy đủ (như `7629b50`), không phải đường tắt web-only.

**Rehearsal trước khi deploy thật:** dựng Postgres/Redis cô lập, build migrate image từ ĐÚNG candidate, áp 104 migration sạch; chèn 1 địa điểm tổng hợp (UUID thật, không phải placeholder) → test qua HTTP có xác thực trên CHÍNH candidate API: lưu địa điểm (201) → liệt kê (đúng field `.name`) → báo cáo (201) → bỏ lưu (200) → lưu một id không tồn tại (404 đúng, không lộ gì). Phát hiện phụ: lần đầu dùng UUID placeholder tự bịa (`...-4444-...`) bị `@IsUUID()` từ chối do không đúng variant bits RFC4122 — lỗi dữ liệu test của tôi, không phải lỗi code; sửa bằng UUID thật (`crypto.randomUUID()`) thì qua hết.

**Gate + cutover:** preflight khớp baseline `7629b50`/`2c0c912`; dry-run trước/sau sync đều PASS qua `assert_scope`; backup `phuquochub-20261021T002926Z.sql.gz` hợp lệ; pending migration đối chiếu ĐÚNG 1 tên (`AddPlaceListableTargetType1720010200000`); `deploy.sh` chạy đủ 11 bước, `SKIP_BUILD=1` dùng đúng 2 image đã test.

**Hậu kiểm:** `verify-release-pins.sh` → "all pins consistent"; `smoke-test.sh` qua domain thật pass đủ; DB = 104 migration; xác nhận trực tiếp trên `https://phuquochub.com/vi/places/bai-sao` (domain thật) — cả "Lưu tin" và "Báo sai" đều xuất hiện. Image rollback (`7629b50`/`2c0c912`) còn giữ trên VPS.

### Giai đoạn 1 (21/10/2026, commit local `adcf76a`) — Báo sai/Lưu tin mở rộng sang địa điểm/khách sạn/nhà hàng/tour — chuẩn bị trước khi deploy (ĐÃ deploy, xem mục cutover ở trên)

Theo chiến lược [strategy-data-hub-2026-10-21.md](strategy-data-hub-2026-10-21.md) §Giai đoạn 1. **Không phải thuần frontend** như đánh giá ban đầu — có 1 migration mới (`1720010200000-AddPlaceListableTargetType`, `ALTER TYPE listable_target_type ADD VALUE 'place'`, additive, không ALTER/DROP dữ liệu đang có) + sửa 2 service (`listing-reports`/`saved-items`) để thêm nhánh `'place'`, đi qua ĐÚNG `PlacesService.getSlugAndStatus()` rồi `getBySlug()` — cùng một nơi quyết định "có công khai không" như route công khai thật, không tự suy luật thứ hai. Chỉ MỘT giá trị enum `'place'` phủ cả 4 loại trang (hotel/restaurant/tour là satellite table của `places`, ADR-002 — cùng id, không phải id riêng). Báo cáo loại `place` tái dùng permission `PlaceEditProposal.Moderate` (cùng người đã xử lý đề xuất chỉnh sửa địa điểm) — không permission mới. `isOwnListing()` luôn `false` cho `place` (không có khái niệm chủ tin đơn).

**Kiểm:** 271 suite/3983 test API + 183 suite/1885 test Web (toàn bộ, không chỉ phần đụng tới) đều pass, không regression nào. Test thật qua HTTP có xác thực trên dev DB (không phải SQL): đăng ký user synthetic → lưu 1 địa điểm thật (Mũi Gành Dầu) → list → báo cáo — cả ba đều 200/201 đúng. Xác nhận bằng trình duyệt thật (dev server, dữ liệu local): nút "Lưu tin"/"Báo sai / báo trùng" render đúng trên trang địa điểm VÀ khách sạn, bấm "Lưu tin" khi chưa đăng nhập hiện đúng "Đăng nhập để lưu tin này." Dữ liệu test đã dọn (trừ 1 user synthetic không xoá được do `audit_logs` bất biến — vô hại, chỉ ở dev DB).

**Chưa build/deploy** — migration mới cần qua đúng quy trình gate đã dùng cho các lần trước (backup → sync → kiểm pending migration → deploy → hậu kiểm), chờ owner duyệt.

### Cutover 2c0c912 (20/10/2026, web-only) — sửa 3 nhãn Novotel `/en` + thẻ tin tuyển dụng (avatar/tóm tắt/ngày đăng) — THÀNH CÔNG, không cần rollback

**Phạm vi xác nhận trước khi chạy (diff thật, không giả định):** `git diff 7629b50 HEAD` chỉ đổi 5 file, toàn bộ `apps/web` (3 file nguồn + 2 spec), **0 file `apps/api`, 0 migration** — nên dùng đúng cơ chế web-only cutover (`docker compose up -d --no-build web`), không chạy `deploy.sh` đầy đủ (vốn sẽ tái tạo API không cần thiết).

**Build + test:** build web image trên VPS, thư mục cô lập, build-args production thật. **Test trên dữ liệu thật** (container candidate nối vào network production thật, trỏ `API_INTERNAL_URL=http://api:4000/api` — chỉ đọc, không đổi container đang sống): `/en/hotels/novotel-phu-quoc` xác nhận cả 3 chỗ đã đúng tiếng Anh (`Check-in/Check-out`, giá trị `Hotel`, title `... Hotels ...`), `/vi/hotels/novotel-phu-quoc` xác nhận bản VI giữ nguyên; `/vi/jobs` xác nhận thẻ Sealight có avatar fallback "S", tóm tắt mô tả, "Đăng ngày: 17/10/2026 · Dương Đông".

**Gate + cutover:** dry-run trước/sau sync đều PASS qua `assert_scope` (chỉ `phuquoc-web-prod` Recreate, postgres/redis/api chỉ `Running/Waiting/Healthy`) và khớp nhau. Backup `phuquochub-20261020T234131Z.sql.gz` (gzip+checksum hợp lệ). Cutover xác nhận **API hoàn toàn không đổi** (cùng Image ID `b34f52bf...`, cùng `StartedAt=2026-10-20T14:06:00Z` trước/sau — không bị recreate).

**Hậu kiểm (chỉ đọc):** `verify-release-pins.sh` → "all pins consistent"; `smoke-test.sh` qua domain thật pass đủ; xác nhận trực tiếp trên domain thật (`curl`) cả hai chỗ sửa đều hiện đúng.

### Cutover 7629b50 (20/10/2026) — rich-text places/job/BĐS + SEO hreflang + CAS rent-listing fix — THÀNH CÔNG, không cần rollback

**Sửa cách diễn đạt (quan trọng):** bản thân QUÁ TRÌNH triển khai (`scripts/deploy.sh`, `scripts/backup.sh`, `scripts/sync-release-source.sh`) có GHI THẬT vào production (file backup mới, cây source cập nhật, 10 migration chạy, container recreate) — đây KHÔNG phải thao tác chỉ đọc. CHỈ các bước HẬU KIỂM sau khi cutover xong (`docker compose ps`, `verify-release-pins.sh`, `smoke-test.sh`, truy vấn `SELECT count(*) FROM migrations`) mới là chỉ đọc.

**Backup trước migration:** `phuquochub-20261020T140512Z.sql.gz` (156K/768451 bytes), gzip+checksum xác nhận hợp lệ ngay sau khi tạo — KHÔNG phải restore test.

**Preflight + gate (chạy thật, có dừng):** baseline/pin/Image ID khớp đúng kỳ vọng trước khi bắt đầu; dry-run trước VÀ sau sync đều CHỈ `phuquoc-api-prod`/`phuquoc-web-prod` đổi (Caddy/Postgres/Redis/Minio xác nhận `Running`/`Waiting`/`Healthy`, không có hành động thay đổi nào khác); pending migration đối chiếu ĐỦ 10 tên (không chỉ đếm số); `SKIP_BUILD=1` dùng đúng 2 image đã build+test trước đó, không build lại trên production.

**Hậu kiểm (chỉ đọc, sau cutover):** 6/6 container `healthy`; `verify-release-pins.sh` → "all pins consistent and immutable"; `smoke-test.sh` qua domain thật: health 200, `/`→307→`/vi`, `/vi` 200, route lạ 404, `/vi/places/bai-sao` 200; `SELECT count(*) FROM migrations` = 103; image rollback (`5b04cac`/`d2f5bf8`) xác nhận còn giữ trên VPS.

**Phân biệt rõ 3 trạng thái, không gộp:**
- **Đã triển khai:** đúng — cutover thành công, tất cả gate pass, không cần rollback.
- **Đã kiểm public:** CHỈ ở mức health/route/migration-count (hậu kiểm tự động) + browser read-only riêng (xem mục browser-check bên dưới nếu đã chạy) — KHÔNG phải đã xác nhận từng tính năng mới (rich-text đậm/bảng, EN overlay thật trên tin production cụ thể, v.v.) bằng mắt trên dữ liệu thật.
- **Owner đã nghiệm thu:** CHƯA — owner chưa tự thao tác/xác nhận tính năng nào trên production qua phiên của chính mình.

**Tự kiểm bằng trình duyệt, chỉ đọc trên domain thật (20/10/2026, SAU cutover 7629b50) — không dùng phiên đăng nhập nào (không có sẵn, không tự tạo tài khoản):**
- **Sealight ("Pha chế", `4dd6260d-2ff7-4e81-bf72-f46614029b05`, tin published THẬT DUY NHẤT trên production — real_estate_listings hiện có 0 dòng, job_listings chỉ có đúng 1 dòng published):** `/vi/jobs/...` 200, xuống dòng/đoạn văn giữ nguyên (`white-space: pre-wrap` xác nhận qua computed style), desktop + 375px không tràn ngang (`scrollWidth`=`innerWidth`=375). `/en/jobs/...` 200, đúng banner "chưa dịch", `robots: noindex, follow`, canonical tự trỏ `/en/...`, hreflang chỉ còn vi+x-default — khớp đúng thiết kế `2448b7f`. **Tin này CHỈ có văn bản thuần (không đậm, không bảng) — KHÔNG có dữ liệu rich-text đậm/bảng nào trên production để kiểm; không coi phần trên là bằng chứng đã kiểm đậm/bảng.**
- **Real-estate (job/BĐS VI/EN theo yêu cầu):** KHÔNG có tin BĐS nào tồn tại trên production (0 dòng mọi status) — không có trang chi tiết nào để kiểm; chỉ trang hub `/vi/real-estate` tồn tại (danh sách rỗng).
- **Bãi Sao** (`/vi/places/bai-sao`): 200, mô tả hiển thị đúng, link Google Maps còn đúng Place ID `ChIJL4toWTGRpzERqGuxiUPhdLQ` — không hồi quy.
- **Novotel** (`/en/hotels/novotel-phu-quoc`): 200, giờ nhận/trả 15:00/12:00 + địa chỉ đúng như đã xác nhận trước — không hồi quy. **Kiểm hẹp đúng 2 vị trí phát hiện tiếng Việt trên route `/en` (không mở lại audit toàn site):**
  1. `<dt>Giờ nhận/trả phòng</dt>` (dòng 179, `hotels/[slug]/page.tsx`) — đây là NHÃN GIAO DIỆN (cùng loại với `<dt>Type</dt>`/`<h2>Hotel information</h2>`/`<h2>Amenities</h2>`/`<h2>Contact</h2>` đứng cạnh, đều ĐÃ đúng tiếng Anh) — không phải nội dung địa điểm fallback.
  2. Giá trị `Khách sạn` dưới `<dt>Type</dt>` và trong `<title>` trang (`${h.name} · Khách sạn · PhuQuocHub`, dòng 50) — đây cũng là CHUỖI GIAO DIỆN hardcode trong chính `page.tsx` (không có nhánh locale, khác hẳn `BREADCRUMB_HOTELS_LABEL: Record<Locale,...>` đúng cách ngay phía trên nó trong cùng file) — không phải dữ liệu place đọc fallback từ DB.
  **Đối chiếu đúng baseline trước khi kết luận:** `git diff 5b04cac HEAD -- hotels/[slug]/page.tsx` — cả hai dòng trên (179 và 50) KHÔNG nằm trong diff của candidate này (diff hôm nay chỉ đổi điều kiện hiện `referencePin` + đổi `<p>{description}</p>` → `<RichDescriptionRenderer>`). Dòng 179 có từ commit `6d31587` (feature không liên quan, có trước cả baseline `5b04cac`). → Xác nhận bằng diff thật, không phải suy đoán: đây là gap có từ trước, release `7629b50` không tạo ra hay làm nặng thêm.
- **Ra Khơi** (`/vi/restaurants/nha-hang-ra-khoi`, redirect đúng từ `/places/...`): 200, mô tả + link bản đồ đúng, KHÔNG có mục thực đơn — khớp đúng trạng thái đã biết ("có dữ liệu nguồn, chưa nghiệm thu lưu menu"), không hồi quy.

**Owner CHƯA tự nghiệm thu bất kỳ mục nào ở trên qua phiên của chính mình** — toàn bộ chỉ là tôi tự đọc domain thật, không đăng nhập.

**Sửa hẹp 3 chuỗi giao diện Novotel `/en` (commit local `877dceb`, CHƯA build/deploy):** `LABEL_CHECK_IN_OUT`/`HOTEL_TYPE_LABELS_EN`/tái dùng `BREADCRUMB_HOTELS_LABEL` cho title — đúng cơ chế `Record<Locale,string>` đã có trong file, không đổi `HOTEL_TYPE_LABELS` gốc (còn dùng ở `HotelCard.tsx`/`HotelDetailsEditor.tsx`, ngoài phạm vi). 43/43 test pass (7 test mới), `tsc`/`eslint` sạch. Chưa đụng dữ liệu/trạng thái production nào.

### Cutover d2f5bf8 — bản vá UX nhập giờ mở cửa (24h, HH:mm) — THÀNH CÔNG, không cần rollback

Preflight khớp chính xác (baseline `1a44601`/`5b04cac`, candidate image ID khớp đúng `sha256:616a37859b53...`, không deploy đồng thời, dry-run chỉ `phuquoc-web-prod`). Cutover + `release_tag_set` chạy không lỗi (dừng theo `set -e` nếu có). Hậu kiểm: identity/pin khớp đúng kỳ vọng; API image ID + `StartedAt=2026-10-16T10:29:34Z` **không đổi** (không bị recreate); 6/6 container healthy; log web không lỗi; route `/vi`, `/en`, `/vi/places/bai-sao`, `/en/hotels/novotel-phu-quoc`, `/dashboard/places/edit-proposals` đều 200; Bãi Sao vẫn đúng trạng thái cũ, không bị ảnh hưởng. **Không có phiên owner hợp lệ trên production** nên chưa tự kiểm giao diện nhập giờ thật trên production (route tồn tại, 200, nhưng chưa thao tác — khác với bằng chứng browser đã có, vốn chạy trên dev server local + API/DB synthetic, KHÔNG phải image production). Owner tự kiểm UI thật khi có phiên, nếu muốn.

**Nghiệm thu góp ý production (Chùa Hộ Quốc, §1 bên dưới) — owner đã thực hiện 17/10/2026: ĐÃ ÁP DỤNG, CHƯA hiển thị public.** Owner tự báo đúng kết quả, không gộp hai việc: "đã áp dụng" (ghi) khác "đủ điều kiện public" (gate evidence). Đối chiếu lại bằng đọc public API (chỉ đọc, không thao tác gì thêm): `GET /api/places/chua-ho-quoc` cả `?locale=vi` lẫn `?locale=en` đều trả `"opening_hours":null` — khớp đúng báo cáo của owner và đúng phân tích chính sách đã nêu ở 1.3 (nguồn Google Maps không thuộc `OFFICIAL_SOURCE_TYPES`, nên dù có nộp bằng chứng qua luồng evidence riêng cũng không qua được gate `SOURCE_NOT_FIRST_PARTY`). **Đóng vòng nghiệm thu "góp ý có phản hồi"** — luồng gửi→duyệt→áp dụng đã chứng minh hoạt động đúng bằng dữ liệu thật; việc công khai giờ cần nguồn first-party khác, chưa có, không theo đuổi tiếp trong lượt này trừ khi owner cung cấp nguồn mới.

**Quyền ghi hiện có:** `Place.Edit.Managed`/`.Any`, `PlaceExternalIdentifier.Verify`, `PlaceEditProposal.Create`+`.Moderate`, `JobListing.Create`+`.Moderate`, `RealEstateListing.Create`+`.Moderate` — tất cả do role `content_owner` giữ. Quyền ghi Bãi Sao trước đó KHÔNG mở rộng sang record/field khác.

### Gói A — Khôi phục xuống dòng (17/10/2026) — SỬA XONG, candidate SẴN SÀNG, CHƯA deploy

**Tái hiện bằng đúng dữ liệu thật** (tin tuyển dụng owner vừa đăng production, "Sealight Villa Phu Quoc") — không cần dựng synthetic cho bước tái hiện vì dữ liệu thật có sẵn đã đúng tình huống (nhiều đoạn, dòng trống, danh sách, tiếng Việt). `GET /api/job-listings` xác nhận `\n` được lưu/trả đúng nguyên vẹn; trang public `/vi/jobs/<id>` hiển thị dồn thành một đoạn — xác nhận bug nằm ở renderer (`<p>{text}</p>` không xử lý whitespace), không phải mất dữ liệu.

**Phạm vi sửa:** thêm 1 class CSS dùng chung `.longText` (`white-space: pre-wrap; overflow-wrap: break-word`) trong `places.module.css`, áp dụng cho mọi field mô tả dài ở 6 trang chi tiết công khai: địa điểm chung, hotel, restaurant, tour, tin tuyển dụng (mô tả/yêu cầu/quyền lợi), bất động sản (mô tả/tiện ích/pháp lý). Không đổi dữ liệu, không migration, không yêu cầu nhập lại nội dung cũ.

**Kiểm:** 7 test mới (khoá đúng "\n" tới DOM nguyên vẹn — xem ghi chú trong `jobs/[id]/page.spec.tsx` về lý do không assert được tên class CSS qua mock test hiện có) + 137 test cũ đều pass (144/144). `tsc`/`eslint` sạch. Xác nhận bằng browser thật, dữ liệu synthetic cô lập local: desktop + 375px, kể cả chuỗi dài không dấu cách — không tràn ngang ở cả hai kích thước (đo `document.body.scrollWidth` khớp `window.innerWidth`, không chỉ xem ảnh chụp).

**Commit local:** `f9e8d28c63ebdc9a5855e4e10d1a9cb77eb3336a`.

**Candidate đã build + kiểm trên ĐÚNG production build, cô lập (17/10/2026):** image `phuquochub-web:f9e8d28c63ebdc9a5855e4e10d1a9cb77eb3336a` — `sha256:f577280bf2fb0f0224ecb68ae8432cf8b2c933d965fc26cbb93dd54a0cac783f`, build trong thư mục cô lập trên VPS (không đụng source tree production, checksum archive khớp trước khi build). Smoke-test qua network production thật (không đổi container thật): `/vi`, `/en`, `/vi/places/bai-sao`, `/en/hotels/novotel-phu-quoc`, và chính tin thật "Sealight Villa Phu Quoc" đều 200, không lỗi log. **Đọc trực tiếp byte HTML trả về** (không chỉ ảnh chụp) xác nhận `\n\n`/`\n` còn nguyên vẹn trong `<p class="...longText">` — bằng chứng mạnh nhất có thể, trên đúng image sẽ deploy nếu được duyệt. Dry-run xác nhận chỉ `phuquoc-web-prod` đổi. Baseline tại thời điểm chuẩn bị: Web `d2f5bf8`/API `5b04cac` (không đổi).

**Rollback nếu cutover:** về `d2f5bf8b6a0efa00b7edae8d3650ec15696e35e5` (Web baseline đang chạy tại thời điểm chuẩn bị gói này).

Chưa chạy cutover — chờ duyệt riêng.

### Kiểm kê — Jobs/Real-estate: hết hạn + song ngữ (17/10/2026, đọc source + checkpoint, không kiểm toàn monorepo)

| Yêu cầu | Đã có | Khoảng trống |
|---|---|---|
| Tin hết hạn ngừng public | ✅ Lọc tại THỜI ĐIỂM ĐỌC (`expiresAt >= CURRENT_DATE`), không phụ thuộc cron — KHÔNG có cron nào cho 2 tính năng này. Tin hết hạn nhưng status vẫn published → API chi tiết trả 404 (giống chưa từng tồn tại), không rò rỉ dữ liệu cũ | — |
| Chủ tin vẫn thấy tin mình sau hết hạn | ✅ Đúng như vậy (status cột không tự đổi) | Dashboard "Tin của tôi" KHÔNG hiện ngày hết hạn, KHÔNG có lý do "vì sao không public" |
| Gia hạn/đăng lại | ⚠️ Có "Mở lại" nhưng CHỈ từ trạng thái Đã đóng, và **tái duyệt toàn bộ** (reset về pending) — KHÔNG có "gia hạn" nhẹ hơn cho tin published-nhưng-hết-hạn; "Sửa" tin published cũng đẩy về pending (đúng quy tắc sửa nội dung trọng yếu, nhưng không phải luồng gia hạn riêng) | Cần luồng: xác nhận nội dung còn đúng → chọn hạn mới → gửi duyệt, áp dụng cho tin published-nhưng-hết-hạn, không chỉ tin đã đóng |
| Nội dung VI/EN riêng | ❌ **Không có gì cả** — `job_listings`/`real_estate_listings` không có cột/bảng dịch nào, không liên quan `place_translations`. `/en/jobs/...` hiện ĐÚNG NGUYÊN VĂN tiếng Việt chủ tin gõ, chỉ nhãn/tiêu đề UI đổi theo locale | Toàn bộ — cần thiết kế từ đầu (Gói C) |
| Rich text/bảng | ❌ Mọi mô tả dài là plain text (`varchar`), không editor nào ngoài textarea thường | Toàn bộ — cần chọn format trước khi xây (Gói D) |

### Gói B — XONG theo phạm vi đã giao (17/10/2026), CHƯA deploy. **Có sửa API + migration-free — KHÔNG phải Web-only**, xem phân loại cuối mục.

Chính sách hạn mặc định/tối đa/giới hạn gia hạn (đề xuất 30/60/90 ngày ở trên) **vẫn CHƯA được owner duyệt** — không coi là đã chốt, không tự áp dụng cho tin thật, không backfill.

**B1 — Hiển thị hạn + bộ lọc trên "Tin của tôi"** (commit local `a1410bf`): `apps/web/src/lib/listingExpiry.ts` (`todayInVietnam()` theo Asia/Ho_Chi_Minh, so sánh chuỗi YYYY-MM-DD); `MyJobListingsView.tsx`/`MyRealEstateListingsView.tsx` hiện ngày hết hạn + nhãn trạng thái hiệu lực cạnh status thật + bộ lọc. Thuần Web, lọc client-side trên dữ liệu API đã trả sẵn.

**B2 — Sửa lệch múi giờ API/dashboard** (commit local `ce2bb9f`): `JobListingsRepository`/`RealEstateListingsRepository.publicQuery()` đổi `expiresAt >= CURRENT_DATE` (UTC phiên Postgres) → `expiresAt >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`, khớp đúng quy ước dashboard. Bug thật: tới ~7 giờ/ngày (00:00–07:00 giờ VN) một tin đã hết hạn theo lịch VN vẫn bị API công khai phục vụ tiếp. Không đổi `expires_at` đã lưu, chỉ đổi điều kiện so sánh lúc đọc — **không migration**. Thêm `useTodayInVietnam()` (hook tự kiểm mỗi 60s, khiến dashboard tự cập nhật khi mở qua nửa đêm mà không cần thao tác gì — trước đó tính "hôm nay" một lần trong thân component thì đứng yên tới khi re-render vì lý do khác).

**B3 — "Quản lý tất cả tin" cho admin, phân biệt rõ với hàng chờ duyệt** (commit local `a1ea166`, bổ sung thêm 17/10/2026 chưa commit): owner xác nhận đúng `GET .../pending` CHỈ trả status=pending, không có cách tìm tin published/closed/rejected/draft của người khác hay lọc theo người đăng. Thêm:
- API: `GET /job-listings/admin` + `GET /real-estate-listings/admin` (cùng permission `*.Moderate` đã có — không permission mới), nhận `status?`/`created_by?`/`page`/`limit`, trả MỌI status + `creator_email`/`creator_display_name` (JOIN `users`, batch một truy vấn — không N+1). Route/DTO/mapper mới, **repository query mới (`listAllForAdmin`/`countAllForAdmin`/`findCreatorSummaries`) — không migration**.
- Web: `AdminJobListingsView`/`AdminRealEstateListingsView` — **sửa lại 17/10/2026 sau phản hồi owner**: bộ lọc trạng thái nay gồm CẢ "Hết hạn"/"Sắp hết hạn" (trạng thái HIỆU LỰC, suy từ status+expires_at qua `matchesListingFilter`/`listingEffectiveStatus` — một tin `published` quá hạn vẫn mang status đó, lọc theo cột status thật không tìm được nó); status thật gửi server, pseudo-status lọc client trên trang đã tải. Thêm **phân trang thật** (50/trang, nút "Tải thêm" nối thêm — không thay thế), hiện rõ "Đã tải X/Y" và CẢNH BÁO khi bộ lọc người đăng (vẫn client-side, theo đúng thiết kế) đang chạy trên một tập CHƯA tải hết, tránh admin nhầm "đã tìm toàn bộ". Nút Đóng/Mở lại tái dùng ĐÚNG API moderator đã dùng được từ trước. Thêm 2 mục nav, tái dùng `canReviewJobListings`/`canReviewRealEstateListings` — không capability mới.
- Kiểm bổ sung: 2 test e2e xác nhận `creator_email`/`creator_display_name`/`created_by` KHÔNG lộ qua `GET /job-listings` (list) và `GET /job-listings/:id` (chi tiết) công khai — gọi response HTTP thật, không chỉ suy từ cấu trúc mapper; cộng test unit tương ứng ở `getPublicById`/`listPublic` cho cả hai module. Test component cập nhật cho phân trang + pseudo-status filter (27 test Web).

**B4 — Hoàn thiện "Sửa và gửi đăng lại"** (commit local `a1ea166`, **sửa lại đáng kể 17/10/2026** sau phản hồi owner — bản đầu có hai lỗi thật, không phải chỉ thiếu test): luồng update→submit→decide ĐÃ hoạt động từ trước (owner-only qua `loadOwned`, published→pending trực tiếp một bước — KHÔNG cần "Đóng tin" trước, `reopen` owner-hoặc-moderator qua `loadOwnedOrModerated`).
- **Lỗi #1 (đã sửa):** bản đầu của `assertValidExpiry()` chặn MỌI `update()` nếu `expires_at` (dù KHÔNG đổi so với giá trị đang lưu) đã ở quá khứ — vô tình chặn cả việc sửa một trường khác (ví dụ lỗi chính tả) của một tin published-đã-hết-hạn hoặc draft/rejected để lâu. Sửa: chỉ chặn khi dto **CHỦ ĐỘNG đặt một `expires_at` MỚI, khác giá trị cũ**, và giá trị đó đã quá khứ; giữ nguyên/xoá về null luôn hợp lệ ở bước lưu.
- **Lỗi #2 (đã sửa):** kiểm ở create/update KHÔNG đủ — một tin còn hạn lúc gửi duyệt có thể hết hạn trong lúc nằm ở hàng chờ (chờ moderator xử lý). Thêm `assertNotAlreadyExpired()`, gate THẬT ở **`submit()`** (gửi duyệt) và **`decide()` khi approve** (không áp cho reject — từ chối luôn được phép bất kể hạn): chặn 400 nếu `expiresAt` hiện tại đã quá khứ, tránh "duyệt thành công" một tin sẽ published nhưng không bao giờ hiện công khai.
- `expires_at=null` vẫn hợp lệ ở mọi bước (không bắt buộc phải có hạn — KHÔNG phải chính sách 30/60/90). Form Web đã có ô `expires_at` và đã surface message lỗi 4xx — không cần sửa Web.
- Kiểm: unit cho cả hai lỗi trên (giữ nguyên hạn cũ không bị chặn; xoá về null không bị chặn; submit/decide-approve với hạn quá khứ → 400 + không gọi `repo.save`; decide-reject với hạn quá khứ → KHÔNG bị chặn) cho cả hai module.
- **e2e `listings-edit-resubmit.e2e-spec.ts`** (fixture: tin **rejected**) — CHỈ chứng minh cơ chế owner-only + gate hoạt động đúng cho một luồng draft/rejected→submit thông thường, **KHÔNG phải tình huống "hết hạn → đăng lại" owner cần** (owner chỉ ra đúng — fixture rejected không có hạn đã qua lúc bắt đầu).
- **e2e MỚI `listings-expired-republish.e2e-spec.ts`** (9 test, fixture ĐÚNG: tin **published với `expires_at` đã qua**, không dùng rejected): (A) published+hết hạn → admin tìm thấy qua `?status=published` → **sửa trực tiếp, KHÔNG cần Đóng tin trước** (update() đẩy published→pending MỘT bước, không qua submit() riêng — khác owner hình dung "sửa→gửi duyệt→duyệt" 3 bước, đã làm rõ) → duyệt → public lại, giữ `id`/`created_by`. (B) tin **closed** (đã đóng tay) → PATCH trực tiếp → 409 → **PHẢI** Mở lại trước (xác nhận đường đó hoạt động đúng) → sửa → gửi duyệt → duyệt → public lại. (C) mirror nhánh A cho real-estate. (D) xác nhận sửa trường khác KHÔNG đổi hạn cũ (đã quá khứ) không bị chặn, nhưng `submit()` sau đó (từ rejected) với hạn vẫn cũ → 400 đúng như thiết kế gate.

**B5 — Xác minh cache (chỉ đọc code, không sửa gì):** không có `CacheInterceptor`/`cache-manager`/Redis nào gắn vào `job-listings`/`real-estate-listings` (đã grep toàn bộ `apps/api/src`; Redis trong repo chỉ dùng cho audit/auth-revocation/logger, không liên quan). Web gọi các API này đều `{ cache: 'no-store' }` sẵn từ trước, trang public không có `revalidate`/`dynamic` nào. → **Không có lớp cache nào trong code/app của repo này** có thể che/trễ hiệu lực sửa múi giờ ở B2; e2e thật (`listings-expiry-timezone.e2e-spec.ts`, đã có từ trước) gọi trực tiếp HTTP endpoint công khai nên là bằng chứng cho **chính public**, không chỉ dashboard — khác hẳn test hook `useTodayInVietnam` (chỉ chứng minh dashboard tự cập nhật hiển thị, không liên quan gì tới public). Không kiểm được CDN/edge cache NGOÀI repo (ví dụ Cloudflare phía trước production, nếu có) — không thuộc version control, không xác minh được bằng cách đọc code.

**Đối chiếu điểm 3 (quản lý tin/admin) với code hiện tại (20/10/2026, đọc source, không kiểm toàn monorepo) — 6/7 mục ĐÃ ĐỦ, không cần sửa gì:**

| # | Yêu cầu | Kết quả đối chiếu |
|---|---|---|
| 1 | Tin của tôi + quản lý tất cả tin, cả 2 module | ✅ Đủ, đối xứng — route/view/nav đều có cho job_listings VÀ real_estate_listings |
| 2 | 5 trạng thái (chờ duyệt/đang công khai/sắp hết hạn/hết hạn/đã đóng), cả 2 màn × 2 module | ✅ Đủ — `listingExpiry.ts`'s `ListingFilterValue`/`matchesListingFilter()` dùng chung, cùng `FILTER_OPTIONS` ở cả 4 view |
| 3 | Bộ lọc/phân trang phạm vi rõ ràng | ✅ Đủ — B3 vẫn đúng trong code hiện tại: phân trang thật 50/trang, cảnh báo rõ khi lọc người đăng trên tập chưa tải hết, ở cả 2 module |
| 4 | Sửa & đăng lại đúng quyền/hạn/qua duyệt | ✅ Đủ, đối xứng — `assertValidExpiry()`/`assertNotAlreadyExpired()` cùng áp dụng đúng chỗ (`create`/`update`/`submit`/`decide`-approve, KHÔNG chặn reject) ở cả 2 module |
| 5 | Từ chối có lý do, cả tin gốc lẫn bản dịch | ✅ Đủ, đối xứng — `review_note`/`note` DTO→service→mapper→UI ("Lý do từ chối: ...") đều có cho main listing VÀ translation decide(), cả 2 module |
| 6 | Bản dịch có trạng thái + cảnh báo cần rà soát, hiện cho CHỦ TIN | ✅ Đủ — đã đóng ở Gói D (18-20/10), SAU thời điểm ghi chú Gói C bên dưới nói "chưa làm": `JobListingTranslationEditor`/`RealEstateListingTranslationEditor` hiện trạng thái + cảnh báo `is_published_stale` riêng biệt (khác `is_stale`) ngay trên trang Sửa tin của owner |
| 7 | Xóa/khôi phục: báo rõ cơ chế + quyền; không xoá dây chuyền ảnh/lịch sử | ✅ Đúng như checkpoint đã ghi — CHỈ có đóng/mở lại (`close()`/`reopen()`), KHÔNG có xoá (cứng hay mềm) nào cho job_listings/real_estate_listings — xác nhận lại bằng grep entity+controller, không có `@DeleteDateColumn`, không có route DELETE. Vì không có xoá nên không có rủi ro "xoá dây chuyền ảnh/lịch sử" xảy ra trong thực tế (ảnh BĐS vẫn còn nguyên khi đóng/mở lại tin). |

**Phát hiện thêm ngoài 7 mục — SỬA LẠI 20/10/2026 sau phản hồi owner (bản ghi trước nói chung "không ghi audit log nào" cho cả vòng đời chính — KHÔNG đúng, gộp lẫn hai việc khác nhau: cột trạng thái hiện tại trên row CÓ ghi actor cho một số hành động, audit_logs bất biến thì KHÔNG dùng cho hành động nào trên row chính cả). Đối chiếu TỪNG hành động, bằng đọc trực tiếp `job-listings.service.ts`/`real-estate-listings.service.ts` tương ứng (cùng cấu trúc ở cả hai module):**

| Hành động | Ai gọi được | Đã truy được "ai, lúc nào"? | Cơ chế |
|---|---|---|---|
| `decide()` (duyệt/từ chối của moderator) | Chỉ role có `JobListing.Moderate`/tương đương | **CÓ** — đã truy được qua cơ chế hiện có, không cần thêm gì | Cột `reviewerId`+`reviewedAt` trên CHÍNH row, ghi mỗi lần `decide()` chạy (dòng 236-237 `job-listings.service.ts`). Giới hạn CÓ THẬT nhưng không phải lỗi: chỉ giữ lần quyết định GẦN NHẤT (ghi đè), không phải lịch sử đầy đủ mọi lần duyệt/từ chối qua các vòng gửi lại — nếu tin bị từ chối rồi gửi lại rồi duyệt, chỉ còn vết của lần duyệt cuối, không còn vết lần từ chối trước |
| `close()`/`reopen()` (đóng/mở lại tin) | CẢ chủ tin LẪN moderator (`loadOwnedOrModerated()` — không phân biệt hai vai trong dữ liệu lưu) | **KHÔNG** — đây là khoảng trống THẬT, không truy được qua cơ chế nào hiện có | Nhận `userId` làm tham số (dùng để KIỂM QUYỀN — chủ tin hay moderator) nhưng KHÔNG ghi `userId` đó vào đâu cả; `reopen()` còn chủ động xoá trắng `reviewerId`/`reviewedAt` cũ (dòng 217-218). `updatedAt` đổi nhưng không phân biệt được "chủ tin tự đóng" với "moderator buộc đóng" — hai tình huống khác hẳn nhau về mặt vận hành (tranh chấp/khiếu nại sẽ cần phân biệt) |
| Bản dịch (saved/submitted/approved/rejected) | Chủ tin + moderator | **CÓ**, đầy đủ hơn cả hai dòng trên | `AuditService.record()` ghi MỖI lần chuyển trạng thái vào `audit_logs` bất biến (actorId+event+timestamp, không bị ghi đè) — xem `job-listing-translations.service.ts` dòng 75/117/151/207 và real-estate tương ứng |

Real_estate_listings riêng còn thêm `markRented()`/`markSold()`/`markAvailable()` (qua `setDealStatus()`, dòng 241-248) — cùng loại gap: nhận `userId` để kiểm quyền qua `loadOwnedOrModerated()` nhưng không ghi actor nào, không có tương đương ở job_listings (deal_status là field riêng của real estate, §13u).

**Kết luận + đề xuất (CHƯA tự làm — để owner quyết trước khi đóng gói release):** gap thật là `close()`/`reopen()` (cả hai module) + `markRented/Sold/Available()` (real-estate) không ghi actor. Các route này cho phép CẢ chủ tin VÀ moderator cùng gọi, và đều ảnh hưởng trực tiếp tới một tin ĐANG công khai, nên đáng được xem là "quan trọng" theo nghĩa owner đã đặt ra. Đề xuất bổ sung NHỎ, tái dùng hạ tầng ĐÃ CÓ (không phải audit trail mới): thêm lệnh gọi `this.audit.record({ event: '<module>.closed'/'.reopened'/'.deal_status_changed', actorId: userId, ... })` ngay trong các hàm này — cùng `AuditService` đã wire sẵn ở các service translation liền kề, không cần entity/migration/dependency mới. Chưa triển khai trong lượt này vì đây là quyết định phạm vi, không phải lỗi phát sinh từ công việc hôm nay.

**Phân loại thay đổi (owner yêu cầu rõ trước khi gộp phát hành — sửa lại 17/10/2026: B4 KHÔNG chỉ là "query/route mới", mà có sửa validation trên đường GHI thật):**

| Phần | API | Web | Migration |
|---|---|---|---|
| B1 (hiển thị + lọc) | — | ✅ | — |
| B2 (múi giờ) | ✅ (2 repository, query-only) | ✅ (hook) | Không |
| B3 (quản lý tất cả tin) | ✅ (2 route+service+repo+mapper mới, read-only) | ✅ (2 view+page+nav, phân trang+pseudo-filter) | Không |
| B4 (hạn hợp lệ khi gửi lại) | ✅ **ghi — validation mới trên `create`/`update`/`submit`/`decide`**, không chỉ đọc | — (form/lỗi hiển thị đã có sẵn) | Không |

→ **Gói A (Web-only) KHÔNG thể gộp chung một candidate "Web-only" với Gói B** (B2/B3/B4 đều có sửa API, B4 còn chạm đường GHI). Nếu phát hành A+B cùng lúc: phải build + smoke-test CẢ image Web MỚI lẫn image API MỚI (không dùng image Web của riêng Gói A để chứng minh phần API của Gói B đã được kiểm), và xác nhận rollback độc lập cho từng image. Tất cả còn ở commit local, CHƯA build candidate, CHƯA deploy.

**Ghi chú UI bổ sung (17/10/2026):** `MyJobListingsView`/`MyRealEstateListingsView` nay có ghi chú rõ dưới nút "Mở lại" của tin `closed`: "không sửa trực tiếp được — bấm Mở lại trước, tin sẽ về trạng thái chờ duyệt, sau đó mới bấm Sửa được" — trước đó chỉ có nút, không giải thích vì sao chưa thấy nút "Sửa". Màn hình admin đổi nhãn nút tương tự ("Mở lại (về chờ duyệt — người đăng tự sửa nội dung/hạn sau đó)").

### Gói C — Song ngữ job/BĐS: PHẦN 1/2 (job_listings) XONG + TEST, commit local `c41772b`. real_estate_listings CHƯA làm. Web (cả hai) CHƯA làm.

Dữ kiện dùng CHUNG, không nhân đôi: giá/lương, diện tích/số lượng, ngày (tạo/duyệt/hết hạn), liên hệ, toạ độ/mức công khai vị trí, loại giao dịch/hình thức làm việc — DTO bản dịch CHỈ nhận 4 trường văn bản, không có chỗ cho các trường này (kiểm bằng kiểu + test).

**Quyết định thiết kế (đọc kỹ `place_translations`/`ADR-020` trước khi quyết, như đã nói sẽ làm) — CHỦ Ý KHÁC, không tái dùng bảng/code:**
- `place_translations` field-granular + giữ TOÀN BỘ lịch sử revision (vì places có field set biến đổi theo loại, nhiều nguồn/đích locale tiềm năng qua `supported_locales`) — job_listings chỉ có MỘT schema cố định, MỘT nguồn (vi) MỘT đích (en). Nên: **một bảng riêng, một ROW/listing** (không field-granular), **không giữ lịch sử** (sửa là UPDATE tại chỗ) — đơn giản hơn nhiều, đúng quy mô thật của tính năng.
- Vòng đời bản dịch: draft→pending→published/rejected — CÙNG vocabulary nhưng là **state machine RIÊNG, độc lập hoàn toàn** với status của chính tin (một tin published tiếng Việt có thể có bản dịch draft/pending/rejected và ngược lại — không bên nào kéo bên kia).
- Quyền: tái dùng NGUYÊN `JobListing.Create` (viết/gửi duyệt) + `JobListing.Moderate` (duyệt) — **không permission mới**.
- Lỗi thời: `source_content_hash` (sha256 cả 4 trường tiếng Việt tại thời điểm dịch) — so lại khi đọc, trả `is_stale` cho CHỦ TIN biết, KHÔNG tự ẩn/tự xoá bản dịch khi tiếng Việt đổi sau đó.
- Đọc công khai: `GET /job-listings/:id?locale=en` — response LUÔN có `locale` phản ánh NỘI DUNG THỰC SỰ đã trả (không phải locale được yêu cầu): yêu cầu `en` nhưng chưa có bản dịch đã duyệt → vẫn trả tiếng Việt + `locale:"vi"`, không "nhận vơ" là tiếng Anh. KHÔNG tái dùng `LocalesService`/`supported_locales` (bộ máy cho N-locale, job_listings chỉ cần vi/en — "không ép place model vào listing" như owner yêu cầu).
- **Chưa làm**: overlay ở `listPublic()` (danh sách — chỉ detail có overlay, ưu tiên thấp hơn vì danh sách chỉ hiện vài field ngắn); route moderation UI riêng (có endpoint `GET /job-listings/translations/en/pending` nhưng chưa có trang Web); ô nhập bản dịch trong `JobListingForm`/trang public `/en/jobs/[id]` CHƯA đọc `locale` khi gọi API (vẫn y như trước Gói C này).

**Kiểm:** 21 unit `JobListingTranslationsService` + 5 unit `JobListingTranslationsController` + 5 unit overlay mới trong `JobListingsService` + **10 test e2e thật** (`job-listing-translations.e2e-spec.ts`, HTTP+Postgres thật): viết draft→gửi duyệt→duyệt→overlay công khai, quyền owner-only (404 cho người lạ) + moderator-only (403), hàng chờ duyệt có đúng ngữ cảnh tin gốc, sửa tiếng Việt sau khi duyệt → `is_stale=true` nhưng bản dịch KHÔNG bị xoá/ẩn, và cả hai locale không ghi đè lẫn nhau. `tsc` sạch.

**Việc tiếp theo (chưa làm, theo đúng thứ tự):** (1) `real_estate_listings` — cùng mẫu CHÍNH XÁC (bảng/entity/repo/service/controller/mapper/DTO/test), field dịch: `title`/`description` chắc chắn, `utilities_note`/`legal_status_note` để owner quyết (ít cần dịch hơn). (2) Web: ô nhập bản dịch (tái dùng layout `JobListingForm`, có thể là tab/khối riêng "English" trong `MyJobListingsView`), trang public đọc `locale` từ route rồi gọi API với `?locale=`, một khối "chờ duyệt bản dịch" nhỏ (có thể gộp vào `JobListingModerationQueueView` hoặc trang riêng).

### Gói D — Rich text: job_listings + real_estate_listings + places/hotels/restaurants/tours (mô tả dài) ĐÃ CODE + ĐÃ KIỂM BROWSER THẬT (20/10/2026), CHƯA build candidate, CHƯA deploy.

**Bug thật phát hiện + sửa qua kiểm browser thật (20/10/2026, commit `27d9517`) — MỌI lần sửa tin BĐS cho thuê qua form Web đều bị chặn nhầm:** `assertTransactionScopedFields()` dùng `legal_status_note_rich !== undefined` (strict) thay vì `!= null` (loose, cùng kiểu hai điều kiện còn lại trên CÙNG dòng) — coi `null` TƯỜNG MINH là "có mặt". Form sửa tin Web luôn gửi lại field này (giá trị đã tải, `null` với tin thuê chưa từng dùng) trên MỌI lần lưu, không chỉ khi đụng tới trường đó → chặn nhầm 400 "sale_price_basis/legal_status_note chỉ áp dụng cho tin bán" khi sửa BẤT KỲ trường nào (giá, tiêu đề, v.v.) của MỘT tin thuê ĐÃ ĐĂNG. Đường TẠO MỚI không dính (form tin mới không gửi field đó). Test cũ không bắt được vì chỉ test nhánh "gửi RichDoc thật" (bypass thật), chưa test nhánh "gửi null tường minh" (cách form Web luôn làm) — đã thêm 3 test hồi quy (null tường minh → lưu được; RichDoc thật → vẫn chặn đúng; tin bán không bị ảnh hưởng). Xác nhận bằng browser thật: sửa giá tin thuê `171506f1-c510-4994-9173-e065ddc9679b` → lưu được → duyệt lại → API phản ánh giá mới (5.000.000) → EN fallback đúng do lệch dữ kiện quan trọng (giá) → thẻ danh sách + trang chi tiết nhất quán (cùng tiêu đề tiếng Việt).

**Đã CODE (commit local, chưa build/deploy):** `e40855a`…`27d9517` (10 commit, xem `git log --oneline e40855a..HEAD` để đối chiếu đủ). Phạm vi field rich-text: job_listings (`description`/`requirements`/`benefits` + bản dịch EN `description`); real_estate_listings (`description`/`utilities_note`/`legal_status_note` + bản dịch EN `description`). Tên/mô tả ngắn/liên hệ/giá/trường lọc KHÔNG đổi (giữ plain, đúng owner chốt).

**Cơ chế dùng CHUNG, không nhân đôi theo field** (`apps/api/src/common/rich-text-field.ts` — `applyRichTextField()`/`serveRichDoc()`): mỗi field rich có cột `*_rich` (RichDoc) + `*_rich_hash` (sha256 plain text tại lúc ghi rich). Khi ĐỌC: `serveRichDoc()` tính lại hash của cột plain HIỆN TẠI, chỉ phục vụ rich nếu khớp hash đã lưu — lệch → coi như chưa từng có rich, trả null, fallback plain. Đây là **cơ chế đóng rủi ro rollback** (điểm 3 owner yêu cầu — xem bên dưới), không phải kỷ luật vận hành ("cẩn thận khi rollback").

**Đóng rủi ro rollback — đã TEST, không chỉ suy luận:** tình huống owner nêu đúng — app cũ sửa trực tiếp cột plain (không biết `*_rich`) có thể để `*_rich` cũ NẰM LẠI, lệch với plain mới. Với hash-trên-đọc này, lần đọc tiếp theo tự phát hiện lệch → KHÔNG phục vụ rich cũ. Đã test đủ 2 lớp: (a) unit `rich-text-field.spec.ts` — giả lập app cũ bằng cách gán trực tiếp `.description = ...` (bỏ qua `applyRichTextField`), gọi lại `serveRichDoc()` → xác nhận null, phục vụ đúng plain mới; (b) **e2e thật** `rich-text-rollback.e2e-spec.ts` (HTTP + Postgres thật) — đúng chuỗi owner yêu cầu: app mới tạo RichDoc → giả lập rollback bằng `UPDATE` SQL thô CHỈ đụng cột plain (y như app cũ không biết `*_rich`) → đọc lại qua API công khai (vẫn chạy app mới, vì không revert code trong test) → xác nhận public **KHÔNG** phục vụ rich cũ, phục vụ đúng plain mới. Ghi `description_rich`/hash tiếp theo qua đường ghi bình thường sẽ tự xoá (demote) cặp cột lệch — không cần script quét riêng. **Không dùng revert migration làm rollback thường** — DROP COLUMN xoá vĩnh viễn nội dung rich hiện có (đã test ở Gói D cũ, xem đánh giá rollback migration dưới) — giữ nguyên schema khi rollback app, phục hồi DB (nếu cần) là quyết định riêng, không tự làm trên production.

**Điểm 4 — ẩn bản dịch khi dữ kiện QUAN TRỌNG mâu thuẫn, không chỉ cảnh báo chung:** thêm hash hẹp thứ hai `publishedCriticalFieldsHash` (chụp lúc duyệt bản dịch) chỉ trên các trường owner liệt tên — job_listings: `shiftInfo`(ca làm)/`workLocation`+`ward`(địa điểm)/toàn bộ `salary_*`+`employmentType`(giá+điều kiện giao dịch); real_estate_listings: `ward`(địa điểm)/`price`+`priceCurrency`+`rentPeriod`+`salePriceBasis`+`depositAmount`(giá)/`transactionType`+`propertyType`+`areaSqm`+`furnitureStatus`+`moveInDate`+`leaseTermMonths`(điều kiện giao dịch). Lệch hash này (không phải hash tổng quát cũ) → `getPublicById()` bỏ HẲN bản dịch, trả nguyên response tiếng Việt (`locale:'vi'`, `translation_hidden_reason:'critical_fact_mismatch'`) — khác với lệch CHỈ phần mô tả/văn xuôi, vẫn giữ hành vi Gói C cũ (`is_translation_stale:true`, vẫn phục vụ bản dịch). Hash=null (bản dịch duyệt trước khi tính năng này tồn tại) → coi là chưa biết, KHÔNG suy diễn ẩn. **Bug phát sinh trực tiếp từ thiết kế này, đã tìm + sửa cùng lượt** (không phải yêu cầu riêng nhưng cần để tính năng đúng): `listPublic()` của cả hai module vẫn hiện tiêu đề overlay tiếng Anh trên thẻ danh sách dù trang chi tiết CÙNG tin đã fallback tiếng Việt — sửa để tiêu đề danh sách dùng đúng điều kiện ẩn như trang chi tiết (`04c8d20`).

**Đã KIỂM (unit + e2e, chưa kiểm browser cho phần MỚI thêm sau 18/10 — xem việc tiếp theo):** test trước đó của luồng mô tả tuyển dụng (75 test, 18/10/2026) cộng mới trong lượt này: wiring rich-text cho requirements/benefits (job) + utilities_note/legal_status_note (real-estate, kể cả chặn `legal_status_note_rich` trên tin RENT qua `assertTransactionScopedFields()` — đường bypass đã đóng), test rò rỉ overlay EN cho từng field rich mới, 4 test nhánh lệch-hash-quan-trọng (lương đổi→fallback hẳn VI; ca làm đổi→fallback; chỉ mô tả đổi→KHÔNG fallback, vẫn hành vi cũ; hash=null→không suy diễn) nhân cho cả hai module, test tính-nhất-quán danh sách/chi tiết. 1 test e2e CŨ (`job-listing-translations.e2e-spec.ts`) viết lại CÓ CHỦ Ý (hành vi mới thay hẳn hành vi cũ cho đúng trường hợp lương-là-trường-quan-trọng — không phải regression). Toàn bộ `npx jest --config ./test/jest-e2e.json` + unit suite của hai module, `tsc`/`eslint` đều sạch sau mỗi lần sửa.

**Web:** editor Tiptap đã nối cho CẢ 5 field rich mới (requirements/benefits job; utilities_note/legal_status_note real-estate — `utilities_note` trước đây là `<input>` một dòng, nay cũng rich) + renderer tương ứng ở form/preview/compare/moderation queue/public detail (cả hai trang `/jobs/[id]` và `/real-estate/[id]`). Banner ẩn-bản-dịch (điểm 4) đã nối cho CẢ hai trang public (`jobs/[id]/page.tsx` trước, `real-estate/[id]/page.tsx` vừa xong lượt này — `ee09206`), phân biệt rõ 3 nhánh (ẩn vì lệch dữ kiện quan trọng / chưa từng dịch / bình thường), có unit test riêng cho cả 3 nhánh × 2 trang.

**9 migration mới từ baseline production 93 (94→102, additive-only, không đổi/xoá cột cũ) — CỘNG migration #103 cho places, liệt kê riêng ở mục places/hotels/restaurants/tours bên dưới (tổng CHÍNH XÁC 10 migration mới, 103 migration — không mặc định 102, đã đếm lại thư mục migrations/):**

| # | Migration | Nội dung |
|---|---|---|
| 94 | `1720009200000-InitJobListingTranslations` | Bảng `job_listing_translations`, một-row-per-locale |
| 95 | `1720009300000-AddJobListingTranslationCasAndSnapshot` | CAS (`content_version`) + cột `published_*`, backfill hàng `published` cũ |
| 96 | `1720009400000-InitRealEstateListingTranslations` | Bảng `real_estate_listing_translations`, thiết kế đúng ngay (CAS+snapshot có sẵn) |
| 97 | `1720009500000-AddJobListingDescriptionRich` | `job_listings.description_rich JSONB NULL` |
| 98 | `1720009600000-AddJobListingRichTextHashesAndFields` | `job_listings.description_rich_hash` + `requirements_rich`/`requirements_rich_hash` + `benefits_rich`/`benefits_rich_hash` |
| 99 | `1720009700000-AddJobListingTranslationDescriptionRich` | `job_listing_translations.description_rich`/`description_rich_hash` (nháp) + `published_description_rich`/`published_description_rich_hash` |
| 100 | `1720009800000-AddRealEstateListingRichText` | `real_estate_listings.description_rich`/`utilities_note_rich`/`legal_status_note_rich` (+ hash mỗi field) VÀ `real_estate_listing_translations.description_rich`/`published_description_rich` (+ hash) — 1 migration chung cho cả nguồn+bản dịch |
| 101 | `1720009900000-AddJobListingTranslationCriticalFieldsHash` | `job_listing_translations.published_critical_fields_hash` |
| 102 | `1720010000000-AddRealEstateListingTranslationCriticalFieldsHash` | `real_estate_listing_translations.published_critical_fields_hash` |

Cả 9 đều test up/down/up trên Postgres dev local; #97 còn test riêng với dữ liệu RichDoc THẬT đã tạo trước khi down (không chỉ bảng rỗng — xem đánh giá rollback migration ở trên, vẫn đúng cho #98-102 vì cùng loại cột JSONB nullable additive).

**Đánh giá rollback migration (DROP COLUMN) — kết luận GIỮ NGUYÊN từ lần trước, áp dụng cho toàn bộ cột `*_rich`/`*_rich_hash` mới:** revert bất kỳ migration nào trong 97-102 trong khi app cũ (không có Gói D) đang chạy → an toàn (app cũ không khai báo cột, không đọc/ghi). Revert trong khi app MỚI đang chạy → gãy cứng (Postgres báo lỗi cột không tồn tại cho MỌI truy vấn liên quan, dễ phát hiện, không âm thầm sai). Revert RỒI chạy lại (không rollback app) → xoá VĨNH VIỄN nội dung rich hiện có (plain text không mất, chỉ mất định dạng) — KHÔNG làm trên production nếu đã có tin thật dùng rich text.

### places/hotels/restaurants/tours — mô tả dài ĐÃ CODE + ĐÃ KIỂM BROWSER THẬT (20/10/2026), chưa build candidate

Mô tả CỦA TIN ĐÃ TỒN TẠI ở places không phải cột scalar đơn giản — đi qua `place_translations` (bảng overlay nháp/duyệt-theo-locale CÓ SẴN từ ADR-020, `PlaceDescriptionEditor.tsx`→`saveDescriptionDraft()`/`publishDescriptionDraft()`→`resolveLocalizedField()`), chỉ đường TẠO MỚI (`PlacesService.create()`) ghi cột thô `places.description` trực tiếp — cột đó, sau khi có bản dịch, chỉ còn là FALLBACK khi locale yêu cầu chưa có bản dịch nào (xem đánh giá riêng dưới). Quyết định đúng như đã nêu: KHÔNG tạo cột `*_rich` riêng song song — một cột `place_translations.rich_doc` DÙNG CHUNG cho mọi field_key (hiện chỉ `description` có giá trị khác null), commit `16ae8b3`/`c6feeb2`/`502f685`. Chi tiết cơ chế (hash không cần thiết nhờ kiến trúc insert-only sẵn có, điểm 4 ẩn-bản-dịch KHÔNG áp dụng cho places vì places chưa có hệ "dữ kiện quan trọng" như job/BĐS) — xem commit message + comment tại chỗ trong `place-translations.service.ts`/`places.service.ts`.

**Migration #103** (`1720010100000-AddPlaceTranslationRichDoc`): thêm `place_translations.rich_doc JSONB NULL` — additive, test up/down/up local. Không có cột hash đi kèm (khác job/BĐS) — xem lý do kiến trúc insert-only tại comment trong `PlaceTranslation` entity.

**Phát hiện thật khi kiểm browser — fallback locale của `description` dùng CỘT THÔ, không dùng bản dịch locale khác:** khi route `/en` chưa có bản dịch EN, response KHÔNG fallback sang bản VI hiện hành trong `place_translations` (dù vừa sửa rich) — mà fallback thẳng về `places.description` (cột thô, có thể CŨ hơn bản VI mới nhất). Đây là hành vi GIỐNG HỆT `name`/`short_description` đã có từ trước (cùng `resolveLocalizedField()` pattern) — **không phải lỗi mới do Gói D**, không tự sửa trong lượt này (đổi chuỗi fallback là quyết định kiến trúc i18n rộng hơn phạm vi "thêm rich text", ngoài những gì owner giao). Hệ quả thực tế: `description_rich` LUÔN null khi fallback xảy ra (cột thô không có rich) — đã xác nhận qua test browser thật, không crash, không lộ draft, chỉ hiển thị plain đúng cột thô.

**Bảng coverage rich-text (owner yêu cầu điểm 2 — field nào có, field nào không, vì sao):**

| Module | Field | Rich-text? | Vì sao |
|---|---|---|---|
| job_listings | description/requirements/benefits | ✅ | Mô tả dài, owner chốt rõ |
| job_listings | title/shift_info/contact/lương/... | ❌ plain | Trường ngắn/lọc được — owner chốt giữ plain |
| job_listing_translations (EN) | description | ✅ | — |
| job_listing_translations (EN) | requirements/benefits | ❌ plain | Owner chốt rõ KHÔNG mở rộng rich sang bản dịch hai trường này |
| real_estate_listings | description/utilities_note/legal_status_note | ✅ | Mô tả dài |
| real_estate_listings | title/giá/diện tích/địa chỉ/... | ❌ plain | Trường ngắn/lọc được |
| real_estate_listing_translations (EN) | description | ✅ | — |
| places/hotels/restaurants/tours | description (mô tả dài) | ✅ | Mô tả dài, qua `place_translations.rich_doc` |
| places/hotels/restaurants/tours | name/short_description | ❌ plain | Trường ngắn, dùng cho thẻ danh sách/SEO title — owner không yêu cầu, giữ plain tránh rich text lọt vào meta/JSON-LD |
| places/hotels/restaurants/tours | opening_hours/price_range/contacts/faqs | ❌ (không áp dụng) | Dữ liệu có cấu trúc, không phải văn bản tự do |
| guide_articles | nội dung bài viết | ❌ chưa làm | Ngoài phạm vi 4 module trên — owner chưa yêu cầu, không tự mở rộng |

**Việc tiếp theo:**
1. Build candidate cô lập + kiểm trên đúng production build + gói duyệt đầy đủ (SHA/diff/migration/image ID/trình tự rollback) — đã được phép, chưa làm trong lượt này.
2. Nếu owner muốn `description` fallback locale-chéo dùng bản dịch hiện hành thay vì cột thô (cho cả rich lẫn plain) — đây là quyết định kiến trúc riêng, cần xác nhận trước khi làm, không tự suy diễn.

Chưa build candidate, chưa deploy, chưa chạy migration/cutover production.

**Quyết định định dạng gốc:** [ADR-DELIVERY-002](decisions/ADR-DELIVERY-002.md) (`RichDoc` — đoạn/tiêu đề phụ/trích dẫn/danh sách/đậm/nghiêng/liên kết/bảng, phi đệ quy, validate allowlist). Editor Tiptap THAO TÁC TRỰC TIẾP (không gõ cú pháp) — chi tiết kiến trúc editor/renderer dùng chung, xem comment đầu `apps/web/src/modules/rich-doc/RichDescriptionEditor.tsx`/`RichDescriptionRenderer.tsx`.

**Kiểm browser thật mô tả tuyển dụng (18/10/2026, dữ liệu synthetic, đã dọn sau khi xong):** soạn đậm + liên kết + bảng 2x3 có caption/hàng tiêu đề → lưu nháp → tải lại → byte-for-byte đúng y hệt → gửi duyệt → moderator thấy đúng cách diễn giải → duyệt → public desktop + 375px (`scrollWidth===innerWidth` dù có bảng) đều đúng.

### Điểm 4 — Rà SEO (20/10/2026, đọc source, so với implementation — không mặc định thiếu) — 1 lỗi thật ĐÃ SỬA, 1 khoảng trống để riêng

**7/8 mục đối chiếu ĐÚNG, không cần sửa:** metadata/body luôn cùng một lần gọi API (không lệch nội dung); `description_rich`/richDoc KHÔNG BAO GIỜ lọt vào meta/JSON-LD (cột plain LUÔN là projection phẳng được ĐẢM BẢO bởi chính cơ chế ghi — `applyRichTextField()`/`place-translations.service.ts`, không phải một bước "nhớ flatten" rời rạc); JSON-LD đọc ĐÚNG object đã overlay/gate (không fetch lại riêng, không có nguy cơ lệch); JobPosting/RealEstateListing JSON-LD chỉ render được cho tin ĐỦ điều kiện công khai (404 trước khi tới dòng JSON-LD nếu hết hạn/đóng/chưa duyệt); sitemap dùng ĐÚNG MỘT truy vấn công khai cho cả listing lẫn chi tiết (không có truy vấn riêng có thể lệch/cũ); dashboard/moderation/translation-draft đều `robots: noindex` + không vào sitemap (36/40 trang dashboard tự khai, 4 còn lại được `robots.ts` chặn tổng); không có trang lọc hàng loạt nào mới sinh ra URL trùng/rỗng.

**1 lỗi thật ĐÃ SỬA, hai lượt (commit `bf3fff9`, SỬA LẠI bởi `2448b7f`):** job_listings/real_estate_listings KHÔNG có cổng lập chỉ mục EN nào (khác hẳn places/hotels/restaurants/tours đã có `isEnDetailIndexable()` từ trước) — route `/en/jobs/{id}` khi chưa có bản dịch, HOẶC khi bản dịch bị ẩn vì `critical_fact_mismatch`, phục vụ nguyên văn tiếng Việt dưới `<html lang="en">` mà không có `robots: noindex` hay canonical/hreflang bù lại.

Bản sửa ĐẦU TIÊN (`bf3fff9`) trỏ canonical sang locale ĐANG PHỤC VỤ khi fallback (vd route `/en` → canonical trỏ `/vi`) — owner chỉ ra đây là diễn giải RỘNG hơn mức cần: không nhất quán với quy ước đã có ở hotel/place, nơi canonical LUÔN tự trỏ về chính locale của route, còn `languages` (hreflang) mới là chỗ thu hẹp lại khi EN chưa đủ điều kiện. Owner cũng bác bỏ khung "cần hạ tầng mới" tôi dùng ban đầu cho hreflang hai chiều — SAU KHI RÀ LẠI, xác nhận owner đúng: `getJobListing(id,'en')`/`getRealEstateListing(id,'en')` ĐÃ sẵn trả `locale:'en'` CHỈ KHI có bản dịch đã duyệt + không bị ẩn vì lệch dữ kiện quan trọng (cùng seam `translation_hidden_reason` đã tồn tại) — không cần field/endpoint mới, chỉ cần gọi lại CHÍNH API này một lần nữa với `locale='en'` bên trong `generateMetadata()` khi route hiện tại không phải `/en`.

**Sửa lại (`2448b7f`, đúng quy ước + đủ phạm vi):** canonical LUÔN tự trỏ về locale của route (self-referencing, giống hotel/place); `languages` (hreflang) tính qua `buildRouteAlternates()` rồi thu hẹp còn `{vi, x-default}` khi EN CHƯA đủ điều kiện (route `/en` tự biết qua `job.locale`/`listing.locale` của chính lần fetch đó; route `/vi` xác nhận qua lệnh gọi THỨ HAI `getJobListing(id,'en')`/`getRealEstateListing(id,'en')`); `robots: noindex,follow` chỉ đặt khi `locale==='en' && !enEligible` — không bao giờ quảng cáo `hreflang="en"` trỏ tới một URL đang noindex. 12 test (6/trang, bao gồm 2 test mới khoá đúng lệnh gọi thứ hai từ route `/vi`) khoá đủ các tổ hợp locale×trạng thái bản dịch.

**1 khoảng trống còn lại, để riêng (owner quyết trước khi làm, KHÔNG phải "cần hạ tầng mới" — chỉ là chưa làm batch):** sitemap vẫn CHỈ liệt kê URL `/vi/jobs/{id}` cho mỗi tin, chưa thêm entry `/en/jobs/{id}` riêng cho tin có bản dịch EN đủ điều kiện — vì chưa có một lệnh gọi/endpoint liệt kê HÀNG LOẠT "id nào đủ điều kiện EN" (tương đương `listEnIndexablePlaceIds` của place); làm được bằng N lệnh gọi thêm (chỉ kém hiệu quả ở quy mô lớn, không phải thiếu khả năng kỹ thuật) nhưng chưa làm trong lượt này. Hệ quả: một bản dịch EN đã duyệt, đủ điều kiện công khai hôm nay vẫn không tự xuất hiện trong sitemap (hreflang trên TRANG đó đã đúng từ `2448b7f`; chỉ việc sitemap CHỦ ĐỘNG liệt kê thêm URL đó là chưa làm). Đã cập nhật comment `sitemap.ts` cho khớp đúng ranh giới này (trước đó comment lẫn lộn "chưa có hreflang" với "chưa có trong sitemap" — hai việc khác nhau, nay đã tách).

### Điểm 5 — Rà bảo mật có phạm vi (20/10/2026, OWASP ASVS tham chiếu, review mã tĩnh — KHÔNG quét/dò trên production) — 1 lỗi thật ĐÃ SỬA, còn lại PASS

**6/7 mục PASS, xác nhận qua code, không chỉ suy đoán:** IDOR — mọi route đọc/ghi bản nháp (job/BĐS translations, places description/name/short-description) đều kiểm đúng chủ sở hữu hoặc quyền kiểm duyệt ở TẦNG SERVICE, không chỉ ẩn nút phía client. Rò rỉ response công khai — đã re-test đúng lớp lỗi "EN overlay lộ RichDoc tiếng Việt" đã biết, xác nhận KHÔNG tái diễn ở bất kỳ module nào (job/BĐS/place đều set `null` tường minh cho field rich không thuộc locale đang phục vụ). CAS — `expected_content_version`/`expected_vi_id`/`expected_en_id` không bị nới lỏng bởi các thay đổi rich-text (field rich chỉ "đi nhờ" trong cùng payload đã có CAS). Validate RichDoc đầu vào — mọi DTO nhận RichDoc từ client đều có `@ValidateIf/@IsObject/@IsRichDoc`; `validateRichDoc()` có allowlist scheme href (chặn `javascript:`), giới hạn kích thước/bảng. Quyền server-side trên route admin/moderation — xác nhận qua chính decorator `@RequirePermissions` trên controller, không chỉ quy ước route phía client. Log — không còn `console.log` debug nào sót lại (đã dọn `ProseSegmentEditor.tsx`), không log token/mật khẩu/nội dung thừa.

**1 lỗi thật ĐÃ SỬA (commit `404c4a7`):** `validateRichDoc()` chỉ giới hạn kích thước CHUNG của RichDoc (200k ký tự), không biết giới hạn RIÊNG của cột plain đích (`description` varchar(4000), `requirements`/`benefits` varchar(2000), `utilities_note`/`legal_status_note` varchar(500)) — một RichDoc hợp lệ (dưới 200k) vẫn có thể flatten ra chuỗi dài hơn cột cho phép, trước đây vượt qua mọi kiểm tra tầng ứng dụng rồi vỡ ở Postgres thành lỗi driver thô (500, lộ tên cột/kiểu dữ liệu) thay vì 400 sạch. Sửa: `applyRichTextField()` nhận thêm `maxPlainLength` (đúng giá trị `@MaxLength` đã khai cho field plain cùng tên), chặn SỚM bằng `BadRequestException` trước khi chạm entity/DB. Không ảnh hưởng places (cột `text` không giới hạn, không có nguy cơ vỡ DB — vẫn chưa có giới hạn độ dài nào, nhưng đó là tình trạng ĐÃ CÓ TỪ TRƯỚC khi thêm rich text, không phải lỗi mới).

**Dependency editor:** Tiptap `^3.32.0` (reasonably current), không có `dangerouslySetInnerHTML` nào trong toàn bộ `rich-doc`/`place-inline-edit`/job/real-estate modules — renderer dựa hoàn toàn vào JSX tự escape + allowlist href đã validate lúc lưu, `rel="noopener noreferrer nofollow"`/`target` gắn cứng lúc RENDER (không chỉ lúc lưu).

**Kiểm cuối đợt điểm 1-5 (20/10/2026):** 789 test API + 622 test Web (toàn bộ module đã chạm: job-listings/real-estate-listings/place-translations/places/rich-doc/common) đều pass. 1 lỗi e2e thật tìm thấy VÀ sửa qua chính lần chạy full suite: test "lương là dữ kiện quan trọng" (viết trong lượt trước) đổi lương fixture dùng chung nhưng quên khôi phục, làm lộ ra một test khác chạy sau nó — đã sửa (commit `1e54227`).

### Làm rõ 5 suite e2e còn lỗi (đối chiếu từng cái bằng commit/ngày đã làm lệch, không chỉ "không chạm file") — KHÔNG có lỗi nào do lượt này gây ra, 0 cần sửa trước release

Phân tích TỪNG suite bằng root cause cụ thể (không dùng "git log không chạm file" làm bằng chứng DUY NHẤT — đã lần đúng commit/ngày làm DTO/response/seed lệch khỏi test, xác nhận khoảng cách THỜI GIAN rõ ràng với lượt hôm nay 20/10/2026):

| Suite | Lỗi cụ thể | Nguyên nhân trực tiếp | Loại | Tác động release |
|---|---|---|---|---|
| `tour-details-patch-semantics.e2e-spec.ts` | Lỗi BIÊN DỊCH TypeScript (test suite không chạy được) | `UpdateTourDetailsDto.expected_content_version` thành bắt buộc từ commit `be3b140` (CAS cho tour details) — test gọi `updateDetails()` thiếu field này, CHƯA TỪNG được cập nhật từ đó | Lỗi test (bitrot) | Không — module tours không nằm trong phạm vi lượt này, không build/deploy tours hôm nay |
| `content-owner-self-approve.e2e-spec.ts` | 10/18 test fail: mọi `POST /places/:id/{description,name,short-description}/draft` VÀ `/places/:id/draft` (scalar) trả 400 thay vì 201 | `expected_vi_id`/`expected_en_id`/CAS token bắt buộc từ commit `b699302` (**2026-10-06**, 2 tuần trước) — test gửi `{vi, en}`/`{address}` không kèm, bị chặn ở `saveFieldDraftIfCurrent()`. Xác nhận bằng đọc trực tiếp DTO + lần đúng commit làm lệch | Lỗi test (bitrot) | Không — route places draft CAS ĐÃ hoạt động đúng (chính route này được gọi hàng trăm lần thành công trong các test MỚI hôm nay — `places.service.spec.ts`/browser thật trên Novotel) |
| `authz-scoped-pep-rollout.e2e-spec.ts` | 2 lỗi riêng: (a) `PATCH /hotels/:id/rooms`/`PATCH /restaurants/:id/menu` trả 400 thay vì 200; (b) `afterAll` cleanup lỗi FK `audit_logs_actor_id_fkey` khi xoá `users` | (a) `expected_content_version` thành bắt buộc cho hotel rooms từ commit `0f7ba30` (**2026-10-07**), test cuối cùng sửa `1043499` (**2026-09-22**, TRƯỚC đó) — cùng loại bitrot CAS. (b) cleanup code CHỈ xử lý FK `wiki_revisions.editor_id` (có comment giải thích rõ), KHÔNG hề nhắc tới `audit_logs` — một luồng ghi audit nào đó (không rõ chính xác, không phải job/real-estate/place-translations — ba module duy nhất tôi chạm) bắt đầu tạo `audit_logs` row cho các actor test này sau khi cleanup được viết, không ai cập nhật | Lỗi test (bitrot) × 2 | Không — hotels/restaurants rooms/menu CAS không nằm trong phạm vi lượt này |
| `place-contacts.e2e-spec.ts` | 2 lỗi contract (`version` xuất hiện trong response, test không ngờ) + cùng lỗi cleanup FK `audit_logs` như trên | Field CAS `version` được thêm vào response Contact từ commit `ab3e24b` (**2026-09-17**, hơn 1 tháng trước) — test file chỉ có DUY NHẤT 1 commit lịch sử (lúc tạo), chưa từng cập nhật theo field mới | Lỗi test (bitrot) × 2 | Không — module contacts không nằm trong phạm vi lượt này |
| `search-contract.e2e-spec.ts` | 2 lỗi đếm: kỳ vọng `total:20` cho query "bien", thực tế `total:22` | DEV DB cục bộ (dùng xuyên suốt nhiều lượt làm việc trong nhiều tuần) đã tích luỹ 280 place `published` — xa hơn hẳn một "seed cố định" mà comment test giả định. Xác nhận: **không migration nào trong 10 migration mới hôm nay (94→103) INSERT bất kỳ hàng `places` nào** (grep trực tiếp); test tự tính `expected` bằng truy vấn ĐỘNG vào CHÍNH DB hiện tại rồi lại so với số đếm GÕ CỨNG (20/7 trang) — mâu thuẫn tự thân, không phải logic sai | Dữ liệu môi trường (DB dev cũ, không phải hạ tầng/migration/sản phẩm) | Không — không phải lỗi migration, search API vẫn hoạt động đúng (phần "không rò rank nội bộ" — mục đích chính của suite — vẫn pass 8/10) |

**Kỷ luật đã theo:** không dùng DB hiện tại (đã nâng cấp lên 103 migration, đã tích luỹ dữ liệu nhiều tuần) làm "baseline" — mọi kết luận trên dựa vào ĐỌC TRỰC TIẾP mã nguồn/DTO/migration + `git log`/`git show` lần đúng COMMIT và NGÀY cụ thể làm từng test lệch khỏi API, không chỉ suy luận "không thấy ai chạm file này". Không sửa 5 file test này trong lượt này — đều là bitrot test có TỪ TRƯỚC lượt hôm nay ít nhất 2 tuần (gần nhất `0f7ba30`/`b699302`, 6-14/10), xa nhất hơn 1 tháng (`ab3e24b`, 17/9) — không nằm trong 4 module đã sửa/thêm hôm nay (job_listings/real_estate_listings/place_translations/places' mô tả dài). Không có lỗi migration, quyền, dữ liệu hay luồng đang phát hành nào trong 5 suite này.

---

## 0. Đã xác nhận (owner, 16/10/2026) — không yêu cầu làm lại

- **Novotel:** giờ nhận/trả 15:00/12:00 + địa chỉ đã lưu, đọc lại public đúng.
- **Bãi Sao:** mô tả ngắn/dài VI/EN đã kiểm public đúng; Google Place ID xác nhận, link VI/EN đúng, không còn nút toạ độ tham khảo. **Đóng mục bản đồ + mô tả Bãi Sao.**
- **Chùa Hộ Quốc:** Place ID xác nhận, public VI/EN dùng đúng ID. Toạ độ nội bộ **vẫn `10.115, 104.035`** — chưa chỉnh sang điểm hồ sơ Google `10.11013, 104.0288896` (việc riêng, xem §2 dưới).
- **Ra Khơi:** đã có ảnh menu thật do nhà hàng cung cấp, owner xác nhận đúng cơ sở và cho đăng. Đã trích được nhóm **tôm sú — 150.000 VND**; đơn vị và ngày áp dụng **chưa xác nhận**. Trạng thái: **có dữ liệu nguồn, chưa nghiệm thu lưu menu** (chưa thao tác lưu qua dashboard) — không kiểm log/DB lặp khi chưa có thao tác mới.

---

## 1. Nghiệm thu "góp ý có phản hồi" — đề xuất có căn cứ, SẴN SÀNG owner gửi

**Hệ thống thật** (không phải `listing-reports`): bảng `place_edit_proposals`, 3 field cho phép `opening_hours`/`address`/`short_description` (KHÔNG hỗ trợ toạ độ — đúng giới hạn owner lường trước, chọn nội dung khác). Luồng: gửi (`PlaceEditProposal.Create`, role `member`) → hàng chờ `/dashboard/edit-proposals` (`PlaceEditProposal.Moderate`, role `moderator`+`content_owner`) → quyết định approve/reject/needs_changes → người gửi xem ở `/dashboard/my-proposals` → approve ghi thẳng qua `PlacesService.update()` (CAS theo `content_version`, phát hiện conflict nếu dữ liệu gốc đổi giữa chừng) → cache invalidate ngay sau commit.

**1.1 Bằng chứng đã đọc (đủ rõ — không phải suy đoán):**
- Đúng hồ sơ: URL mang chính Place ID đã xác nhận `ChIJCzimRUaRpzER1jlvynsq6ko` (`.../place/Hộ+Quốc+Temple/@10.11013,104.0288896,...!1s0x31a7914645a6380b:0x4aea2a7bca6f39d6...`).
- Bấm mở rộng khối giờ mở cửa (ban đầu chỉ hiện dòng tóm tắt "Closed · Opens 6 AM Sat") → hiện **đủ bảng 7 ngày**: Thứ Sáu/Bảy/Chủ Nhật/Hai/Ba/Tư/Năm đều **"6 AM–6 PM"**, không có ngày nào khác hay ngoại lệ.
- Thời điểm đọc: trong phiên làm việc này, ngày 16/10/2026 (giờ hệ thống không ghi trong trang, chỉ có ngày).

→ Bằng chứng đủ rõ cho cả 7 ngày — KHÔNG phải trường hợp "chưa đủ, giữ chưa xác nhận".

**1.2 Đề xuất — Chùa Hộ Quốc, trường `opening_hours`:**

| | Hiện có | Đề xuất |
|---|---|---|
| `opening_hours` | `null` | `{"timezone":"Asia/Ho_Chi_Minh","regular":{"mon":[{"open":"06:00","close":"18:00"}],"tue":[{"open":"06:00","close":"18:00"}],"wed":[{"open":"06:00","close":"18:00"}],"thu":[{"open":"06:00","close":"18:00"}],"fri":[{"open":"06:00","close":"18:00"}],"sat":[{"open":"06:00","close":"18:00"}],"sun":[{"open":"06:00","close":"18:00"}]}}` |

**Các bước owner thực hiện (đúng tên nút thật, đọc từ mã nguồn):**
1. Mở `https://phuquochub.com/vi/places/chua-ho-quoc` → bấm **"Đề xuất chỉnh sửa"** (dưới "Thấy thông tin cần cập nhật?").
2. Ở `/dashboard/places/edit-proposals`, chọn trường **"Giờ mở cửa"**, nhập 06:00–18:00 cho cả 7 ngày.
3. **"Lý do đề xuất"** (owner chốt lại 17/10/2026, đúng nguyên văn): "Giờ hiển thị trên hồ sơ Google Maps, đọc ngày 16/10/2026: 06:00–18:00 tất cả các ngày. Đây không phải xác nhận trực tiếp của đơn vị quản lý chùa."
4. **"Link nguồn tham khảo"**: `https://maps.app.goo.gl/ifvzNQ5RF3ydw6QUA`
5. Bấm **"Gửi đề xuất"** → màn hình xác nhận "Đề xuất đã được gửi và đang chờ xem xét".
6. Mở `/dashboard/edit-proposals` → xem diff "Hiện tại: null" / "Đề xuất: …" → chọn **"Duyệt — áp dụng ngay"** (có thể ghi "Phản hồi cho người gửi", tuỳ chọn) → **"Xác nhận: Duyệt — áp dụng ngay"**.
7. Kiểm `/dashboard/my-proposals` → trạng thái đổi thành **"Đã áp dụng"**.
8. Kiểm `opening_hours` ghi vào `places` (đọc qua dashboard edit hoặc DB) — **KHÔNG giả định public đã đổi**, xem 1.3.

Tôi chưa tự gửi/duyệt/publish gì. Không tạo góp ý giả — đây là dữ liệu thật, nguồn ghi đúng là "giờ hiển thị trên hồ sơ Google Maps", không gọi là xác nhận của chùa.

**1.3 Kiểm contract trước khi hứa public đổi — "Duyệt — áp dụng ngay" KHÔNG đủ để giờ hiện public:**

Đọc `PlacesService.getBySlug()` ([`places.service.ts:307-316,349`](../../apps/api/src/modules/places/places.service.ts)): route công khai chỉ trả `opening_hours` thật nếu `hasCurrentQualifiedOpeningHoursEvidence(place_id, opening_hours)` đúng — cần một **evidence row hiện hành, đã duyệt, khớp hash giá trị** qua cơ chế riêng (`/places/:id/opening-hours-evidence`, workflow khác hẳn edit-proposals). Đọc `PlaceEditProposalsService.decide()` ([`place-edit-proposals.service.ts:27-28`](../../apps/api/src/modules/place-edit-proposals/place-edit-proposals.service.ts)): approve **chỉ ghi `places.opening_hours`** qua `update()` — comment nói rõ "không tự nâng evidence/place thành VERIFIED". Không có cầu nối tự động giữa hai cơ chế.

→ **Tách hai sự kiện, không gộp:**
- **"Góp ý đã được áp dụng"** — đúng sau bước 6/7, `places.opening_hours` đã đổi, `/dashboard/my-proposals` hiện "Đã áp dụng".
- **"Giờ đã đủ điều kiện hiển thị public"** — KHÔNG đảm bảo theo luồng trên. Cần nộp bằng chứng riêng qua quy trình opening-hours-evidence (`/dashboard/places/<id>/opening-hours-evidence`) và được duyệt, thì public mới hiện giờ thay vì ẩn (`null`). Nếu owner muốn giờ hiện công khai ngay, cần làm thêm bước này sau khi áp dụng góp ý — tôi chưa chuẩn bị chi tiết luồng evidence trong lượt này, báo nếu cần.

**1.4 Nghiệm thu tự gửi/tự duyệt — phạm vi thật của phép thử:**

Owner tự gửi rồi tự duyệt (cùng tài khoản content_owner, giữ cả `PlaceEditProposal.Create` và `.Moderate`) kiểm được **đúng vòng thao tác quản trị** (submit → diff hiện đúng → apply → CAS/conflict hoạt động) — không thay thế việc kiểm ranh giới quyền giữa HAI tài khoản khác nhau (member gửi, không tự duyệt được). Ranh giới đó **đã được kiểm** trong bộ test cô lập `place-edit-proposals.e2e-spec.ts` (case "member gửi được đề xuất nhưng KHÔNG xem/duyệt được hàng đợi — 403"), chạy trên DB test riêng, không tạo tài khoản production nào mới. Không cần lặp lại việc này bằng tài khoản thật.

---

## 2. Hàng chờ địa điểm

### 2.1 Chùa Hộ Quốc — đổi toạ độ (việc RIÊNG với Place ID, CHƯA ghi)

Place ID giữ nguyên, không đụng. Đường ghi: form "Lưu thay đổi" (PlaceForm, có CAS theo `content_version`) tại `/dashboard/places/6a9dee6c-957a-4af7-ac5d-e703bb566abf/edit` — mục **"Vĩ độ (lat)"**: `10.115` → `10.11013`; **"Kinh độ (lng)"**: `104.035` → `104.0288896`. Các trường khác trong form (category/address/ward/opening_hours/price_range) đã điền sẵn đúng giá trị hiện có — không sửa. Nguồn: cùng hồ sơ Google đã xác nhận ở trên. Bấm **"Lưu thay đổi"** để ghi (owner tự làm).

### 2.2 Ra Khơi — nhập món thật đã có bằng chứng (ảnh menu nhà hàng cung cấp)

**Dữ liệu đã có:** món "Tôm sú", giá 150.000 VND; **đơn vị và ngày áp dụng chưa xác nhận** — để trống hai ô này (không bịa).

Tại `/dashboard/places/<id-ra-khơi>/edit`, mục "Thực đơn" (`MenuEditor`):
1. **"Mục"**: chọn "+ Mục mới…" → **"Tên mục mới"**: ví dụ "Hải sản" (hoặc tên owner muốn).
2. **"Tên món"**: `Tôm sú`.
3. **"Giá (VND)"**: `150000`. **Để trống** "Đơn vị" và "Ngày ghi nhận giá" (chưa xác nhận).
4. **"Nguồn giá — tiêu đề"**: "Ảnh menu Ra Khơi (nhà hàng cung cấp, owner xác nhận)". **"Nguồn giá — URL"**: để trống nếu ảnh chỉ tải lên hệ thống, không có URL công khai.
5. Bấm **"Thêm vào bản nháp"** → món hiện ngay trong danh sách phía trên ("Tôm sú — 150.000 VND (chưa rõ đơn vị), chưa rõ ngày ghi nhận") — **kiểm đúng trước khi lưu**.
6. Bấm **"Lưu thực đơn"** để ghi thật (CAS theo `content_version`).

Ảnh menu (nếu muốn hiện trên trang) tải riêng qua **"Quản lý ảnh"** (`/dashboard/places/<id>/photos`) — khác màn hình Thực đơn, không có ô tải ảnh trong `MenuEditor`. Owner tự thao tác; tôi chưa ghi gì.

### 2.3 Novotel/Bãi Sao — danh sách còn thiếu (giữ nguyên, không có nguồn mới)

- Novotel: ảnh (hiện có 1), chính sách huỷ phòng (tóm tắt thiếu đoạn cuối), Google Place ID (`null`, chờ owner cấp link map thật).
- Bãi Sao: ảnh, đường vào cụ thể, bãi đỗ xe, chi phí dịch vụ — chưa có nguồn, chỉ bổ sung khi owner cung cấp.
- Ra Khơi: liên hệ/ảnh/giờ/nguồn vẫn thiếu (xem §0).

---

## 3. Tuyển dụng & bất động sản — 2 phiếu thu thập tin thật (tái dùng §39)

Quyền duyệt (`JobListing.Moderate`/`RealEstateListing.Moderate`) do chính role `content_owner` giữ — owner tự làm được toàn bộ vòng đời một mình, không cần người khác duyệt. Chưa có tin thật không chặn việc hoàn thiện hướng dẫn này — bàn giao mẫu, chuyển việc độc lập khác.

### 3.1 Phiếu — Tin tuyển dụng

| Nhóm | Trường | Ghi chú |
|---|---|---|
| **Bắt buộc (schema)** | `employer_name`, `title`, `job_category` (tự do), `work_location`, `employment_type` (full_time/part_time/seasonal), `contact_method`+`contact_value` | Thiếu 1 trong số này → không gửi được |
| **Cần để tin hữu ích** | lương (`salary_min`/`max`/`currency`/`period`, để trống = thoả thuận), `shift_info`, `requirements`, `benefits`, `description` | Không bắt buộc nhưng thiếu thì tin kém hữu ích |
| **Bổ sung sau** | `salary_negotiable`, `expires_at`, `place_id` liên kết địa điểm | Có thể sửa sau khi đăng |

**Vòng đời:** `/dashboard/job-listings/new` (**"Lưu nháp"**/"Lưu thay đổi") → `/dashboard/job-listings` (**"Gửi duyệt"**) → `/dashboard/job-listings/moderation` (**"Duyệt — đăng công khai"**/"Từ chối") → công khai `/vi/jobs` → **"Đóng tin"**/"Mở lại (cần duyệt lại)".

### 3.2 Phiếu — Tin bất động sản (thuê/bán)

| Nhóm | Trường | Ghi chú |
|---|---|---|
| **Bắt buộc (schema)** | `poster_role` (owner/broker, tự khai), `transaction_type` (rent/sale), `property_type` (room/apartment/house/land/retail), `title`, `contact_method`+`contact_value` | Thiếu 1 trong số này → không gửi được |
| **Cần để tin hữu ích** | giá, diện tích, địa chỉ/khu vực, mô tả, ảnh (cần quyền sử dụng thật — hệ thống không xác minh quyền ảnh) | Không bắt buộc nhưng thiếu thì tin kém hữu ích |
| **Bổ sung sau** | `expires_at`, chỉnh sửa chi tiết sau khi đăng | — |

**Vòng đời:** `/dashboard/real-estate/new` → `/dashboard/real-estate` (**"Gửi duyệt"**) → `/dashboard/real-estate/moderation` → công khai `/vi/real-estate` → **"Đóng tin"**/"Mở lại".

Chưa có tin thật — chờ owner cung cấp dữ liệu khi sẵn sàng. Không tạo tin giả, không nhập fixture production.

---

## 4. Backlog sau release — CHƯA XÂY, chỉ ghi hướng đi (owner yêu cầu điểm 7/8, 20/10/2026)

### 4.1 Luồng "Gửi câu hỏi/yêu cầu" — ưu tiên MỘT, cho nhóm người đăng thử nghiệm

**Đã rà hệ thống có sẵn, không trùng:** `place_edit_proposals` (sửa DỮ LIỆU place qua duyệt — khác mục đích/quyền, KHÔNG ép thành tin nhắn, đúng owner chốt). `listing_reports` (báo sai/trùng MỘT CHIỀU, không có hội thoại qua lại). `contacts` (chỉ hiển thị SĐT/email tĩnh của place, không phải kênh gửi). `business_claims`/`business_managers` (apps/api/src/modules/business/) — ĐÂY mới là mô hình "người nhận có kiểm quyền rõ" cho PLACE: một place có quản lý doanh nghiệp đã xác minh (`business_members`) mới có người nhận hợp lệ. Không có module nào sẵn phù hợp để tái dùng trực tiếp — cần module mới, nhưng quyền/người nhận dựa trên hạ tầng ĐÃ CÓ (business_members cho place; `job_listings.created_by`/`real_estate_listings.created_by` cho tin tuyển dụng/BĐS — người nhận đã rõ ràng, không cần hạ tầng mới).

**Thiết kế tối thiểu (chưa code):**
- Entity mới `listing_inquiries` (hoặc tên tương đương): `target_type` ('place'|'job_listing'|'real_estate_listing') + `target_id`, `sender_id`, `recipient_id` (suy từ business_members cho place, created_by cho job/BĐS — snapshot tại thời điểm gửi, không suy lại động), `message`, `status` ('sent'|'replied'|'resolved'|'closed'), lịch sử trả lời (bảng con hoặc JSON mảng có mốc thời gian).
- **Nút gửi CHỈ hiện khi có người nhận hợp lệ** — place chưa có business_members xác minh → ẩn nút (đúng yêu cầu "không mở nút nếu không có bên tiếp nhận phù hợp"), không hiện nút rồi báo lỗi sau khi bấm.
- Nội dung riêng mặc định (chỉ sender/recipient/moderator đọc được) — permission mới hoặc tái dùng pattern `Review.Any`-style đã có cho kiểm duyệt khi cần can thiệp tranh chấp.
- Báo spam/chặn: tái dùng pattern `listing_reports` (report một inquiry) + rate limit theo sender (đếm số inquiry trong cửa sổ thời gian, chặn khi vượt — cùng nhóm cơ chế rate-limit auth hiện có, xem `apps/api/src/core` nếu có sẵn).
- **"Đặt lịch/giữ chỗ" KHÔNG tự suy ra từ gửi yêu cầu** — chỉ khi recipient tự xác nhận một hành động rõ ràng (trường `confirmed_at`/`confirmed_by` riêng), tin nhắn một mình không bao giờ coi là đã đặt lịch.

### 4.2 Sau khi 4.1 vận hành thật mới làm: lưu tìm kiếm, theo dõi cập nhật, thông báo tuỳ chọn, AI hỗ trợ

AI (khi tới lượt) CHỈ hỗ trợ tìm/tóm tắt/dịch nháp/gợi ý trả lời — không tự nâng trust, không tự duyệt tin, không tự xác nhận giao dịch (đúng giới hạn owner chốt, khớp nguyên tắc GOVERNANCE HARDENING đã dùng cho place_translations: mọi ghi nội dung do AI vẫn phải qua người duyệt).

### 4.3 Dashboard "việc cần xử lý" — dựa trên hàng chờ ĐÃ CÓ, không thêm thống kê trang trí

Hàng chờ thật đã tồn tại, chỉ cần MỘT màn hình tổng hợp (không phải xây mới từng cái):
- Tin chờ duyệt: `GET /job-listings/pending`, `GET /real-estate-listings/pending`, `GET /place-edit-proposals` (moderation queue có sẵn).
- Bản dịch chờ duyệt/stale: `GET /job-listings/translations/en/pending`, `GET /real-estate-listings/translations/en/pending`; "stale" suy từ `is_translation_stale`/`translation_hidden_reason` đã có trên response công khai, CHƯA có một truy vấn liệt kê "mọi bản dịch đang stale" cho owner — đây là phần MỚI cần thêm (một query đơn giản, không phải tính năng lớn).
- Báo sai: `GET /listing-reports` (đã có, `listing-reports` module).
- Tin hết hạn: đã có field `expires_at` + `listingEffectiveStatus()` (web, `MyJobListingsView`/`AdminJobListingsView` dùng), chỉ cần lọc qua đúng hàm có sẵn.
- Yêu cầu chưa phản hồi: phụ thuộc 4.1 tồn tại trước — CHƯA CÓ nếu 4.1 chưa xây.

Mỗi việc cần người phụ trách + mốc thời gian + lịch sử — `wiki_revisions`/`moderation_cases` đã có cơ chế audit tương tự, tái dùng pattern đó thay vì tạo bảng audit riêng.

**Chỉ số đo (events KHÔNG chứa nội dung tin nhắn/SĐT/email thô — chỉ id + loại sự kiện + mốc thời gian):**
- Tỷ lệ yêu cầu được phản hồi, thời gian phản hồi — tính từ `listing_inquiries.status`/mốc thời gian (phụ thuộc 4.1).
- Tỷ lệ người dùng xác nhận đã giải quyết — tính từ `status='resolved'` do SENDER tự đặt (không phải recipient tự nhận đã xong), tránh tự chấm điểm.
- Tỷ lệ tin còn chính xác — có thể suy một phần từ tần suất `listing_reports` trên cùng tin / thời gian từ lần duyệt gần nhất, chưa có số liệu thật để định nghĩa ngưỡng cụ thể.
- Lượt tìm kiếm dẫn tới hành động hữu ích — cần một sự kiện "search → click → hành động" chưa có hạ tầng đo lường nào hôm nay, phải thiết kế riêng khi tới lượt.

Không triển khai mục 4 trong lượt này — chỉ ghi lại để owner duyệt hướng trước khi bắt đầu.

### 4.4 Định hướng Tuyển dụng — "đúng việc, liên hệ được, biết còn tuyển" (owner đề xuất 20/10/2026, CHƯA XÂY)

Mục tiêu owner chốt: giúp người lao động tìm đúng việc tại Phú Quốc, liên hệ được người tuyển, biết tin còn tuyển hay không. Trước mắt hoàn thiện bằng tin thật — CHƯA xây hệ thống CV/chat riêng.

**Cấu trúc tin chuẩn đề xuất:** Tiêu đề (Vị trí — Tên cơ sở) · thông tin đầu trang (nơi làm, toàn/bán thời gian, lương, số lượng) · ca làm (không tự suy khi chưa rõ) · công việc (danh sách ngắn) · yêu cầu · quyền lợi (chỉ ghi điều đã cung cấp) · nút liên hệ nổi bật · tình trạng (còn tuyển/hết hạn/ngày cập nhật). Đậm/danh sách/bảng phục vụ việc đọc nhanh — không ép mọi tin phải có bảng.

**Một tin = một vị trí.** Tin "Pha chế" (Sealight) hiện mô tả cả 5 vị trí — về lâu dài nên tách thành 5 tin liên kết cùng cơ sở ("Các vị trí khác đang tuyển tại Sealight"). **CHƯA tự tách/đổi tin đang công khai** — cần owner xác nhận từng vị trí còn tuyển + hình thức làm việc cụ thể trước (nhãn "Full-time/Part-time" chung không đủ để gán cho mọi vị trí). Rooty Trip cũng tách theo vị trí, xác nhận riêng nơi làm là Phú Quốc hay TP.HCM cho từng tin — không mặc định.

**VI/EN là bản dịch CÙNG một tin, một ID** (đúng mô hình `job_listing_translations`/`real_estate_listing_translations` đã có) — chung số lượng/lương/ca làm/địa chỉ/liên hệ/hạn tuyển, dịch riêng tiêu đề/công việc/yêu cầu/quyền lợi, không thêm nội dung khi dịch (khớp đúng kỷ luật đã áp dụng khi dịch tin Sealight hôm nay). Tin chưa có EN vẫn phục vụ người đọc VI — không cần chờ dịch mới đăng (đã đúng hành vi hiện tại). Với Sealight: chốt phạm vi tin VI (tách hay giữ nguyên) TRƯỚC khi dịch, tránh tiêu đề EN hẹp hơn mô tả.

**Vòng đời + màn hình admin (đề xuất, CHƯA chốt):**
| Tình huống | Xử lý |
|---|---|
| Đang tuyển | Hiện công khai đến hạn đã chọn |
| Tuyển đủ | Người đăng bấm "Đã tuyển đủ / Đóng tin" (tái dùng `close()` đã có) |
| Hết hạn | Ngừng hiện trong danh sách tìm việc; vẫn giữ trong dashboard (đã đúng hành vi hiện tại) |
| Muốn tuyển tiếp | Cập nhật tin + hạn mới, gửi duyệt lại (tái dùng `submit()`/`decide()` đã có) |
| Tin cũ | Lưu trữ để tra cứu/dùng lại |
| Tin rác/trùng | Admin xử lý theo quyền; không tự xoá mọi tin hết hạn |

Hạn mặc định đề xuất 30 ngày (chọn được ngày khác) — **đây là đề xuất chính sách, chưa phải hành vi đã triển khai**, không tự áp dụng. Màn hình admin ưu tiên 4 nhóm: chờ duyệt/sắp hết hạn/đã hết hạn/bị báo cáo — tái dùng đúng các hàng chờ đã liệt kê ở §4.3, không phải xây mới. Thao tác đóng/mở lại cần lưu người thực hiện + thời điểm — **đây chính là gap audit actor đã ghi nhận ở "Đối chiếu điểm 3"** (`close()`/`reopen()` chưa ghi actor), không phải việc mới — ưu tiên sửa gap đó TRƯỚC khi xây màn hình admin dựa vào nó.

**Tương tác thật (phụ thuộc §4.1 "Gửi câu hỏi/yêu cầu" đã thiết kế ở trên, dùng lại hạ tầng đó thay vì xây luồng riêng):** người tìm việc báo "không liên hệ được"/"đã tuyển đủ" → nhà tuyển dụng xác nhận "vẫn đang tuyển" → admin xử lý tin cần can thiệp + phản hồi người báo. **Phân biệt rõ "đã xác nhận liên hệ" (sender/recipient trao đổi được) với "đã xác minh doanh nghiệp" (`business_members` xác minh qua hồ sơ) — không dùng chung một dấu xác minh cho cả hai**, đúng nguyên tắc đã áp dụng cho place (trust badge theo ĐÚNG phạm vi claim, không mượn badge của claim khác).

---

## BÀN GIAO NGẮN

| Hạng mục | Kết quả mới | Còn thiếu | Owner cần làm |
|---|---|---|---|
| Góp ý có phản hồi | Bằng chứng 7 ngày xác nhận đủ rõ; đề xuất + 8 bước soạn sẵn; **phát hiện contract**: approve KHÔNG tự làm giờ hiện public (gate evidence riêng); ranh giới quyền 2 tài khoản đã có test cô lập, không cần tài khoản thật | Owner gửi+duyệt; nếu muốn giờ hiện public cần thêm bước evidence riêng (chưa chuẩn bị) | §1, 8 bước + đọc kỹ 1.3 trước khi kỳ vọng public đổi |
| Toạ độ Chùa Hộ Quốc | Thay đổi đã xác định rõ, tách khỏi Place ID | Owner tự ghi qua PlaceForm | §2.1 |
| Menu Ra Khơi | **Có dữ liệu thật** (Tôm sú — 150.000 VND, nguồn ảnh owner xác nhận); hướng dẫn 6 bước cụ thể | Owner thao tác lưu qua dashboard | §2.2 |
| Tuyển dụng/BĐS | 2 phiếu thu thập tách bắt buộc/nên có/bổ sung sau, vòng đời đầy đủ | Tin thật đầu tiên | §3.1/3.2, owner cung cấp khi sẵn sàng |

Không sửa code/build/deploy, không ghi/publish production trong lượt này.
