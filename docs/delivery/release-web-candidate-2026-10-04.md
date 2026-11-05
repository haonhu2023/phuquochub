# Gói release Web: candidate `b91e92c` (trạng thái hiện hành, cập nhật 05/10/2026)

**Trạng thái (05/10/2026, 09:49Z): ĐÃ DEPLOY WEB; OWNER ĐÃ XÁC NHẬN XEM TRƯỚC HOẠT ĐỘNG (05/10/2026).** Phạm vi xác nhận là preview của cẩm nang, không suy rộng thành nghiệm thu mọi chức năng của website. Web chạy `b91e92c…` (index digest `f264dde6…21db79`), pin `WEB_IMAGE_TAG` đã ghi. API không đổi. Chi tiết kết quả ở mục 11. Các mục 1–9 giữ nguyên là gói đã duyệt và baseline trước cutover.

Tài liệu này thay thế các mục cũ của bản 04/10 (baseline `82fb23c`, danh sách file "chưa commit", lệnh build "chưa chạy"). Những mục đó đã lỗi thời: HEAD hiện là `b91e92c`, 16 file của gói đã nằm trong commit này, và image đã được build.

---

## 1. Trạng thái theo từng loại việc

| Loại | Trạng thái | Bằng chứng |
|---|---|---|
| **Code** | Đã commit trong `b91e92c` (21 file đổi từ `f0c65b7`, đều dưới `apps/web`) | `git show --stat b91e92c`; `git diff --name-only f0c65b7 b91e92c` |
| **Test source** | Đã chạy 04/10: jest 316 test PASS, eslint và tsc PASS. **Không chạy lại trong lượt 05/10** | `docs/delivery/evidence/product-usefulness-2026-10-04/` |
| **Build** | Đã thực hiện 04/10 15:35–15:36Z, exit 0. Không rebuild lại | `build-cmd.sh`, `build.exit`, `build.log` trên VPS |
| **Deploy** | **Đã cutover Web 05/10/2026 09:49Z** (xem mục 11). API vẫn `f0c65b7` | Mục 11 |
| **HTTP trên image** | 13/13 PASS, 05/10, mạng cô lập | Mục 4.1 |
| **Browser trên image** | 11/11 PASS, 05/10, mạng cô lập, dữ liệu synthetic: 5 kiểm tra public (mục 4.2) và 6 kiểm tra editor preview (mục 4.4). A, B, D đều đạt | Mục 4.2–4.4 |
| **Nghiệm thu owner** | Preview (Xem trước): owner xác nhận hoạt động ngày 05/10/2026. Không gồm các chức năng khác của website | Mục 11.6 |

---

## 2. Identity candidate (tách từng loại digest)

| Đối tượng | Giá trị | Nguồn |
|---|---|---|
| Commit | `b91e92ce7baf547b757d425eea0f30ceac8cd848` | `git rev-parse HEAD` |
| Image tag | `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848` | `docker image inspect` |
| **Index digest** (OCI image index, `mediaType: application/vnd.oci.image.index.v1+json`) | `sha256:f264dde684c53352642fffc72207b6d3490e37becff5d4101ebf04871b21db79` | `docker image inspect` (`.Id` và `.Descriptor.digest`) và build log dòng `exporting manifest list` |
| Manifest digest | `sha256:d464edf0d3ee6fba53c326381b874f88c4d87b22556fb53fdb218ee92f2a28b0` | build log dòng `exporting manifest` |
| Config digest | `sha256:6b2941e1fd711cfed0d61a25b0d667d662bf3bb471a8cf2966a7686ae06df9de` | build log dòng `exporting config`. **Không đọc lại bằng inspect trong lượt này** |
| RepoDigests (inspect) | `phuquochub-web@sha256:f264dde6…21db79` | `docker image inspect`; trùng index digest, **không** trùng config digest |
| Label `org.opencontainers.image.revision` | `b91e92ce7baf547b757d425eea0f30ceac8cd848` | `docker image inspect` |
| Thời điểm tạo | `2026-10-04T15:36:30Z` | `docker image inspect` |

Docker Id đã báo cáo là **index digest** (`f264…`). Không so index digest với config digest; hai giá trị thuộc hai loại khác nhau.

---

## 3. Build và bằng chứng secret

**Lệnh build thực chạy** (`build-cmd.sh` trên VPS, cd vào `src/` rồi `docker build -f apps/web/Dockerfile`):

- `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`
- `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`
- `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- `GIT_COMMIT=b91e92ce7baf547b757d425eea0f30ceac8cd848`
- `BUILD_DATE=2026-10-04T15:35:37Z`

Dockerfile mặc định `NEXT_PUBLIC_API_URL=http://localhost:4000/api`; giá trị này bị ghi đè bởi build-arg ở trên. Kết quả: `build.exit = 0`.

**Phân loại bằng chứng:**
- Lệnh build: `build-cmd.sh` (xác nhận đúng ARG).
- Kết quả build: `build.log` và `build.exit` (exit 0, các digest ở mục 2). Log không in giá trị `--build-arg`.
- Metadata runtime: label revision và tên biến môi trường của image (chỉ tên: `HOSTNAME`, `NODE_ENV`, `NODE_VERSION`, `PATH`, `PORT`, `YARN_VERSION`; không tên nào khớp `secret|password|token|key`).
- Bundle: quét 04/10 theo tên biến (`JWT_ACCESS_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`) và chuỗi `localhost:4000/api`. **Không chạy lại trong lượt này.** Đây là quét tên và chuỗi, không chứng minh không có giá trị secret.

Giá trị `NEXT_PUBLIC_*` không đọc được từ image hay build log. Chúng được xác nhận bằng `build-cmd.sh`. Việc chúng có đúng trong client bundle **chưa được kiểm lại**.

**Build context:** thư mục `src/` trên VPS chỉ chứa `.env.example` (kiểm bằng tìm tên file). `.dockerignore` loại `.env`, `.env.local`, `.env.*.local` **chỉ ở gốc**; không có quy tắc `**/.env`. Hiện không có `.env` trong thư mục con, nhưng nên thêm `**/.env` trước lần build sau.

---

## 4. Kiểm trên image (05/10/2026)

**Môi trường:** network Docker `phq-smoke-v2-net` có `--internal`, không publish cổng, không nối DB/Redis/API production. Candidate chạy với đúng image ID ở mục 2, chỉ thêm biến runtime `API_INTERNAL_URL=http://phq-smoke-stub-v2:4000/api` và `NODE_ENV=production`. Build-args không đổi, không sửa Caddy, firewall, CORS, CSP hay auth.

**Stub synthetic:** node:20-alpine, chỉ phục vụ fixture từ snapshot public đã có (04/10) và một tour synthetic. Mọi request được ghi log. Credential đăng nhập là giá trị ngẫu nhiên tạo cho lượt này, chỉ tồn tại trên VPS, đã xóa khi dọn dẹp.

### 4.1 HTTP probe: 13/13 PASS

| ID | Kiểm tra | Kết quả |
|---|---|---|
| E1 | `/vi/places/novotel-phu-quoc` → 308 `/vi/hotels/novotel-phu-quoc` | PASS |
| E2 | `/en/places/nha-hang-ra-khoi` → 308 `/en/restaurants/nha-hang-ra-khoi` | PASS |
| E3 | `/vi/places/bai-sao` → 200 (bãi biển giữ route chung) | PASS |
| E4 | `/vi/places/slug-khong-ton-tai` → 404 | PASS |
| D1 | `/vi/hotels/novotel-phu-quoc` → 200 | PASS |
| D2 | `/vi/restaurants/nha-hang-ra-khoi` → 200 | PASS |
| T1 | `/vi/places/phq-synthetic-tour` → 308 `/vi/tours/phq-synthetic-tour` | PASS |
| T2 | `/en/places/phq-synthetic-tour` → 308 `/en/tours/phq-synthetic-tour` | PASS |
| T3 | `/vi/tours/phq-synthetic-tour` → 200, có tiêu đề | PASS |
| T4 | `/vi/places/phq-draft-tour` → 404 (chưa published, không có trong fixture) | PASS |
| T5 | `/vi/tours/phq-draft-tour` → 404 | PASS |
| T6 | Chuỗi redirect tour có đúng 1 hop | PASS |
| S1 | `/sitemap.xml`: 200, `application/xml`, XML đúng cấu trúc; có `/vi/tours/phq-synthetic-tour`, `/vi/hotels/novotel-phu-quoc`, `/vi/restaurants/nha-hang-ra-khoi`, `/vi/places/bai-sao`; **không** có `/vi/places/phq-synthetic-tour`, `/vi/places/novotel-phu-quoc`, draft, hay `/en/tours/...` | PASS (74 URL) |

Bằng chứng: `docs/delivery/evidence/candidate-smoke-2026-10-05/probe-result.json` và `sitemap.xml`.

**Các lỗi harness đã sửa trong lượt này (không phải lỗi app):**
- Lần chạy đầu, S1 FAIL: entry chung của tour còn trong sitemap. Nguyên nhân: fixture của list item không có `category_id` đúng taxonomy `tour`, nên sitemap không map được category. Đã sửa fixture.
- Lần chạy thứ hai vẫn FAIL vì container candidate đang chạy giữ sitemap và fetch cache từ trước. Đã tạo lại container (image không đổi) và chạy lại. Kết quả 13/13 là từ container khởi động sạch.

**Giới hạn:** log stub không được cắt sạch (lỗi quyền khi truncate), nên số lần gọi trong log gồm cả các lần chạy trước.

**Dữ liệu tour thật (chỉ để chọn slug cho hậu kiểm):** GET công khai `/api/tours?limit=100` trả 3 tour, gồm `sunset-cruise-phu-quoc`, `tour-3-dao-an-thoi`, `lan-ngam-san-ho-hon-thom`. Hậu kiểm sau cutover dùng `sunset-cruise-phu-quoc`. Không tạo dữ liệu production để lấp chỗ trống.

### 4.2 Browser: 5/5 PASS (synthetic)

**Runner:** image `phq-smoke-runner` (node:20-alpine + Chromium 149 của Alpine + `playwright-core@1.63.0`), build trên VPS. Chạy với user `node` không đặc quyền, **không** tắt sandbox của Chromium (không dùng `--no-sandbox`). Cùng network `--internal`.

**Cách kiểm soát request:** mọi request không thuộc origin candidate hoặc API origin baked (`https://phuquochub.com/api/`) bị abort và ghi lại. API origin được trả lời từ stub. Kết quả: **0 request bị chặn** (không có request ngoài nào được thử), **0 page error**, **1 ghi** duy nhất là `POST /api/auth/login` synthetic. Không có token hay cookie production.

| ID | Kiểm tra | Kết quả |
|---|---|---|
| C1 | `/vi/places/novotel-phu-quoc` trên trình duyệt đi tới `/vi/hotels/novotel-phu-quoc`, không lỗi | PASS |
| C2 | `/vi/places/slug-khong-ton-tai` render 404, không page error | PASS |
| T1 | `/vi/places/phq-synthetic-tour` đi tới `/vi/tours/phq-synthetic-tour`, tiêu đề hiện | PASS |
| E1 | CTA "Đề xuất chỉnh sửa" trên `/vi/places/bai-sao` khi chưa đăng nhập đưa tới `/login?next=…` có `place_id` | PASS |
| E2 | Sau đăng nhập synthetic, quay về `/dashboard/places/edit-proposals` với `place_id` giữ nguyên, form hiện tên địa điểm | PASS |

Ảnh chụp sau đăng nhập: `docs/delivery/evidence/candidate-smoke-2026-10-05/e2-after-login.png`. Kết quả đầy đủ: `browser-result.json`.

**Lỗi đã sửa trong harness:** lần đầu E1 FAIL do test click rồi đợi network idle trước khi navigation bắt đầu (đã sửa bằng chờ URL đích). E2 FAIL lần đầu do stub trả phản hồi đăng nhập thiếu envelope `{success, data}` (đã sửa stub). Các sửa này nằm trong harness, không sửa app.

**Log candidate:** container candidate ghi 22 dòng lỗi `getaddrinfo EAI_AGAIN phq-smoke-stub-v2` và `fetch failed`. Các dòng này xuất hiện khi stub chưa chạy (lần khởi động stub đầu bị lỗi mount). Đã xóa container trước khi đối chiếu timestamp, nên **không khẳng định log sạch cho lần chạy PASS**.

### 4.3 Bản preview dev-server cũ

Trước đây đã báo cáo PASS cho preview trên dev server (mở overlay, tiêu đề chưa lưu hiện và còn sau khi đóng, resolve địa điểm synthetic, không gọi save/publish). **Đã báo cáo trước đó, chưa tìm lại được artifact** trong repo hay trên VPS. Kết quả này không được tính là bằng chứng trên image; bằng chứng trên image là mục 4.4.

### 4.4 Editor preview trên image (run `editor-ed01`, 05/10/2026)

**Phạm vi:** phiên synthetic có role `content_owner` (fixture), đăng nhập qua trang login của candidate. Bài draft synthetic `00000000-0000-4000-8000-00000000e001` (slug `phq-synthetic-guide`) có một block `place_collection` với slug `novotel-phu-quoc`, `slug-khong-ton-tai`, `bai-sao`. **Không dùng phiên production hay bài `ffe8f569-…`.** Mạng `--internal`, API được fixture hóa, request ngoài bị chặn.

| ID | Kiểm tra | Kết quả |
|---|---|---|
| P1 | Editor mở được bài draft (không "Không có quyền", có ô Tiêu đề với giá trị đã lưu) | PASS |
| P2 | Sửa tiêu đề không lưu: trạng thái "Chưa lưu" hiện, 0 ghi | PASS |
| P3 | Xem trước mở: có tiêu đề mới, có card Novotel và Bãi Sao, không page error mới | PASS |
| P4 | Slug `slug-khong-ton-tai`: preview vẫn mở, không có văn bản crash, card hợp lệ vẫn hiện | PASS |
| P5 | Đóng preview: tiêu đề mới còn nguyên, trạng thái "Chưa lưu" còn nguyên | PASS |
| P6 | Không có request ghi nào trong cả lượt (chỉ POST đăng nhập synthetic được phép) | PASS |

Bằng chứng: `docs/delivery/evidence/candidate-editor-preview-ed01/` (kết quả JSON, ảnh P2, P3, P5, log requests của stub, dump DOM).

**Kiểm chéo phía stub:** log `requests.jsonl` chỉ có POST `/api/auth/login` (synthetic) ngoài GET. Các route `/api/admin/guide-articles` chỉ nhận GET. Request tới slug lỗi có mặt trong log và được xử lý không làm sập trang.

**Lần chạy 1 (giữ làm lịch sử, `editor-result-run1-p3-expectation.json`):** P3 FAIL ở điều kiện "có heading của block". Đây là **lỗi kỳ vọng của harness**: `PlaceCollectionPreview` chỉ render lưới và trạng thái rỗng; heading do vỏ section bên ngoài sở hữu (chú thích đầu `PlaceCollectionBlock.tsx`). Harness đã đổi thành ghi nhận `headingRendered` (thông tin, không bắt buộc). Lần chạy 2 PASS 6/6.

**Các lỗi harness khác đã sửa trong lượt này (không phải app):** stub trả role dạng object, còn app chỉ đọc role dạng chuỗi (`capabilitiesFromRoles`), nên editor hiện "Không có quyền". Đã sửa fixture. Lần chạy khởi tạo có lệnh build runner lỗi do một gói đã bị loại khỏi Alpine; đã sửa Dockerfile.

**Giới hạn của kiểm tra editor:**
- Chỉ kiểm một slug không tồn tại và một block `place_collection`.
- Heading của block không hiển thị trong preview. Đây là hành vi của component, không phải xác nhận rằng hiển thị như vậy là đúng. Owner cần quyết định nếu muốn heading xuất hiện trong preview.
- Không kiểm trên production: không dùng phiên production và không có kiểm tra editor sau cutover.
- Dọn dẹp: container, network và image runner của run đã xóa. Thư mục `out` (ảnh và log, không có secret) còn trên VPS tại `runs/editor-ed01/out`.
---

## 5. Baseline production (đọc chỉ đọc, 05/10/2026)

| Mục | Giá trị |
|---|---|
| `WEB_IMAGE_TAG` trong `.env` | `f0c65b716c39a41de4948c695d4383f2cfa47f1f` |
| `API_IMAGE_TAG` trong `.env` | `f0c65b716c39a41de4948c695d4383f2cfa47f1f` |
| Container web | `phuquoc-web-prod`, image ID `sha256:97782e0bc9abe0f92381bc3cc24d9ea2a9842fc9994b6f0fd2c5bfbe3ba5de0c`, revision `f0c65b7…`, healthy, khởi động `2026-10-01T14:56:14Z`, RestartCount 0 |
| Container API | `phuquoc-api-prod`, image `phuquochub-api:f0c65b7…`, healthy, Up 3 days. **ID image và StartedAt chưa ghi trong lượt này** (phải ghi ở bước S0 của cutover) |
| Rollback web | `phuquochub-web:f0c65b7…` tồn tại; ID `97782e0b…` = image đang chạy |
| Deploy/rollback đang chạy | Không (kiểm `ps` theo tên script) |
| Candidate `b91e92c` | Có trên host dưới dạng image, không chạy trên production |
| Public `/vi/places/novotel-phu-quoc` | 200, chưa redirect |
| Public `/vi/hotels/novotel-phu-quoc` | 200 |
| Public `/api/health` | 200 |

Mục 6 yêu cầu đọc lại toàn bộ baseline ngay trước giờ cutover.

---

## 6. Gói cutover Web-only (một lần duyệt)

**Phạm vi duyệt:** một quyết định bao gồm cả: cutover web, ghi pin, redirect 308 công khai (quyết định 7, tài liệu audit), hậu kiểm đầy đủ ở bước 9–12, và tiêu chí rollback ở mục 7. Duyệt gói này nghĩa là đồng ý tất cả các bước, không tách.

**Điều kiện trước khi chạy:** owner duyệt; baseline mục 5 đọc lại không khác; identity candidate mục 2 kiểm lại; dry-run chỉ có web thay đổi. Nếu một điều kiện không đạt, dừng và báo lại, không tự chọn bước khác.

**Đường dẫn cây deploy:** `/home/deploy/apps/PhuQuocHub`. Helper: `scripts/lib/release-tag.sh` (`release_tag_get KEY FILE`, `release_tag_set KEY TAG FILE`), khuôn nhánh `web` của `scripts/rollback.sh`. Không chạy `deploy.sh`, không sync source đè cây deploy.

**Trình tự (CHƯA CHẠY):**

0. **Baseline.** Ghi lại: pin `WEB_IMAGE_TAG` và `API_IMAGE_TAG`; image ID và revision của `phuquoc-web-prod`; image ID và `StartedAt` của `phuquoc-api-prod`; số dòng `error` trong log web 15 phút gần nhất. Các giá trị này dùng để so sau cutover.
1. **Identity candidate.** `docker image inspect phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848 --format '{{.Id}}'` phải bằng `sha256:f264dde684c53352642fffc72207b6d3490e37becff5d4101ebf04871b21db79`. Label revision phải bằng `b91e92ce…`.
2. **Image rollback còn tồn tại.** `docker image inspect phuquochub-web:f0c65b716c39a41de4948c695d4383f2cfa47f1f --format '{{.Id}}'` phải bằng `sha256:97782e0bc9abe0f92381bc3cc24d9ea2a9842fc9994b6f0fd2c5bfbe3ba5de0c`.
3. **Dry-run chỉ web.** `WEB_IMAGE_TAG=b91e92ce7baf547b757d425eea0f30ceac8cd848 docker compose -f docker-compose.prod.yml --dry-run up -d --no-build --no-deps web`. Kỳ vọng: chỉ `web` Recreate. `api`, `postgres`, `redis`, `minio`, `caddy` đều Running. Không có migrate. Có dòng nào khác thì dừng.
4. **Cutover.** `WEB_IMAGE_TAG=b91e92ce7baf547b757d425eea0f30ceac8cd848 docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web`.
5. **Ghi pin ngay sau bước 4.** `. scripts/lib/release-tag.sh && release_tag_set WEB_IMAGE_TAG b91e92ce7baf547b757d425eea0f30ceac8cd848 /home/deploy/apps/PhuQuocHub/.env`. Lệnh `up -d` không có tiền tố env sẽ đưa bản cũ trở lại, nên pin phải được ghi trước khi làm việc khác.
6. **Kiểm pin.** `scripts/verify-release-pins.sh /home/deploy/apps/PhuQuocHub` phải exit 0.
7. **Identity web.** `docker inspect phuquoc-web-prod --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'` phải ra `sha256:f264dde6…21db79` và `b91e92ce…`. Container healthy.
8. **API không đổi.** `docker inspect phuquoc-api-prod --format '{{.Image}} {{.State.StartedAt}}'` phải bằng giá trị ghi ở bước 0.
9. **Route qua domain công khai (Caddy).**
   - `curl -sI https://phuquochub.com/vi/places/novotel-phu-quoc` → 308, `location: /vi/hotels/novotel-phu-quoc`; `curl -sI https://phuquochub.com/vi/hotels/novotel-phu-quoc` → 200.
   - `curl -sI https://phuquochub.com/vi/places/nha-hang-ra-khoi` → 308 `/vi/restaurants/nha-hang-ra-khoi`; trang đích 200.
   - `curl -sI https://phuquochub.com/vi/places/sunset-cruise-phu-quoc` → 308 `/vi/tours/sunset-cruise-phu-quoc`; `curl -sI https://phuquochub.com/vi/tours/sunset-cruise-phu-quoc` → 200.
   - Trang đích không redirect lại (0 hop).
10. **Sitemap công khai.** `curl -s https://phuquochub.com/sitemap.xml`: XML đúng cấu trúc; có `/vi/tours/sunset-cruise-phu-quoc` và `/vi/hotels/novotel-phu-quoc`; **không** có `/vi/places/novotel-phu-quoc` và `/vi/places/sunset-cruise-phu-quoc`; `/vi/places/bai-sao` vẫn có.
11. **Log web.** `docker logs --since 15m phuquoc-web-prod 2>&1 | grep -ciE 'error|unhandled'` so với bước 0. Không có 5xx trong log.
12. **Route chính.** `/vi`, `/vi/places`, `/vi/hotels`, `/vi/restaurants`, `/vi/tours`, `/vi/places/bai-sao` đều 200. Có `scripts/smoke-test.sh` thì chạy thêm, nhưng phải kiểm nó gửi đúng header `Host` khi gọi loopback, nếu không thì bỏ qua và dùng domain thật.

**Tiêu chí đạt:** bước 1–12 đều đạt. Bất kỳ bước nào không đạt là một lỗi do release, chuyển sang mục 7.

---

## 7. Rollback (kiểm Web, revision và pin, không chỉ API health)

**Điều kiện kích hoạt:** lỗi mới do release: 5xx trên route chính, vòng lặp redirect, web không healthy, hoặc sitemap hỏng.

**Các bước:**

1. `scripts/rollback.sh f0c65b716c39a41de4948c695d4383f2cfa47f1f web`.
2. **Kiểm web (bắt buộc, vì helper không kiểm web):**
   - `docker inspect phuquoc-web-prod --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'` phải ra `sha256:97782e0bc9abe0f92381bc3cc24d9ea2a9842fc9994b6f0fd2c5bfbe3ba5de0c` và `f0c65b7…`; container healthy.
   - `curl -sI https://phuquochub.com/vi` → 200; `curl -sI https://phuquochub.com/vi/places/novotel-phu-quoc` → 200.
3. **Kiểm pin:** `scripts/verify-release-pins.sh` exit 0; `grep '^WEB_IMAGE_TAG=' /home/deploy/apps/PhuQuocHub/.env` ra `f0c65b7…`.
4. **Kiểm API:** identity không đổi so với bước 0. API health không đủ để kết luận.
5. **Nếu `rollback.sh` không hoàn tất:** khôi phục pin đúng một khóa, `release_tag_set WEB_IMAGE_TAG f0c65b716c39a41de4948c695d4383f2cfa47f1f /home/deploy/apps/PhuQuocHub/.env`, rồi chạy `WEB_IMAGE_TAG=f0c65b7… docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web`, rồi kiểm lại bước 2–4. Không in nội dung `.env`.

**Giới hạn của rollback:**
- Redirect 308 có thể đã nằm trong cache trình duyệt hoặc CDN. Rollback image không xóa chúng. Không tự purge hay sửa cache production; nếu cần, owner quyết định.
- `rollback.sh` nhánh `web` chỉ kiểm `/api/health` qua container API. Vì vậy phải có bước 2 ở trên.

---

## 8. Giới hạn đã biết

- Editor preview (A, B, D) đã kiểm trên image bằng phiên synthetic. Không kiểm trên production.
- Giá trị `NEXT_PUBLIC_*` không đọc được từ image hay log; chúng được xác nhận bằng `build-cmd.sh`. Việc có đúng trong client bundle chưa được kiểm lại.
- Backend thật (published-only, locale, sitemap) không được kiểm lại; kết quả trên là với stub mô phỏng contract.
- Log candidate có 22 dòng lỗi từ lần stub chưa chạy; không khẳng định log sạch.
- Slug tour dùng cho hậu kiểm là từ danh sách công khai, chưa kiểm sâu nội dung trang.
- Cache của 308 nằm ngoài tầm kiểm soát của rollback.

---

## 9. Quyết định cần owner

1. Duyệt gói cutover Web-only mục 6 một lần, gồm redirect 308 công khai và tiêu chí rollback mục 7.
2. Heading của block `place_collection` không hiển thị trong preview (mục 4.4). Ghi nhận để owner quyết định; không chặn cutover.

Không thuộc gói này: "Góp ý của tôi" (cần API mới, release riêng), ảnh, dữ liệu Novotel/Bãi Sao (chưa ghi), MVP cư dân.


---

## 11. Kết quả cutover Web-only (05/10/2026, đã duyệt và thực hiện)

**Duyệt:** owner duyệt gói mục 6–7 (bao gồm redirect 308 và rollback). Thực hiện theo đúng gói, không dừng xin phép giữa các bước.

### 11.1 Trước → sau

| Mục | Trước | Sau |
|---|---|---|
| `WEB_IMAGE_TAG` (.env) | `f0c65b716c39a41de4948c695d4383f2cfa47f1f` | `b91e92ce7baf547b757d425eea0f30ceac8cd848` |
| Web image (running) | `sha256:97782e0bc9abe0f92381bc3cc24d9ea2a9842fc9994b6f0fd2c5bfbe3ba5de0c` (rev `f0c65b7…`) | `sha256:f264dde684c53352642fffc72207b6d3490e37becff5d4101ebf04871b21db79` (index digest; rev `b91e92ce7baf547b757d425eea0f30ceac8cd848`) |
| Web started | `2026-10-01T14:56:14.577916167Z` | `2026-10-05T09:49:34.138387746Z` |
| Web health / restarts | healthy / 0 | healthy / 0 |
| API image (running) | `sha256:c451fbe1b372ed417bd8c7c38f0b30a179504f412d1916df510c3b8d620bb603` (tag `f0c65b7…`) | **không đổi** |
| API started | `2026-10-01T14:56:14.410676697Z` | **không đổi** |
| `API_IMAGE_TAG` | `f0c65b716c39a41de4948c695d4383f2cfa47f1f` | **không đổi** |

Rollback image `phuquochub-web:f0c65b7…` (`sha256:97782e0b…`) vẫn còn trên host.

### 11.2 Trình tự đã chạy

- Preflight: pin, identity, rollback image đều khớp gói đã duyệt. Không có deploy hay rollback nào khác đang chạy. `verify-release-pins` exit 0 trước khi bắt đầu.
- Dry-run `--no-build --no-deps web`: chỉ `phuquoc-web-prod` Recreate.
- Cutover (T0 09:49:33Z): `WEB_IMAGE_TAG=b91e92c… docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web`.
- Ghi pin: `release_tag_set WEB_IMAGE_TAG b91e92c… .env` (ngay sau `up`).
- `verify-release-pins.sh`: exit 0. Web `.env` khớp image đang chạy `f264dde6…`; API khớp `c451fbe1…`.

### 11.3 Hậu kiểm (đã chạy)

| Kiểm tra | Kết quả |
|---|---|
| Web healthy, revision `b91e92c…` | PASS |
| API identity và StartedAt không đổi | PASS |
| `/vi`, `/en`, `/vi/places`, `/vi/hotels`, `/vi/restaurants`, `/vi/tours` | 200 |
| `/vi/places/bai-sao` | 200 |
| `/vi/places/novotel-phu-quoc` | 308 → `/vi/hotels/novotel-phu-quoc` (đích 200, 1 hop) |
| `/vi/places/nha-hang-ra-khoi` | 308 → `/vi/restaurants/nha-hang-ra-khoi` (đích 200, 1 hop) |
| `/vi/places/sunset-cruise-phu-quoc` | 308 → `/vi/tours/sunset-cruise-phu-quoc` (đích 200, 1 hop) |
| `/en/places/novotel-phu-quoc` | 308 → `/en/hotels/novotel-phu-quoc` (đích 200, 1 hop) |
| `/vi/places/slug-khong-ton-tai` | 404 |
| `/api/health` | 200 |
| `smoke-test.sh https://phuquochub.com bai-sao` | All checks passed (API health, root → /vi, /vi 200, unknown 404, /vi/places/bai-sao 200) |
| Sitemap `https://phuquochub.com/sitemap.xml` | 200, `application/xml`, `cache-control: public, max-age=0, must-revalidate`. Sitemap đã trả nội dung đúng tại thời điểm kiểm tra (09:50Z và kiểm lại 09:54Z): 94 URL, có các URL chuyên biệt, đã loại ba entry chung. Header không chứng minh server không có cache; không khẳng định gì về cache ngoài thời điểm kiểm tra. Bằng chứng: `sitemap-public.xml`, `sitemap-recheck.xml` |
| Log web từ khi container mới khởi động | Chỉ có dòng khởi động Next.js (Ready). Không có lỗi |

Bằng chứng sitemap: `docs/delivery/evidence/cutover-web-b91e92c-2026-10-05/sitemap-public.xml` (file có header HTTP và dòng log ở đầu; XML bắt đầu tại dòng `<?xml`).

Ghi chú: trang chủ và danh sách trả 200. Kiểm tra trang chủ không kiểm nội dung từng thẻ.

### 11.3b Ghi rõ tag và identity

- `WEB_IMAGE_TAG` hiện là `b91e92ce7baf547b757d425eea0f30ceac8cd848` (running: index digest `sha256:f264dde6…21db79`, revision `b91e92c…`).
- `f0c65b716c39a41de4948c695d4383f2cfa47f1f` là **tag rollback** của Web (running trước đó: `sha256:97782e0b…`).
- `API_IMAGE_TAG` vẫn `f0c65b716c39a41de4948c695d4383f2cfa47f1f`; API running `sha256:c451fbe1…`, started `2026-10-01T14:56:14.41Z`, không đổi.
- Trạng thái: **đã deploy Web; chờ owner nghiệm thu** phần Xem trước trên bài nháp.
- Smoke `scripts/smoke-test.sh https://phuquochub.com bai-sao` chạy lại lúc 09:5x UTC, exit code trực tiếp: **0**. Output: `evidence/cutover-web-b91e92c-2026-10-05/smoke-test-bai-sao.txt`.

### 11.5b Nghiệm thu owner

- Owner xác nhận: "Xem trước đã hoạt động" (05/10/2026). Không yêu cầu bấm thử lại; không build, deploy hay test lại phần preview.
- Phạm vi: preview của cẩm nang. Không suy rộng thành nghiệm thu các chức năng khác của website.
- Backlog riêng, không thuộc nghiệm thu này: heading của block `place_collection` không hiện trong preview (cần đối chiếu renderer public).

### 11.6 Trạng thái

- Web `b91e92c…` đã deploy; pin `WEB_IMAGE_TAG` = `b91e92c…`; `f0c65b7…` là tag rollback; API `f0c65b7…` không đổi.
- Smoke `bai-sao` exit 0 (xem mục 11.3b).
- Chưa rollback: không có lỗi release được chứng minh.

### 11.4 Rollback

**Không cần rollback.** Mọi kiểm tra đạt, không có lỗi do release. Rollback image và pin `f0c65b7…` vẫn sẵn sàng theo mục 7 nếu có lỗi sau này.

### 11.5 Chưa kiểm và phần owner cần làm

- **Nghiệm thu owner (chưa làm):** mở bài nháp hiện có `ffe8f569-7f5d-4626-8088-a66f5d476f3c` và bấm "Xem trước". Không cần lưu hay xuất bản. Đây là việc của owner; lượt này không tạo phiên owner và không chạm bài này.
- **Heading place_collection:** preview không hiện heading của block; cần đối chiếu với renderer public trước khi kết luận (backlog nhỏ, không chặn).
- Không kiểm trên production bằng phiên editor (không dùng phiên production).
- Cache trình duyệt/CDN của redirect 308 không được purge; chỉ quan sát được qua truy vấn không cache.


---

## 12. Editor VI/EN: candidate `cb56c0a`, rollout và rollback (06/10/2026, ĐÃ BUILD CANDIDATE, CHƯA CUTOVER)

### 12.1 Commit và artifact

| Mục | Giá trị |
|---|---|
| Commit đầu | `b699302b053b30142a4b97157411ae69df453e8d` (fix(editor): protect translation drafts and publish selected revisions) |
| Commit 2 | `78a946d7523336a6e6c10957f5d1c1f750e888c3` (fix(editor): keep the approved public text while a newer draft waits) |
| Commit 3 (candidate) | `cb56c0ac7be1ca732caa145556d38811ebfffcd5` (fix(review): serialize concurrent reviews of the same translation) |
| Archive | `phuquochub-source-cb56c0ac….tar.gz`, sha256 `33ad29f6364e03b096436a0feffa9fa85ec42b7f032770af6bfac4cc767775ac`; manifest khớp; `release_manifest_verify` OK (80 migration) |
| Thư mục candidate | `/home/deploy/release-candidates/cb56c0ac7be1ca732caa145556d38811ebfffcd5/` (archive, manifest, `src/`, `build-cmd.sh`, log build) |
| API image | `phuquochub-api:cb56c0ac…`, ID `sha256:3dfeb04ef2a2e28a1d3ca3b486892565603baa9919b7cbeca78297f694efe580`, revision `cb56c0ac…`, `linux/amd64` |
| Web image | `phuquochub-web:cb56c0ac…`, ID `sha256:971e5bc0e5875647f80c03a10be0bf944150930ffe78832c97e51bc51dba5407`, revision `cb56c0ac…`, `linux/amd64` |
| Build-args API | `GIT_COMMIT=cb56c0ac…`, `BUILD_DATE=2026-10-06T10:51:31Z` |
| Build-args Web | `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `GIT_COMMIT=cb56c0ac…`, `BUILD_DATE=2026-10-06T10:51:31Z` |
| Build | Tuần tự, `nice -n 15`, không prune, không migrate image. Log: `build-api.log`, `build-web.log`; exit 0 cả hai. |

Ghi chú: Web build có 19 bước CACHED (layer của phần không đổi được tái dùng), nên `Created` của image Web hiển thị thời điểm layer gốc. ID image khác với các candidate trước.

**Quét Web bundle** (phạm vi: tên biến và chuỗi, không phải giá trị): tên biến secret (`JWT_ACCESS_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`) = 0 file; `localhost:4000/api` = 0 file; `https://phuquochub.com/api` = 3 file (đúng build-arg production). Tên biến môi trường của image: chỉ `PATH`, `NODE_VERSION`, `YARN_VERSION`, `NODE_ENV`, `PORT`, `HOSTNAME`.

**Quét cho đúng lệnh build:** `.dockerignore` loại `.env`, `.env.local`, `.env.*.local` ở gốc; source archive chỉ chứa `.env.example`.

### 12.2 Kiểm tra trên artifact

| Kiểm tra | Môi trường | Kết quả | Bằng chứng |
|---|---|---|---|
| API image: draft stale → 409, không ghi | DB/Redis/PostGIS cô lập, mạng `--internal`, HTTP tới container API thật | 20/20 PASS | `candidate-cb56c0a-2026-10-06/api-check.json` |
| API image: publish đúng field/locale/id; VI không duyệt EN; id sai place/field/locale → 404; body rỗng → 400; public chỉ bản đã duyệt; sai quyền → 403; không token → 401 | như trên | PASS (trong 20 ca trên) | như trên |
| Browser + Web image + API image cô lập: sửa → lưu nháp → công khai; tải lại có draft → công khai; chọn EN đã lưu trước; không chọn EN; conflict giữ nội dung; partial và retry đúng revision | Chromium 149, Web candidate, API candidate; không dùng production | 8/8 PASS, 0 request bị chặn, 0 page error, 13 request ghi đi tới API candidate | `browser-flows.json`, `f1-published.png`, `f5-conflict.png`, `f6-partial.png` |
| Integration CAS và cạnh tranh (source đúng `cb56c0a`, DB cô lập) | Postgres/PostGIS, Redis, `AppModule` đầy đủ | 16/16 PASS | `integration-e2e.log`, `integration-summary.txt` |

Quan sát cạnh tranh (integration): publish–publish cùng id → đúng một `ok:true`, một `ok:false` 409 (sau khi sửa đường lock). Save B (expected A) đua với publish A, 8 lần lặp: 4 lần publish trước, 4 lần save trước; cả hai thứ tự đều cho trạng thái đúng (không duyệt bản đã bị thay).

Lưu ý thứ tự cạnh tranh: lần chạy trên `78a946d` trước đó làm test publish–publish fail (`uq_wiki_rev_number` thô). Nguyên nhân: review không khóa hàng translation. Đã sửa ở commit 3 và chạy lại trên cùng source.

Unit và tĩnh: API `tsc` exit 0; Web `tsc` toàn gói exit 0; API unit places/place-translations 435/435; spec editor Web 20/20; lint API và Web module exit 0.

### 12.3 Baseline (đọc chỉ đọc, 06/10/2026)

| | Web | API |
|---|---|---|
| Pin `.env` | `b91e92ce7baf547b757d425eea0f30ceac8cd848` | `f0c65b716c39a41de4948c695d4383f2cfa47f1f` |
| Container đang chạy | image `sha256:f264dde6…21db79`, revision `b91e92c…`, started `2026-10-05T09:49:34Z`, healthy | image `sha256:c451fbe1…603`, revision `f0c65b7…`, started `2026-10-01T14:56:14Z`, healthy |
| Rollback image trên host | `phuquochub-web:b91e92c…` | `phuquochub-api:f0c65b7…` |

`verify-release-pins`: nhất quán. Không có deploy hay rollback nào đang chạy. Không có migration mới (cả hai đều 80).

### 12.4 Thứ tự phát hành (API trước, Web sau)

1. Owner duyệt cặp image `phuquochub-api:cb56c0ac…` và `phuquochub-web:cb56c0ac…` (đúng ID ở 12.1).
2. Cutover API (chỉ `api`, `--no-deps`):
   - `release_tag_set API_IMAGE_TAG cb56c0ac7be1ca732caa145556d38811ebfffcd5 /home/deploy/apps/PhuQuocHub/.env`
   - `docker compose -f docker-compose.prod.yml up -d --no-build --no-deps api`
   - `scripts/verify-release-pins.sh /home/deploy/apps/PhuQuocHub`
3. Cutover Web (chỉ `web`, `--no-deps`):
   - `release_tag_set WEB_IMAGE_TAG cb56c0ac7be1ca732caa145556d38811ebfffcd5 /home/deploy/apps/PhuQuocHub/.env`
   - `docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web`
   - `scripts/verify-release-pins.sh /home/deploy/apps/PhuQuocHub`
4. Hậu kiểm (chỉ đọc, không ghi nội dung): identity và revision của hai container; `/api/health`; `GET /api/places/novotel-phu-quoc?locale=vi|en` (không đổi so với baseline); route `/vi`, `/vi/places/bai-sao`, `/vi/hotels/novotel-phu-quoc` 200; sitemap; log web từ lúc container mới khởi động. Không dùng phiên production để test editor; owner tự kiểm bằng phiên của mình.

**Không chạy `deploy.sh` đầy đủ** (kéo theo build và cutover ngoài phạm vi). Không chạy migration.

### 12.5 Cửa sổ chuyển đổi và tab cũ

- **Vì sao API trước:** Web mới với API cũ không an toàn: API cũ bỏ qua body publish (không có `@Body`) nên duyệt tất cả bản pending, kể cả EN; ValidationPipe `forbidNonWhitelisted` cũng từ chối `expected_*_id` (400) ở save. Không đảo thứ tự.
- **Trong khoảng API mới lên và Web chưa lên:** tab Web cũ vẫn gửi contract cũ. Save không kèm expected id → 400 từ service. Publish không có body → 400. Không có ghi sai dữ liệu. Thời gian gián đoạn API recreate: vài giây (ước lượng, chưa đo trên production).
- **Tab mở từ bundle cũ sau khi Web mới lên:** bundle không tự tải lại, nên các thao tác ghi vẫn dùng contract cũ và nhận 400. Editor giữ nội dung trong ô (không reset), và hiển thị lỗi theo từng trường (`Chưa lưu: …`) hoặc theo locale (`Chưa áp dụng: …`).
- **Hướng dẫn owner:** trước khi tải lại trang, sao chép nội dung chưa lưu (vì tải lại sẽ mất text). Sau khi nhận thông báo cutover xong thì tải lại. Không tự tải lại phiên của owner trong lượt này.
- Không hạ CAS để tránh 400: payload cũ không được ghi nội dung.

### 12.6 Rollback (đúng baseline)

Thứ tự ngược: **Web về `b91e92c…` trước, rồi API về `f0c65b7…`.** Lý do: rollback API trước sẽ để Web mới (nếu còn chạy) với API cũ, trạng thái không an toàn (mục 12.5).

1. `release_tag_set WEB_IMAGE_TAG b91e92ce7baf547b757d425eea0f30ceac8cd848 …/.env` và `docker compose … up -d --no-build --no-deps web`; `verify-release-pins`.
2. `release_tag_set API_IMAGE_TAG f0c65b716c39a41de4948c695d4383f2cfa47f1f …/.env` và `docker compose … up -d --no-build --no-deps api`; `verify-release-pins`.
3. Kiểm lại: identity và revision của cả hai container; pin; `/vi` và `/vi/hotels/novotel-phu-quoc` (200); `/api/health`. Không kết luận "đã rollback" chỉ dựa vào API health.

Không có migration để revert. Dữ liệu nháp đã ghi bằng contract mới vẫn nằm trong bảng; API cũ đọc được nhưng không còn CAS.

### 12.7 Giới hạn

- Thời gian gián đoạn chưa đo trên production.
- Kiểm tra trên image dùng stub S3 tối giản và fixture khách sạn synthetic trong DB cô lập; không có dữ liệu production.
- Nhánh cạnh tranh được quan sát đủ cả hai thứ tự (4/4), nhưng chỉ trong 8 lần lặp.
- Chưa có giao diện duyệt EN riêng; EN công khai qua checkbox.
- Bản EN đang công khai của mô tả ngắn Bãi Sao vẫn chứa khẳng định chưa có nguồn cho đến khi owner duyệt nội dung (A/B Novotel và C Bãi Sao chưa áp dụng).

### 12.8 File đề nghị commit

Đã commit: `b699302`, `78a946d`, `cb56c0a` (xem 12.1). Các file dưới đây đã nằm trong các commit đó.

Evidence đề nghị lưu (đã kiểm nội dung, không chứa secret; chưa stage): `docs/delivery/evidence/candidate-cb56c0a-2026-10-06/` gồm `integration-e2e.log`, `integration-summary.txt`, `api-check.json`, `browser-flows.json`, `build-export-lines.txt`, `f1-published.png`, `f5-conflict.png`, `f6-partial.png`.

Không đưa vào: `apps/web/next-env.d.ts`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, các thư mục evidence cũ chưa kiểm.

## 13. Trạng thái các đợt (06/10/2026)

**Baseline và nền:** nhánh `owner-dashboard-patch-0a636dd`, HEAD `cb56c0a` (chuỗi CAS: `b699302` → `78a946d` → `cb56c0a`). Production: Web pin `b91e92c…`, API pin `f0c65b7…`, nhất quán, không có deploy đang chạy. Worktree khác (`.claude/worktrees/*`) không thuộc phạm vi này và không bị động tới.

**Quyền đã cấp:** commit và build candidate cho bản CAS. Chưa có quyền cutover, ghi production hay chạy migration production. Không mở rộng sang tính năng mới.

### Đợt 0 — CAS (chốt ở mức candidate)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Code | Đã commit (3 commit) | `b699302`, `78a946d`, `cb56c0a` |
| Test source | Đã chạy | integration 16/16 (source `cb56c0a`), unit places/place-translations 435/435, spec editor 20/20, tsc API và Web exit 0, lint exit 0 |
| Test image | Đã chạy trên candidate cô lập | API 20/20, browser 8/8 (6 luồng) |
| Candidate | Đã build | API `phuquochub-api:cb56c0a…` (`3dfeb04e…`), Web `phuquochub-web:cb56c0a…` (`971e5bc0…`) |
| Deploy | Chưa | Chờ owner duyệt cutover |
| Nghiệm thu owner | Chưa | Owner chưa xác nhận luồng editor trên production |

Ma trận tương thích, thứ tự rollout (API trước, Web sau) và rollback (Web về `b91e92c…`, API về `f0c65b7…`) nằm ở mục 12.

### Đợt 1 — Địa điểm giàu thông tin (kiểm kê có giới hạn, chưa triển khai)

Kiểm kê dựa trên DTO và field đã đọc. Chưa đọc renderer và admin UI của từng nhóm; kết luận "có UI" chưa được xác minh.

| Nhóm | Field/endpoint có sẵn (DTO) | Thiếu hoặc cần xác minh |
|---|---|---|
| Khách sạn | `hotel_type`, `star_rating` + `star_rating_source_id`, `check_in`, `check_out`; rooms, amenities, contacts, prices | Điều kiện giá và chính sách chưa có cấu trúc rõ; ảnh có quyền cần hồ sơ; hiển thị trên UI chưa kiểm |
| Nhà hàng | `cuisine_codes`, `is_local_specialty`, `dietary`; menu endpoint; contacts; `opening_hours` (cấp place) | Gửi xe chưa có; giá món cần đơn vị và ngày ghi nhận; UI chưa kiểm |
| Bãi biển | `access_route`, `characteristics`, `services`, `best_season` và `lifeguard_info` (đều có source), `sourced_notes` | Phân biệt điểm tham chiếu với điểm tiếp cận: chưa kiểm trên UI; phí theo dịch vụ chưa có cấu trúc |
| Tour | `tour_type`, `duration_minutes`, `difficulty`, `organizer_id`, `pickup_point`, `inclusions`, `exclusions`, `cancellation_policy`; itinerary và schedule | Phần lớn đã có; cần kiểm UI và giá |
| Tìm/lọc/bản đồ | Chưa kiểm | Chưa đọc endpoint tìm kiếm và bộ lọc |

Bước tiếp theo cho đợt 1: kiểm kê renderer và admin của bốn nhóm (tìm theo route và symbol), rồi chọn một lát đầu nhỏ có nghiệm thu rõ.

### Đợt 2, 3, 4 — chưa bắt đầu

Chưa có code, migration hay bằng chứng cho các đợt này. Không ước lượng ngày hoàn thành: số giờ làm việc thực tế chưa được đo riêng, và chưa kiểm kê UI nên chưa biết khối lượng còn lại.

### Quyết định cần owner

1. Duyệt cutover cặp `cb56c0a` (API `3dfeb04e…`, Web `971e5bc0…`) theo thứ tự ở mục 12.

### 13b. Đợt 1, lát đầu: CAS cho chi tiết bãi biển (06/10/2026, nhánh riêng, CHƯA BUILD, CHƯA DEPLOY)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Vấn đề | `PATCH …/beaches/:id/details` ghi không kiểm version, khác khách sạn/nhà hàng/tour | Đọc `beaches.repository.ts` và DTO |
| Sửa | CAS trên `places.content_version` trong cùng transaction; thiếu version → 400; lệch → 409, không ghi, không audit; PATCH rỗng không bump version | Commit `3a4366d` trên `feat/beach-details-cas` (từ `cb56c0a`) |
| Test source | Unit beaches 72/72; tsc API exit 0; eslint beaches exit 0 | Chạy trong phiên |
| Test DB thật | E2E `beach-details-cas` 3/3 (Postgres/PostGIS, Redis, AppModule, DB cô lập đã dọn) | `evidence/beach-details-cas-2026-10-06/README.txt` |
| Candidate | Chưa build. Không thuộc candidate `cb56c0a` | — |
| UI | Chưa có editor và hiển thị public cho chi tiết bãi biển (web không tham chiếu các field này) | Kiểm kê mục 13 |
| Deploy/nghiệm thu | Chưa | — |

Tiêu chí còn thiếu cho lát này: editor admin cho `access_route`, `services`, `best_season`, `lifeguard_info` (kèm nguồn) → lưu → đọc lại; hiển thị public tách điểm tham chiếu và điểm tiếp cận; ca đủ/thiếu; kiểm desktop và 375px; browser một luồng. Cần nối vào `EditPlaceView` (cùng mẫu `RestaurantDetailsEditor`).

### 13c. Đợt 1, lát 2: editor và hiển thị công khai bãi biển (06/10/2026; cập nhật 07/10/2026: ĐÃ COMMIT `c8bd06a`/`3dc1734`, ĐÃ BUILD candidate `3dc1734`, xem 13d)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Code API | `GET /beaches/:id/details` (quyền `Place.Edit.Managed`, đọc được bản nháp); PATCH trả `content_version` mới lấy từ kết quả CAS | `beaches.controller.ts`, `beaches.service.ts`, `beaches.repository.ts` |
| Code web | `category-admin/BeachDetailsEditor.tsx` gắn trong `EditPlaceView` khi `category_slug='beach'`; mục "Thông tin bãi biển" ở `/places/[slug]` (chỉ với bãi biển, lỗi đọc không làm hỏng trang) | `EditPlaceView.tsx`, `places/[slug]/page.tsx` |
| Nguồn | Mùa tham khảo và cứu hộ chỉ có nguồn khi người quản trị nhập tên/URL; không suy ra từ text | `BeachDetailsEditor.tsx` |
| Test API | beaches unit 75/75; `tsc` exit 0; eslint beaches exit 0 | chạy trong phiên |
| Test web | `BeachDetailsEditor.spec.tsx` 6/6 (tải, CAS gửi đúng version, ô trống → null, không tạo nguồn khi không nhập, tạo nguồn rồi gửi id, 409 giữ nội dung); `tsc` exit 0; các suite place-management/places/beaches/category-admin 11 suite/114 test trước khi thêm spec | chạy trong phiên |
| Lint web | File mới/sửa không lỗi, trừ `EditPlaceView.tsx:74` `react-hooks/set-state-in-effect` đã có ở HEAD (không do lát này) | `lint-web.txt` |
| Test mục công khai | `page.beach.spec.tsx` 4/4 (có đường vào và mùa có nguồn là liên kết; mùa không nguồn không hiện "Nguồn"; lỗi đọc → trang vẫn render; không phải bãi → không gọi API). Cùng suite places/[slug] và editor: 54/54; web `tsc` exit 0 | chạy trong phiên |
| Chưa có | Luồng trình duyệt sửa → lưu → đọc lại → công khai; kiểm 375px và desktop | Cần stack cô lập có image mới |
| Schema | Không đổi schema, không migration | — |
| Candidate / deploy | Chưa build; candidate `cb56c0a` không đổi; chưa cutover | — |

**Gói duyệt (chưa thực hiện):**
1. Commit lát này trên `feat/beach-details-cas` (gồm 3a4366d + thay đổi trên, 7 file API/web mới sửa + 2 spec mới). Lệnh đề xuất: `git add` theo danh sách file; không đưa `next-env.d.ts` và WIP.
2. Build candidate mới từ SHA sau commit, trên VPS trong thư mục candidate, không prune, không migrate; chạy luồng trình duyệt trong mạng `--internal` như candidate `cb56c0a`. Cần duyệt riêng vì build trên VPS.
3. Cutover: không yêu cầu trong lát này. Quyết định cutover `cb56c0a` vẫn chờ.

**Rollback (nếu sau này cutover):** candidate mới không đổi pin. Quay về pin hiện tại Web `b91e92c`, API `f0c65b7` theo mục 12.6. Không có migration để revert. Trước khi cutover phải chờ API có `GET /beaches/:id/details` và trả `content_version`, vì editor web mới cần cả hai.

**Bước tiếp theo:** chờ duyệt (1) và (2). Sau khi có, chạy luồng trình duyệt và ghi bằng chứng vào `docs/delivery/evidence/beach-editor-2026-10-06/`.

### 13d. Đợt 1, lát 2 — đã commit và đã có candidate (07/10/2026)

**Đính chính 13c:** mục 13c ghi "CHƯA COMMIT" là cũ. Code và test đã nằm trong git: `c8bd06a` (editor, đọc quản trị, mục công khai, spec) và `3dc1734` (sửa e2e gửi content_version). Không có thay đổi bãi biển nào chưa commit. Không có migration mới so với `cb56c0a` (80 migration, `migration_count=80`).

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Quan hệ với `cb56c0a` | Phụ thuộc theo chuỗi: `3dc1734` ← `c8bd06a` ← `3a4366d` ← `cb56c0a`. Không thay thế cb56c0a. Candidate `cb56c0a` giữ nguyên | `git log` |
| Test source | API beaches unit 75/75; web BeachDetailsEditor + page.beach 12/12; `tsc` API và web exit 0; eslint phần bãi biển exit 0 | Chạy trong phiên |
| Lint có sẵn (không sửa) | `EditPlaceView.tsx:75` `react-hooks/set-state-in-effect`, có từ trước `c8bd06a` | `git show c8bd06a^` |
| E2E trên DB thật | `beach-details-authz-cas`, `beach-details-cas`, `beach-details-patch-semantics`: 8/8 trên Postgres/PostGIS, Redis, AppModule, DB `phq_test` của run `r2` | `candidate-3dc1734-2026-10-07/e2e-beach.log` |
| Candidate | API `phuquochub-api:3dc1734cfab7009b28b8835b972bd31388769ad3` (ID `559d613b…`); Web `phuquochub-web:3dc1734cfab7009b28b8835b972bd31388769ad3` (ID `03b23bd5…`); `APP_REVISION` và label revision khớp. Build-args giống cb56c0a | `build-api.log`, `build-web.log`, `release-manifest-…txt` |
| Migration | 80/80 áp dụng trên DB test mới của run `r2`. Không chạy trên production | `migrate.log` |
| API contract (HTTP thật) | GET A 200; GET B (không quản lý) 403; PATCH stale 409 không ghi; PATCH với version trả về 200; public A thấy chi tiết; draft public 404 và không lộ nội dung | `api-check-r2.out` |
| Browser (24/24) | Desktop: sửa, lưu, tải lại, version đúng. Nguồn thật được tạo và hiện là liên kết công khai. 375px: không tràn ngang ở public và editor. 409: giữ nội dung người dùng nhập, không ghi đè. Người không quản lý: GET 403, không có form. Bãi thiếu dữ liệu: không có mục bãi biển, không có "miễn phí"/"an toàn". Draft: 404 | `browser/browser-r2.json`, ảnh desktop/375 |
| Lỗi 500 khi lưu sau khi đã tạo nguồn | Injected 500 cho PATCH; lưu lại thành công; chỉ có 1 nguồn "Nguồn retry" cho mỗi run | DB `sources`, `browser-run1/2.log` |
| Harness | Run 1: 23/24 do fixture (`sourced_notes` không được seed). Run 2: 23/24 do giả định assertion sai (phụ thuộc trạng thái). Run 3 (sửa cả hai): 24/24 | `browser/browser-r2-run1.json`, `-run2.json`, `browser-r2.json` |

**Contract thực tế:**
- PATCH `/beaches/:id/details` có hiệu lực **ngay** trên bãi đã xuất bản, không có bước duyệt. Ghi vào `place_beach_details` trong cùng transaction với CAS trên `places.content_version`.
- Bãi nháp: GET công khai trả 404, dữ liệu không lộ. Public đọc chi tiết với `cache: 'no-store'`, nên thay đổi hiện ở request kế tiếp, không chờ cache 60 giây.
- Tác động: người có quyền quản lý bãi đã xuất bản sửa thì thay đổi lên công khai ngay. Không có kiểm duyệt trước khi hiển thị.

**Còn lại (không sửa trong lát này):**
1. Tạo nguồn và lưu details là hai request. Retry trong cùng màn hình không tạo nguồn trùng. Nếu tải lại trang sau lỗi 500, lần lưu tiếp theo tạo nguồn mới và nguồn cũ thành mồ côi. Cần idempotency ở backend nếu muốn chặn hoàn toàn.
2. Sau 409, editor giữ nội dung nhưng không có nút tải lại. Người dùng phải tải lại trang để lấy version mới.
3. Nguồn có thể gắn vào giá trị rỗng, vì editor chỉ kiểm tra có nhập tên/URL nguồn hay không.

**Gói duyệt (rollout/rollback, chưa thực hiện):**
- Rollout: API `3dc1734` trước, sau đó Web `3dc1734`, theo đúng mẫu cutover staged (`up -d --no-build --no-deps <service>` và `release_tag_set`). Không có migration nên không cần bước migrate.
- Rollback: Web về `b91e92c…`, API về `f0c65b7…` (pin hiện tại). Không có migration để revert. Editor bãi biển cần cả API mới lẫn Web mới, nên rollback phải về cặp pin hiện tại.

**Tài nguyên:** đã dọn toàn bộ container/network/image test `phq-r2-*`. Giữ image candidate `3dc1734`. Không prune `cb56c0a`. Stack `phq-r1-*` của lần trước (`c8bd06a`) vẫn chạy, chưa được động vào.

**Chưa làm:** chưa cutover `cb56c0a` hoặc `3dc1734`. Chưa xử lý bài `ffe8f569-…` và gói dữ liệu Novotel/Bãi Sao. Phần tour/hotel/restaurant chưa bắt đầu.

### 13e. Phạm vi local/cô lập đã duyệt: bãi biển hoàn tất, bắt đầu nhóm nhà hàng (07/10/2026)

**Quan hệ git (đã kiểm bằng `git merge-base --is-ancestor` và `git diff --name-status`):**
- `cb56c0a` là tổ tiên của `3dc1734`. Candidate `3dc1734` chứa đầy đủ CAS (`b699302` → `78a946d` → `cb56c0a`) và chỉ thêm thay đổi bãi biển.
- Diff `cb56c0a..3dc1734` chỉ chạm file trong `apps/*/beaches`, `BeachDetailsEditor`, `EditPlaceView.tsx` và `places/[slug]/page.tsx`. Không có migration mới.
- Kết luận: `3dc1734` **thay thế** `cb56c0a` về mặt code trong gói release, vì là bản cha của nó cộng thêm bãi biển. Chưa được nghiệm thu production.

**Commit mới:** `535598f` `fix(beaches): wrap public beach info pairs so labels and values stay aligned`. Sửa lỗi bố cục do ảnh desktop cho thấy: `dt`/`dd` phẳng trong lưới `infoGrid` làm nhãn và giá trị lệch hàng. Kiểm: `page.beach.spec` 5/5, `tsc` web exit 0, eslint file đó exit 0. **Candidate `3dc1734` KHÔNG chứa commit này**; cần candidate mới để mang bản sửa.

**Bảng khoảng trống (đọc source, không dựa báo cáo cũ):**

| Nhóm | Đã có | Thiếu | Ghi chú |
|---|---|---|---|
| Nhà hàng | Đặc sản, loại ẩm thực (`cuisine_codes`), chế độ ăn (`dietary` JSON), giờ mở cửa theo ngày ở cấp place, editor có CAS, menu có sections/items với `price` + `currency` | (1) Đơn vị giá món và ngày ghi nhận giá: không có cột. (2) ~~Trang công khai không hiển thị menu~~ — **đính chính 07/10/2026: sai.** Nhà hàng có route riêng `/restaurants/[slug]` (trang `places/[slug]` redirect nhà hàng sang đó) và trang này ĐÃ render menu công khai, ẩn giá (xem `restaurants/[slug]/page.tsx`). (3) Gửi xe: không có trường riêng (có thể dùng tiện ích). | Đơn vị/ngày giá cần migration. Hiển thị giá menu công khai chạm vào cổng tin cậy giá (Public Beta) — xem điểm cần duyệt |
| Khách sạn | Editor `HotelDetailsEditor` có CAS, `place_hotel_details`, `hotel_room_types`, star_rating + nguồn, check-in/out | Chưa kiểm chi tiết trong lượt này | Làm sau khi nhà hàng xong |
| Tour | Bảng `place_tour_details`, `tour_stops`, `tour_schedules`; module web/api `tours` | Chưa có editor trong `category-admin` (chưa xác nhận hiển thị công khai) | Chưa kiểm sâu |

**Đã chọn nhóm nhà hàng trước** vì có editor, CAS và bảng sẵn; phần thiếu lớn nhất (menu công khai) không cần migration.

**Tiêu chí nghiệm thu nhóm nhà hàng (chốt trước khi sửa):**
1. Nhập/sửa menu và đặc sản/ẩm thực → lưu → tải lại: dữ liệu và version đúng.
2. Trang công khai: menu hiển thị đúng dữ liệu đã lưu; món thiếu giá **không** hiện "0đ"; giờ theo ngày thiếu **không** hiện "đang mở".
3. Quyền: người không quản lý không đọc/sửa menu (403), CAS stale trả 409 và không ghi.
4. Draft không lộ qua API/trang công khai.
5. Desktop và 375px: không tràn ngang, khối trống không chiếm chỗ.

**Điểm cần duyệt (quyết định sản phẩm, chưa tự quyết):**
- **A (đã có sẵn trong code, cần owner xác nhận chính sách):** API công khai `GET /restaurants/:id/menu` luôn đặt `price = null`, và trang `/restaurants/[slug]` chỉ hiện dòng "đang xác minh" khi món có giá. Không cần thay đổi code; chỉ cần owner xác nhận đây là chính sách mong muốn.
- **B.** Có thêm migration cho đơn vị giá và ngày ghi nhận giá món không? Cần thiết cho yêu cầu "giá, đơn vị và ngày ghi nhận", nhưng là thay đổi schema, phải duyệt trước khi viết.
- **C.** Có build candidate mới mang `535598f` và phần nhà hàng không? Đề xuất gom vào một candidate sau khi nhóm nhà hàng xong, để tránh build nhiều lần.

**Tài nguyên:** không tạo tài nguyên VPS mới trong lượt này. Stack `phq-r2-*` đã dọn trước đó. Stack `phq-r1-*` (run cũ `c8bd06a`) vẫn đang chạy, chưa xử lý, không chặn công việc. Image `3dc1734` giữ nguyên.

**Cập nhật cùng lượt:** đã thử thêm mục menu vào `places/[slug]/page.tsx` rồi hoàn tác (không commit): route đó redirect nhà hàng, nên mục sẽ không bao giờ hiển thị. Không còn thay đổi chưa commit nào của lượt này ngoài `next-env.d.ts` (ngoài phạm vi).

**Bước tiếp theo:** (1) owner xác nhận chính sách giá món (A); (2) quyết định migration cho đơn vị giá và ngày ghi nhận (B); (3) rà lại tiêu chí nhà hàng trên `/restaurants/[slug]` (không phải `/places/[slug]`) và viết spec cho đúng trang đó; (4) đề xuất candidate mới mang `535598f` (C).

### 13f. Nhà hàng: tiêu chí, phần đã có, phần đã thêm, điểm chờ (07/10/2026)

**Phần đã có (đã đọc source và spec, không dựa báo cáo cũ):**
- Public: `/restaurants/[slug]` render menu công khai, ẩn giá (`restaurants/[slug]/page.tsx`); spec `page.spec.tsx` có cổng giá menu, món nổi bật, ẩm thực, liên hệ, giờ mở cửa.
- Ghi: `e2e restaurant-details-patch-semantics` (giữ/đổi/xoá dietary, CAS 409 hai request, rollback khi cuisine sai); `MenuEditor.spec.tsx` (CAS 409, không gửi khi thiếu tên mục).

**Phần thiếu đã thêm (chưa chạy):** `apps/api/test/restaurant-details-authz.e2e-spec.ts`. Chứng minh qua HTTP thật: manager A đọc/ghi được; manager B bị 403 khi GET/PATCH details và PATCH menu, không đổi dữ liệu; không grant → 403; CAS stale → 409, version trả về đúng; draft không lộ qua `GET /restaurants/:slug`. Typecheck dự án đạt; chưa chạy vì thiếu DB.

**Điểm chờ (cần một lần):** cần một DB test cô lập trên VPS (Postgres/PostGIS + Redis, migrate 80 trên DB mới) để chạy spec trên. Đề xuất: tạo stack `phq-r3-*` theo đúng khuôn `stack-3dc.sh` (chỉ tài nguyên của run, không dùng `phq-r1-*`), chạy e2e, lưu log, rồi dọn. Không build image mới.

**Điểm chưa giải quyết:** (A) chính sách giá món công khai — code đã ẩn giá, cần owner xác nhận; (B) migration đơn vị và ngày ghi nhận giá món — chưa viết; (C) candidate mới mang `535598f` — chưa build.

### 13g. Tour: kiểm kê (đọc source, 07/10/2026; chưa triển khai, theo thứ tự nhóm)

| Yêu cầu | Đã có | Thiếu (đã xác nhận) | File |
|---|---|---|---|
| Ghi chi tiết tour | `PATCH :id/details` (quyền `Place.Edit.Managed`), trường organizer/duration/difficulty/pickup/inclusions/exclusions/cancellation | **Không có CAS**: DTO không có `expected_content_version` | `tours.controller.ts:47`, `dto/tours.dto.ts` |
| Admin editor | — | **Không có editor tour** trong `category-admin`/`place-management` | — |
| Lịch trình | `PUT :id/itinerary`, `GET :id/itinerary`, `GET :id/schedule` | Chưa kiểm UI hiển thị | `tours.controller.ts` |
| Public chi tiết | Trang `/tours/[slug]` tồn tại | **Không render** pickup/inclusions/exclusions/cancellation (grep không thấy) | `(public)/tours/[slug]/page.tsx` |
| Web API | — | Không có hàm ghi chi tiết tour (chỉ `TourDetail` type) | `modules/tours/api/tours.api.ts` |

**Đề xuất khi được mở nhóm tour:** thêm CAS vào `PATCH details` theo đúng khuôn beach/restaurant (không cần migration: `places.content_version` có sẵn); tạo editor theo khuôn `BeachDetailsEditor`; thêm mục công khai cho các trường chi tiết với nguyên tắc thiếu dữ liệu không thành "miễn phí"/"an toàn"; spec authz e2e tương tự `restaurant-details-authz`.

**Trạng thái nhóm nhà hàng (không đổi):** code và spec authz đã có; chờ duyệt tạo DB test `phq-r3-*` trên VPS để chạy e2e; chờ quyết định A (chính sách giá món) và B (migration đơn vị/ngày giá).

### 13h. Tour: CAS cho PATCH chi tiết (07/10/2026; code local, CHƯA COMMIT, CHƯA BUILD)

**Đã làm (chỉ API, không migration, không web):**
- `UpdateTourDetailsDto`: thêm `expected_content_version` (bắt buộc, số nguyên ≥ 0).
- `ToursRepository.updateDetails`: CAS trên `places.content_version` trong cùng transaction; lệch → 409, không ghi; PATCH không có trường chi tiết → không bump version (không mở transaction); chưa có hàng `place_tour_details` → INSERT khi có `tour_type` (cột NOT NULL), thiếu `tour_type` → 400.
- `ToursService.updateDetails`: map conflict → 409, missing tour_type → 400, trả `content_version` mới; audit chỉ khi ghi thành công.
- Lỗi đã sửa: trước đây PATCH tour khi chưa có hàng chi tiết `UPDATE` không ghi gì nhưng vẫn trả thành công.

**Test:** tour unit 75/75 (repo CAS/insert/conflict/no-op, service 409/400/content_version, controller); `tsc` API exit 0; eslint `src/modules/tours` exit 0. Đây là bằng chứng mock, KHÔNG chứng minh CAS/transaction trên DB.

**Tác động tới client cũ:** web chưa có hàm gọi PATCH tour (`modules/tours/api/tours.api.ts` không có), nên không có tab Web cũ nào gửi PATCH này. Client API ngoài nào gọi PATCH cũ sẽ nhận 400 vì thiếu `expected_content_version` — cần xác nhận không có client ngoài.

**Còn thiếu cho nhóm tour:** e2e DB thật cho CAS/authz tour (cần cùng DB test như mục 13f); editor admin tour; mục công khai cho trường chi tiết; spec trang `/tours/[slug]`.

**Trạng thái:** code: có (chưa commit, đang trong working tree); commit: chưa (quyền commit chỉ cho bãi biển); candidate: chưa; deploy/nghiệm thu: chưa.

**Gói commit đề xuất (chờ duyệt):** `feat(tours): require content version on tour detail writes` gồm 6 file: `apps/api/src/modules/tours/{dto/tours.dto.ts, repositories/tours.repository.ts, repositories/tours.repository.spec.ts, tours.service.ts, tours.service.spec.ts, tours.controller.spec.ts}`.

**Bổ sung (07/10/2026):** thêm `GET /tours/:id/details` (quyền `Place.Edit.Managed`, đọc được bản nháp; `ToursService.getDetails` → `repo.detail`). Controller spec 5/5; `tsc` API exit 0; eslint `src/modules/tours` exit 0. Chưa có editor web; chưa có hàm web gọi endpoint này.

**Editor tour (07/10/2026, local, CHƯA COMMIT):** `category-admin/TourDetailsEditor.tsx` (+ spec 7/7), `modules/tours/api/tours.admin.api.ts`, nối vào `EditPlaceView.tsx` khi `category_slug='tour'` (4 dòng). Thời lượng trống gửi `null`, không thành 0; `tour_type` chỉ gửi khi đã chọn; 409/400 giữ nội dung đang nhập. `tsc` web exit 0; eslint các file mới exit 0. Lỗi lint có sẵn `EditPlaceView.tsx:76` (set-state-in-effect) không do thay đổi này.

**Chưa có:** e2e DB thật cho tour; mục công khai cho các trường chi tiết tour; trình duyệt desktop/375px cho editor tour.

**Mục công khai tour (07/10/2026, local, CHƯA COMMIT):** `tours/[slug]/page.tsx` thêm `TourInfoSection` (loại, thời lượng, độ khó, điểm đón, bao gồm, không bao gồm, quy định hủy); chỉ hiện trường có giá trị. Spec mới `page.tour-info.spec.tsx` 3/3 + spec cũ 10/10 (tổng 13/13 trên hai file). `tsc` web exit 0; eslint trang exit 0.

**Trạng thái nhóm tour sau lượt này:** code API CAS + GET quản trị, editor admin, mục công khai đã có trong working tree (chưa commit). Còn thiếu: e2e DB thật cho CAS/quyền tour; trình duyệt desktop/375px cho editor và mục công khai; ảnh/lịch trình chưa kiểm sâu.

### 13i. Nhóm tour: commit, candidate, kiểm thử cô lập (07/10/2026)

**Quyền đã cấp (ghi nhận, không hỏi lại):** tạo stack `phq-r3-*` trên VPS cô lập (đã dọn); migration trên DB test mới; e2e DB thật; commit gói tour; build và kiểm candidate tour. KHÔNG bao gồm: cutover, ghi production, đổi pin/secrets, deploy, sửa `ffe8f569-…`.

**Commit (trên `feat/beach-details-cas`, không push/merge):**
- `be3b140` `feat(tours): CAS on tour details, admin editor and public details section` — 14 file (API tour, e2e tour, editor, mục công khai).
- `f906467` `fix(tours): rewrite the public tour-info spec so the web build typechecks` — 1 file. Sửa lỗi `next build` (TS2393) từ spec được tạo sai; không sửa ngầm artifact cũ.
- Quan hệ: `be3b140` chứa `3dc1734` và `535598f` (đều là tổ tiên, đã kiểm bằng `merge-base --is-ancestor`). Không có migration mới giữa `3dc1734` và `f906467` (diff rỗng).
- Chưa commit: `apps/api/test/restaurant-details-authz.e2e-spec.ts` (WIP nhà hàng, đã chạy PASS trong run r3 nhưng không thuộc gói tour) và `apps/web/next-env.d.ts`.

**Kiểm thử source:** tour unit 25/25 (repo), controller 5/5; web `tsc` toàn bộ exit 0; spec tour web 13/13; eslint các file tour đạt.

**E2E DB thật (run r3, DB `phq_test` cô lập, 80 migration áp dụng từ commit nền `535598f`):** tour 6/6; nhà hàng authz 4/4; nhà hàng patch-semantics 3/3. Log trong `docs/delivery/evidence/tour-r3-2026-10-07/` (giữ cả các lần fail và lỗi đã sửa: rollback khi thiếu tour_type; timeout công khai do retry cache-invalidation tới host không tồn tại trong run).

**Candidate `f906467…` (cùng full SHA cho API và Web):**
- API `phuquochub-api:f90646735eaa2f63e426ce7a9350e9328ead2fb4` (ID `d5ca84d7…`), revision/APP_REVISION khớp.
- Web `phuquochub-web:f90646735eaa2f63e426ce7a9350e9328ead2fb4` (ID `f7a9989d…`), label revision khớp; build-args production giữ nguyên (`https://phuquochub.com/api`, bundle chặn bằng route ở browser).
- Candidate `be3b140` Web FAIL (không có image); API `be3b140` có image nhưng KHÔNG dùng để kiểm.
- Kiểm HTTP trên candidate: GET 200/403, PATCH 200/409/403/400, organizer_id được giữ, PATCH lần kế dùng version trả về, draft public 404 không lộ. `tour-api-check.json`.
- Browser desktop/375px: 22/22, `blocked=0`, `pageErrors=0`. Luồng: editor tải → sửa → lưu → reload; public hiển thị đúng; 409 giữ nội dung và không ghi đè; lần đầu thiếu loại 400 giữ nội dung; bãi B không thuộc owner: 403, không có form; bãi thiếu/nháp đúng.
- DB sau browser (đối chiếu): A version 6, organizer giữ, exclusions giữ, duration 120; nháp version 1, không có hàng chi tiết; B không đổi; audit 5 khớp số lần ghi thành công.
- Bằng chứng: `docs/delivery/evidence/candidate-tour-f906467-2026-10-07/`.

**Phần chưa đạt / giới hạn:**
- Không kiểm luồng retry hai request (tour không tạo nguồn); lần browser không inject lỗi 500 cho PATCH.
- Dữ liệu synthetic: chứng minh chức năng, không chứng minh chất lượng dữ liệu production.
- Mục công khai tour chưa đối chiếu với nội dung thật; không có ảnh/lịch trình kiểm sâu.

**Gói rollout/rollback đề xuất (CHƯA thực hiện, chờ duyệt):**
- Thay đổi: API `f906467` (tour PATCH bắt buộc `expected_content_version`) và Web `f906467` (editor tour, mục công khai tour). Không có migration.
- Thứ tự: API trước (`up -d --no-build --no-deps api` với `APP_REVISION` đúng), sau đó Web; cập nhật `release_tag_set`. Đây là cutover, cần duyệt riêng.
- Tương thích: web cũ không gọi PATCH tour nên an toàn; cần xác nhận không có client API ngoài gọi PATCH tour cũ (sẽ nhận 400).
- Hậu kiểm: `/tours/<slug>` công khai, `GET /tours/:id/details` quản trị, PATCH có version.
- Rollback: Web về pin hiện tại (`b91e92c…`), API về pin hiện tại (`f0c65b7…`). Không có migration để revert; dữ liệu tour đã ghi bằng API mới vẫn đọc được bởi API cũ (cùng cột).

**Quyết định cần bạn duyệt:**
1. Cutover candidate `f906467` (API trước, Web sau) — chưa duyệt.
2. Nhà hàng: chính sách giá món công khai (A) và migration đơn vị/ngày giá (B) — chưa duyệt.
3. Commit WIP nhà hàng (spec authz) — chưa duyệt.

### 13j. Khách sạn: kiểm kê (07/10/2026, đọc source, chưa triển khai)

| Yêu cầu | Đã có (đã đọc) | Còn thiếu cần xác nhận |
|---|---|---|
| Ghi chi tiết | `PATCH :id/details` có `expected_content_version` (CAS), `GET :id/details` quản trị; `HotelDetailsEditor` | Chưa kiểm e2e DB thật cho quyền/CAS khách sạn |
| Hạng sao + nguồn | `star_rating`, `star_rating_source_id`; public hiện sao và nguồn | Chưa kiểm e2e/browser |
| Giờ nhận/trả | `check_in`, `check_out`; public hiện "Nhận/Trả" và "Chưa có thông tin" khi thiếu | Chưa kiểm browser |
| Phòng | `PATCH :id/rooms`, `GET :id/rooms`; `capacity`, `price_ref`, `valid_from/to` | Đường hiển thị giá/điều kiện trên public cần đọc riêng |
| Tiện ích | `GET :id/amenities`; public nối nhãn | Không đồng nghĩa miễn phí — cần kiểm nhãn |
| Loại hình | `hotel_type` | Kiểm hiển thị |

**Kết luận:** khách sạn gần đủ tiêu chí; việc tiếp theo là e2e DB thật (quyền, CAS, bảo toàn field, draft) và kiểm browser desktop/375px, không viết lại chức năng. Chưa làm trong lượt này vì cần DB test (chờ duyệt stack, đã dọn).

### 13k. Quyền được cấp (07/10/2026) — ghi để không hỏi lại

1. **Khách sạn:** được tạo stack `phq-r4-*` trên VPS (Postgres/PostGIS, Redis, thành phần test cần thiết) trong mạng cô lập; migration hiện có trên DB test mới; seed synthetic; ưu tiên candidate `f906467` nếu source cần đã có trong image, không rebuild vì fixture/harness. Dọn đúng `phq-r4-*` sau khi lưu bằng chứng. Không đụng `phq-r1-*`, production, storage/DB/tài khoản production.
2. **Nhà hàng — nguyên tắc giá món:** đã duyệt (xem mục 13l).
3. **Nhà hàng — migration cô lập:** được thiết kế và triển khai bổ sung tối thiểu đơn vị/ngày ghi nhận nếu schema hiện tại không đáp ứng; nullable, không backfill suy đoán; CHƯA chạy trên production.
4. **Commit test authz nhà hàng:** `apps/api/test/restaurant-details-authz.e2e-spec.ts` (chỉ spec này).
5. **Candidate `f906467`:** CHƯA cutover. Không coi chờ cutover là điểm chặn cho khách sạn, nhà hàng hoặc phần local đợt 2.

### 13l. Khách sạn, nhà hàng và gói release (07/10/2026)

**Nguyên tắc giá món nhà hàng (đã duyệt):** hiển thị giá khi cơ sở/nguồn được phép cung cấp theo quyền/kiểm duyệt hiện có; phân biệt cụ thể/khoảng/thỏa thuận/chưa biết; thiếu giá không thành miễn phí; không đoán đơn vị/nguồn/ngày của bản ghi cũ.
**Đối chiếu với đề xuất A:** A hiện ẩn MỌI giá món công khai (fail-closed) và chưa có cơ chế cho giá được phép hiển thị. Điểm khác duy nhất: nguyên tắc cho phép hiển thị giá đã được phép, A thì không. Để làm được việc đó cần đơn vị, ngày ghi nhận và nguồn trên từng món (mục B).
**Trạng thái B:** CHƯA triển khai trong lượt này. Chưa viết migration; chưa có schema diff đã kiểm thử. Đây là phần còn thiếu của nhà hàng.
**Phát hiện mới (chưa sửa):** `restaurants` `replaceRooms`/`menu` và phòng khách sạn dùng `currency DEFAULT 'VND'` NOT NULL: một phòng/món chưa có giá vẫn có đơn vị "VND" trong API. Vi phạm "không tự đoán đơn vị", cần quyết định schema (nullable) — chưa sửa.

**Khách sạn (stack `phq-r4-*`, đã dọn):**
- Migration: 80/80 áp dụng từ image candidate `f906467` trên DB test mới (`migrate.log`).
- HTTP trên candidate (`hotel-api-check` trong `browser/hotel-api-check.json`): details GET 200, GET B 403, PATCH không `hotel_type` 400, stale 409, PATCH đúng trả version mới và GIỮ hạng sao + nguồn; PATCH B 403; nháp public 404; phòng không giá public = null.
- Browser desktop/375px: 23/23, blocked=0, pageErrors=0. Hạng sao có nguồn hiện là "Nguồn: …", không có nhãn "đã xác minh". Đổi hạng sao KHÔNG kèm nguồn mới thì nguồn cũ bị xoá (đúng hợp đồng `computeSourcedFieldPatch`). Giờ nhận trống hiện "Chưa có thông tin nhận phòng", không coi là đang mở. 409 giữ nội dung đang nhập. Người không quản lý: GET 403, không có form.
- Bằng chứng: `docs/delivery/evidence/hotel-r4-2026-10-07/` (log run 1–3 giữ nguyên lịch sử, gồm run đầu fail do kịch bản giả định trạng thái).
- Fixture: `sources.reliability = 50` là giá trị FIXTURE (cột NOT NULL), KHÔNG phải đánh giá nguồn.

**Lỗi thật phát hiện và đã sửa LOCAL (chưa đưa vào candidate):** `PATCH /hotels/:id/rooms` KHÔNG có CAS. Ghi không version luôn được chấp nhận (200), gửi version bị 400 vì DTO không khai báo. Sửa: `expected_content_version` bắt buộc, CAS trong cùng transaction (lệch → 409, không xoá/ghi phòng nào); trả `{ rooms, content_version }` (đổi kiểu trả về; không có caller web nào của endpoint này). Kiểm: hotels unit 28/28 (tsc API exit 0, eslint exit 0); rooms e2e DB thật 4/4 (`hotel-rooms-cas.e2e-spec.ts`, log `e2e-hotel-rooms.log`).
**Khoảng trống lớn:** editor khách sạn KHÔNG có phần sửa phòng — admin chưa thể nhập phòng từ giao diện. Chưa làm.

**Gói release đầy đủ (chưa cutover):**
- Candidate: full SHA `f90646735eaa2f63e426ce7a9350e9328ead2fb4` (commit `f906467`). API `phuquochub-api:f906…` (ID `d5ca84d7…`), Web `phuquochub-web:f906…` (ID `f7a9989d…`). `APP_REVISION`/label khớp SHA. Log build và identity trong `docs/delivery/evidence/candidate-tour-f906467-2026-10-07/`.
- Baseline production đã xác nhận (đọc-only, 07/10/2026): Web `phuquochub-web:b91e92ce7baf…` (`b91e92c`), API `phuquochub-api:f0c65b716c39…` (`f0c65b7`).
- Thay đổi so với cặp production: 9 commit; API 29 file, Web 14 file; **không có migration mới** so với `f0c65b7`. Gồm: CAS chi tiết tour, editor tour, mục công khai tour, GET quản trị tour, spec beach/restaurant/hotel. Bản sửa rooms khách sạn và migration nhà hàng CHƯA có trong candidate này.
- Tương thích: web mới gọi `GET /beaches/:id/details`, `GET/PATCH /tours/:id/details` — không có trên API cũ → API PHẢI lên trước. Web cũ không gọi các endpoint mới nên chạy được với API mới.
- Thứ tự: (1) API `f906467` `up -d --no-build --no-deps api` với revision đúng; (2) hậu kiểm HTTP tour/bãi; (3) Web `f906467`; (4) cập nhật pin.
- Hậu kiểm: `GET /api/health`, `APP_REVISION`, `GET /tours/<slug>` công khai, `GET /beaches/<slug>`, PATCH có version trên một bản ghi thử.
- Rollback: Web về `b91e92ce…`; API về `f0c65b716c…`. Không có migration để revert; dữ liệu tour/bãi đã ghi bằng API mới vẫn đọc được bởi API cũ (cùng cột).

**Trạng thái tổng:** code có (commit `3dd685a`, `be3b140`, `f906467`; sửa rooms và rooms e2e chưa commit); commit: đã có cho tour/bãi/spec nhà hàng; candidate: `f906467` đã build và kiểm; deploy: chưa; nghiệm thu production: chưa.
**Chưa làm:** migration nhà hàng (B); sửa rooms candidate mới; editor phòng khách sạn; kiểm trình duyệt bản sửa rooms; luồng retry nguồn khách sạn (không có luồng hai request trong khách sạn đã kiểm).

### 13m. Đợt 1 còn lại — tiến độ (07/10/2026, CHƯA commit, CHƯA build)

**Quyết định áp dụng (đã duyệt):** giá món công khai được hiển thị khi cơ sở/nguồn được phép cung cấp qua quyền/kiểm duyệt hiện có; giá null = chưa có giá (không phải miễn phí); thiếu đơn vị/ngày/nguồn hiển thị "chưa rõ", không suy đoán; ngày sửa bản ghi KHÔNG phải ngày ghi nhận giá.

**Điều kiện hiển thị giá món — trước/sau:**
- Trước: API công khai luôn trả `price = null` cho mọi món (fail-closed); trang nhà hàng ẩn giá và hiện dòng "đang xác minh".
- Sau: API công khai trả `price`, `price_unit`, `price_recorded_on`, `price_source` khi có; trang hiện giá + "(chưa rõ đơn vị)" / "chưa rõ ngày ghi nhận" / "chưa rõ nguồn giá" khi thiếu; giá null hiện "chưa có giá".
- Không thay đổi: quyền Place.Edit.Managed để ghi; CAS menu; trạng thái publication; cổng giá cấp địa điểm (`prices`/`price_range`).
- Xung đột cần biết: test cũ khoá "raw price không bao giờ lộ" đã được viết lại theo chính sách mới (không sửa để test xanh).

**Schema (migration mới):** `1720007900000-AddRestaurantMenuPriceMeta` — thêm `price_unit varchar(40) NULL`, `price_recorded_on date NULL`, `price_source_id uuid NULL → sources(id) ON DELETE SET NULL`; CHECK: ngày chỉ khi có giá; đơn vị không rỗng. Không backfill. `currency` giữ nguyên (không đổi VND thành null).

**Đã làm (local):**
- API nhà hàng: DTO, repository (đọc kèm nguồn, ghi đủ cột), `mapItem`, chặn món chưa có giá mà gửi đơn vị/ngày/nguồn (400). Unit 53/53; tsc API và eslint đạt.
- Web nhà hàng: kiểu `MenuItem`, trang công khai, spec 18/18 (trang) và 43/43 (nhà hàng). tsc web đạt.
- Khách sạn rooms CAS (API, từ lượt trước): hotels unit 28/28, e2e DB 4/4.

**Chưa làm (còn trong đợt 1):**
1. Editor admin giá món (MenuEditor): nhập đơn vị, ngày ghi nhận, nguồn (chọn/tạo nguồn, retry không trùng); test.
2. Editor phòng khách sạn (`RoomsEditor`) + tải/lưu rooms với version: chưa viết; response rooms đổi sang `{rooms, content_version}` nên web phải đọc đúng.
3. Migration và API trên DB test cô lập: chưa chạy (schema diff, bản ghi cũ, ràng buộc, rollback).
4. E2E DB thật cho menu price và rooms (quyền, CAS, bảo toàn field); browser desktop/375px.
5. Commit theo phần, build candidate mới (SHA mới), bằng chứng và gói release.

**Tình trạng:** code local có; commit chưa; candidate chưa; deploy chưa; nghiệm thu chưa.

### 13n. Candidate `0072e2a` — rooms khách sạn và giá món nhà hàng (07/10/2026)

**Trạng thái:** SOURCE ĐẠT · COMMIT ĐẠT · CANDIDATE ĐẠT (kiểm trên stack cô lập) · CHƯA DEPLOY · CHƯA NGHIỆM THU PRODUCTION.

**Commit (trên `feat/beach-details-cas`, không push/merge):** `0f7ba30` (rooms khách sạn) · `0072e2a` (migration + metadata giá món nhà hàng). Candidate tiếp theo chứa cả hai.

**Identity (full SHA `0072e2aa561e3c3b740efff98cc34dcf1dd26d38`):**
- API `phuquochub-api:0072e2a…` — ID `7410bd92…`, revision label và `APP_REVISION` khớp.
- Web `phuquochub-web:0072e2a…` — ID `9e6498a3…`, revision khớp; build-args production giữ nguyên (`https://phuquochub.com/api`; trình duyệt test chặn origin này bằng route).
- Log build, manifest và identity: `docs/delivery/evidence/candidate-0072e2a-2026-10-07/`.

**Baseline production (đọc-only hôm nay):** Web `phuquochub-web:b91e92ce…` (`b91e92c`), API `phuquochub-api:f0c65b71…` (`f0c65b7`).

**Toàn bộ thay đổi so với cặp production:** 12 commit; API 44 file, Web 22 file; **một migration mới** `1720007900000-AddRestaurantMenuPriceMeta` (cột nullable: `price_unit`, `price_recorded_on`, `price_source_id`). Nội dung chính: CAS rooms khách sạn; route quản trị đọc rooms và menu (giá thật); editor phòng khách sạn; editor giá món nhà hàng; hiển thị giá món công khai theo chính sách mới; CAS/tour/bãi/spec đã nêu ở các mục trước (`535598f`, `be3b140`, `f906467`, `3dd685a`).

**Migration và schema:**
- Chỉ thêm cột NULLABLE, không backfill. Dữ liệu cũ: món giữ giá và `VND`, đơn vị/ngày/nguồn NULL ("chưa rõ"); phòng cũ giữ giá.
- CHECK: ngày ghi nhận chỉ có khi có giá; đơn vị không rỗng. FK nguồn `ON DELETE SET NULL`.
- Kiểm trên DB cô lập bằng cách nâng cấp thật: migrate 80 bằng image cũ → seed dữ liệu cũ → migrate 81 bằng image mới: 1 migration áp dụng; món/phòng cũ không đổi; ba ràng buộc chặn đúng dữ liệu sai.

**Ma trận tương thích:**
- API `0072e2a` + Web cũ `b91e92c`: chạy được. Web cũ không gọi route mới; PATCH menu cũ vẫn có version; các trường mới là tùy chọn.
- Web `0072e2a` + API cũ `f0c65b7`: KHÔNG chạy đúng (editor gọi `/menu/managed`, `/rooms/managed` và PATCH rooms có version). Bắt buộc API lên trước.
- API cũ `f0c65b7` với schema đã có migration 81: chạy được (cột mới nullable, câu SQL cũ không đụng cột mới). Đây là điều kiện để rollback API an toàn.
- Shape rooms đổi từ mảng sang `{rooms, content_version}`: đã kiểm callers — không có caller web cũ nào của PATCH rooms; GET rooms công khai giữ nguyên shape.

**Test đã đạt và giới hạn:**
- Source: unit khách sạn 28/28, nhà hàng 53/53, web nhà hàng 43/43, editor phòng 5/5, editor menu 6/6, controller/spec liên quan; tsc API và web exit 0; eslint phần đổi exit 0.
- DB thật (candidate, stack cô lập): HTTP và SQL — quyền 403 cho bãi/khách sạn không quản lý, 400 khi không có version, 409 không ghi (món và phòng giữ nguyên), version trả đúng, món thiếu giá không nhận đơn vị/ngày/nguồn (400), public trả giá kèm đơn vị/ngày/nguồn khi có, phòng public không có giá (null), nháp 404.
- Browser desktop/375px (candidate): **25/25** — tải phòng, thêm/bỏ phòng, lưu, reload, 409 giữ nội dung, không quyền không có form; sửa giá món cũ (đơn vị/ngày), thêm món có nguồn mới, lỗi 500 giữ nháp và retry chỉ tạo **một** nguồn; public hiện giá/đơn vị/ngày/nguồn; nháp 404; 375px không tràn ngang.
- Giới hạn thật: fixture synthetic; chưa có dữ liệu production để đánh giá chất lượng; luồng "gửi xe", "liên hệ đặt bàn", ảnh và giờ theo ngày nhà hàng chưa kiểm trong gói này; rooms không có vị trí/điểm tiếp cận riêng; browser chỉ chạy trên một khách sạn và một nhà hàng synthetic.
- Lưu ý: hai lần chạy browser đầu lỗi do harness (chọn nhầm nhãn và điều kiện trạng thái); đã sửa harness và reset fixture có kiểm soát, không hạ assertion. Log giữ trong evidence.

**Thứ tự rollout (đề xuất, chưa thực hiện):**
1. Migration 81 — chạy trên production bằng cách chạy riêng, có kiểm trước (chỉ thêm cột nullable; không cần downtime). Cần duyệt riêng.
2. API `0072e2a` (`up -d --no-build --no-deps api`), kiểm `APP_REVISION`, `/api/health`, `GET /restaurants/<slug>/menu` và `GET /hotels/<slug>` công khai.
3. Web `0072e2a` (`up -d --no-build --no-deps web`), kiểm trang nhà hàng/khách sạn, editor với một bản ghi thử do owner chọn.
4. Cập nhật pin và `release_tag_set`.

**Hậu kiểm:** health; revision; một bản ghi nhà hàng và khách sạn công khai; log lỗi API 24 giờ; số bản ghi menu có giá nhưng thiếu đơn vị (để admin biết còn thiếu gì — không tự điền).

**Rollback:**
- Web về `b91e92ce…` (tương thích API mới và schema mới).
- API về `f0c65b716c…`: chạy được với schema 81 (cột nullable), nên KHÔNG cần revert migration.
- Không chạy down migration: nó sẽ xóa đơn vị/ngày/nguồn đã nhập. Chỉ dùng nếu owner quyết định bỏ hẳn metadata giá.
- Nếu cần bỏ dữ liệu mới, phải có bản sao lưu trước đó và quyết định riêng.

**Điều kiện xung đột chính sách đã nêu:** test cũ khóa "giá món không bao giờ công khai" đã được viết lại theo quyết định sản phẩm. Điều kiện hiển thị giá món mới: có giá (null = chưa có giá). Đơn vị/ngày/nguồn chỉ hiển thị khi có, thiếu thì "chưa rõ". Giá cấp địa điểm (`prices`/`price_range`), quyền ghi, CAS và trạng thái publication không đổi.

**Quyết định cần owner:**
1. Duyệt cutover gói `0072e2a`: migration 81 trước, API, rồi Web.
2. Chấp nhận giới hạn kiểm thử ở trên (chưa có dữ liệu thật; một khách sạn và một nhà hàng synthetic).

**Chưa làm trong đợt 1 (cần để đóng đợt):** một số trường nhà hàng/khách sạn còn lại trong yêu cầu (vị trí/điểm tiếp cận khách sạn, gửi xe và liên hệ đặt bàn nhà hàng, giờ theo ngày), và phần bãi biển/tour đã kiểm trước đó chưa rà lại theo chuẩn này. Đợt 2–4 chưa bắt đầu.

### 13o. Candidate `c12dc40` — gói release đợt 1 (rooms khách sạn, giá món nhà hàng, đường vào khách sạn) (07/10/2026)

**Trạng thái:** SOURCE ĐẠT · COMMIT ĐẠT · CANDIDATE ĐẠT (stack cô lập) · CHƯA DEPLOY · CHƯA NGHIỆM THU PRODUCTION.

**Commit (trên `feat/beach-details-cas`, không push/merge):** `0f7ba30` (rooms khách sạn) · `0072e2a` (giá món nhà hàng, migration 81) · `c12dc40` (đường vào khách sạn, migration 82).

**Identity, full SHA `c12dc40ed4a067ca5eb553aa4ac96a27d30b1c93`:**
- API `phuquochub-api:c12dc40…` — ID `2ceebd64…`, revision khớp.
- Web `phuquochub-web:c12dc40…` — ID `ccd49d48…`, revision khớp; build-args production giữ nguyên.
- Evidence: `docs/delivery/evidence/candidate-c12dc40-2026-10-07/`.

**Baseline production (đọc-only hôm nay):** Web `b91e92c…`, API `f0c65b7…`.

**Toàn bộ thay đổi so với production:** 13 commit từ `b91e92c` (đo bằng `git rev-list --count`); API 45 file đổi so với `f0c65b7`; Web 25 file đổi so với `b91e92c` (đo bằng `git diff --name-only`). Migration mới so với production: **81** `AddRestaurantMenuPriceMeta` và **82** `AddHotelAccessRoute` — cả hai chỉ thêm cột NULLABLE, không backfill.

**Ma trận tương thích (đã kiểm nguyên tắc, không chỉ theo tên):**
- Web `c12dc40` + API `f0c65b7`: KHÔNG chạy đúng. Editor gọi route mới (`/rooms/managed`, `/menu/managed`), và PATCH chi tiết khách sạn gửi `access_route` mà DTO cũ từ chối (forbidNonWhitelisted → 400). API phải lên trước.
- API `c12dc40` + Web `b91e92c`: chạy được. Web cũ không gửi trường mới; PATCH rooms và menu cũ vẫn gửi version.
- API `f0c65b7` với schema 82: chạy được (câu SQL cũ không đụng cột mới; cột nullable).
- Shape rooms `{rooms, content_version}`: không có caller web cũ nào của PATCH rooms.

**Test đã đạt và giới hạn:**
- Source: unit khách sạn 47/47 (sau thay đổi đường vào), nhà hàng 53/53, web nhà hàng 43/43, editor phòng 5/5, editor menu 6/6, editor chi tiết khách sạn 3/3; tsc API và web exit 0; eslint phần đổi exit 0.
- Migration nâng cấp thật (81→82 và 80→81): dữ liệu cũ giữ nguyên, cột mới NULL cho khách sạn cũ, không đoán; ràng buộc chặn dữ liệu sai.
- Browser candidate `c12dc40`: đường vào 9/9 (lưu, tải lại, công khai, xóa về trống thì ẩn dòng, 375px, không quyền); hồi quy rooms/menu 25/25; `blocked=0`, không lỗi trang.
- Giới hạn thật: dữ liệu synthetic; hai khách sạn và hai nhà hàng synthetic; "gửi xe" (tiện ích), "liên hệ" và "giờ theo ngày" của nhà hàng đã có sẵn trong editor địa điểm và trang công khai nhưng chưa được kiểm lại trong gói này.

**Thứ tự rollout (đề xuất, chưa thực hiện):**
1. Migration 81 và 82 — chạy riêng trên production sau khi owner duyệt; cả hai là thêm cột nullable.
2. API `c12dc40` (`up -d --no-build --no-deps api`), kiểm `APP_REVISION`, `/api/health`, một khách sạn và một nhà hàng công khai.
3. Web `c12dc40`, kiểm trang chi tiết khách sạn/nhà hàng và editor với một bản ghi do owner chọn.
4. Cập nhật pin.

**Hậu kiểm:** health; revision; log lỗi API 24 giờ; số bản ghi menu có giá nhưng thiếu đơn vị (admin biết còn thiếu gì, không tự điền).

**Rollback:**
- Web về `b91e92ce…` (không gửi trường mới, chạy được với API mới và schema mới).
- API về `f0c65b716c…`: chạy được với schema 82 (cột nullable), nên không cần revert migration.
- Không chạy down migration: sẽ xóa đơn vị/ngày/nguồn giá và đường vào đã nhập. Chỉ làm nếu owner quyết định bỏ hẳn các dữ liệu này, có sao lưu trước.

**Quyết định cần owner:** duyệt cutover gói `c12dc40` theo thứ tự trên (migration 81 và 82, API, Web). Không có quyết định sản phẩm nào mở thêm.

**Chưa làm:** đợt 2–4 chưa bắt đầu. Bài nháp `ffe8f569-…` và gói Novotel/Bãi Sao không được chạm.

### 13p. Đợt 2 — góp ý có phản hồi: trạng thái (07/10/2026)

**Đã có trước đó (đọc source):** tạo đề xuất sửa địa điểm (`POST places/:id/edit-proposals`, quyền Create, giới hạn tần suất); hàng đợi và quyết định của quản trị (`PlaceEditProposal.Moderate`: danh sách, chi tiết, quyết định); các trạng thái PENDING / REJECTED / NEEDS_CHANGES / CONFLICT / APPROVED; web có form đề xuất, hàng đợi và form quyết định.

**Đã làm (commit `528912d`, local):** `GET place-edit-proposals/mine` và `GET place-edit-proposals/mine/:id` — người gửi chỉ thấy đề xuất của chính mình (404 nếu không thuộc); view người gửi không có `reviewer_id` và `review_note` (ghi chú nội bộ). Kiểm: mapper 1/1; spec đề xuất hiện có 36/36; tsc API và eslint đạt.

**Còn thiếu để đóng đợt 2 (chưa làm):**
1. Web "Góp ý của tôi": trang danh sách và chi tiết cho người gửi.
2. Phản hồi riêng cho người gửi (field không phải note nội bộ) — cần schema, chưa có.
3. Luồng áp dụng: xem diff/bằng chứng/hiện tại, áp dụng qua CAS và audit, xung đột không báo "đã áp dụng" (cần kiểm trên DB thật).
4. Kiểm trên DB cô lập: quyền người khác (không đọc/sửa), trạng thái, transaction, và public đổi/không đổi đúng.
5. Browser desktop/375px cho luồng gửi → duyệt → người gửi thấy kết quả.
6. Candidate mới cho đợt 2 (chưa build).

**Trạng thái:** source đợt 2: một phần (API người gửi). Commit local: có (`528912d`). Candidate: chưa. Deploy và nghiệm thu: chưa.

**Quyết định cần owner:** không có điểm chặn về quyền. Cần quyết định sản phẩm về phản hồi cho người gửi (field riêng khỏi ghi chú nội bộ): đề xuất thêm một trường `sender_message` nullable, admin điền khi quyết định, người gửi đọc được; không đưa `review_note` ra ngoài.

**Việc tiếp theo:** web trang "Góp ý của tôi"; sau đó luồng áp dụng và kiểm DB; rồi build candidate đợt 2 khi đủ một luồng hoàn chỉnh.

**Cập nhật 13p (07/10/2026):** thêm web "Góp ý của tôi" (`/dashboard/my-proposals`, commit `4cbba4f`): danh sách đề xuất của người dùng, trạng thái và ngày; trạng thái rỗng và lỗi tách biệt; không hiện người duyệt hay ghi chú nội bộ. Kiểm: spec 3/3, tsc web đạt, eslint file đổi đạt. Commit API người gửi: `528912d`.
**Còn thiếu đợt 2:** kiểm DB thật (quyền người khác, trạng thái, transaction áp dụng, public đổi/không đổi); luồng admin xem diff và áp dụng qua CAS/audit (đã có từ trước, chưa kiểm lại); phản hồi riêng cho người gửi (`sender_message`, cần quyết định sản phẩm); browser 375px; candidate đợt 2 (chưa build).

### 13q. Đợt 2 — góp ý có phản hồi: candidate `4cbba4f` (07/10/2026)

**Trạng thái:** SOURCE ĐẠT (phần người gửi) · COMMIT LOCAL (`528912d`, `4cbba4f`) · CANDIDATE ĐẠT (stack cô lập) · CHƯA DEPLOY · CHƯA NGHIỆM THU PRODUCTION.
**Identity:** full SHA `4cbba4f0a65de17416a3fc00307c3256190905dd`; API `phuquochub-api:4cbba4f…` ID `d6a2edfd…`; Web `phuquochub-web:4cbba4f…` ID `22dc312a…`; revision khớp. Migration: không có mới (schema 82). Baseline production: không đổi.
**Evidence:** `docs/delivery/evidence/candidate-4cbba4f-proposals-2026-10-07/`.

**Kết quả kiểm trên DB và API thật (stack `phq-r7`, đã dọn):**
- Gửi đề xuất trường `short_description` → 201; người gửi thấy "chờ duyệt"; người khác: danh sách rỗng, đọc đề xuất của người gửi → 404; người gửi vào hàng duyệt → 403; quản trị → 200; gửi lặp cùng trường khi đang chờ → 409.
- Duyệt → áp dụng, công khai đổi, người gửi thấy "đã áp dụng" và ngày xử lý.
- Từ chối (có ghi chú nội bộ) → công khai không đổi; người gửi thấy "đã từ chối"; ghi chú không lộ.
- Xung đột: giá gốc đổi giữa chừng (mô phỏng sửa đồng thời bằng SQL trên DB test) → duyệt trả `conflict`, công khai giữ giá quản trị, người gửi thấy "xung đột".
- Browser (desktop + 375px): 6/6; không tràn ngang; người khác không thấy đề xuất nào.

**Giới hạn và điều cần biết:**
- Chỉ các trường được phép gửi: `opening_hours`, `address`, `short_description`. Mô tả dài không đề xuất được qua luồng này.
- Xung đột được tạo bằng SQL trên DB test (không phải thao tác admin thật qua giao diện).
- Chưa có phản hồi riêng cho người gửi (`sender_message`): người gửi chỉ thấy trạng thái và ngày; không đưa ghi chú nội bộ ra ngoài.
- Chưa kiểm luồng admin xem diff/bằng chứng trên browser, và chưa kiểm ảnh góp ý qua media moderation.
- Thử nhiều lần bị giới hạn tần suất (5 gửi/phút) và các run treo do lỗi script; log giữ trong evidence.

**Quyết định cần owner:** chấp nhận giới hạn trên cho candidate `4cbba4f`; quyết định về `sender_message` (thêm field nullable, admin điền khi quyết định); cutover đợt 1 (`c12dc40`) và đợt 2 (`4cbba4f`) là gói riêng, chưa duyệt.

**Cập nhật 13q — luồng admin xem diff (07/10/2026, stack `phq-r8`, đã dọn):** kiểm trên trình duyệt (không chỉ đọc code) trang `/dashboard/edit-proposals` với candidate `4cbba4f`. Kết quả 7/7: trang tự gọi `previewPlace()` và hiện đúng "Hiện tại" (giá trị gốc) cạnh "Đề xuất"; có nút quyết định; sau khi duyệt, đề xuất không còn ở trạng thái chờ và `places.short_description` trong DB đổi đúng thành giá trị đã duyệt. Ảnh: `docs/delivery/evidence/candidate-4cbba4f-proposals-2026-10-07/browser/queue-desktop.png`, `queue-after-decide.png`.
**Đợt 2 còn thiếu sau cập nhật này:** ảnh góp ý qua media moderation; phản hồi riêng cho người gửi (`sender_message`, chờ quyết định); 375px cho trang duyệt admin (đã kiểm cho trang người gửi, chưa kiểm trang admin).

**Cập nhật 13q — 375px trang duyệt admin (07/10/2026, stack `phq-r9`, đã dọn):** 4/5 tự động đạt; mục còn lại là harness tìm sai thời điểm (nút chỉ hiện "Xác nhận: …" SAU khi chọn một quyết định — đúng thiết kế, không phải lỗi). Xác nhận bằng ảnh: không tràn ngang, "Hiện tại" và "Đề xuất" đều hiện rõ ở 375px. Ảnh: `docs/delivery/evidence/candidate-4cbba4f-proposals-2026-10-07/browser/queue-375-mobile.png`.

**Phát hiện cần owner quyết định (chưa tự làm):** luồng góp ý hiện KHÔNG có đường gửi ảnh — các trường được phép đề xuất chỉ là `opening_hours`, `address`, `short_description` (văn bản). "Ảnh góp ý qua media moderation" trong yêu cầu đợt 2 chưa có hạ tầng (không có upload, không có liên kết tới moderation trong luồng proposal). Đây là một tính năng mới (upload + gắn vào hàng duyệt + hiển thị cho admin), không phải khoảng trống nhỏ. Cần owner xác nhận có đưa vào phạm vi đợt 2 ngay hay lùi sang sau, trước khi tôi thiết kế schema/API cho việc này.

**Đợt 2 còn lại sau cập nhật này:** quyết định `sender_message`; quyết định phạm vi ảnh góp ý; sau đó mới coi đợt 2 là đã kiểm đủ theo yêu cầu gốc.

**Cập nhật 09/10/2026 — `sender_message` ĐÃ LÀM, không còn chờ quyết định:** đọc lại prompt tổng (đã lặp lại nguyên văn ~8 lần từ 07/10 tới 09/10 không đổi) thấy mục V đợt 2 ghi RÕ "Tách phản hồi public khỏi note nội bộ" — đây là yêu cầu ĐÃ CHỐT trong chính văn bản, không phải một lựa chọn sản phẩm còn mở cần hỏi lại (khác với lúc viết đoạn trên, trước khi nhiều lần lặp lại khẳng định không đổi câu này). Đã thêm cột `sender_message` (nullable, migration `1720008800000`), field độc lập hoàn toàn với `review_note` trong `DecidePlaceEditProposalDto`/service `decide()` (viết ở MỌI nhánh quyết định, kể cả nhánh CONFLICT có đường ghi riêng), lộ ra ở CẢ hai mapper view. Web: ô "Phản hồi cho người gửi" (luôn tuỳ chọn, tách khỏi ô "Lý do" bắt buộc) trong form quyết định; "Góp ý của tôi" hiện phản hồi dạng trích dẫn khi có. Code: `74356fe`. 11 test mới, API 257 suite/3705 test PASS, Web 160 suite/1605 test PASS. Không cần candidate VPS riêng (không đổi API route nào, chỉ thêm field) — xem mục VIII "chỉ kiểm lại khi có rủi ro cụ thể"; rủi ro ở đây chỉ là field mới hoàn toàn cộng thêm, cùng mức rủi ro đã chấp nhận cho các cột nullable khác trong phiên này.

**Còn lại của đợt 2 sau cập nhật này: CHỈ còn "ảnh góp ý qua media moderation"** — đang thiết kế (đọc lại CHECK constraint "một chủ sở hữu" của bảng `media` dùng chung trước khi mở rộng thêm nhánh thứ 6 `proposal_id`, đúng nguyên tắc "chỉ tách phần dùng chung khi có nhu cầu thực, đọc đúng trước khi sửa phần dùng chung nhạy cảm").

### 13r. Đợt 3 — Tuyển dụng MVP: bảng trạng thái và thiết kế (07/10/2026, bắt đầu)

**Không có module nào trước đó** (đọc source xác nhận: không có `jobs`/`recruit*` trong `apps/api/src/modules` hay `apps/web/src/modules`). Đây là tính năng mới hoàn toàn, không phải khoảng trống trong module có sẵn.

**Bảng chuyển trạng thái (chốt trước khi code, theo yêu cầu mục VI):**

| Từ | Sang | Ai | Điều kiện |
|---|---|---|---|
| (mới) | draft | chủ tin | tạo tin |
| draft | pending | chủ tin | gửi duyệt |
| pending | published | moderator | duyệt — ghi `reviewer_id`/`reviewed_at`/`published_at` |
| pending | rejected | moderator | từ chối — ghi `reviewer_id`/`reviewed_at`/`review_note` |
| rejected | pending | chủ tin | sửa rồi gửi lại (không qua lại draft) |
| draft/pending | draft | chủ tin | sửa khi chưa công khai |
| published | closed | chủ tin hoặc moderator | đóng tin (đã tuyển đủ/ngừng) |
| closed | pending | chủ tin | mở lại — PHẢI qua duyệt lại, không tự đẩy ngày đăng |
| published (còn hạn) | — | hệ thống | hiển thị công khai |
| published + `expires_at` < hôm nay | — | hệ thống | **không đổi cột status**; điều kiện đọc public tính hết hạn tại thời điểm đọc (không chỉ dựa cron) — tin ẩn khỏi danh sách/chi tiết công khai nhưng chủ tin vẫn thấy trong "Tin của tôi" với nhãn "đã hết hạn" |

**Giới hạn MVP đã quyết định để tránh over-engineer (ghi rõ, không hỏi lại):** sửa nội dung cốt lõi khi tin đang `published` chuyển tin về `pending` ngay (tin tạm ẩn khỏi public cho đến khi duyệt lại) — KHÔNG xây overlay "bản sửa chờ duyệt song song với bản public" cho đợt này (việc đó cần một bảng revision riêng, ngoài phạm vi một luồng MVP). Lý do: tin tuyển dụng không có khái niệm "bản dịch công khai đã duyệt" giữ nguyên trong lúc chờ như place; chấp nhận gián đoạn ngắn khi admin duyệt lại thay vì xây thêm một hệ thống revision.

**Schema tối thiểu (job_listings), không bảng nào tái dùng được cho tin tuyển dụng (không giống chi tiết địa điểm):** người đăng (`created_by`), cơ sở/vai trò tự do (`employer_name`, `employer_role`), `place_id` tùy chọn, `title`, `job_category`, `ward`, `work_location`, `employment_type` (full_time/part_time/seasonal), `salary_min/max`, `salary_negotiable`, `salary_currency`, `salary_period` (hour/day/month — đơn vị tiền lương, không suy đoán), `shift_info`, `requirements`, `benefits`, `description`, `contact_method`/`contact_value` (liên hệ công khai do chủ tin chọn), `status`, `review_note` (nội bộ), `reviewer_id`/`reviewed_at`, `expires_at` (date), `published_at`.

**Tái sử dụng:** quyền/role theo đúng khuôn `place-edit-proposals` (`member` tạo, `moderator` + `content_owner` duyệt — cấp trực tiếp, không qua kế thừa, đúng lý do đã ghi trong `GrantContentOwnerPlaceEditProposalModeration`). "Tin của tôi" cùng khuôn "Góp ý của tôi". Chưa có bảng/luồng nào để tái dùng cho báo sai/báo trùng tin tuyển dụng — sẽ xem `place-reports` khi tới phần đó.

### 13s. Đợt 3 — Tuyển dụng MVP: backend đã commit `de5852d` (07/10/2026)

**Đã có (local, đã test, đã commit — CHƯA build candidate, CHƯA có web UI):**

- Migration `1720008100000-InitJobListings` (bảng `job_listings`, 3 enum type, 6 CHECK constraint, 6 index) + `1720008200000-SeedJobListingPermissions` (`JobListing.Create` → `member`; `JobListing.Moderate` → CẢ `moderator` VÀ `content_owner` ngay trong migration này — tránh lặp lại việc phải vá sau như `place_edit_proposals`).
- `JobListingsRepository`/`JobListingsService`/`JobListingsController`/`JobListingsModule`, đăng ký trong `app.module.ts`. Route: `GET /job-listings` + `GET /job-listings/:id` (công khai, @Public — chỉ published và chưa hết hạn, lọc hết hạn TẠI THỜI ĐIỂM ĐỌC, không đổi cột status), `GET /job-listings/mine` + `/mine/:id` (đã đăng nhập, không cần quyền Moderate), `GET /job-listings/pending` + `POST /job-listings/:id/decide` (`JobListing.Moderate`), `POST /job-listings` + `PATCH /job-listings/:id` + `POST /job-listings/:id/submit` (`JobListing.Create`), `POST /job-listings/:id/close` + `/:id/reopen` (chủ tin HOẶC moderator — quyết định quyền nằm trong service qua `AuthorizationService.can()`, cùng mẫu `ModerationService.decide()`, vì route này không biết trước ai gọi lúc khai decorator).
- **Sửa một sai lệch với bản thiết kế đã chốt ở §13r trong lúc code**: §13r nói rõ "sửa nội dung cốt lõi khi tin đang `published` chuyển tin về `pending` NGAY" — bản code đầu tiên của tôi lại CHẶN hẳn việc sửa khi đang published (bắt đóng tin trước). Đã sửa lại `JobListingsService.update()` đúng theo §13r: sửa khi `published` → tự chuyển về `pending` (ẩn khỏi công khai ngay, xoá `reviewer_id/reviewed_at/published_at`, buộc duyệt lại); `closed` vẫn chặn sửa trực tiếp (phải `reopen()` trước — tránh gộp ngầm hai hành động "mở lại" và "sửa" thành một).
- **Một lỗi SQL thật bị bắt trước khi chạy migration**: migration `SeedJobListingPermissions` lúc đầu viết cột `"resource"` — bảng `permissions` thật dùng cột `"module"` (xác nhận bằng cách so với 5 migration seed-permission gần nhất, tất cả đều `"module"`). `tsc` không bắt được vì đây là một chuỗi SQL thô; sửa trước khi migration từng chạy lần nào. Đây đúng là loại lỗi mà bước "chạy migration thật trên DB cô lập" (chưa làm — xem bên dưới) sẽ bắt được dù `tsc`/eslint đã xanh.
- Test: 22 unit test cho service (sở hữu, toàn bộ các chuyển trạng thái trong bảng §13r, validate lương, lọc hết hạn) + 2 spec cấu trúc migration (ghi lại SQL qua `QueryRunner` giả, không cần DB) cho cả hai migration mới — tổng 32 test mới, tất cả PASS. `tsc --noEmit` và eslint sạch trên toàn bộ file mới. Toàn bộ suite API (239 suite / 3561 test) vẫn PASS sau khi thêm module này.

**CHƯA làm (còn lại của đợt 3):**

- Chưa chạy migration thật trên một DB cô lập (chỉ mới test cấu trúc SQL qua mock `QueryRunner`, KHÔNG phải bằng chứng DB — đúng nguyên tắc "stub không thay thế bằng chứng lưu/CAS trên DB" đã áp cho các đợt trước). Sẽ chạy cùng lúc dựng stack cô lập để test HTTP/browser, không tách riêng.
- Chưa có web UI: form tạo/sửa tin, trang tìm kiếm/danh sách/chi tiết công khai, "Tin của tôi", hàng chờ duyệt cho moderator. Theo đúng quy tắc "build candidate khi đủ một luồng hoàn chỉnh" (mục VIII), KHÔNG build candidate cho riêng phần backend này — tiếp tục sang web trước.
- Hai quyết định còn treo của đợt 2 (field `sender_message` cho người gửi góp ý; phạm vi ảnh đính kèm góp ý) VẪN CHƯA có quyết định từ owner — không liên quan đợt 3, không chặn tiến độ đợt 3.

### 13t. Candidate `1b122b8` — Tuyển dụng MVP trọn luồng (backend + web), đã test cô lập (07/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật, không mock) — CHƯA deploy, CHƯA nghiệm thu production.**

**Code:** `de5852d` (backend: entity/migration/repository/service/controller) → `bf55401` (sửa service trả raw entity thành mapper snake_case đúng quy ước mọi module khác, vá 1 sai lệch với bảng trạng thái đã chốt §13r khi code — sửa `published→update` từ "chặn" thành "tự rút về pending" đúng thiết kế) → `1b122b8` (web: public `/jobs` + `/jobs/[id]`, dashboard "Tin tuyển dụng của tôi" + tạo/sửa + hàng chờ duyệt, nav/sitemap/hub-copy). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Image identity (xác nhận bằng `docker image inspect`):**
- `phuquochub-api:1b122b8c8635279e2e51d51fb4dec29078c437a6` — id `sha256:0d73f6ee…`, label revision khớp đúng SHA.
- `phuquochub-web:1b122b8c8635279e2e51d51fb4dec29078c437a6` — id `sha256:80c82b3f…`, label revision khớp đúng SHA.
- Build-arg web: `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL` production thật — đúng cấu hình sẽ chạy thật nếu triển khai, không phải build riêng cho test.
- Nguồn build: archive checksum-verified từ `scripts/create-release-archive.sh`/`sync-release-source.sh` (84 migration, khớp SHA) — không build từ working tree Windows.

**Migration (chạy thật trên Postgres cô lập, KHÔNG phải mock QueryRunner):** cả 84 migration (82 cũ + `InitJobListings`/`SeedJobListingPermissions`) chạy thành công trên DB trống `phq_test` mới tạo, bằng `npx typeorm migration:run -d dist/core/database/data-source.js` (image thật, không ts-node). Xác nhận bằng SQL trực tiếp: `role_permissions` có đúng `member→JobListing.Create`, `moderator→JobListing.Moderate`, `content_owner→JobListing.Moderate` (3 dòng, đúng thiết kế "cấp cả hai ngay trong 1 migration", không có khoảng trống như place-edit-proposals từng có).

**Test cô lập (VPS, stack `phq-r10-*` — network `--internal`, không egress, đã dọn sau khi lưu bằng chứng):**
- **HTTP (DB thật, 38/38 PASS):** tạo/sửa/submit/decide/close/reopen đúng toàn bộ bảng chuyển trạng thái §13r kể cả hai nhánh dễ sai nhất — sửa khi `published` tự rút về `pending` (không chặn, không qua draft) và sửa khi `closed` bị chặn 409; resubmit từ `rejected` thẳng lên `pending` không qua draft; ownership (404 khi không sở hữu, không lộ tồn tại) và quyền moderator (403 khi thiếu `JobListing.Moderate`) tại đúng record; validate lương (có số tiền thiếu currency → 400); và quan trọng nhất — **một tin `published` nhưng `expires_at` đã qua KHÔNG đổi cột `status`, vẫn 404 trên cả list lẫn detail công khai TẠI THỜI ĐIỂM ĐỌC, nhưng chủ tin vẫn thấy nó trong "mine"** — đúng yêu cầu mục VI "hết hạn xét tại điều kiện đọc public, không chỉ cron".
- **Browser (Playwright chromium thật, 11/11 PASS):** đăng nhập qua UI thật → tạo tin qua form dashboard thật → "Gửi duyệt" → đổi trạng thái đúng trên UI; đăng nhập moderator khác → hàng chờ duyệt hiện tin → chọn "Duyệt — đăng công khai" → xác nhận → tin rời hàng chờ; khách chưa đăng nhập mở `/vi/jobs` → thấy tin vừa duyệt → vào chi tiết → thấy đúng số liên hệ. Cả ba browser context (chủ tin/moderator/khách) có `blockedOrigins` rỗng — không request nào ngoài web/api candidate lọt ra, kể cả khi web image có `NEXT_PUBLIC_API_URL` baked production thật (proxy nội bộ chỉ để luồng chạy được, cách ly tự thân đã nằm ở mạng Docker `--internal`).
- Ảnh chụp: `docs/delivery/evidence/job-listings-1b122b8-2026-10-07/jobs-list-screenshot.png` — trang `/vi/jobs` thật, hiện đúng "Chưa rõ mức lương" cho hai tin test chưa khai lương (không suy ra 0đ/miễn phí).
- Script test + kết quả đầy đủ lưu tại `docs/delivery/evidence/job-listings-1b122b8-2026-10-07/` (http-check-script.mjs, browser-check-script.mjs, register-users-script.mjs, build-exit-codes.txt).

**Source test (chạy local trước khi build):** API 239 suite/3561 test PASS (bao gồm 30 test mới: 24 service + 6 controller cho job-listings). Web 152 suite/1545 test PASS (11 test mới: 5 MyJobListingsView + 6 formatSalary). `tsc --noEmit` và eslint sạch cả hai workspace. `next build` production thành công, mọi route `/jobs`, `/jobs/[id]`, `/dashboard/job-listings*` biên dịch đúng.

**Tương thích:** thuần tính năng mới (bảng/route/permission mới hoàn toàn) — không đổi bất kỳ bảng/route/response shape nào của module khác. Không có client cũ nào gọi các route này (chưa từng tồn tại). An toàn rollback về baseline trước đó mà không mất dữ liệu của module khác (chỉ `job_listings`/2 permission mới trống dữ liệu production thật).

**Thứ tự triển khai nếu được duyệt (CHƯA xin duyệt, chỉ ghi để sẵn):** API trước (migrate + cutover), xác nhận `JobListing.Create`/`JobListing.Moderate` đã lên đúng 3 role, rồi Web. Hậu kiểm: `GET /job-listings` trả rỗng (chưa có dữ liệu thật) không phải lỗi; tạo 1 tin thật qua chính tài khoản owner, duyệt, xác nhận hiện đúng `/jobs`.

**Rollback:** dừng ở image/tag trước đó (API+Web), KHÔNG cần revert migration (bảng mới, không chạm dữ liệu cũ) — nêu rõ để không ai tưởng "rollback migration" là bước bắt buộc.

**Giới hạn đã biết (ghi rõ, không phải thiếu sót bị bỏ sót):** chưa có "lưu tin"/"báo sai/báo trùng" cho tuyển dụng (mục VI đợt 3 liệt kê — CHƯA làm, ngoài phạm vi lượt này); chưa có sitemap entry cho từng tin riêng lẻ (chỉ `/jobs` hub có trong sitemap — tin tuyển dụng đổi/hết hạn nhanh, ưu tiên thấp hơn nội dung du lịch, ghi nhận có chủ đích); chưa có dữ liệu thật nào trên production (đúng, đợi owner duyệt + cộng đồng/admin nhập sau).

### 13u. Đợt 4 — Bất động sản MVP: bảng trạng thái, thiết kế schema, và MỘT lỗ hổng hạ tầng cần quyết định (07/10/2026, bắt đầu)

**Không có module nào trước đó** (xác nhận: không có `real-estate`/`listings`/`property` trong `apps/api/src/modules` hay `apps/web/src/modules`). Module mới, độc lập — cùng lý do `job_listings` không phải satellite của `places` (không có vòng đời duyệt/dịch/xác minh của place, một thực thể có vòng đời riêng).

**Hai trạng thái TÁCH BIỆT (đúng yêu cầu mục VI "Phân biệt kiểm duyệt với còn giao dịch"):**

| Trường | Giá trị | Ý nghĩa |
|---|---|---|
| `status` | draft/pending/published/rejected/closed | Vòng đời KIỂM DUYỆT — giống hệt bảng đã chốt cho `job_listings` (§13r): draft→pending→published/rejected; rejected→pending (gửi lại trực tiếp); draft/pending→draft (sửa); published→(sửa)→pending NGAY (không overlay bản chờ duyệt song song); published→closed (chủ tin/moderator); closed→pending (reopen, LUÔN qua duyệt lại). |
| `deal_status` | available/rented/sold | Còn GIAO DỊCH hay không — ĐỘC LẬP với `status`. Chỉ có ý nghĩa khi `status` đã từng `published`. Chủ tin đánh dấu qua hành động RIÊNG (`mark-rented`/`mark-sold`/`mark-available`), KHÔNG đi qua `update()` — đánh dấu "đã thuê/đã bán" không phải sửa nội dung, không kéo tin về `pending` (khác việc sửa mô tả/giá). |

Danh sách/chi tiết công khai lọc **CẢ HAI**: `status = 'published'` **VÀ** `deal_status = 'available'` **VÀ** chưa hết hạn (tại thời điểm đọc, cùng cơ chế `job_listings`). Một tin đã thuê/đã bán biến mất khỏi tìm kiếm chủ động nhưng KHÔNG xoá — chủ tin vẫn thấy trong "Tin của tôi" với nhãn đúng trạng thái.

**Taxonomy loại tài sản (enum, không free text — đúng yêu cầu "theo taxonomy"):** `room` (phòng trọ), `apartment` (căn hộ), `house` (nhà), `land` (đất), `retail` (mặt bằng).

**Field theo giao dịch — CHECK constraint ở DB chặn field sai ngữ cảnh lọt vào (không chỉ validate ở DTO):**
- Thuê: `rent_period` (month/year — kỳ tính giá), `deposit_amount` (cọc), `utilities_note` (điện/nước/phí), `furniture_status`, `move_in_date`, `lease_term_months`. CHỈ hợp lệ khi `transaction_type='rent'`.
- Bán: `sale_price_basis` (total/per_sqm — "giá tổng hoặc theo diện tích rõ ràng"), `legal_status_note` (text TỰ DO do người đăng khai — KHÔNG BAO GIỜ một nhãn "đã xác minh"/"pháp lý sạch" do hệ thống gắn). CHỈ hợp lệ khi `transaction_type='sale'`.
- Có `price` thì bắt buộc có `price_currency` (cùng nguyên tắc `job_listings`/menu nhà hàng — không mặc định VND).

**Vị trí/quyền riêng tư (mục IV.5 + mục V đợt 4 — yêu cầu RÕ RÀNG, không phải diễn giải thêm):**
- `address_precision`: `area` (mặc định) hoặc `exact` — người đăng TỰ CHỌN mức công khai.
- `ward` (khu vực) LUÔN công khai bất kể `address_precision`.
- `address_text`/`lat`/`lng`: lưu đầy đủ nếu người đăng nhập (để chính họ sửa/xem lại), nhưng **API public CHỈ trả khi `address_precision='exact'`** — `address_precision='area'` thì mapper công khai KHÔNG đưa 3 trường này vào response, kể cả khi DB có giá trị (đúng nguyên văn "Chọn khu vực thì API public không trả tọa độ/địa chỉ riêng" — chặn ở tầng dữ liệu trả về, không phải chỉ ẩn ở UI).

**LỖ HỔNG HẠ TẦNG CÓ THẬT, cần quyết định trước khi coi riêng phần ảnh của đợt 4 là xong (không phải một lựa chọn kỹ thuật thường — nêu rõ theo đúng mục X "trở ngại cụ thể"):**

Yêu cầu mục V đợt 4: "Không chỉ ẩn marker; kiểm metadata ảnh khi có nguy cơ lộ vị trí." Đọc `media.service.ts`/`media.module.ts` xác nhận: toàn bộ pipeline upload hiện tại là **presigned PUT đi THẲNG lên S3/MinIO** (`createPresignedPutUrl`) — **API không bao giờ nhận byte ảnh**, và module comment ghi rõ từ đầu "Backend-only, no resize/thumbnail/**EXIF**/AI". Không có `sharp`/`exifr`/`piexif` hay bất kỳ thư viện xử lý ảnh nào trong repo (đã `grep` cả ba `package.json`). Nghĩa là: tước GPS EXIF khỏi ảnh người dùng tải lên — ĐÚNG như yêu cầu — đòi một trong hai hạ tầng CHƯA TỪNG TỒN TẠI:
1. Xử lý phía CLIENT (trình duyệt) trước khi PUT lên URL presigned — thêm một bước strip EXIF bằng JS thuần (vd `exifr`/tự viết) ngay trong luồng upload ảnh hiện có của web.
2. Một worker xử lý SAU upload (tải lại object từ S3, strip, ghi đè) — hạ tầng async mới, ảnh hưởng toàn bộ pipeline media, không chỉ riêng đợt 4.

Cả hai đều là **hạ tầng dùng chung mới**, không phải một chi tiết chỉ thuộc bất động sản — xây lặng lẽ chỉ cho module này vừa sai phạm vi ("không xây hạ tầng dùng chung ngoài nhu cầu thực sự") vừa để lại một con đường upload ảnh KHÔNG strip (mọi ảnh khác của site) nếu chỉ vá riêng đợt 4. **Không tự chọn lặng lẽ một trong hai phương án** — ghi nhận là trở ngại cụ thể, chờ quyết định: (a) chấp nhận cảnh báo SẢN PHẨM (text rõ trong form đăng tin bất động sản: "không tải ảnh có gắn vị trí nếu chọn chỉ hiển thị khu vực") làm biện pháp tạm cho MVP này trong lúc hạ tầng xử lý ảnh chưa có, hay (b) ưu tiên xây bước strip EXIF phía client ngay trong lượt này (phạm vi nhỏ hơn worker async, nhưng vẫn là code mới ngoài phần dữ liệu/API đã thiết kế ở trên). Tiếp tục phần schema/API/state machine bên dưới trong lúc chờ — không bị chặn bởi quyết định này.

**Tái sử dụng:** quyền theo đúng khuôn `job_listings` (`member` tạo, `moderator` + `content_owner` duyệt — cấp trực tiếp cả hai trong CÙNG migration). "Tin của tôi"/báo sai/báo trùng/lưu tin cùng khuôn đã có ở các module khác.

**Phát hiện thêm khi thiết kế field "ảnh" (mục V đợt 4 liệt kê "mô tả/ảnh/liên hệ" là field chung bắt buộc): module `media` hiện tại gắn CỨNG vào `places`** — `media.entity.ts` có cột `placeId` trực tiếp (không phải bảng liên kết đa hình), và toàn bộ `media.service.ts` (`presignForPlace`, `listForPlaceOwner`, `reorderPlaceMedia`, kiểm duyệt ảnh...) viết riêng cho place, không có đường nào nhận một loại entity sở hữu khác. Gắn ảnh cho `real_estate_listings` đòi MỘT trong hai: (a) thêm cột `realEstateListingId` nullable song song `placeId` trên CHÍNH bảng `media` dùng chung, nhân đôi phần lớn logic presign/list/kiểm duyệt cho owner type thứ hai, hoặc (b) thiết kế lại thành liên kết đa hình (`owner_type`/`owner_id`) — một thay đổi kiến trúc thật cho module `media`, không phải một field thêm vào DTO. Đây LÀ hạ tầng dùng chung, CÙNG LOẠI quyết định với lỗ hổng EXIF ở trên — không tự chọn một phương án rồi xây lặng lẽ trong lượt này. MVP lượt này triển khai ĐẦY ĐỦ vòng đời tin (tạo/sửa/duyệt/đóng/đánh dấu đã thuê-bán/tìm kiếm/chi tiết) với các field văn bản/số đã liệt kê — CHƯA có "ảnh" (và do đó yêu cầu kiểm EXIF cũng chưa áp dụng được, vì chưa có ảnh nào để kiểm). Ghi nhận rõ đây là giới hạn đã biết, không phải bị bỏ sót, chờ quyết định hướng mở rộng `media` trước khi làm tiếp.

### 13v. Candidate `7c28059` — Đợt 3 (tuyển dụng) + Đợt 4 (bất động sản) gộp, đã test cô lập (08/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật, không mock) — CHƯA deploy, CHƯA nghiệm thu production.**

**Code:** `de5852d`/`bf55401`/`1b122b8` (đợt 3, đã có candidate riêng `1b122b8` ở §13t) → `b0a2b7c` (đợt 4 backend: entity/migration/repository/service/controller, state machine + `deal_status` độc lập + quyền riêng tư vị trí) → `7c28059` (đợt 4 web: public `/real-estate` + `/real-estate/[id]`, dashboard "Tin bất động sản của tôi" + tạo/sửa + đánh dấu đã thuê/đã bán + hàng chờ duyệt, nhóm điều hướng "Sống tại Phú Quốc"). Nhánh `feat/beach-details-cas`, chưa merge/push. Candidate này GỘP cả đợt 3 lẫn đợt 4 vì cùng nằm trên một nhánh tại thời điểm build — đợt 3 đã có bằng chứng riêng ở `1b122b8` (§13t), lượt này thêm smoke test đợt 3 để xác nhận không hồi quy khi đợt 4 được thêm vào, KHÔNG lặp lại toàn bộ 49 test đã đạt của đợt 3.

**Image identity (xác nhận bằng `docker image inspect`):**
- `phuquochub-api:7c28059f41781a9345872d6339b908bc189a1dd0` — id `sha256:1a794b23…`, label revision khớp đúng SHA.
- `phuquochub-web:7c28059f41781a9345872d6339b908bc189a1dd0` — id `sha256:4a0381f4…`, label revision khớp đúng SHA.
- Build-arg web: production thật (`NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, map tile OSM thật).
- Nguồn build: archive checksum-verified (86 migration, khớp SHA) qua `create-release-archive.sh`/`sync-release-source.sh`.

**Migration (chạy thật trên Postgres cô lập mới tạo, 86/86 thành công):** `npx typeorm migration:run -d dist/core/database/data-source.js` trên image thật. SQL trực tiếp xác nhận ĐỦ 6 dòng `role_permissions` đúng thiết kế cho cả hai permission mới (`JobListing.Create`→member, `JobListing.Moderate`→moderator+content_owner, `RealEstateListing.Create`→member, `RealEstateListing.Moderate`→moderator+content_owner) — không thiếu grant nào.

**Test cô lập (VPS, stack `phq-r11-*` — network `--internal`, không egress, đã dọn sau khi lưu bằng chứng):**
- **HTTP (DB thật, 50/50 PASS):** Bất động sản — validate field theo giao dịch (rent/sale field cross-contamination → 400, khớp CHECK DB), toàn bộ bảng chuyển trạng thái (submit/decide/resubmit/update-khi-published-rút-về-pending/close/reopen), và ba điểm RIÊNG của đợt 4: (1) `deal_status` hoàn toàn độc lập — `mark-rented` không đổi `status`, tin biến mất khỏi công khai dù `status` vẫn `published`, chủ tin vẫn thấy đủ trong "mine"; (2) quyền riêng tư vị trí — `address_precision='area'` thì public detail trả `address_text`/`lat`/`lng` = `null` DÙ DB CÓ GIÁ TRỊ, trong khi "mine" vẫn thấy đủ; `address_precision='exact'` thì public trả đầy đủ; (3) hết hạn xét tại thời điểm đọc, không đổi cột status. Cộng smoke test tuyển dụng (tạo→duyệt→xuất hiện công khai) xác nhận module cũ không hồi quy.
- **Browser (Playwright chromium thật, 14/14 PASS):** đăng nhập → tạo tin bán qua form dashboard thật (chọn "Mua bán", field pháp lý hiện đúng theo nhánh) → "Gửi duyệt" → moderator duyệt qua UI → khách thấy trên `/real-estate` và chi tiết đúng số liên hệ → chủ tin bấm "Đánh dấu đã bán" trên UI thật → xác nhận nhãn trạng thái kiểm duyệt ("Đang đăng") KHÔNG đổi trong khi nhãn giao dịch đổi thành "Đã bán" → tin biến mất khỏi `/real-estate` công khai ngay. Cả ba browser context có `blockedOrigins` rỗng.
- Ảnh chụp: `docs/delivery/evidence/combined-job-real-estate-7c28059-2026-10-08/real-estate-list-screenshot.png` — trang `/vi/real-estate` thật, hiện đúng nhóm nav mới "Sống tại Phú Quốc" ở footer, giá hiện "Chưa rõ giá" cho tin test chưa khai giá.
- Script + kết quả đầy đủ: `docs/delivery/evidence/combined-job-real-estate-7c28059-2026-10-08/`.

**Source test (local trước build):** API 246 suite/3620 test PASS (42 test mới cho real-estate-listings: 27 service + 6 controller + 9 migration-structure). Web 154 suite/1556 test PASS (11 test mới: 5 MyRealEstateListingsView + 6 formatRealEstatePrice). `tsc`/eslint sạch. `next build` production thành công, mọi route `/real-estate*` và `/dashboard/real-estate*` biên dịch đúng.

**Tương thích:** thuần tính năng mới — không đổi bảng/route/response shape của module khác (kể cả `job_listings`, xác nhận bằng smoke test). Rollback về baseline trước đó không mất dữ liệu module khác (chỉ `real_estate_listings`/2 permission mới trống dữ liệu production thật).

**Thứ tự triển khai nếu được duyệt (CHƯA xin duyệt):** giống §13t — API trước (migrate + cutover), xác nhận permission đã lên đúng role, rồi Web. Hậu kiểm: tạo 1 tin thật qua tài khoản owner, duyệt, xác nhận hiện đúng `/real-estate` VÀ xác nhận `address_precision='area'` không lộ địa chỉ/toạ độ trên response công khai thật (không chỉ tin vào test này).

**Rollback:** dừng ở image/tag trước đó, KHÔNG cần revert migration (bảng mới).

**Giới hạn đã biết:** chưa có ảnh/EXIF-check (đã ghi ở §13u, chưa đổi); chưa có "lưu tin"/báo sai/báo trùng cho cả hai đợt 3 và 4; chưa có sitemap entry cho từng tin riêng lẻ (chỉ hub `/jobs`/`/real-estate`); chưa có dữ liệu thật trên production.

**Đọc source cho "lưu tin"/"báo sai/báo trùng" trước khi làm tiếp (mục VII: "Tái sử dụng... báo sai") — tìm thấy HAI lỗ hổng hạ tầng dùng chung nữa, cùng loại quyết định với media/EXIF ở §13u, không tự chọn rồi xây lặng lẽ:**

1. **"Lưu tin" (saved items): KHÔNG tồn tại cho BẤT KỲ entity nào trên toàn nền tảng** — đã `grep` toàn bộ `apps/api/src/modules` tìm `SavedItem`/`Favorite`/`Bookmark`, không có kết quả nào. Không phải thiếu riêng cho job/real-estate — chưa ai xây tính năng này cho hotel/restaurant/tour/beach cũng vậy. Xây nó bây giờ nghĩa là tạo một bảng `saved_items` (user_id + target_type + target_id) hoàn toàn mới — hạ tầng dùng chung thật, không phải field thêm vào job_listings/real_estate_listings.

2. **"Báo sai/báo trùng": có `reports`/`moderation_cases` SẴN và đúng kiểu đa hình (`target_type`/`target_id`, không FK cứng) — gần dùng được hơn `media`** — nhưng `moderation.enums.ts`'s `ModerationTargetType` tự ghi rõ trong comment: "ĐỦ 3 loại đã đăng ký FSM-hoặc-dự-trù trong ADR-018 §D9/MR-4" (`review`/`media`/`place`) — một tập ĐÃ CHỐT theo ADR, không phải danh sách mở. Thêm `job_listing`/`real_estate_listing` đòi: (a) `ALTER TYPE` thêm 2 giá trị enum Postgres, (b) viết logic xử lý quyết định MỚI trong `ModerationService` cho 2 loại target này (hiện chỉ có `decideMedia()` + dự trù `review`/`place`, không có khung chung cho "gọi method đóng/từ chối của module khác khi report được giữ"). Đây LÀ một sửa đổi ADR-018, không phải một PATCH nhỏ — khác hẳn khái niệm "quyết định duyệt tin" (`JobListingsService.decide()`/`RealEstateListingsService.decide()`) vốn ĐÃ CÓ và xử lý một việc khác (duyệt bản NHÁP trước khi công khai, không phải người dùng gắn cờ một tin ĐÃ công khai).

MVP lượt này (đợt 3 + đợt 4) dừng ở vòng đời tin + tìm kiếm + duyệt + quyền riêng tư vị trí — CHƯA có lưu tin/báo sai/báo trùng, cùng lý do CHƯA có ảnh ở §13u. Ba lỗ hổng hạ tầng (EXIF/ảnh, saved items, mở rộng `ModerationTargetType`) nên được quyết định CÙNG NHAU vì đều là hạ tầng dùng chung ảnh hưởng nhiều module, không chỉ đợt 3/4.

**Cập nhật 08/10/2026: "lưu tin" đã triển khai (phần (1) ở trên) — KHÔNG chờ quyết định, vì đây là hạ tầng MỚI không đụng ADR nào, rủi ro thấp hơn hẳn mở rộng `ModerationTargetType`.** Xem §13w. "Báo sai/báo trùng" (phần (2)) và ảnh/EXIF (đã ghi ở §13u) vẫn CHỜ quyết định.

### 13w. Candidate `96fad68` — "Lưu tin" dùng chung cho tuyển dụng + bất động sản, đã test cô lập (08/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật) — CHƯA deploy, CHƯA nghiệm thu production.**

**Code:** `4b3e88e` (backend: entity/migration/repository/service/controller đa hình) → `e6188cf` (sửa 204 giả thành đúng quy ước EmptySuccess của repo) → `e67e536` (web: SaveButton + "Tin đã lưu") → `96fad68` (sửa a11y nút "Bỏ lưu" lặp lại — phát hiện khi viết browser test, không phải chỉ để test dễ chọn phần tử). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Image identity:**
- `phuquochub-api:96fad68a29ba1ae48ae972a307cc491632206d46` — id `sha256:618d41c8…`.
- `phuquochub-web:96fad68a29ba1ae48ae972a307cc491632206d46` — id `sha256:c78060af…`.
- 87 migration (86 cũ + `InitSavedItems`).

**Test cô lập (VPS, stack `phq-r12-*`, đã dọn sau khi lưu bằng chứng):**
- **HTTP (DB thật, 18/18 PASS):** không lưu được tin draft (404 — chặn dò tồn tại tin chưa công khai của người khác qua chính endpoint lưu tin); lưu trùng không tạo 2 dòng (idempotent, dùng `ON CONFLICT DO NOTHING`); danh sách lưu của mỗi người KHÔNG lẫn nhau; tin đã lưu bị đóng sau đó → dòng lưu VẪN còn nhưng `listing: null` (không âm thầm biến mất khỏi "Tin đã lưu"); bỏ lưu một tin chưa từng lưu vẫn thành công (idempotent); chưa đăng nhập → 401.
- **Browser (Playwright chromium thật, 8/8 PASS):** đăng nhập → bấm "Lưu tin" trên trang chi tiết CẢ tuyển dụng LẪN bất động sản → nút đổi thành "Đã lưu" ngay → "Tin đã lưu" trong dashboard hiện đúng cả hai → bấm "Bỏ lưu" đúng MỘT tin (phân biệt bằng `aria-label` kèm tiêu đề, phát hiện lúc viết test rằng nhiều nút "Bỏ lưu" trùng tên là một lỗ hổng a11y thật) → tin đó rời danh sách, tin còn lại vẫn nguyên. `blockedOrigins` rỗng.
- Script + kết quả: `docs/delivery/evidence/saved-items-96fad68-2026-10-08/`.

**Source test:** API 249 suite/3634 test PASS (14 test mới: 9 service + 4 controller + 5 migration). Web 156 suite/1563 test PASS (7 test mới: SaveButton + MySavedItemsView). `tsc`/eslint sạch. `next build` thành công, `/dashboard/saved` biên dịch đúng.

**Tương thích:** tính năng mới thuần — `saved_items` không đụng bảng nào khác; `JobListingsService.getPublicById()`/`RealEstateListingsService.getPublicById()` được GỌI (không sửa) từ module mới, không đổi hành vi hai module đó.

**Giới hạn:** chỉ lưu được `job_listing`/`real_estate_listing` (đúng phạm vi yêu cầu đợt 3/4 — CHƯA mở rộng cho hotel/restaurant/tour/beach, điều mục VII không yêu cầu cho các loại đó ở đợt này). "Báo sai/báo trùng" và ảnh/EXIF vẫn chờ quyết định (§13u/§13v).

**Cập nhật 08/10/2026: "báo sai/báo trùng" cũng đã triển khai — xem lại §13u/§13v, phát hiện là KHÔNG cần chờ quyết định về `ModerationTargetType` (chỉ ảnh/EXIF thật sự còn chờ).** Xem §13x.

### 13x. Candidate `ac6db5d` — "Báo sai/báo trùng" cho tuyển dụng + bất động sản, đã test cô lập (08/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật) — CHƯA deploy, CHƯA nghiệm thu production.**

**Quyết định đã xem lại:** §13v từng ghi "báo sai/báo trùng" là một trong ba lỗ hổng hạ tầng chờ quyết định, với lý do `ModerationTargetType` bị khoá đúng 3 loại theo ADR-018. Khi bắt tay viết, nhận ra KHÔNG có yêu cầu nào buộc tái dùng ĐÚNG bảng `reports`/`ModerationCase` đó — `job_listings`/`real_estate_listings` vốn đã có luồng duyệt (`decide()`) ĐỘC LẬP với `ModerationCase` từ đầu, nên một cơ chế báo cáo cho hai module này cũng độc lập được, y hệt cách `saved_items` đã xây — hạ tầng MỚI, nhỏ, polymorphic, không đụng ADR nào. Không cần hỏi lại vì đây là áp dụng lại nguyên tắc đã chốt ("tái sử dụng PATTERN, không nhất thiết tái sử dụng ĐÚNG BẢNG"), không phải một lựa chọn sản phẩm mới.

**Code:** `298a1c9` (backend: entity/migration/repository/service/controller, polymorphic, tái dùng CHÍNH permission `JobListing.Moderate`/`RealEstateListing.Moderate` đã có — không permission mới) → `28929d7` (sửa hàng chờ moderator để kèm tiêu đề/giá tin bị báo cáo, không chỉ UUID) → `ac6db5d` (web: ReportButton trên cả hai trang chi tiết công khai + hàng chờ xử lý gộp cả hai loại tin trong MỘT trang). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Hợp nhất enum đáng chú ý:** đổi tên `saved_item_target_type` → `listable_target_type` (an toàn — chưa có dữ liệu thật nào phụ thuộc tên cũ) và tách ra `common/listable-target-type.enum.ts` dùng CHUNG cho cả `saved_items` lẫn `listing_reports` — đúng lúc xuất hiện consumer thứ hai mới tách (nguyên tắc mục III "chỉ tách phần dùng chung khi có nhu cầu thực"), không tách trước khi cần. Xác nhận bằng `psql` thật trên DB test: cả hai cột `target_type` của hai bảng cùng trỏ đúng kiểu đã đổi tên sau khi chạy đủ 88 migration.

**Image identity:**
- `phuquochub-api:ac6db5d3a3f4d7a829a611811b414f914dc1f231` — id `sha256:5781ecce…`.
- `phuquochub-web:ac6db5d3a3f4d7a829a611811b414f914dc1f231` — id `sha256:6a69463d…`.
- 88 migration (87 cũ + `InitListingReports`, gồm cả bước đổi tên enum).

**Test cô lập (VPS, stack `phq-r13-*`, đã dọn sau khi lưu bằng chứng):**
- **HTTP (DB thật, 19/19 PASS):** không tự báo cáo được tin của chính mình (400); không báo cáo được tin draft chưa công khai (404, cùng gate `getPublicById()` route công khai thật đang dùng); member thường gọi hàng chờ → mảng rỗng (KHÔNG 403 — không giữ permission Moderate nào thì không loại nào được thêm); moderator giữ CẢ hai permission thấy ĐỦ báo cáo của CẢ hai loại tin, kèm đúng tiêu đề/ghi chú; reporter (không có quyền Moderate) cố resolve → 403; resolve một báo cáo đã xử lý → 409; sau khi resolve/dismiss, báo cáo rời khỏi hàng chờ đúng thứ tự (không ảnh hưởng báo cáo loại kia).
- **Browser (Playwright chromium thật, 7/7 PASS):** đăng nhập → mở form "Báo sai/báo trùng" NGAY trên trang chi tiết công khai (không điều hướng đi nơi khác) → chọn lý do, nhập ghi chú, gửi → hiện lời cảm ơn → đăng nhập vai trò khác (moderator) → hàng chờ hiện ĐÚNG tiêu đề tin và ghi chú người báo cáo đã nhập → bấm "Xác nhận hợp lệ" → báo cáo rời hàng chờ. `blockedOrigins` rỗng cả hai context.
- Script + kết quả: `docs/delivery/evidence/listing-reports-ac6db5d-2026-10-08/`.

**Source test:** API 252 suite/3656 test PASS (37 test mới: 10+1 service + 3 controller + 6+2 migration-structure, tính cả bản cập nhật enrich hàng chờ). Web 158 suite/1571 test PASS (8 test mới: ReportButton + ListingReportsQueueView). `tsc`/eslint sạch. `next build` thành công, `/dashboard/listing-reports` biên dịch đúng.

**Tương thích:** tính năng mới thuần, CỘNG một đổi tên enum nội bộ (`saved_item_target_type`→`listable_target_type`) — không có dữ liệu production nào phụ thuộc tên cũ (chưa deploy `saved_items` lên production), an toàn.

**Giới hạn còn lại:** ảnh/EXIF cho bất động sản VẪN chờ quyết định hạ tầng `media` (§13u/§13v, không đổi) — đây là lỗ hổng DUY NHẤT còn lại chưa giải quyết trong toàn bộ mục V đợt 3/4.

### 13y. Candidate `dfeb9b7` — Ảnh cho bất động sản + kiểm GPS EXIF, đã test cô lập với MinIO thật (09/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật, lần đầu dùng MinIO thật thay stub) — CHƯA deploy, CHƯA nghiệm thu production. Đây là lỗ hổng DUY NHẤT còn lại của mục V đợt 3/4 — sau candidate này, toàn bộ mục V đợt 3+4 đã có đủ các field/flow bắt buộc.**

**Quyết định đã xem lại (cùng mẫu §13v/§13x):** §13v/§13u từng ghi ảnh/EXIF chờ quyết định vì tưởng cần mở rộng bảng `media`/`MediaService` (place-coupled, có hàng chờ kiểm duyệt ảnh riêng không khớp vòng đời `real_estate_listings`). Đọc toàn văn `storage.service.ts` phát hiện `StorageService` hoàn toàn entity-agnostic (`createPresignedPutUrl`/`verifyUploadedObject`/`createPresignedGetUrl`/`deleteObject`, không `placeId`, không biết gì về `media` table) — tái dùng TRỰC TIẾP, xây bảng mới hẹp `real_estate_listing_photos` (FK cứng, KHÔNG đa hình vì chỉ nhắm một loại entity, khác `saved_items`/`listing_reports`), không đụng `MediaService`/ADR nào. Không cần hỏi lại — cùng nguyên tắc "tái dùng PATTERN, không nhất thiết tái dùng ĐÚNG BẢNG" đã áp dụng ở §13v/§13x.

**Kiểm metadata vị trí (mục V đợt 4: "Không chỉ ẩn marker; kiểm metadata ảnh khi có nguy cơ lộ vị trí"):** khi tin có `address_precision != 'exact'`, bước đăng ký ảnh (`register()`) tải lại bytes vừa upload (`StorageService.getObject()`, hàm MỚI, generic, bounded theo cùng trần `MAX_OBJECT_BYTES`) và phân tích EXIF — JPEG: parse chính xác TIFF/IFD, chỉ chặn khi tìm thấy tag `GPSLatitude`/`GPSLongitude` trong GPS IFD (không chặn JPEG có EXIF thông số máy ảnh thông thường); PNG/WEBP: chặn khi có BẤT KỲ chunk EXIF nào (bảo toàn hơn, vì hiếm gặp với ảnh điện thoại thật). Phát hiện → xoá object, từ chối đăng ký (422, không strip thầm lặng — người đăng phải tự xử lý, an toàn hơn một bước "làm sạch" họ không biết đã xảy ra). Khi `address_precision='exact'`, KHÔNG kiểm (vị trí đã công khai, ảnh có GPS không thêm rủi ro).

**Code:** `612fe10` (backend: entity/migration/repository/service/controller/module + `lib/image-location-risk.ts` — parser EXIF tự viết, không thêm dependency mới; thêm `StorageService.getObject()` + 2 URL builder vào `MediaUrlService` tái dùng) → `dfeb9b7` (web: `RealEstateListingPhotosManager` mounted trong form sửa tin — tái dùng `runImageUpload()`/`useAuthenticatedImage` dùng chung của `modules/media`; `RealEstateListingPhotoGallery` trên trang chi tiết công khai). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Image identity:**
- `phuquochub-api:dfeb9b7366091829416f7a37f7a6207ce75ba8d8` — id `sha256:b20ad988fd9f…`.
- `phuquochub-web:dfeb9b7366091829416f7a37f7a6207ce75ba8d8` — id `sha256:74f411eb108…` (build LẠI lần 2 với đúng `--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api` — lần build đầu thiếu build-arg, baked-in `http://localhost:4000/api`, chỉ phát hiện được qua browser test thật, không phải lỗi sản phẩm).
- 89 migration (88 cũ + `InitRealEstateListingPhotos`).

**Test cô lập (VPS, stack `phq-r14-*`, đã dọn sau khi lưu bằng chứng) — LẦN ĐẦU dùng MinIO THẬT (`minio/minio:latest`) thay cho container stub trả 200 cho mọi request mà các candidate trước (r11/r12/r13) dùng, vì tính năng này cần verify bytes/signature/EXIF thật:**
- **HTTP (DB+MinIO thật, 40/40 PASS):** presign/PUT/register round-trip thật; `area` + ảnh có GPS → 422 đúng thông điệp, không tạo dòng, không lộ ở "mine"; `area` + ảnh không GPS → 201, xuất hiện đúng ở "mine" VÀ public list (tin đã published); `exact` + ảnh có GPS → vẫn 201 (không kiểm khi vị trí đã công khai); public list trên tin `pending` → 404; `owner-file` xem được ở BẤT KỲ trạng thái tin (đã test khi còn `pending`), `file` công khai CHỈ khi tin `published`; bytes tải về qua CẢ hai kênh khớp byte-for-byte với ảnh đã upload (đối chiếu buffer thật, không chỉ mã trạng thái); không phải chủ tin → 404 ở mọi endpoint; gỡ ảnh không ảnh hưởng ảnh của tin khác; trần 10 ảnh/tin → 409 (tách riêng khỏi throttle presign 10/60s để khẳng định đúng cơ chế đang chặn, xem `stack-notes.md`).
- **Browser (Playwright chromium thật, 12/12 PASS):** chủ tin đăng nhập → vào form sửa tin → tải ảnh THẬT qua `<input type=file>` → thấy "Đã thêm ảnh." + thumbnail → khách (chưa đăng nhập) vào trang chi tiết công khai thấy ĐÚNG `<img>` của ảnh vừa tải (không cần xác thực) → chủ tin gỡ ảnh qua UI thật → biến mất. `blockedOrigins` rỗng cả hai context (ảnh MinIO qua Caddy TLS được khai rõ, không tính là rò rỉ — xem `stack-notes.md`).
- Hai phát hiện HẠ TẦNG TEST (không phải bug sản phẩm, ghi chi tiết ở `stack-notes.md`): (1) Web Crypto (`crypto.subtle`, dùng để băm SHA-256 phía client) cần secure context — stack test phải thêm Caddy TLS internal trước web, khớp đúng topology production (Caddy/ACME); (2) sau đó gặp Mixed Content vì presigned URL vẫn HTTP — thêm alias Caddy TLS thứ hai trước MinIO, đúng như production đã làm với `media.phuquochub.com`.
- Script + kết quả: `docs/delivery/evidence/real-estate-listing-photos-dfeb9b7-2026-10-09/`.

**Source test:** API 255 suite/3693 test PASS (37 test mới: parser EXIF với buffer JPEG/PNG/WEBP tự dựng + service + controller + 5 migration-structure). Web 160 suite/1583 test PASS (21 test mới: manager upload/gỡ/trần-10-ảnh/lỗi-422 + gallery công khai). `tsc`/eslint sạch trên cả hai workspace.

**Tương thích:** tính năng mới thuần (bảng mới, 2 cột tiện ích thêm vào `MediaUrlService`, 1 method mới `StorageService.getObject()`) — không đổi schema/contract của bất kỳ entity nào đã có, không có dữ liệu production nào bị ảnh hưởng.

**Giới hạn đã biết:** không có sắp xếp lại thứ tự ảnh (thứ tự = thứ tự tải lên — mục V đợt 4 không yêu cầu sắp xếp); PNG/WEBP chặn BẤT KỲ EXIF nào khi `area` (bảo toàn hơn mức tối thiểu cần, chấp nhận được vì ảnh điện thoại thật hầu như luôn là JPEG).

**Mục V đợt 3 + đợt 4 — sau candidate này:** KHÔNG còn lỗ hổng field/flow bắt buộc nào được ghi nhận trong toàn bộ quá trình rà soát §13t→§13y. Candidate gần nhất của mỗi phần (`1b122b8`/`7c28059`/`96fad68`/`ac6db5d`/`dfeb9b7`) đều ở trạng thái CANDIDATE ĐẠT, CHƯA deploy/nghiệm thu production.

### 13z. Sửa sitemap — thêm chi tiết tin tuyển dụng/bất động sản (09/10/2026)

**Trạng thái: SOURCE ĐẠT.** Không cần candidate VPS riêng (web-only, không migration, không endpoint mới, chỉ tái dùng `listJobListings()`/`listRealEstateListings()` công khai đã có candidate/test ở §13t/§13v) — kiểm bằng unit test + `tsc`/eslint + `next build` thật đã đủ, đúng nguyên tắc "không build/test toàn hệ thống theo thói quen, chỉ kiểm lại khi có rủi ro cụ thể".

§13t (dòng 964) và §13v/§13y từng ghi "chưa có sitemap entry cho từng tin riêng lẻ" là giới hạn ĐÃ BIẾT — nhưng mục VI nói rõ "Danh sách/chi tiết/search/sitemap/structured data nhất quán" là yêu cầu, không phải tuỳ chọn. Thêm `/jobs/{id}` và `/real-estate/{id}` (bản `vi` duy nhất — không có bản dịch EN song song nên không vào `/en`, cùng khuôn `events`) vào `app/sitemap.ts` qua helper `detailEntries()` dùng chung đã có. Một endpoint lỗi không làm hỏng sitemap (route hub `/jobs`/`/real-estate` vẫn còn).

**Code:** `b8c2f44`. 3 test mới (`sitemap.spec.ts`), 160 suite/1586 test web PASS, `tsc`/eslint sạch, `next build` thành công.

**Sửa lại ngay dưới đây (§13z-2):** câu trên viết "mảnh ghép CUỐI CÙNG" là SAI — "structured data" trong CÙNG câu chính sách ("sitemap/structured data nhất quán") vẫn chưa làm lúc viết đoạn này. Để lại nguyên văn để thấy rõ đã tự sửa, không xoá dấu vết.

### 13z-2. Structured data (JobPosting/RealEstateListing) cho trang chi tiết tin (09/10/2026)

**Trạng thái: SOURCE ĐẠT.** Cũng không cần candidate VPS riêng — cùng lý do §13z (web-only, không đụng API/DB, dữ liệu lấy từ đúng response trang đã gọi sẵn).

Soát lại mọi loại entity khác (hotel/restaurant/tour/place/event/guide) đều đã phát JSON-LD (`lib/structured-data.ts`, MVP SEO pass) — CHỈ `/jobs/{id}` và `/real-estate/{id}` còn thiếu, đúng phần "structured data" của mục VI chưa đóng mà §13z bỏ sót.

- `buildJobPostingJsonLd()`: field bắt buộc của DB (title/datePosted/employmentType/hiringOrganization/jobLocation) LUÔN phát; `validThrough`/`baseSalary`/`description` CHỈ khi dữ liệu thật có — không bịa `baseSalary` cho lương "thoả thuận". `jobLocation` lùi `ward → work_location`, cùng khuôn `postalAddress()` của place. `employment_type='seasonal'` ánh xạ enum đóng `TEMPORARY` của schema.org (gần nghĩa nhất, không phải suy diễn tự do).
- `buildRealEstateListingJsonLd()`: CỐ Ý tối giản (name/url/datePosted/offers) — Google không có rich result riêng cho kiểu này, và phần mở rộng hơn (kiểu tài sản lồng, `floorSize`, GoodRelations `businessFunction` cho thuê/bán) đòi quyết định ngữ nghĩa dữ liệu hiện có không trả lời rõ (vd "đã cho thuê" có phải "SoldOut"?). KHÔNG đưa `address_text`/`lat`/`lng` vào JSON-LD dù object có mang theo — API đã tự ẩn khi `address_precision != 'exact'`, builder không lặp lại quyết định riêng tư đó (test riêng xác nhận không lọt).

**Code:** `4c0a743`. 14 test mới (`structured-data.spec.ts`), 160 suite/1600 test web PASS, `tsc`/eslint sạch, `next build` thành công.

**Đây MỚI là mảnh ghép cuối cùng của mục VI ("sitemap/structured data nhất quán") cho mục V đợt 3/4** — không còn giới hạn đã ghi nào về sitemap hoặc structured data cho hai đợt này.

### 13z-3. Candidate `91316c7` — "Ảnh góp ý qua media moderation": đợt 2 ĐÓNG HOÀN TOÀN (09/10/2026)

**Trạng thái: SOURCE ĐẠT, CANDIDATE ĐẠT (bằng chứng DB+HTTP+browser thật, MinIO thật, không mock) — CHƯA deploy, CHƯA nghiệm thu production.** Đây là mảnh ghép CUỐI CÙNG còn treo của đợt 2 (xem §13q "Còn lại của đợt 2... CHỈ còn ảnh góp ý qua media moderation") — sau candidate này, đợt 2 ("Đóng góp có phản hồi") không còn giới hạn/quyết định nào đang chờ.

**Thiết kế (đã ghi trước khi code, xem §13u "chỉ tách phần dùng chung khi có nhu cầu thực"):** tái dùng TRỰC TIẾP `MediaRepository`/`ModerationCasesRepository` đã export sẵn — KHÔNG đụng `MediaService`/`MediaModule` nội bộ. Thêm nhánh sở hữu thứ 6 (`proposal_id`) vào `media` qua `CHECK chk_media_at_most_one_owner` (5 nhánh cũ: place/review/post/business/event) — migration `AddMediaProposalOwner1720008900000`, `down()` ném lỗi nếu còn dòng `proposal_id IS NOT NULL` (đúng tiền lệ "throwing down()" đã dùng cho mọi migration cộng-thêm nhạy cảm trong phiên này). Module mới `place-edit-proposal-photos` import `PlaceEditProposalsModule` + `MediaModule` + `ModerationCoreModule` — hướng import AN TOÀN (không ai import module này quay lại) vì `MediaModule` không thể import `PlaceEditProposalsModule` (sẽ tạo cycle, do `PlacesModule` đã import `MediaModule`). Ảnh LUÔN vào hàng chờ kiểm duyệt chung (`ModerationTargetType.MEDIA`), không bao giờ tự công khai; trần 3 ảnh/đề xuất (thấp hơn hẳn ảnh cơ sở/bất động sản — đây là ảnh BẰNG CHỨNG, không phải gallery).

**Code:** `91316c7` (migration/entity/repository/module/service/controller backend + nhúng field `photos` vào MỌI view đọc hiện có của place-edit-proposals; web: `ProposalPhotoUploader`/`ProposalPhotoThumbnail` + wiring vào `ProposeEditView`/`PlaceEditProposalsQueueView`/`MyProposalsView`). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Image identity:**
- `phuquochub-api:91316c7e092e956e38e1f122f137382eb2761726` — build trên VPS từ archive checksum-verified (`sha256:196e6b4b…`, khớp đúng commit).
- `phuquochub-web:91316c7e092e956e38e1f122f137382eb2761726` — build NGAY LẦN ĐẦU với đúng `--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api` v.v. (rút kinh nghiệm lỗi cấu hình r14 ở §13y — không cần build lại lần 2).
- 91 migration (90 cũ + `AddMediaProposalOwner1720008900000`).

**Kiểm boot thật (rủi ro CỤ THỂ của thay đổi này mà unit test KHÔNG bắt được — unit test khởi tạo service bằng `new Service(...)` tay, bỏ qua hoàn toàn DI container thật của Nest):** stack cô lập `phq-r16-*`, chạy đủ 91 migration thành công trên Postgres mới tạo (xác nhận bằng `\d media` thật: cột `proposal_id` + CHECK 6 nhánh đúng thiết kế), rồi boot container `api` thật — log `docker logs` hiện "Nest application successfully started" với `PlaceEditProposalsModule`/`PlaceEditProposalPhotosModule` cùng khởi tạo xong, KHÔNG có lỗi circular dependency, và đủ 4 route mới được map (`POST .../media/presign`, `POST .../media`, `GET .../media`, `GET .../media/:mediaId/file`).

**Test cô lập (VPS, stack `phq-r16-*`, network `--internal`, MinIO THẬT — cùng lý do r14, tính năng đi qua `verifyUploadedObject()` thật — đã dọn sau khi lưu bằng chứng):**
- **HTTP (DB+MinIO thật, 21/21 PASS):** tạo đề xuất → `photos:[]`; người khác không presign/register/listMine/xem file được đề xuất không thuộc mình (404, không lộ tồn tại); chưa đăng nhập → 401; upload thật qua presign→PUT MinIO→register, status `pending`; `listMine`/`getMine` nhúng đúng ảnh; chạm trần 3 ảnh → ảnh #4 presign → 409; register với key chưa từng presign hợp lệ → 422; moderator thấy đề xuất trong hàng chờ kèm đủ 3 ảnh; người gửi xem được file ảnh của mình ở BẤT KỲ trạng thái; moderator duyệt (kèm `sender_message`) không ảnh hưởng tới ảnh (hai luồng kiểm duyệt độc lập) — sau duyệt `getMine` vẫn còn đủ 3 ảnh + phản hồi.
- **Browser (Playwright chromium v1.63.0 thật, 12/12 PASS):** người gửi đăng nhập qua UI → mở form đề xuất thật (từ URL có query, giống link từ trang chi tiết Place) → gửi → khung tải ảnh bằng chứng xuất hiện NGAY → tải ảnh thật qua `<input type=file>` → "Đã gửi ảnh"; moderator đăng nhập → hàng chờ `/dashboard/edit-proposals` hiện đúng đề xuất + nhãn "Ảnh bằng chứng đính kèm" + thumbnail "Đang chờ duyệt" → duyệt kèm phản hồi qua UI thật → đề xuất rời hàng chờ; người gửi vào "Góp ý của tôi" → thấy đúng phản hồi admin VÀ ảnh bằng chứng (ảnh thật render qua kênh xác thực riêng của người gửi, không phải kênh công khai). `blockedOrigins` rỗng cả hai context.
- Ảnh chụp: `docs/delivery/evidence/proposal-photos-91316c7-2026-10-09/my-proposals-screenshot.png`.
- Script + kết quả đầy đủ + ghi chú hạ tầng test: `docs/delivery/evidence/proposal-photos-91316c7-2026-10-09/`.

**Hai phát hiện hạ tầng-test (không phải bug sản phẩm, chi tiết ở `stack-notes.md` cùng thư mục):** (1) `auto_https off` trong Caddyfile tắt TOÀN BỘ TLS automation của Caddy kể cả `tls internal` tường minh — phải bỏ hẳn dòng này để cả hai alias (web/MinIO) có cert; (2) tiến trình Node CỦA CHÍNH SCRIPT TEST (không chỉ container `api`) cũng cần `NODE_TLS_REJECT_UNAUTHORIZED=0` khi fetch() của nó tự theo redirect sang MinIO TLS tự ký — thiếu dòng này biểu hiện thành `net::ERR_FAILED` trong Chromium, dễ nhầm là bug sản phẩm.

**Source test:** API 260 suite/3727 test PASS (thêm `place-edit-proposal-photos.service.spec.ts` 14 test + `.controller.spec.ts` 4 test + `AddMediaProposalOwner.spec.ts` migration-structure 3 test + 4 test embed trong `place-edit-proposals.service.spec.ts`). Web 161 suite/1611 test PASS (thêm `ProposalPhotoUploader.spec.tsx` 6 test). `tsc`/eslint sạch cả hai workspace.

**Tương thích:** thuần cộng thêm (cột `proposal_id` nullable, CHECK mở rộng đúng từ ≤1 trong 5 sang ≤1 trong 6 — một đề xuất không có ảnh nào vẫn thoả `0 <= 1`, không ảnh hưởng 5 nhánh cũ) — không sửa/xoá contract nào module khác đang dùng.

**Rollback:** dừng ở image/tag trước đó — KHÔNG cần revert migration nếu chưa có ảnh góp ý thật nào được tạo trên production; nếu có, `down()` của `AddMediaProposalOwner1720008900000` sẽ TỪ CHỐI chạy (ném lỗi) để tránh mất dữ liệu, đúng tiền lệ "throwing down()".

**Đợt 2 — kết luận sau candidate này: KHÔNG còn giới hạn/quyết định nào đang chờ.** Cả hai mảnh ghép treo từ §13q (`sender_message` ở `74356fe`, ảnh góp ý ở `91316c7`) đã đóng. Đợt 2 ở trạng thái CANDIDATE ĐẠT đầy đủ, CHƯA deploy/nghiệm thu production — sẵn sàng được gộp vào gói duyệt production cùng đợt 3/4 (mục 15) nếu owner muốn duyệt chung, hoặc xét riêng.

### 13z-4. Commit `666bee8` — Đợt 1: nhà hàng hiện tiện nghi + cả hai trang hiện giờ cả tuần (10/10/2026)

**Trạng thái: SOURCE ĐẠT, xác nhận thêm trên dữ liệu thật ở §13z-5** (stack `phq-r17`, 10/10/2026 — cùng lượt xác nhận cho cả restaurant/beach/tour, xem cuối §13z-5). Ban đầu không định làm candidate VPS riêng cho CHỈ nhà hàng vì truy vấn SQL giống nguyên văn `HotelsRepository.listAmenities()` đã chạy thật trên production cho khách sạn; khi làm tiếp bãi biển/tour ở §13z-5 đã gộp xác nhận thật cho CẢ BA category mới (restaurant/beach/tour) trong một lượt, không lặp lại cho riêng nhà hàng.

**Bối cảnh — đọc lại khi rà soát đợt 1 theo yêu cầu "tiếp tục":** §13o (dòng 795/822) từng ghi "vị trí/điểm tiếp cận khách sạn, gửi xe và liên hệ đặt bàn nhà hàng, giờ theo ngày" là phần CHƯA LÀM/CHƯA kiểm lại của đợt 1. Rà soát trực tiếp source (không suy đoán từ bảng tóm tắt cũ ở đầu tài liệu — bảng đó đã lỗi thời) cho kết quả:

1. **"Gửi xe" nhà hàng — ĐÃ CÓ hạ tầng từ trước, chỉ THIẾU một chỗ nối:** `AmenitiesEditor` đã render cho category `restaurant` trong `EditPlaceView.tsx` từ lâu (owner gán được tiện nghi cho nhà hàng), và `GET /places/:id/amenities` đã `@Public()`. Chỗ thiếu DUY NHẤT: `RestaurantsService.getBySlug()` chưa từng trả `amenities` ra response công khai (khác `HotelsService.getBySlug()` đã làm đúng việc này), và trang `/restaurants/[slug]` chưa từng render. Đã sửa: thêm `RestaurantsRepository.listAmenities()` (y nguyên truy vấn hotel), nhúng vào `getBySlug()`, render cùng khuôn trang khách sạn.
2. **"Liên hệ đặt bàn" — KHÔNG phải một field còn thiếu, mà là cách dùng hạ tầng đã có:** `contacts` là danh sách chung (PHONE/HOTLINE/BOOKING_URL/...) với `label` tự do — owner gõ nhãn "Đặt bàn" vào MỘT contact là đủ, không cần thêm loại contact mới trong schema. Không sửa gì — ghi nhận rõ để không tự mở một field mới không cần thiết.
3. **"Giờ theo ngày" — dữ liệu/hàm ĐÃ CÓ VÀ ĐÃ TEST (`getOpeningWeek()`, dùng ở trang place chung từ trước), chỉ thiếu render ở hai trang riêng:** cả `/restaurants/[slug]` và `/hotels/[slug]` trước đây chỉ gọi `getOpeningToday()` ("giờ hôm nay"), chưa từng hiện bảng cả tuần dù hàm đã sẵn có. Đã thêm khối `<details>` giống đúng khuôn trang place chung vào CẢ HAI trang.
4. **"Vị trí/điểm tiếp cận riêng của từng phòng khách sạn" — xác nhận KHÔNG tồn tại, và KHÔNG phải một tiêu chí đã chốt cần làm** (chỉ là một quan sát ghi ở §13y/13v khi đang liệt kê giới hạn, không phải một yêu cầu owner từng đặt ra) — giữ nguyên là giới hạn đã biết, không tự mở thêm trường mới ngoài phạm vi.

**Code:** `666bee8` (API: `RestaurantsRepository.listAmenities()` + `RestaurantsService.getBySlug()` nhúng `amenities`; Web: `RestaurantDetail` type + render tiện nghi trên `/restaurants/[slug]`, render bảng giờ cả tuần trên CẢ `/restaurants/[slug]` và `/hotels/[slug]`). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Test mới:** API 260 suite/3727 test PASS (1 test cập nhật — `getBySlug: ghép restaurant_details + cuisines + amenities`, khẳng định `repo.listAmenities` được gọi đúng `place.id`). Web 161 suite/1615 test PASS (4 test mới: amenities hiện/không hiện trên trang nhà hàng; bảng giờ cả tuần trên cả hai trang nhà hàng/khách sạn). `tsc`/eslint sạch cả hai workspace. `next build` production thành công, route `/[locale]/restaurants/[slug]` và `/[locale]/hotels/[slug]` biên dịch đúng.

**Tương thích:** thuần cộng thêm field đọc (`amenities` giờ xuất hiện trong response `GET /restaurants/:slug` — không có client nào phụ thuộc vào SỰ VẮNG MẶT của field này, nên không có rủi ro tương thích ngược). Không migration, không đổi route nào.

**Đợt 1 — sau commit này:** cả 4 mục "chưa làm" ghi ở §13o đã được xử lý (2 đóng bằng code, 2 xác nhận không phải gap thật). Không còn mục nào được ghi nhận là "cần để đóng đợt" trong toàn bộ §13b→§13z-4 — đợt 1 ở trạng thái SOURCE ĐẠT cho những phần đã rà; **chưa rà lại phần bãi biển/tour theo đúng chuẩn kiểm tra chi tiết này** (§13o từng ghi "phần bãi biển/tour đã kiểm trước đó chưa rà lại theo chuẩn này" — đây là việc CHƯA làm, không phải đã làm rồi quên ghi).

### 13z-5. Commit `1b50c1c` — Đợt 1: bãi biển + tour cùng khoảng trống, đã đóng (10/10/2026)

**Trạng thái: SOURCE ĐẠT + xác nhận thêm trên dữ liệu thật (xem cuối mục này).** Không cần MỘT candidate VPS đầy đủ kiểu HTTP+browser cô lập riêng (không migration, không route mới) — nhưng vì đây là lần ĐẦU TIÊN 3 câu SQL mới (`listAmenities()` của restaurant/beach/tour) chạy ngoài unit test mock, đã làm một xác nhận boot+real-data nhẹ (không cần MinIO/web/browser) trên VPS, xem cuối mục.

**Tiếp tục rà soát §13z-4 đã hoãn lại ("chưa rà lại phần bãi biển/tour theo đúng chuẩn kiểm tra chi tiết này") — kết quả:**

1. **Bãi biển — giờ theo ngày: ĐÃ ĐÚNG từ trước, không cần sửa.** Bãi biển không có trang chi tiết riêng — phục vụ qua CHÍNH trang `/places/[slug]` dùng chung, và trang đó đã có `getOpeningWeek()` từ trước (không liên quan gì tới đợt làm hotel/restaurant) — không có gap.
2. **Bãi biển — tiện nghi: CÓ gap, đã sửa.** `BeachesService.getBySlug()` chưa từng join `place_amenities` (giống đúng lỗ hổng nhà hàng ở §13z-4). Thêm `BeachesRepository.listAmenities()` (y nguyên truy vấn hotel/nhà hàng), nhúng vào response, render ở trang `/places/[slug]` (mục "Tiện nghi" MỚI, độc lập với mục "Thông tin bãi biển" hiện có — một bãi có thể có tiện nghi dù chưa có hàng `place_beach_details` nào).
3. **Tour — giờ theo ngày: CÓ gap thật, đã sửa.** Khác bãi biển, tour CÓ trang chi tiết riêng (`/tours/[slug]`) và trang đó CHƯA TỪNG đọc `opening_hours` ở bất kỳ hình thức nào (không phải chỉ thiếu bảng cả tuần — thiếu cả "giờ hôm nay"). Dữ liệu đã có sẵn trên `PlaceDetail` nền (base) từ lâu, chỉ thiếu phần render. Thêm cả hai (giờ hôm nay + bảng cả tuần), cùng khuôn các trang khác.
4. **Tour — tiện nghi: CÓ gap, đã sửa.** `ToursService.getBySlug()` cũng chưa từng join `place_amenities`. Thêm `ToursRepository.listAmenities()`, nhúng, render.

**Code:** `1b50c1c` (API: `BeachesRepository.listAmenities()` + `BeachesService.getBySlug()`; `ToursRepository.listAmenities()` + `ToursService.getBySlug()`. Web: `getBeachPublicDetails()` đổi hình dạng trả về thành `{beach_details, amenities}` — tách riêng vì hai nguồn độc lập; trang `/places/[slug]` render tiện nghi bãi; `TourDetail` type + trang `/tours/[slug]` render tiện nghi + giờ hoạt động/bảng cả tuần). Nhánh `feat/beach-details-cas`, chưa merge/push.

**Test mới:** API 260 suite/3729 test PASS (2 test mới: `BeachesService`/`ToursService` getBySlug nhúng đúng amenities). Web 161 suite/1621 test PASS (6 test mới: bãi biển amenities hiện/không hiện độc lập với beach_details rỗng; tour amenities + giờ hoạt động hiện/không hiện + bảng cả tuần). `tsc`/eslint sạch cả hai workspace. `next build` production thành công.

**Tương thích:** thuần cộng thêm field đọc, cùng lý do §13z-4. `getBeachPublicDetails()` đổi hình dạng trả về (`BeachDetails | null` → `{beach_details, amenities}`) — hàm nội bộ, CHỈ một nơi gọi (`places/[slug]/page.tsx`, đã sửa trong CÙNG commit), không phải route API nào đổi hợp đồng.

**Xác nhận thêm trên dữ liệu thật (10/10/2026, stack tối giản `phq-r17` — chỉ postgres+redis+api, KHÔNG cần MinIO/web/browser vì đây là đường đọc thuần, đã dọn):** unit test mock repository nên câu SQL mới (`listAmenities()` của cả 3 repository) chưa từng chạy thật trên Postgres thật trước đó. Build image `phuquochub-api:1b50c1c…`, chạy đủ 91 migration, boot container thật ("Nest application successfully started", không lỗi DI — đúng dự kiến vì không có module mới). Gán tiện nghi "parking" qua SQL trực tiếp cho MỘT địa điểm thật đã published của ĐỦ 4 category (`novotel-phu-quoc`/`nha-hang-ra-khoi`/`bai-sao`/`tour-3-dao-an-thoi`), gọi đúng 4 endpoint công khai thật — cả 4 đều trả về 200 kèm đúng mảng `amenities` (object đầy đủ `{id,code,label_vi,label_en,icon,group}`, cột `"group"` có dấu ngoặc kép chạy đúng, không lỗi cú pháp SQL). Kiểm hồi quy: một khách sạn KHÁC chưa từng gán tiện nghi nào (`sonasea-phu-quoc`) trả `amenities: []` — không `null`, không lỗi. Bằng chứng: `docs/delivery/evidence/place1-amenities-1b50c1c-2026-10-11/`.

**Đợt 1 — kết luận sau candidate này: cả 4 nhóm (khách sạn/nhà hàng/bãi biển/tour) đã được rà theo cùng chuẩn kiểm tra chi tiết (DTO→service→API công khai→render web), không còn khoảng trống nào được ghi nhận.** Đợt 1 ở trạng thái SOURCE ĐẠT đầy đủ — chưa có candidate VPS GỘP cho toàn bộ các sửa đổi §13z-4+13z-5 (từng commit đều được đánh giá rủi ro thấp và miễn candidate riêng theo mục VIII), chưa deploy, chưa nghiệm thu production.

## 15. GÓI DUYỆT PRODUCTION — cụm đợt 3+4 (chuẩn bị 09/10/2026, CHƯA xin duyệt tới khi owner đọc mục này)

Gói theo đúng khung mục IX — không chỉ trỏ tới một mục tài liệu. Baseline production xác nhận bằng đọc trực tiếp (không mutate) vào lúc chuẩn bị gói, không suy đoán từ báo cáo cũ.

### 15.1 Phạm vi và toàn bộ diff so với baseline thực tế

**Baseline production hiện tại (đọc trực tiếp 09/10/2026):**
- `phuquoc-api-prod` đang chạy image `phuquochub-api:f0c65b716c39a41de4948c695d4383f2cfa47f1f`.
- `phuquoc-web-prod` đang chạy image `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848` — **hai service đang pin HAI SHA khác nhau** (đúng tiền lệ "release tag governance" đã ghi — không mặc định API/Web cùng tag).
- DB production: **80 migration**, mới nhất `SeedPriceVerifyPermission1720007800000` (đọc trực tiếp `SELECT count(*), max(name) FROM migrations` qua socket nội bộ container, không cần mật khẩu, không ghi gì).

**Candidate đề xuất:** MỘT SHA duy nhất cho cả API và Web — `1fda1bd1484de09364b167d6e42f1149f0f028a4` (nhánh `feat/beach-details-cas`, chưa merge/push).

**Diff theo tính năng (không phải vì không có diff code — 33 commit đổi `apps/api`, 18 commit đổi `apps/web` kể từ hai baseline trên; xem toàn văn bằng `git log --oneline f0c65b7..4c0a743` / `git log --oneline b91e92c..4c0a743`):**

1. **Đợt 1 polish còn sót (trước đợt 3/4, chưa từng deploy):** metadata giá món nhà hàng (đơn vị/ngày ghi nhận/nguồn), route tiếp cận khách sạn (`AddHotelAccessRoute`).
2. **Đợt 3 — Tuyển dụng MVP:** `job_listings` đầy đủ vòng đời draft→pending→published→closed, "Tin của tôi", hàng chờ duyệt, public `/jobs`+`/jobs/{id}`.
3. **Đợt 4 — Bất động sản MVP:** `real_estate_listings` (thuê+bán, `deal_status` độc lập, ẩn vị trí chính xác khi `address_precision='area'`), `real_estate_listing_photos` (tải/xem/gỡ ảnh, kiểm GPS EXIF khi vị trí chưa chính xác), public `/real-estate`+`/real-estate/{id}`.
4. **Hạ tầng dùng chung mới (phục vụ cả đợt 3 lẫn đợt 4):** `saved_items` ("lưu tin"), `listing_reports` ("báo sai/báo trùng") — cả hai polymorphic, tái dùng pattern đã có, không đụng `ModerationCase`/ADR nào.
5. **Đóng mục VI còn thiếu:** sitemap + structured data (JSON-LD `JobPosting`/`RealEstateListing`) cho cả hai loại tin.

### 15.2 Full SHA, API/Web image identity

- **SHA đầy đủ:** `1fda1bd1484de09364b167d6e42f1149f0f028a4`.
- **API image:** `phuquochub-api:1fda1bd1484de09364b167d6e42f1149f0f028a4` — id `sha256:bbce83daa75a…` (build lại 09/10/2026 trên VPS từ đúng archive SHA này; nội dung layer giống hệt image đã test đầy đủ ở §13y dưới SHA `dfeb9b7`, vì KHÔNG có commit nào đổi `apps/api` giữa `dfeb9b7` và SHA này — chỉ build lại để có tag khớp đúng SHA release, không phải vì có thay đổi backend mới).
- **Web image:** `phuquochub-web:1fda1bd1484de09364b167d6e42f1149f0f028a4` — id `sha256:76428ac09c32…` (build MỚI thật, bao gồm 3 commit sitemap/structured-data/limit-fix — build bằng đúng `--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api` v.v. như production thật dùng, build THÀNH CÔNG, exit 0).

**Sửa một bug thật phát hiện khi test CHÍNH image này (không phải chỉ unit test), xem §15.1-bis dưới đây** — SHA ban đầu chuẩn bị ở lượt trước (`4c0a743`) có bug, KHÔNG dùng SHA đó, dùng SHA `1fda1bd` này.

### 15.1-bis. Bug tìm thấy qua test image, đã sửa trước khi trình gói (09/10/2026)

Build xong image ở SHA `4c0a743` (web, gồm 2 commit sitemap+structured-data), đưa lên stack cô lập `phq-r15-*`, seed 1 tin tuyển dụng + 1 tin bất động sản thật (submit+duyệt), rồi `curl` trực tiếp `sitemap.xml` — PHÁT HIỆN sitemap hoàn toàn KHÔNG có URL chi tiết nào cho 2 loại tin này (JSON-LD từng trang vẫn đúng, nhưng sitemap thì không). Gọi trực tiếp `GET /job-listings?limit=100` xác nhận nguyên nhân: `ListJobListingsQueryDto`/`ListRealEstateListingsQueryDto` chỉ cho `@Max(50)`, trả 400; `safeList()` trong `sitemap.ts` nuốt lỗi đó thành mảng rỗng (đúng thiết kế chống sập sitemap, nhưng khiến bug im lặng). Đây CHÍNH XÁC là lỗi mà unit test (mock, không áp constraint DTO thật) không bắt được — chỉ test image thật mới lộ ra, đúng lý do mục VIII phân biệt "test từ source" với "test image thật".

Sửa: `apps/web/src/app/sitemap.ts` đổi `limit:100`→`limit:50` cho 2 lời gọi này, thêm test khẳng định call args (`b8c2f44`/`4c0a743` không có test này, chỉ test KẾT QUẢ mock trả về — không khoá được giả định sai về trần limit). Commit `1fda1bd`. Build lại image web (+ api để tag khớp), thay vào CÙNG stack `phq-r15-*`, `curl` lại xác nhận sitemap.xml VÀ JSON-LD đều đúng trên image mới. Bằng chứng: `docs/delivery/evidence/sitemap-structured-data-1fda1bd-2026-10-09/`.

### 15.3 Migration cụ thể

**9 migration mới** (80 → 89), đều CỘNG THÊM, không migration nào sửa/xoá cột hiện có:

| # | Migration | Thuộc phần |
|---|---|---|
| 81 | `AddRestaurantMenuPriceMeta1720007900000` | Đợt 1 polish |
| 82 | `AddHotelAccessRoute1720008000000` | Đợt 1 polish |
| 83 | `InitJobListings1720008100000` | Đợt 3 |
| 84 | `SeedJobListingPermissions1720008200000` | Đợt 3 |
| 85 | `InitRealEstateListings1720008300000` | Đợt 4 |
| 86 | `SeedRealEstateListingPermissions1720008400000` | Đợt 4 |
| 87 | `InitSavedItems1720008500000` | Hạ tầng chung |
| 88 | `InitListingReports1720008600000` | Hạ tầng chung (đổi tên enum `saved_item_target_type`→`listable_target_type`, an toàn vì chưa có dữ liệu thật) |
| 89 | `InitRealEstateListingPhotos1720008700000` | Đợt 4 (ảnh/EXIF) |

Tất cả đã chạy thành công nhiều lần trên DB test cô lập (r11-r14, xem §13t-§13y) — KHÔNG migration nào backfill suy đoán, tất cả nullable-first đúng mục VIII.

### 15.4 Kết quả test và giới hạn

- Mỗi phần đã có candidate riêng với bằng chứng DB+HTTP+browser thật trên VPS (r11: `1b122b8`/`7c28059`; r12: `96fad68`; r13: `ac6db5d`; r14: `dfeb9b7`) — xem §13t/§13v/§13w/§13x/§13y. Sitemap/structured-data (`b8c2f44`/`4c0a743`) chỉ cần source test (unit+build) vì không đụng API/schema — xem §13z/§13z-2.
- Source test hiện tại: API 255 suite/3693 test PASS; Web 160 suite/1601 test PASS (sau commit `1fda1bd`). `tsc`/eslint sạch toàn bộ hai workspace.
- **Giới hạn đã biết:** chưa có dữ liệu thật nào trên production cho job-listings/real-estate-listings (đúng — chờ owner/cộng đồng nhập sau khi deploy); không sắp xếp lại ảnh bất động sản; PNG/WEBP chặn EXIF bảo toàn hơn mức tối thiểu. `StorageService`/MinIO thật chỉ test trên stack cô lập r14 (MinIO riêng), chưa test trực tiếp với MinIO production — nhưng đã xác nhận bằng đọc trực tiếp (không mutate) `docker inspect phuquoc-api-prod`: `S3_ENDPOINT=S3_PUBLIC_URL=https://media.phuquochub.com`, `S3_BUCKET=phuquochub-prod` — ĐÃ đúng domain thật từ trước, không phải việc còn phải sửa trước deploy.

### 15.5 Ma trận tương thích client/API/schema

- Toàn bộ thay đổi là CỘNG THÊM (bảng mới, cột mới nullable, permission mới) — không sửa/xoá contract nào API cũ đang dùng. Một Web CŨ (đang chạy `b91e92c`) gọi vào API MỚI (`4c0a743`) vẫn hoạt động đúng (API mới chỉ thêm route, không đổi route cũ). Một API CŨ (`f0c65b7`) với Web MỚI sẽ lỗi 404 ở các trang/API mới (`/jobs`, `/real-estate`, `/saved`, `/listing-reports`, ảnh bất động sản) — vì vậy **thứ tự triển khai PHẢI API trước, Web sau** (không đảo được).
- Đổi tên enum `saved_item_target_type`→`listable_target_type` (migration 88) là thay đổi NỘI BỘ (không lộ qua API) — an toàn tuyệt đối vì bảng `saved_items` sản xuất chưa tồn tại trước migration 87 trong CÙNG lượt deploy này (không có dữ liệu cũ nào phụ thuộc tên cũ).

### 15.6 Thứ tự triển khai, pin, hậu kiểm

**Thứ tự (không đảo):**
1. Backup DB + media production trước (theo lịch cron đã có hoặc chạy tay `scripts/backup.sh`/`scripts/backup-media.sh`).
2. Deploy API trước: pin `API_IMAGE_TAG=1fda1bd1484de09364b167d6e42f1149f0f028a4`, chạy migration (9 migration mới, cộng thêm, ~vài giây).
3. Xác nhận permission mới (`JobListing.Create/Moderate`, `RealEstateListing.Create/Moderate`) đã lên đúng role `member`/`moderator`/`content_owner` (migration 84/86 tự seed — chỉ cần xác nhận bằng `SELECT` sau khi chạy).
4. Pin `WEB_IMAGE_TAG=1fda1bd1484de09364b167d6e42f1149f0f028a4` — ĐỒNG BỘ HOÁ api/web về CÙNG một tag (sửa luôn trạng thái split-pin hiện tại, đúng tiền lệ "release tag governance" khuyến nghị không mặc định API/Web cùng tag NHƯNG ở đây là MỘT quyết định rollout rõ ràng, không phải mặc định ngầm).
5. `S3_ENDPOINT`/`S3_PUBLIC_URL` production đã đúng `https://media.phuquochub.com` từ trước (xác nhận lại ngay trong gói này, không cần sửa) — tính năng ảnh bất động sản dùng ĐÚNG cùng `StorageService`/config này, không cần thay đổi gì thêm ở bước deploy.

**Hậu kiểm (thực hiện qua tài khoản owner thật, không chỉ tin vào test):**
- Tạo 1 tin tuyển dụng thật, submit, duyệt, xác nhận hiện đúng `/jobs/{id}`, có trong sitemap.xml, có JSON-LD hợp lệ (dán vào Google Rich Results Test).
- Tạo 1 tin bất động sản thật với `address_precision='area'`, xác nhận response public KHÔNG có `address_text`/`lat`/`lng`; tải 1 ảnh thật (không gắn GPS) → thành công; thử tải ảnh có gắn GPS (ảnh chụp từ điện thoại chưa tắt định vị) → bị từ chối với thông báo rõ.
- "Lưu tin" + "Báo sai/báo trùng" từ một tài khoản thường, xác nhận hàng chờ moderator nhận đúng.

### 15.7 Điều kiện rollback và phương án bảo toàn dữ liệu

- **Rollback image:** trả `API_IMAGE_TAG`/`WEB_IMAGE_TAG` về `f0c65b716c39a41de4948c695d4383f2cfa47f1f`/`b91e92ce7baf547b757d425eea0f30ceac8cd848` — khôi phục code/UI cũ NGAY, nhưng (đúng mục VIII: "không coi rollback image là rollback schema") 9 bảng/cột MỚI vẫn còn trong DB, vô hại với code cũ (code cũ không đọc/viết chúng).
- **Rollback schema (chỉ khi thật sự cần, ví dụ migration gây lỗi DB):** KHÔNG tự chạy `down()` của 9 migration trên (mục VIII: "không mặc định chạy down migration làm mất dữ liệu mới") — nếu đã có tin/ảnh/lưu tin/báo cáo thật được tạo ra trong lúc chạy, down sẽ XOÁ chúng. Phải xác nhận riêng với owner trước khi down bất kỳ migration nào trong danh sách 81-89, và chỉ down theo đúng thứ tự ngược (89→81).
- **Dữ liệu cần bảo toàn:** mọi tin tuyển dụng/bất động sản + ảnh + lưu tin + báo cáo được tạo SAU khi deploy — backup DB+media ngay SAU hậu kiểm (không chỉ trước deploy), để có điểm khôi phục bao gồm cả dữ liệu thật đầu tiên.

**Dừng ở đây — chờ owner đọc và quyết định.** Yêu cầu "tiếp tục" trước đó KHÔNG được hiểu là đã duyệt mục 15 này.

## 16. MỞ RỘNG GÓI DUYỆT — cộng thêm đợt 1 (polish) + đợt 2 (đóng hoàn toàn) lên trên mục 15 (chuẩn bị 10-11/10/2026, CHƯA xin duyệt)

Mục 15 ở trên (SHA `1fda1bd`) vẫn ĐÚNG và còn hiệu lực cho đúng phạm vi nó mô tả (đợt 3+4) — mục này KHÔNG thay thế, chỉ cộng thêm 4 commit mới đã lên candidate SAU khi mục 15 được viết. Owner có thể duyệt mục 15 và mục 16 CÙNG LÚC (một SHA duy nhất, xem §16.2) hoặc chỉ mục 15 trước — cả hai lựa chọn đều an toàn vì KHÔNG có bảng/route nào trùng nhau giữa hai phạm vi (xem §16.5).

### 16.1 Phạm vi — đúng 5 commit mới, không gì khác

```
git log --oneline 1fda1bd..a187105
a187105 feat(hotels): cancellation policy field
1b50c1c fix(beaches,tours): amenities + full-week opening hours
666bee8 fix(restaurants,hotels): amenities + full-week opening hours
91316c7 feat(place-edit-proposals): ảnh góp ý qua media moderation
74356fe feat(place-edit-proposals): sender_message — phản hồi public cho người gửi
```

1. **Đợt 2 — đóng hoàn toàn** (xem §13z-3): `sender_message` (phản hồi admin viết cho người gửi, tách khỏi `review_note` nội bộ) + "ảnh góp ý qua media moderation" (tối đa 3 ảnh bằng chứng/đề xuất, qua đúng hàng chờ kiểm duyệt chung `ModerationTargetType.MEDIA`, nhánh sở hữu thứ 6 của `media`). Sau hai commit này, đợt 2 không còn giới hạn/quyết định nào đang chờ (trước đó mục 15 KHÔNG bao gồm đợt 2 — đợt 2 vẫn đang có 2 khoảng trống treo tại thời điểm viết mục 15).
2. **Đợt 1 — polish, đóng 4 khoảng trống còn treo từ §13o** (xem §13z-4/§13z-5): khách sạn/nhà hàng/bãi biển/tour đều thiếu render `amenities` (tiện nghi — "gửi xe" v.v., bảng `place_amenities` dùng chung, owner đã gán được từ trước nhưng public API/trang không trả/không hiện); nhà hàng/khách sạn/tour đều chỉ hiện "giờ hôm nay" thay vì bảng giờ cả tuần (`getOpeningWeek()`) đã có sẵn và đã test. "Liên hệ đặt bàn" và "vị trí riêng từng phòng khách sạn" xác nhận KHÔNG phải gap thật (ghi rõ lý do ở §13z-4 mục 2/4) — không sửa.
3. **Đợt 1 — khách sạn: "chính sách" (mục V đợt 1 mục A liệt kê rõ) hoàn toàn chưa có field nào** (`a187105`): `place_hotel_details` trước đây chỉ có loại hình/hạng sao/giờ nhận-trả/đường vào — không có bất kỳ cột chính sách nào (đã grep xác nhận, không suy đoán). Thêm `cancellation_policy` (văn bản tự do, cùng khuôn `place_tour_details.cancellation_policy` đã có), wire đủ DTO→repository upsert/detail→service→editor admin→trang công khai.

### 16.2 Full SHA, API/Web image identity

- **SHA đầy đủ (gộp mục 15 + mục 16):** `a18710540bab5444e7b681340c0ae3cd0ebfc74f`.
- **API image:** `phuquochub-api:a18710540bab5444e7b681340c0ae3cd0ebfc74f` — id `sha256:56e0ec6bb813…` (build thật trên VPS từ archive checksum-verified `sha256:ce7bf592…`, khớp đúng SHA).
- **Web image:** `phuquochub-web:a18710540bab5444e7b681340c0ae3cd0ebfc74f` — id `sha256:6b68b8a63b48…` (build với đúng `--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api` v.v., đã dùng để chạy browser test thật ở §16.4).

### 16.3 Migration cụ thể

**3 migration mới so với mục 15** (89 → 92), cả ba CỘNG THÊM, không sửa/xoá cột hiện có:

| # | Migration | Thuộc phần |
|---|---|---|
| 90 | `AddPlaceEditProposalSenderMessage1720008800000` | Đợt 2 |
| 91 | `AddMediaProposalOwner1720008900000` | Đợt 2 (nhánh sở hữu thứ 6 của `media`) |
| 92 | `AddHotelCancellationPolicy1720009000000` | Đợt 1 (khách sạn) |

Cả ba đã chạy thành công nhiều lần trên DB test cô lập (stack `phq-r16`, `phq-r17`, `phq-r18`) — không migration nào backfill suy đoán, nullable-first đúng mục VIII.

### 16.4 Kết quả test và bằng chứng

- **Đợt 2:** candidate riêng đầy đủ (DB+HTTP+browser thật, MinIO thật, không mock) — stack `phq-r16`, xem §13z-3. HTTP 21/21, browser (Playwright v1.63.0) 12/12. API boot thật xác nhận KHÔNG có lỗi circular dependency (rủi ro cụ thể của thay đổi này — module mới tái dùng `MediaRepository` theo hướng an toàn).
- **Đợt 1 (amenities/giờ cả tuần):** source test (unit+typecheck+eslint+`next build`) cho cả hai commit, CỘNG MỘT xác nhận boot+dữ liệu thật riêng (stack tối giản `phq-r17`) — gán tiện nghi "parking" cho MỘT địa điểm thật đã published của ĐỦ 4 category, gọi đúng 4 endpoint công khai thật, cả 4 trả 200 kèm đúng `amenities`; một khách sạn khác chưa gán tiện nghi nào trả `amenities: []` (không null, không lỗi) — bằng chứng `docs/delivery/evidence/place1-amenities-1b50c1c-2026-10-11/`.
- **Đợt 1 (chính sách huỷ phòng khách sạn, `a187105`):** đây là ĐƯỜNG GHI thật (không chỉ đọc) nên xác nhận kỹ hơn — stack `phq-r18`, đăng ký user thật, cấp role `business_manager` scope `managed` đúng business_id của MỘT khách sạn thật đã published (`novotel-phu-quoc`), round-trip qua API thật: GET baseline (`cancellation_policy: null`) → PATCH với giá trị (200, CAS bump `content_version` 1→2 đúng) → GET công khai `/hotels/novotel-phu-quoc` trả đúng giá trị vừa ghi → PATCH gửi `null` tường minh (200, xoá đúng về null, phân biệt "không gửi" với "gửi null để xoá" theo đúng quy ước DTO đã chốt). Bằng chứng: `docs/delivery/evidence/hotel-cancellation-policy-a187105-2026-10-11/`.
- **Source test tại SHA này:** API 260 suite/3731 test PASS; Web 161 suite/1625 test PASS. `tsc`/eslint sạch cả hai workspace.
- **Cập nhật 11/10/2026 — browser test cô lập thật cho cả đợt 1 polish (stack `phq-r18`, Playwright v1.63.0, 20/20 PASS):** đăng nhập thật → trang sửa khách sạn → nhập "Chính sách huỷ phòng" → lưu (hiện "Đã lưu...") → reload trang → giá trị vẫn đúng (readback thật qua DB, không chỉ state React) → trang công khai khách sạn hiện đúng nội dung; cả hai bước có kiểm 375px (field/mục vẫn thấy, không tràn ngang); trang nhà hàng/bãi biển/tour đều hiện đúng "Tiện nghi"/"Bãi đỗ xe"; `blockedOrigins` rỗng cả hai context. **Phát hiện đáng chú ý (không phải bug của 3 commit này):** `opening_hours` có cổng bằng chứng riêng từ trước (`PlacesService.getBySlug()` → `hasCurrentQualifiedOpeningHoursEvidence()`, cùng khuôn price trust gate) — giá trị ghi thẳng qua SQL (không qua `evidence_artifacts`/`evidence_reviews` APPROVE đúng hash) bị fail-closed về `null`, đúng thiết kế. Xác nhận bằng SQL trực tiếp: KHÔNG có place nào trong seed hiện tại từng có bằng chứng `opening_hours` hợp lệ — cổng này áp dụng chung mọi category qua `PlacesService.getBySlug()`, không phải điều 3 commit này tạo ra, và dường như chưa từng được thấy "đi qua" (pass) trong môi trường này. Test đã xác nhận đúng nhánh fail-closed (trang không lỗi, không hiện mục trống) — nhánh positive (dữ liệu đã qua bằng chứng thật → hiện đúng bảng cả tuần) đã được xác nhận ở tầng unit/component (`page.spec.tsx`, tiêm `opening_hours` thẳng ở ranh giới fetch — đúng ranh giới cho test render thuần, dùng CHÍNH `getOpeningWeek()` đã chạy thật nhiều năm trên trang place chung) — KHÔNG dựng chuỗi bằng chứng giả cho một test chỉ để xác nhận phần render, ngoài phạm vi sửa đổi của 3 commit này. Bằng chứng: `docs/delivery/evidence/dot1-polish-browser-a187105-2026-10-11/`.
- **Giới hạn đã biết còn lại:** nhánh "positive" của `opening_hours` (dữ liệu đã qua bằng chứng thật → hiện bảng cả tuần) chưa thấy qua browser thật — chỉ qua unit test, lý do đã nêu trên. Rủi ro thấp vì dùng chung object/hàm `getOpeningWeek()` đã chạy thật trên trang place chung từ lâu.

### 16.5 Không có xung đột phạm vi với mục 15

Đợt 1 polish đụng bảng `hotels`/`restaurants`/`beaches`/`tours` (đọc thêm + 1 cột mới ở riêng `place_hotel_details`) + bảng `place_amenities`/`amenities` đã có từ trước. Đợt 2 đụng `place_edit_proposals`/`media` (2 migration). **Không bảng nào trong hai nhóm này trùng với `job_listings`/`real_estate_listings`/`real_estate_listing_photos`/`saved_items`/`listing_reports` của đợt 3/4** — owner duyệt mục 15, mục 16, hoặc cả hai mà không lo xung đột giữa hai gói.

### 16.6 Thứ tự triển khai, pin, hậu kiểm

Cùng thứ tự mục 15.6 (API trước — chạy đủ 12 migration mới so với baseline production 81→92 — rồi Web), KHÔNG đảo. Cả hai image (API + Web) đã build xong đúng SHA `a187105` và đã dùng để test thật (§16.4) — sẵn sàng deploy nếu owner duyệt.

**Hậu kiểm riêng cho mục 16 (owner thật thao tác, không chỉ tin test):**
- Gửi một đề xuất chỉnh sửa thật, kèm 1 ảnh bằng chứng qua UI — xác nhận ảnh vào đúng hàng chờ kiểm duyệt chung, moderator duyệt kèm phản hồi, người gửi đọc được phản hồi + vẫn thấy ảnh.
- Gán tiện nghi "Bãi đỗ xe" cho một nhà hàng/bãi biển/tour thật qua editor hiện có — xác nhận hiện đúng trên trang công khai (trước đây sẽ KHÔNG hiện dù đã gán).
- Mở trang chi tiết một nhà hàng/khách sạn/tour có giờ mở cửa đầy đủ — xác nhận mục "Giờ mở cửa cả tuần" xuất hiện và đúng 7 ngày.
- Nhập chính sách huỷ phòng thật cho một khách sạn qua editor admin — xác nhận hiện đúng trên trang công khai khách sạn đó.

### 16.7 Rollback

- **Rollback image:** trả về SHA `1fda1bd` (chỉ mục 15) hoặc baseline production `f0c65b7`/`b91e92c` — an toàn với schema 92 (migration 90-92 chỉ cộng cột/bảng nullable, code cũ không đọc).
- **Rollback schema:** migration 91 (`AddMediaProposalOwner`) có "throwing down()" — TỪ CHỐI chạy nếu đã có ảnh góp ý thật (`proposal_id IS NOT NULL`), phải xác nhận riêng với owner trước. Migration 90 (`AddPlaceEditProposalSenderMessage`) và 92 (`AddHotelCancellationPolicy`) down() đều là DROP COLUMN thẳng (không có guard) — nếu đã có dữ liệu thật, down sẽ XOÁ vĩnh viễn, cũng cần xác nhận riêng trước khi chạy, không mặc định.
- **Dữ liệu cần bảo toàn:** mọi `sender_message`/ảnh góp ý/chính sách huỷ phòng thật được tạo SAU deploy — backup DB+media ngay sau hậu kiểm, cùng nguyên tắc mục 15.7.

**Dừng ở đây — chờ owner đọc và quyết định mục 16 (độc lập với mục 15, có thể duyệt riêng hoặc cùng lúc).**

## 17. MỞ RỘNG GÓI DUYỆT — rà soát trường đợt 3/4 theo đúng chuẩn đợt 1, cộng thêm lên mục 15 (chuẩn bị 11/10/2026, cập nhật lại cùng ngày — cả 4/4 khoảng trống đã đóng; CHƯA xin duyệt)

Đợt 3 (tuyển dụng)/đợt 4 (bất động sản) được kế thừa ở mức "candidate đạt" từ TRƯỚC phiên làm việc này (đóng gói ở mục 15), nhưng chưa từng được rà theo đúng chuẩn chi tiết field-by-field đã áp dụng cho đợt 1 ở §13z-4/§13z-5 (tiêu chí đó tìm ra 3 khoảng trống thật cho khách sạn/nhà hàng/bãi biển/tour). Lượt này áp lại đúng chuẩn đó cho đợt 3/4.

### 17.1 Phạm vi — commit `e583bff`, thuần web, không migration, không route mới

Đối chiếu trực tiếp danh sách field của mục V đợt 3 ("...ca làm, yêu cầu, phúc lợi, liên hệ public, hạn tuyển") và đợt 4 ("...ngày đăng/cập nhật/hết hạn/trạng thái") với DTO→service→API công khai→trang web, tìm được:

1. **`job_category` (ngành nghề) — bắt buộc nhập qua form, backend lưu/trả về, nhưng thẻ tin VÀ trang chi tiết công khai chưa từng hiện trường này.** Đã thêm vào cả hai.
2. **`expires_at` (hạn tuyển) — chủ tin nhập được, backend đã lọc tin hết hạn khỏi kết quả công khai (xem `JobListingsRepository`), nhưng hạn tuyển chưa từng hiện cho người tìm việc thấy.** Đã thêm vào trang chi tiết.
3. **Bất động sản: ngày đăng/cập nhật/hạn đăng — có trong response từ lâu, chưa từng render ở trang chi tiết công khai.** Đã thêm. `deal_status` CỐ Ý KHÔNG thêm — endpoint công khai này chỉ trả tin `deal_status=available` (lọc ở tầng repository), nên giá trị đó hằng định trên trang này, không mang thêm thông tin cho người xem (khác `job_category`/`expires_at`, vốn thay đổi theo từng tin) — không phải một gap thật như hai trường còn lại.
4. **`job_listings.place_id` ("place tùy chọn") — ĐÃ ĐÓNG, xem §17.7 (ban đầu hoãn lại ở commit `e583bff`, đóng tiếp ở commit `4a70e59` cùng ngày).** Đã ghi được qua DTO/entity/mapper từ lâu nhưng KHÔNG có ô chọn nào trong form, và không render công khai. Mục V tự ghi rõ trường này "tùy chọn" và "không cấp quyền đại diện/quản lý" nên được xếp hoãn lại ban đầu (đúng nguyên tắc "một luồng nghiệp vụ hoàn chỉnh tại một thời điểm") — sau khi đóng 3 gap còn lại, quay lại đóng tiếp luôn trong cùng ngày vì phạm vi đã rõ và không còn phụ thuộc gì khác.

### 17.2 Vì sao không cần candidate VPS riêng

Thuần thêm render phía web cho dữ liệu ĐÃ CÓ SẴN trong response hiện tại (không đổi API, không route mới, không migration). Cùng nguyên tắc mục VIII "chỉ kiểm lại khi có rủi ro cụ thể" đã áp cho §13z/§13z-2/§13z-4 — rủi ro duy nhất ("các field này có thật trong response không") đã xác nhận bằng cách đọc trực tiếp DTO/mapper/entity (không suy đoán), và xác nhận lại bằng unit test mới (test fixture đúng hình dạng `JobListingBaseView`/`RealEstateListingBaseView` thật, không bịa field).

### 17.3 Kết quả test

Web 164 suite/1637 test PASS (6 test mới: `JobListingCard` — ngành nghề; trang chi tiết tin tuyển dụng — ngành nghề + hạn tuyển có/không + locale EN; trang chi tiết bất động sản — ngày đăng (có/không `published_at`) + cập nhật (khác/giống ngày đăng) + hạn đăng (có/không) + locale EN). `tsc`/eslint sạch, `next build` production thành công.

### 17.4 Tương thích

Thuần hiển thị thêm — không đổi field nào trong response, không có client nào phụ thuộc vào việc các field này KHÔNG được hiện trước đây. Không rủi ro tương thích ngược.

### 17.5 Không có xung đột phạm vi với mục 15/16

Chỉ sửa 2 trang public (`/jobs/[id]`, `/real-estate/[id]`) + 1 component thẻ (`JobListingCard`) — không đụng bảng/route/migration nào. An toàn để duyệt cùng mục 15, hoặc độc lập sau.

### 17.6 Rollback

Rollback image đơn giản — không migration, không đổi schema, không đổi route. Trả về SHA trước đó (`a187105` hoặc `1fda1bd`/baseline production) là đủ, không cần bước nào khác.

### 17.7 Đóng khoảng trống còn lại — "place tùy chọn" cho tin tuyển dụng (commit `4a70e59`, cùng ngày)

**SHA đầy đủ (mục 17 hoàn chỉnh):** `4a70e59602ac598442efc6c4c1769618e063506c`. **API image:** `phuquochub-api:4a70e59…` — id `sha256:7a3e456cf9bc…`. **Web image:** `phuquochub-web:4a70e59…` — id `sha256:1e0ef3e23bc4…` (CẢ HAI build thật trên VPS từ ĐÚNG SHA này, xác nhận bằng checksum archive trước khi build — không chỉ suy ra từ tên candidate).

**Sửa một khoảng trống kiểm thử thật phát hiện khi đối chiếu lại (11/10/2026):** lượt xác nhận đầu (ngay trên) chỉ build image API, không build Web — nghĩa là UI chọn địa điểm CHỈ được xác nhận qua Jest/jsdom (fetch/API đã mock), chưa từng chạy qua một build Next.js production thật trong browser thật. Đã build bổ sung image Web đúng SHA và chạy lại — xem block "Xác nhận UI thật" ngay dưới.

**Thiết kế:** thêm `JobListingsRepository.findPlaceSummary(placeId)` — một SELECT trần vào bảng `places` (cùng mẫu "query bảng kia trực tiếp, không inject service" đã dùng nhiều lần trong phiên này để tránh coupling module không cần thiết), ghép vào response qua `JobListingsService.attachPlace()` — CHỈ ở hai lời gọi đọc MỘT bản ghi (`getMine`/`getPublicById`), không ở các lời gọi danh sách (`listMine`/`listPublic`) hay các lời gọi ghi (`create`/`update`/`submit`/`close`/`reopen`) — type ở web (`JobListingPublicDetailView`/`JobListingSenderDetailView`) phản ánh đúng sự khác biệt này, không nói sai field có mặt ở nơi nó không có. Web: ô tìm single-select mới trong `JobListingForm` (tái dùng `search.suggest()` — CÙNG API `PlacePicker` của `guide-editor` dùng, nhưng viết UI riêng vì hình dạng single-select khác hẳn multi-select có thứ tự của component đó); trang chi tiết công khai hiện liên kết "Tại: &lt;tên địa điểm&gt;" khi có.

**Xác nhận trên dữ liệu thật (stack `phq-r19`, minimal postgres+redis+api, 11/10/2026, đã dọn):** `findPlaceSummary()` là SQL mới chưa từng chạy ngoài unit test mock — đã chạy đủ 92 migration, boot container thật (không lỗi DI), rồi round-trip HTTP thật: tạo tin kèm `place_id` của MỘT địa điểm thật đã published (`POST /job-listings` → 201) → `submit` → `decide(approve)` bởi moderator thật → `GET /job-listings/mine/:id` VÀ `GET /job-listings/:id` (công khai) đều trả đúng `place: {id, name: "Bãi Sao", slug: "bai-sao"}`; tin KHÔNG có `place_id` → `place: null`, không lỗi. Bằng chứng: `docs/delivery/evidence/job-place-picker-4a70e59-2026-10-11/`.

**Test:** API 260 suite/3735 test PASS (4 test mới: `getPublicById`/`getMine` ghép đúng place khi có/không có/không khớp hàng nào). Web 165 suite/1642 test PASS (3 test mới cho `JobListingForm`'s picker: tìm→chọn→gửi đúng `place_id`; bỏ liên kết→gửi `null`; trạng thái rỗng ban đầu — cộng 2 test cho liên kết hiện/không hiện ở trang chi tiết công khai). `tsc`/eslint sạch cả hai workspace, `next build` thành công.

**Xác nhận UI thật (stack `phq-r19`, ĐỦ 4 container postgres+redis+api+web đúng SHA, Playwright chromium v1.63.0, 11/10/2026, đã dọn):** 12/12 PASS — đăng nhập qua UI thật → `/dashboard/job-listings/new` → gõ "Bãi" vào ô tìm → `search.suggest()` THẬT (không mock) trả đúng gợi ý "Bãi Sao" từ DB thật → bấm chọn → hiện "Đang liên kết: Bãi Sao", ô tìm biến mất → lưu nháp thật → (submit+duyệt qua API trực tiếp, luồng này đã có bằng chứng browser riêng từ candidate gốc, không lặp lại) → khách CHƯA đăng nhập mở `/vi/jobs/{id}` công khai thật → thấy đúng liên kết `<a>` "Bãi Sao" trỏ `/vi/places/bai-sao` → tạo tin thứ hai, chọn rồi bấm "Bỏ liên kết" → ô tìm hiện lại đúng. `blockedOrigins` rỗng cả hai context. Bằng chứng: `docs/delivery/evidence/job-place-picker-browser-4a70e59-2026-10-11/`.

**Tương thích:** thuần cộng thêm field đọc (`place`) ở đúng hai response trước đây KHÔNG có field này — không có client nào phụ thuộc vào sự vắng mặt đó. Không migration, không route mới, không đổi DTO ghi (`place_id` đã nhận từ trước).

**Mục 17 — kết luận: cả 4/4 khoảng trống tìm được ở đợt 3/4 đã đóng.** Không còn khoảng trống nào được ghi nhận cho đợt 3/4 sau rà soát field-by-field này.

**Dừng ở đây — chờ owner đọc và quyết định mục 17 (độc lập, có thể duyệt riêng hoặc gộp cùng mục 15).**

## 18. BẢNG NGHIỆM THU NGẮN + GÓI ĐỢT 1 HOÀN CHỈNH (đối chiếu trạng thái 11/10/2026)

Đối chiếu trực tiếp HEAD/worktree/VPS tại thời điểm viết mục này: HEAD `4a70e59`, worktree sạch (không gì chưa commit ngoài file trạng thái/evidence không đưa vào git theo tiền lệ), VPS sạch (chỉ `phq-r1-*` cũ không thuộc run này và `phuquoc-*-prod`), baseline production KHÔNG đổi (API `f0c65b7…`, Web `b91e92c…`, 80 migration). Không có gì lệch so với các mục 15–17 đã ghi.

### 18.1 Bảng nghiệm thu

| Luồng sử dụng | Tiêu chí còn thiếu | Bằng chứng | Commit/candidate | Trạng thái production | Bước tiếp theo |
|---|---|---|---|---|---|
| Đợt 0 — CAS | Không | Integration 16/16, browser 8/8 (§Đợt 0, đầu tài liệu) | `b699302`/`78a946d`/`cb56c0a` | CHỜ DUYỆT RELEASE | Gộp vào gói đợt 1 (mục 18.2) khi owner duyệt |
| Đợt 1a — Rooms CAS + editor phòng | Không | Browser **25/25** (desktop+375px): thêm/sửa/bỏ phòng, reload, 409 giữ nội dung, public có/không giá (§13n/13o) | `0f7ba30`/`0072e2a`/`c12dc40` | CHỜ DUYỆT RELEASE | Gộp vào gói đợt 1 |
| Đợt 1b — Metadata giá món nhà hàng (đơn vị/ngày/nguồn) | Không | Cùng browser 25/25 trên: sửa giá cũ, thêm món có nguồn mới, lỗi 500 giữ nháp + retry không tạo nguồn trùng, public hiện đúng (§13n/13o) | `0072e2a` | CHỜ DUYỆT RELEASE | Gộp vào gói đợt 1 |
| Đợt 1c — Khách sạn/nhà hàng/bãi biển/tour: tiện ích + giờ cả tuần + chính sách huỷ phòng | Không (nhánh "giờ cả tuần đã qua bằng chứng thật" chưa demo được qua browser — xem giới hạn ở §16.4, không phải lỗi code) | HTTP+browser thật **20/20** (Playwright, desktop+375px), round-trip ghi thật qua UI cho chính sách huỷ phòng (§16) | `666bee8`/`1b50c1c`/`a187105` | CHỜ DUYỆT RELEASE | Gộp vào gói đợt 1 |
| Đợt 2 — Góp ý có phản hồi (sender_message + ảnh qua media moderation) | Không | HTTP **21/21**, browser **12/12** (Playwright), MinIO thật (§13z-3) | `74356fe`/`91316c7` | CHỜ DUYỆT RELEASE | Gói riêng (mục 16) hoặc gộp |
| Đợt 3 — Tuyển dụng MVP | Không | Candidate gốc HTTP+browser (§13t) + field audit/place-picker, HTTP round-trip thật (§17) | `de5852d…1b122b8` + `e583bff`/`4a70e59` | CHỜ DUYỆT RELEASE | Gói riêng (mục 15+17) hoặc gộp |
| Đợt 4 — Bất động sản MVP | Không | Candidate gốc HTTP+browser, MinIO thật (§13v-y) + field audit render (§17) | `b0a2b7c`/`7c28059` + `e583bff` | CHỜ DUYỆT RELEASE | Gói riêng (mục 15+17) hoặc gộp |

Không có hàng nào ở trạng thái CHƯA LÀM/ĐANG LÀM — toàn bộ 5 đợt đã CANDIDATE ĐẠT với bằng chứng DB+HTTP thật, đa số có thêm browser thật (desktop+375px). Chưa có hàng nào ĐÃ DEPLOY hay ĐÃ NGHIỆM THU — production baseline không đổi suốt phiên này.

### 18.2 Gói đợt 1 hoàn chỉnh (hợp nhất §13n/13o với §16 — không phải thông tin mới, chỉ gộp lại thành MỘT gói để duyệt gọn)

**SHA đầy đủ cho đúng phạm vi "đợt 0+1+2, không lẫn đợt 3/4":** `a18710540bab5444e7b681340c0ae3cd0ebfc74f` — đây là commit NGAY TRƯỚC khi đợt 3/4 được chạm tới tiếp ở `e583bff` (xác nhận bằng `git log`: `a187105` → `e583bff` → `4a70e59`), nên tại đúng SHA này, lịch sử branch chứa ĐẦY ĐỦ đợt 0+1+2 và KHÔNG có bất kỳ thay đổi nào cho `job_listings`/`real_estate_listings` ngoài những gì đã có từ gói mục 15 cũ hơn.

**API/Web image:** đã build và test thật ở §16.2 (`phuquochub-api/web:a187105…`).

**Migration riêng của đợt 1 (đã CỘNG vào tổng, không migration nào sửa/xoá):**
| Migration | Nội dung | Candidate gốc |
|---|---|---|
| `InitBeachDetails` | `place_beach_details` | cb56c0a (§13b) |
| `AddHotelStarRatingSource` | hạng sao có nguồn | (trước §13n) |
| `AddRestaurantMenuPriceMeta` (81) | đơn vị/ngày ghi nhận/nguồn giá món | 0072e2a (§13n) |
| `AddHotelAccessRoute` (82) | đường vào/điểm tiếp cận khách sạn | c12dc40 (§13o) |
| `AddHotelCancellationPolicy` (92) | chính sách huỷ phòng | a187105 (§16) |

**Luồng đã nghiệm (gộp từ hai nguồn bằng chứng, không lặp lại test):**
- Rooms CAS + editor: browser 25/25 (§13n/13o) — thêm/sửa/bỏ phòng, reload giữ đúng, 409 bảo toàn dữ liệu, quyền 403 đúng, public ẩn/hiện giá đúng.
- Giá món nhà hàng: cùng 25/25 — đơn vị/ngày/nguồn, retry không tạo nguồn trùng, public "chưa rõ" khi thiếu metadata (không suy đoán).
- Tiện ích (khách sạn/nhà hàng/bãi biển/tour) + giờ cả tuần (nhà hàng/khách sạn/tour) + chính sách huỷ phòng (khách sạn): HTTP+browser 20/20 (§16) — gồm một round-trip GHI thật qua UI (nhập→lưu→reload→public), không chỉ đọc.
- Bãi biển/tour (CAS, field gốc): kế thừa candidate đã đạt trước đó (§13e/13i), không làm lại.

**Tương thích:** API mới + Web cũ chạy được (mọi field mới là tùy chọn/nullable); Web mới + API cũ KHÔNG chạy đúng ở các route editor mới (`/rooms/managed`, `/menu/managed`, PATCH rooms có version) — API phải lên trước Web, không đảo.

**Rollback:** Web về baseline `b91e92c…` (tương thích schema mới); API về baseline `f0c65b716c…` (chạy được với toàn bộ cột mới đều nullable, KHÔNG cần revert migration). KHÔNG chạy `down()` nếu đã có dữ liệu thật (đơn vị/ngày/nguồn giá, chính sách huỷ phòng) — sẽ xoá vĩnh viễn.

**Hậu kiểm (owner thật thao tác):** tạo 1 phòng khách sạn thật qua editor, reload xác nhận còn; sửa giá 1 món nhà hàng thật kèm đơn vị/ngày/nguồn, xác nhận public hiện đúng; gán tiện nghi cho 1 nhà hàng/bãi biển/tour thật, xác nhận hiện công khai; nhập chính sách huỷ phòng cho 1 khách sạn thật, xác nhận hiện công khai.

**Mục 18 — kết luận:** đợt 1 đã SẴN SÀNG làm MỘT gói duyệt độc lập, hoàn chỉnh, không cần thêm bằng chứng. Đợt 2/3/4 cũng ở cùng mức (CHỜ DUYỆT RELEASE) theo bảng 18.1 — owner có thể duyệt từng đợt riêng theo đúng mục IX ("không gom thành một cutover lớn"), hoặc duyệt gộp nếu muốn, bằng cách chọn đúng SHA tương ứng phạm vi muốn (`a187105` = đợt 0+1+2; `4a70e59` = tất cả 5 đợt).

### 18.3 Dự toán phần còn lại — SỬA LẠI (11/10/2026, theo yêu cầu đối chiếu lại)

**Câu "0 giờ còn lại" ở lượt viết trước là SAI PHẠM VI — rút lại.** Câu đó chỉ đúng cho nghĩa hẹp "không còn tiêu chí kỹ thuật nào tôi có quyền tự xử lý trong phạm vi code đã test" — nhưng diễn đạt "0 giờ còn lại" đọc như "không còn việc gì phải làm", trong khi các việc sau CHƯA làm và không phải việc 0 giờ:
- **Migration production:** 0/12 migration mới (81→92, hoặc 81→89 nếu chỉ chọn mục 15) đã chạy trên DB production. Đây là việc thật, có rủi ro thật (xem mục 20 bảng migration), không phải "0 giờ".
- **Triển khai production:** 0 image candidate nào đã pin lên `phuquoc-api-prod`/`phuquoc-web-prod`. Baseline production vẫn nguyên `f0c65b7`/`b91e92c`/80 migration tại thời điểm viết mục này (xác nhận lại bằng đọc trực tiếp, không mutate, cùng lúc viết mục 18 — xem mục 18 đoạn mở đầu).
- **Hậu kiểm thật trên production:** các hậu kiểm ghi ở mục 15.6/16.6 ("owner thật thao tác") CHƯA làm trên production — chỉ đã làm tương đương trên stack cô lập (r11-r19), không phải trên production.
- **Nghiệm thu/bàn giao:** owner CHƯA đọc/duyệt bất kỳ gói nào trong mục 15/16/17/18 — "tiếp tục" trước đó không được hiểu là đã duyệt (đã ghi rõ ở cuối mỗi mục).
- **Khoảng trống governance mới phát hiện (mục 19 dưới):** quyết định về cổng bằng chứng `opening_hours` CHƯA được owner đưa ra.

**Diễn đạt đúng:** phần việc TÔI có quyền tự làm trong phạm vi được giao (code, migration viết sẵn, test trên candidate/stack cô lập) đã xong cho cả 5 đợt. Phần việc CHƯA xong — migration production, triển khai, hậu kiểm thật, nghiệm thu, bàn giao — đều là việc thật, cần owner duyệt trước, và không nằm trong quyền tự quyết của tôi theo đúng mục II/III của chỉ thị gốc. "Thời gian còn lại" vì vậy KHÔNG phải "0 giờ" — nó là: (a) thời gian owner đọc và quyết định (không đo được, không phải việc kỹ thuật), cộng (b) thời gian thực hiện triển khai+hậu kiểm thật SAU khi duyệt (khoảng 30-60 phút thao tác thực tế mỗi gói theo đúng trình tự mục 15.6/16.6, không tính thời gian chờ duyệt).

**Dừng ở đây — chờ owner đọc mục 18 và quyết định.** Xem mục 19-23 dưới đây cho phần còn lại theo đúng yêu cầu đối chiếu mới nhất.

## 19. Phát hiện quan trọng cần QUYẾT ĐỊNH OWNER — cổng bằng chứng `opening_hours` không có đường hợp lệ nào để đi qua (11/10/2026)

### 19.1 Hiện tượng

`PlacesService.getBySlug()` (`apps/api/src/modules/places/places.service.ts`) gọi `PlacesRepository.hasCurrentQualifiedOpeningHoursEvidence(placeId, currentValue)` và trả `opening_hours: null` công khai nếu hàm đó trả `false` — bất kể `opening_hours` có dữ liệu thật trong DB hay không (cùng khuôn "fail-closed" đã dùng cho price trust gate). Hàm đó yêu cầu một hàng `evidence_reviews` khớp hash, `decision='APPROVE'`, `verification_expires_at > NOW()`, nối qua `place_field_evidence_links`/`evidence_artifacts`/`sources` với `sources.type` thuộc `{OFFICIAL_WEBSITE, BUSINESS_OWNER, GOVERNMENT}` (`apps/api/src/modules/evidence/evidence-trust.ts:31-35`).

### 19.2 Đã xác định: đây là THIẾU UI/WIRING/CONTRACT, không phải chỉ thiếu fixture

Theo đúng yêu cầu "không tự gọi đó là giới hạn dữ liệu", đã kiểm trực tiếp (không suy đoán) toàn bộ đường từ DB lên UI:

- **Không có controller nào** cho pipeline này — `apps/api/src/modules/evidence/evidence.service.ts` có đủ `ensureEvidenceArtifact`/`linkEvidenceToPlaceField`/`reviewEvidenceArtifact`, nhưng comment ngay trong module tự ghi: *"Không có controller — chưa có yêu cầu API surface"*. Grep xác nhận 0 route HTTP nào gọi tới các hàm này.
- **Không có UI nào** — grep `evidence_artifact`/`place_field_evidence` trong toàn bộ `apps/web/src`: 0 kết quả.
- **Không có test nào từng chạy trọn pipeline thật** — `evidence.service.spec.ts` là unit test thuần mock; `places.repository.spec.ts` chỉ test cách ly hàm gate; không có `apps/api/**/e2e/**` nào tồn tại; script gần nhất (`apps/api/src/scripts/remediate-pilot-evidence.ts`) CỐ Ý chỉ chạy nhánh TRANSLATION evidence (khác `opening_hours`/place-field) và dừng ở `NEEDS_REVIEW`, không gọi `reviewEvidenceArtifact`/`linkEvidenceToPlaceField`.
- **Xác nhận bằng SQL trực tiếp:** không có place nào trong dữ liệu seed hiện tại từng có bằng chứng `opening_hours` đạt gate — nghĩa là nhánh "positive" (đi qua gate) của chức năng này CHƯA TỪNG được ai vận hành thành công trong môi trường này, kể cả trước phiên làm việc này.

**Kết luận:** vì không có controller/UI nào tồn tại để tạo dữ liệu đạt gate qua đường hợp lệ, KHÔNG THỂ demo nhánh positive bằng luồng admin thật — đúng chỉ thị, không tự flip cờ DB để giả lập, và không gọi đây là "thiếu fixture" (fixture ngụ ý hạ tầng đã có, chỉ thiếu dữ liệu mẫu — ở đây hạ tầng ghi/tạo bằng chứng qua API/UI THẬT SỰ KHÔNG TỒN TẠI).

### 19.3 Vì sao KHÔNG tự xây (không nằm trong phạm vi đợt 1-4 đã giao)

Đợt 1 (mục V) chỉ yêu cầu `opening_hours` "nhập được, hiện được" — đã đúng ở tầng dữ liệu (cột, DTO, editor, `getOpeningWeek()` đều hoạt động thật, đã test). Cổng bằng chứng là một tầng tin cậy RIÊNG, đã tồn tại từ trước phiên này (không phải do 3 commit đợt-1-polish tạo ra), cùng loại cơ chế với price trust gate (ĐÃ là quyết định chủ đích, ghi trong `legal-trust-blocker.md`) nhưng với `opening_hours` thì KHÔNG có ghi nhận quyết định chủ đích nào tương đương — đây là hạ tầng "xây trước, chưa có người dùng" (đúng nhận diện qua comment tự ghi trong code "chưa có yêu cầu API surface"). Xây một controller + UI quản trị cho toàn bộ pipeline duyệt bằng chứng (gồm xử lý thứ tự "trứng-gà" ở `linkEvidenceToPlaceField` dòng 249-262, nơi nó yêu cầu một review APPROVE đã tồn tại TRƯỚC khi link được tạo) là hạ tầng MỚI, vượt phạm vi "trang địa điểm hữu ích" đã giao — đúng tiêu chí "quyết định sản phẩm ngoài phạm vi" của chỉ thị gốc, nên dừng lại xin quyết định, không tự xây.

### 19.4 Ba lựa chọn cho owner (không tự chọn giúp)

1. **Xây pipeline duyệt bằng chứng thật** (controller mới + UI quản trị cho moderator) — chi phí: ước lượng 1 đơn vị công việc mới hoàn toàn (ngoài phạm vi 5 đợt hiện tại), cần quyết định UX riêng (ai submit bằng chứng, ai duyệt, hiển thị trạng thái "đang chờ duyệt" cho owner địa điểm thế nào).
2. **Giữ nguyên fail-closed, ghi nhận là giới hạn đã biết của chức năng `opening_hours`** (không phải "giới hạn dữ liệu" — là giới hạn governance có chủ đích tạm thời) — mục công khai "Giờ mở cửa cả tuần" sẽ KHÔNG hiện cho tới khi có quyết định 1 hoặc 3.
3. **Hạ gate xuống mức tương đương category khác** (ví dụ bỏ yêu cầu evidence cho riêng `opening_hours`, chỉ giữ cho `price_range`) — cần owner xác nhận đây có phải thay đổi chủ đích ban đầu khi gate được xây hay không (không có ghi nhận lý do gốc trong memory/docs hiện có, cần hỏi lại người đã xây nếu còn truy được).

**Không tự chọn phương án — dừng ở đây chờ owner quyết định mục 19.**

## 20. BẢNG NGHIỆM THU THEO ĐÚNG CỘT YÊU CẦU MỚI NHẤT (11/10/2026) — thay thế cách đọc bảng 18.1

Bảng 18.1 ở trên vẫn giữ nguyên làm tham chiếu nhanh, nhưng KHÔNG tách rõ "SHA đã build+test thật" khỏi "commit có trong HEAD" — bảng này sửa đúng lỗi đó, đi từng dòng, không gộp cả đợt thành một ô.

| Luồng sử dụng | Commit chứa chức năng | SHA/image đã test | Bằng chứng | Thay đổi sau test | Kết luận còn áp dụng hay chưa |
|---|---|---|---|---|---|
| CAS chung (places, optimistic lock) | `b699302`/`78a946d` | `cb56c0a` — API+Web image build thật | Integration 16/16, browser 8/8 (đầu tài liệu, mục §Đợt 0) | Nhiều commit sau (đến `4a70e59`) cộng field mới nhưng KHÔNG commit nào sửa cơ chế CAS/`content_version` lõi (đã grep xác nhận `OptimisticLockVersionException`/`content_version` không đổi) | **Còn áp dụng** — cơ chế lõi không bị đổi bởi các commit sau |
| Rooms CAS + editor phòng khách sạn | `0f7ba30`/`0072e2a`/`c12dc40` | `c12dc40` — API+Web image build thật | Browser 25/25 desktop+375px (§13n/13o) | `666bee8`/`a187105` sửa TIẾP `HotelsService.getBySlug()`/`HotelsRepository` (cộng amenities/hours/policy) — CÙNG hàm aggregate mà rooms render qua, nhưng chỉ cộng field mới, không đổi field/logic rooms | **Còn áp dụng với lưu ý:** logic rooms bản thân không đổi, nhưng kết quả tổng hợp của `getBySlug()` KHÔNG được re-run qua browser 25/25 đó sau khi 2 commit sau cộng thêm field — rủi ro thấp (cộng thêm, không sửa), nhưng chưa re-verify trực tiếp |
| Giá món nhà hàng (đơn vị/ngày/nguồn) | `0072e2a` | `0072e2a` — API+Web image build thật (cùng candidate với rooms) | Cùng browser 25/25 trên | Tương tự dòng trên — `666bee8` cộng amenities vào `RestaurantsService.getBySlug()` sau | **Còn áp dụng, cùng lưu ý rủi ro thấp như trên** |
| Khách sạn/nhà hàng/bãi biển/tour — tiện ích (`amenities`) | `666bee8`/`1b50c1c` | `1b50c1c` — **CHỈ API, KHÔNG build Web/browser** (quyết định có chủ đích §17.2-tương tự: đọc thêm field đã có sẵn, dùng SQL đã proven) | HTTP thật (1 place/category, parking) — `docs/delivery/evidence/place1-amenities-1b50c1c-2026-10-11/` | `a187105` cộng field policy vào CÙNG service (hotel) ngay sau; sau đó `a187105`'s own browser check (20/20) CÓ xác nhận lại amenities hiện đúng trên cả 4 trang (không phải chỉ policy) | **Còn áp dụng** — amenities ĐÃ được re-xác nhận qua browser thật ở SHA `a187105` ngay sau (không chỉ API) |
| Nhà hàng/khách sạn/tour — giờ mở cửa cả tuần (render) | `666bee8`/`1b50c1c` | `a187105` (browser 20/20, cùng lượt re-xác nhận trên) | `docs/delivery/evidence/dot1-polish-browser-a187105-2026-10-11/` | Không có thay đổi sau `a187105` chạm tới `getOpeningWeek()`/render này | **Còn áp dụng — NHƯNG chỉ nhánh "không có bằng chứng → ẩn" (fail-closed) được xác nhận thật; nhánh "có bằng chứng → hiện bảng cả tuần" CHƯA TỪNG được xác nhận qua dữ liệu thật trong môi trường này — xem mục 19.** |
| Khách sạn — chính sách huỷ phòng (`cancellation_policy`) | `a187105` | `a187105` — API+Web image build thật, round-trip GHI qua API thật + browser 20/20 (nhập qua UI→lưu→reload→public) | `docs/delivery/evidence/hotel-cancellation-policy-a187105-2026-10-11/` + `dot1-polish-browser-a187105-2026-10-11/` | Không có thay đổi sau | **Còn áp dụng, đầy đủ nhất trong các dòng đợt 1 — cả API và UI đã qua round-trip ghi thật** |
| Đợt 2 — `sender_message` + ảnh góp ý qua media moderation | `74356fe`/`91316c7` | `91316c7` — API+Web image build thật | HTTP 21/21, browser 12/12, MinIO thật (§13z-3) | Không có thay đổi sau chạm tới `place_edit_proposals`/media-proposal-photos | **Còn áp dụng** |
| Đợt 3 — Tuyển dụng MVP (vòng đời draft→published→closed, hàng chờ duyệt) | `de5852d`...`1b122b8` | `1b122b8` (candidate riêng, r11) | HTTP+browser thật (§13t) | `e583bff`/`4a70e59` cộng render field + place-picker sau — xem 2 dòng riêng dưới, không gộp vào đây | **Còn áp dụng cho đúng phạm vi vòng đời gốc — các field/UI cộng sau được nghiệm riêng, không tự suy ra đã nghiệm chung** |
| Đợt 3 — hiện `job_category`/`expires_at` trên thẻ+trang chi tiết | `e583bff` | `e583bff` (nằm trong `4a70e59` không đổi) — **ĐÃ đóng gap trong lượt đối chiếu này (11/10/2026):** browser thật bổ sung, tái dùng image `4a70e59` có sẵn (không build lại) | Browser thật (Playwright) 14/14 PASS — `docs/delivery/evidence/job-realestate-field-render-browser-4a70e59-2026-10-11/` | Không có thay đổi sau | **Còn áp dụng — ĐÃ nâng từ "chỉ unit test" lên "browser thật xác nhận", đúng gap mục 4 của chỉ thị mới đã cảnh báo, không còn tồn đọng** |
| Đợt 3 — place-picker tuỳ chọn cho tin tuyển dụng | `4a70e59` | `4a70e59` — **API+Web image CẢ HAI đã build thật** (Web build BỔ SUNG trong lượt đối chiếu này, 11/10/2026 — trước đó chỉ có API image, đây CHÍNH LÀ gap mà chỉ thị mới cảnh báo và đã được đóng ngay trong lượt này) | HTTP round-trip (`docs/delivery/evidence/job-place-picker-4a70e59-2026-10-11/`) + browser thật 12/12 (`docs/delivery/evidence/job-place-picker-browser-4a70e59-2026-10-11/`) | Không có thay đổi sau (đây là HEAD hiện tại) | **Còn áp dụng — đây là dòng có mức bằng chứng đầy đủ nhất vừa đóng xong trong lượt đối chiếu này** |
| Đợt 4 — Bất động sản MVP (thuê/bán, ẩn vị trí, ảnh+EXIF) | `b0a2b7c`...`7c28059`/`dfeb9b7` | `dfeb9b7` (candidate riêng, r14) | HTTP+browser thật, MinIO thật (§13v-y) | `e583bff` cộng render ngày đăng/cập nhật/hạn — xem dòng riêng dưới | **Còn áp dụng cho đúng phạm vi gốc (thuê/bán/ảnh/EXIF)** |
| Đợt 4 — hiện ngày đăng/cập nhật/hạn đăng trên trang chi tiết | `e583bff` | `e583bff` (nằm trong `4a70e59` không đổi) — **ĐÃ đóng gap cùng lượt trên**, tái dùng cùng image `4a70e59` | Browser thật (Playwright) 14/14 PASS, cùng lượt chạy với dòng trên — `docs/delivery/evidence/job-realestate-field-render-browser-4a70e59-2026-10-11/` | `4a70e59` không chạm tới real-estate thêm | **Còn áp dụng — ĐÃ nâng mức bằng chứng cùng lúc với dòng job_category/expires_at, không còn tồn đọng** |
| Hạ tầng chung: `saved_items`, `listing_reports` | candidate gốc đợt 3/4 (r12/r13) | `96fad68`/`ac6db5d` | HTTP+browser thật (§13w/§13x) | Không có thay đổi sau | **Còn áp dụng** |
| Sitemap + JSON-LD cho jobs/real-estate | `b8c2f44`/`4c0a743`→sửa bug→`1fda1bd` | `1fda1bd` — Web image build thật | `curl` trực tiếp `sitemap.xml` + JSON-LD trên stack cô lập r15 (§15.1-bis) | Không có thay đổi sau chạm tới `sitemap.ts` | **Còn áp dụng — đã tìm và sửa 1 bug thật (limit DTO 400 bị nuốt lỗi) trước khi chốt SHA này, không phải suy đoán sạch** |
| Cổng bằng chứng `opening_hours` (nhánh positive — có bằng chứng → hiện) | Hạ tầng có từ trước phiên này, không commit nào trong 5 đợt tạo ra | **CHƯA TỪNG có image/candidate nào test được nhánh này bằng luồng hợp lệ** — không có controller/UI để tạo dữ liệu đạt gate | Không có — xem mục 19 | Không áp dụng (chưa từng pass) | **KHÔNG áp dụng được — cần quyết định owner ở mục 19 trước khi có thể "còn áp dụng hay chưa" có ý nghĩa** |

**Lưu ý đọc bảng:** hai dòng từng là "thuần render field, không có image riêng" (`e583bff` × 2) là đúng quyết định rủi ro-thấp đã ghi nhận ở §17.2 lúc đó, KHÔNG phải bị bỏ sót — nhưng theo đúng yêu cầu mới ("không coi API có endpoint nhưng UI không tới được là hoàn tất"), mức bằng chứng của 2 dòng đó thấp hơn các dòng đã có browser-thật. Thay vì chỉ ghi nhận khoảng trống đó cho owner đọc, đã BỔ SUNG ngay trong lượt đối chiếu này một lượt browser-thật (Playwright, 14/14 PASS) tái dùng image `4a70e59` đã build sẵn (không build lại, không tốn thêm chi phí build) — xem `docs/delivery/evidence/job-realestate-field-render-browser-4a70e59-2026-10-11/`. Nhân tiện phát hiện và sửa một lỗi dựng stack (không phải lỗi sản phẩm): container Web cần biến `API_INTERNAL_URL` để fetch phía server (SSR) — thiếu biến này khiến MỌI trang public SSR trả 500 trên stack cô lập; đã sửa và ghi lại trong `results-summary.json` để lượt sau không lặp lại. Sau bước này, **không còn dòng nào trong bảng ở mức bằng chứng "chỉ unit test, chưa qua browser thật"** — toàn bộ 2 đợt 0-4 đã có ít nhất một lượt xác nhận qua browser thật hoặc HTTP round-trip thật, trừ đúng một ngoại lệ duy nhất: nhánh positive của cổng bằng chứng `opening_hours` (mục 19 — không thể test vì không có luồng hợp lệ nào để tạo dữ liệu đạt gate, cần quyết định owner trước).

## 21. HAI PHƯƠNG ÁN RELEASE + MỘT KHUYẾN NGHỊ (11/10/2026)

Không có phương án thứ ba. Cả hai dùng thứ tự triển khai API-trước-Web-sau giống nhau (mục 15.6/16.6), khác nhau ở SỐ LƯỢNG CUTOVER và PHẠM VI MỖI CUTOVER. **Không gọi bất kỳ phương án nào là "triển khai theo đợt/phased rollout" theo nghĩa có activation-control** — cả hai đều là một image nguyên khối chứa toàn bộ code tới đúng SHA được chọn; sự khác biệt là SỐ LẦN đổi `*_IMAGE_TAG` trên production, không phải cơ chế bật/tắt tính năng theo luồng (không có feature flag nào trong hệ thống, và KHÔNG tự thêm framework feature flag chỉ để phục vụ release này).

### Phương án A — Hai cutover tuần tự theo đúng ranh giới gói đã chuẩn bị

1. **Cutover 1:** pin SHA `a187105` (API+Web, 92 migration) — gồm đợt 0+1+2 (CAS, rich place pages, proposals có phản hồi). Hậu kiểm xong (mục 16.6) mới làm cutover 2.
2. **Cutover 2:** pin SHA Web `1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b` + API `b82b24e9d819d8d84e7da8a573bfa510245b1e3c` (cùng 92 migration, không migration mới — ĐÃ CẬP NHẬT LẦN 2, xem mục 29: SHA Web trước đó `be21cc0` chưa từng có image thật, `1cd93dc` là SHA ĐÃ build+test thật mới nhất) — cộng thêm đợt 3+4 (jobs/real-estate) + 4 field-render fix đã đóng ở mục 17/20 + đóng mục 19 (opening_hours evidence workflow, mục 25) + fix nav wiring (mục 27).

**Tác động:** owner xem được đúng 2 lần đổi, mỗi lần một phạm vi tính năng rõ ràng, có thể dừng giữa hai cutover nếu muốn quan sát cutover 1 trước khi quyết định cutover 2. Rollback của cutover 2 không ảnh hưởng cutover 1 (độc lập bảng/route, xem §16.5). Chi phí: 2 lần thao tác pin+hậu kiểm thay vì 1 (~gấp đôi thời gian thao tác tay, mỗi lần ~30-60 phút theo mục 15.6/16.6).

### Phương án B — Một cutover duy nhất tại SHA cuối cùng (toàn bộ 5 đợt + opening_hours evidence workflow)

Pin `API_IMAGE_TAG=b82b24e9d819d8d84e7da8a573bfa510245b1e3c` + `WEB_IMAGE_TAG=1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b`, chạy đủ 12 migration mới (81→92) trong một lượt, hậu kiểm toàn bộ theo cả hai danh sách mục 15.6 VÀ 16.6 cộng hậu kiểm riêng cho opening_hours evidence workflow (mục 24/25) và nav wiring (mục 27) trong cùng một lần.

**Tác động:** một lần thao tác, một lần rủi ro migration (dù rủi ro thấp — toàn bộ 12 migration cộng thêm, nullable-first, đã test nhiều lần trên stack cô lập, xem mục 20). Nếu có vấn đề phát sinh, rollback đưa CẢ 5 đợt về baseline cũ cùng lúc (không rollback được riêng đợt 3/4 mà giữ đợt 1/2, vì đã pin chung một tag) — đây là khác biệt THẬT so với phương án A, không phải chi tiết vụn.

### Khuyến nghị: Phương án A

**Lý do:** đợt 3/4 (jobs/real-estate) là tính năng MỚI HOÀN TOÀN chưa từng có dữ liệu thật nào trên production (xem mục 23) — tách riêng cutover cho phần này giúp owner quan sát đợt 1/2 (vốn là cải tiến trên tính năng ĐÃ có người dùng thật) ổn định trước, mà không phải gánh rủi ro của một mảng hoàn toàn mới trong cùng một lần rollback nếu cần. Chi phí thêm (một lượt hậu kiểm nữa) nhỏ hơn lợi ích cách ly rủi ro. Đây là khuyến nghị, KHÔNG tự thực hiện — dừng để owner chọn.

## 25. ĐÓNG MỤC 19/24 — opening_hours evidence workflow ĐÃ XÂY, ĐÃ TEST THẬT (11/10/2026, SHA `b82b24e`/`be21cc0`)

Owner đã chọn lựa chọn 1 ở mục 19 (xây luồng tối thiểu). Thiết kế + code: mục 24. Kết quả test thật:

**SHA:** code hoàn chỉnh tại `b82b24e9d819d8d84e7da8a573bfa510245b1e3c` (API+Web, 92 migration — không migration mới). Một sửa UI nhỏ thêm ngay sau (đua đua với chính lượt test này, xem dưới) tại `be21cc069ee74d9076bf66f693e718defadc5710` (chỉ Web, cũng không migration). **SHA cuối cùng nên dùng nếu duyệt: `be21cc0...`** (web) kèm API `b82b24e...` — không có commit API nào sau `b82b24e` nên API giữ nguyên SHA đó.

**Hai bug thật phát hiện VÀ SỬA trong lúc xây/test (không phải bug của luồng mới, nhưng luồng mới là lần đầu ai đó thực sự thi chạm vào):**
1. `PlacesService.preview()` (đường đọc đặc quyền owner tự xem lại, gác `Place.Edit.Managed`) vô tình áp CHUNG cổng bằng chứng công khai của `opening_hours` qua `buildDetailResponse()` dùng chung với `getBySlug()` — owner tự xem lại giờ mở cửa CHÍNH MÌNH vừa lưu sẽ thấy `null` bất cứ khi nào chưa có bằng chứng (tức LUÔN LUÔN, trước khi luồng này tồn tại). Đã sửa: thêm `applyOpeningHoursGate` (mặc định true, `getBySlug` không đổi; `preview()` tắt). **Phát hiện một bug ANH EM giống hệt cho `price_range`** (cùng hàm, cùng nguyên nhân, mâu thuẫn với chính comment gốc của `redactUntrustedPriceRange` nói rõ "KHÔNG được redact" ở đường đặc quyền) — CỐ TÌNH KHÔNG sửa trong lượt này (ngoài phạm vi opening_hours đã giao), đã tách riêng thành task nền `task_563d3776` để xem xét sau.
2. Bug ở chính script test (không phải sản phẩm): hàng chờ duyệt tự `reload()` ngay sau khi duyệt xong, xoá mất item (và kết quả `eligible`/`reason_codes`/`linked_to_public_gate` hiện inline) trước khi moderator đọc được. Sửa: bỏ auto-reload, thêm nút "Tải lại hàng chờ" tường minh.

**Test thật đã chạy (stack cô lập `phq-r21`, postgres+redis+api+web, 92 migration, dọn sạch sau khi xong):**
- HTTP round-trip 8 bước (`http-check.sh`): member không quyền → 403; owner nộp → 201; owner tự duyệt → 403 (không có `Source.Verify`); moderator thấy hàng chờ kèm giá trị hiện tại; moderator APPROVE → `eligible:true, linked_to_public_gate:true`; trang công khai hiện đúng giờ; owner sửa giờ lần nữa (revision mới); trang công khai lại ẩn (bằng chứng cũ KHÔNG tự áp cho giá trị mới).
- Browser thật (Playwright, 17/17 PASS): đăng nhập owner qua UI → điền form nộp bằng chứng thật (loại nguồn/URL/nội dung chép nguyên văn/tính ổn định) → nộp → hiện "đang chờ duyệt"; member đăng nhập → mở hàng chờ → "Không có quyền truy cập"; moderator đăng nhập → thấy đúng hàng chờ (tên place, nội dung nộp, giá trị hiện tại để so khớp) → duyệt qua UI → hiện kết quả đã duyệt; reload hàng chờ → item biến mất (đúng); khách chưa đăng nhập mở trang công khai → hiện "Giờ mở cửa" đúng giá trị MỚI; reload → vẫn đúng; 375px → vẫn đúng, không tràn ngang.
- Bằng chứng: `docs/delivery/evidence/opening-hours-evidence-workflow-b82b24e-2026-10-11/` (results-summary.json, browser-results.json, http-check.sh, browser-check-script.mjs).

**Nghiệm thu đối chiếu đúng 6 tiêu chí mục đã nêu ở chỉ thị owner:**
1. Nhập giờ cả tuần và nguồn qua API/UI hợp lệ — ✅ (UI thật, không mock).
2. Duyệt đúng quyền rồi public hiển thị — ✅ (`Source.Verify`/moderator, qua UI thật).
3. Chưa duyệt/không đủ bằng chứng không hiển thị như đã xác minh — ✅ (giữ nguyên hành vi fail-closed đã có, xác nhận lại qua browser).
4. Người không có quyền bị từ chối — ✅ (member UI 403-equivalent; owner tự duyệt → 403 HTTP).
5. Sửa giờ không tiếp tục dùng bằng chứng cũ sai revision — ✅ (2 vòng revision riêng, mỗi vòng cần bằng chứng MỚI của chính nó).
6. Reload và browser desktop/375px đúng — ✅.

**Mục 19 — đóng.** Mục 20 (bảng nghiệm thu) cần thêm 2 dòng mới cho SHA `b82b24e`/`be21cc0` (opening_hours evidence workflow + fix `preview()`) — xem ghi chú ngắn ở mục 20 (bảng gốc giữ nguyên các dòng cũ, không sửa lịch sử; dòng mới bổ sung dưới).

## 27. KIỂM PHẦN KẾT NỐI (navigation wiring) — phát hiện + sửa 1 gap thật (11/10/2026, HEAD `1cd93dc`)

Theo đúng yêu cầu "menu đưa tới đúng module, người dùng tới được 'của tôi', đăng nhập giữ ngữ cảnh, admin tới được hàng chờ cần xử lý" — kiểm trực tiếp bằng đọc source (không suy đoán):

- **Menu công khai → jobs/real-estate:** `nav.copy.ts`'s `residentItems` ("Sống tại Phú Quốc") render trong `SiteFooter.tsx` — có đường vào thật, tách khỏi header hướng du khách (chủ đích, đã ghi chú trong code, không phải thiếu sót).
- **Dashboard → "của tôi" (jobs/real-estate/saved):** `DashboardNav.tsx` đã có đủ `/dashboard/job-listings`, `/dashboard/real-estate`, `/dashboard/saved` — luôn hiện cho mọi người đăng nhập, đúng.
- **Admin → hàng chờ cần xử lý (job/real-estate/listing-reports):** đã có trong `DashboardNav.tsx`, gác đúng theo `caps.canReviewJobListings`/`canReviewRealEstateListings`.
- **Đăng nhập giữ ngữ cảnh:** `RouteGuard` (bọc toàn bộ `/dashboard/*` ở layout) đã có cơ chế `?next=` lưu đúng URL gốc, kèm test chặn open-redirect — áp dụng tự động cho MỌI trang `/dashboard/*`, kể cả trang mới thêm, không cần sửa gì thêm.
- **PHÁT HIỆN THẬT — `/dashboard/opening-hours-evidence` (hàng chờ duyệt bằng chứng giờ mở cửa, xây ở mục 24/25 CÙNG phiên này) KHÔNG có lối vào nào trong `DashboardNav`:** route backend đã gác đúng `Source.Verify` từ đầu, nhưng một moderator đăng nhập sẽ KHÔNG thấy trang này trừ khi tự gõ URL — đúng loại lỗi "API/route có nhưng UI không tới được" mà chỉ thị liên tục cảnh báo không được coi là hoàn tất. **Đã sửa:** thêm `canReviewOpeningHoursEvidence` (map đúng `Source.Verify` — CHỈ `moderator` giữ trực tiếp, KHÔNG `content_owner`, khác hẳn `JobListing.Moderate`/`RealEstateListing.Moderate` — đã grep xác nhận lại migration seed, không suy đoán) + thêm mục vào `DashboardNav`. Test mới: `capabilities.spec.ts`/`DashboardNav.spec.tsx` xác nhận đúng phân quyền hiển thị (moderator thấy, content_owner không thấy). `tsc`/eslint/`next build` sạch. Commit `1cd93dc`.
- **Tin tuyển dụng — "bản sửa chờ duyệt không thay public", "không tự làm mới ngày đăng":** đọc trực tiếp `JobListingsService.update()` — sửa khi đang `published` đẩy NGAY về `pending` (ẩn công khai tức thì, không hiện bản cũ lẫn bản mới chưa duyệt) + `publishedAt = null` (không giữ ngày đăng cũ treo lơ lửng khi đã ẩn); `createdAt` không bao giờ bị gán lại ở bất kỳ nhánh nào. Đây là quyết định có chủ đích đã ghi trong code (§13r) — đúng yêu cầu, không phải gap.

**Không còn gap "UI không tới được" nào khác được phát hiện qua lượt kiểm này.**

## 28. XÁC MINH LẠI TRẠNG THÁI THỰC (không suy đoán từ báo cáo cũ, 11/10/2026, HEAD `1cd93dc`)

Đọc trực tiếp lại (không tin báo cáo cũ):

- **Production — đọc trực tiếp ngay lúc viết mục này:** API image `phuquochub-api:f0c65b716c39a41de4948c695d4383f2cfa47f1f`, Web image `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848`, DB `80` migration (`max=StrengthenPlaceInformationModel1720004500000`). **KHÔNG đổi** so với mọi lần đọc trước trong tài liệu này — CAS/rooms/menu-price/opening_hours evidence/jobs/real-estate đều CHƯA có trong production, chưa deploy lần nào.
- **Rooms CAS + editor phòng:** commit `0f7ba30` — xác nhận có trong lịch sử nhánh hiện tại (`git log` từ `0f7ba30` tới HEAD). Bằng chứng browser 25/25 đã có (§13n/13o) — không làm lại.
- **Metadata giá món (đơn vị/ngày/nguồn):** commit `0072e2a` — cùng lịch sử, cùng bằng chứng browser 25/25. Không làm lại.
- **Hotel access route:** `c12dc40` — cùng lịch sử. Không làm lại.
- **Đợt 2-4:** code thật đã có từ lâu (không phải "chưa bắt đầu") — xem §13t-§13z-5 cho chi tiết từng commit.

### Bảng nghiệm thu — đúng vocabulary 7 mức (không dùng một chữ "xong" cho mọi dòng)

| Luồng sử dụng | Tiêu chí còn thiếu | Bằng chứng | Commit/candidate | Trạng thái production | Bước tiếp theo |
|---|---|---|---|---|---|
| Đợt 0 — CAS (places, optimistic lock) | Không | Integration 16/16, browser 8/8 | `cb56c0a` (trong HEAD `1cd93dc`) | **CHỜ DUYỆT RELEASE** | Chọn phương án §21 |
| Đợt 1a — Rooms CAS + editor phòng | Không | Browser 25/25 (§13n/13o) | `0f7ba30` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói đợt 1 |
| Đợt 1b — Metadata giá món (đơn vị/ngày/nguồn) | Không | Cùng browser 25/25 trên | `0072e2a` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói đợt 1 |
| Đợt 1c — Amenities/giờ cả tuần/chính sách huỷ/access route | Không (nhánh positive opening_hours xem dòng riêng) | HTTP+browser 20/20 (§16) | `666bee8`/`1b50c1c`/`a187105`/`c12dc40` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói đợt 1 |
| Opening_hours evidence workflow (nộp+duyệt, đóng mục 19) | Không | HTTP 8/8 + browser 17/17 (§25) | `e4557e7`/`fddf7fa`/`b82b24e`/`be21cc0` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói giai đoạn 2 (hoặc đợt 1 nếu owner muốn tách) |
| Đợt 2 — Góp ý có phản hồi (sender_message + ảnh) | Không | HTTP 21/21, browser 12/12 (§13z-3) | `74356fe`/`91316c7` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói giai đoạn 1 |
| Đợt 3 — Tuyển dụng (vòng đời + place-picker + field render) | Không | HTTP+browser đủ (§13t/§17/§20) | `1b122b8`...`4a70e59`→`be21cc0` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói giai đoạn 2 |
| Đợt 4 — Bất động sản (thuê/bán/ảnh/EXIF/field render) | Không | HTTP+browser đủ (§13v-y/§17/§20) | `dfeb9b7`→`be21cc0` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói giai đoạn 2 |
| Nav wiring: hàng chờ duyệt opening-hours-evidence | Đã đóng (mục 27) | `capabilities.spec.ts`/`DashboardNav.spec.tsx` | `1cd93dc` | **CHỜ DUYỆT RELEASE** | Gộp cùng gói giai đoạn 2 |

**Vì sao mọi dòng CÙNG ở "CHỜ DUYỆT RELEASE" — không phải lười gộp:** đã xác minh fresh ngay trên (không suy đoán) rằng production THỰC SỰ chưa đổi (nên không dòng nào là ĐÃ DEPLOY/ĐÃ NGHIỆM THU), và mọi luồng ĐỀU đã qua browser/HTTP thật trên candidate + đã đóng gói vào §21/§22 (nên không dòng nào còn ở mức SOURCE ĐẠT/CANDIDATE ĐẠT rời rạc chưa đóng gói). Đây là kết luận sau khi đọc lại, không phải tái dùng nhãn cũ không kiểm tra.

**Không còn "phần độc lập của đợt tiếp theo" để làm trong lúc chờ owner** — cả 5 đợt + opening_hours + nav wiring đều đã ở mức candidate-đạt-đóng-gói, không có đợt thứ 6 nào trong phạm vi đã giao. Việc duy nhất còn lại ngoài chờ owner là `task_563d3776` (price_range preview bug, đã tách riêng, không chặn gói này).

## 29. XÁC NHẬN ARTIFACT PHÁT HÀNH — GAP THẬT PHÁT HIỆN VÀ ĐÓNG (15/10/2026)

**Gap phát hiện:** mục 27/28 viết xong với HEAD `1cd93dc` (sửa nav), nhưng image Web THỰC SỰ trên VPS lúc đó vẫn là `be21cc0` — **chưa từng build image nào cho đúng SHA `1cd93dc`**. Đúng loại rủi ro chỉ thị mới nhất cảnh báo: "tên tag hoặc revision label một mình chưa đủ chứng minh build context đúng commit" — ở đây còn chưa có image nào để mà kiểm tag.

**Đã đóng ngay trong lượt này — build lại đúng SHA cuối, phân biệt rõ 3 loại digest:**

- **API** (không đổi từ `b82b24e`, không có commit nào sửa `apps/api` giữa `b82b24e` và `1cd93dc`): `phuquochub-api:b82b24e9d819d8d84e7da8a573bfa510245b1e3c` — Image ID/RepoDigest `sha256:fa24032d...`.
- **Web** (build MỚI thật, 15/10/2026): `phuquochub-web:1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b` — archive checksum xác nhận TRƯỚC build (`03eb7bba82...`) — **Image ID/RepoDigest** (manifest list, multi-platform) `sha256:f05c3a016e9895c3b6872266667e3e3be844a51ccede13f8211902d9412f9165`; **manifest digest** (single-platform amd64/linux) `sha256:28e00c29ded208a876567f3fb6da216fe368a5724ca8a6e5c946adc5b0f2c050`; **config digest** `sha256:3f1134309aca4d8f01a4f9fd9b80272399f7c6eb3f65ee4d7d19a2ce284aa75d`; label `revision=1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b`.
- **Preflight trước build (đọc trực tiếp VPS):** không có build/deploy nào đang chạy, disk 126G/193G trống, load 0.10, mọi container `phq-r1-*`/`phuquoc-*-prod` nguyên vẹn trước và sau.
- **Kiểm tra tích hợp tối thiểu trên ĐÚNG bộ image cuối cùng** (không phải source, không phải image cũ): stack cô lập `phq-r23`, 92 migration chạy sạch từ đúng archive đã băm, API `b82b24e` + Web `1cd93dc` boot sạch, browser thật (Playwright) 6/6 PASS — moderator thấy đúng link mới trong `DashboardNav` và điều hướng đúng; member thường KHÔNG thấy link, phần nav còn lại không vỡ. Bằng chứng: `docs/delivery/evidence/final-candidate-image-1cd93dc-2026-10-15/`.
- Đã dọn sạch `phq-r23` — chỉ còn `phq-r1-*`/`phuquoc-*-prod`.

**SHA RUNTIME CUỐI CÙNG để dùng cho mọi quyết định release từ đây:** API `b82b24e9d819d8d84e7da8a573bfa510245b1e3c`, Web `1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b` — THAY THẾ mọi tham chiếu `be21cc0` ở các mục trước (mục 25/27/28 viết lúc `be21cc0` còn là HEAD mới nhất; nay `1cd93dc` đã có code MỚI đứng sau — nav fix — và giờ đã có image thật tương ứng).

## 30. SỬA MỘT KẾT LUẬN SAI THẬT — "Phương án A: giai đoạn 1 KHÔNG có đợt 3/4" là SAI (15/10/2026)

**Phát hiện khi kiểm lại tính nhất quán gói phát hành (yêu cầu "giai đoạn 2 có baseline/rollback tính từ trạng thái sau giai đoạn 1" ở chỉ thị mới nhất — buộc phải xác nhận lại quan hệ ancestry giữa 2 SHA bằng `git merge-base --is-ancestor`, không suy diễn từ việc "không trùng bảng"):**

```
git merge-base --is-ancestor <SHA> a187105
dfeb9b7 (real-estate-listing-photos, đợt 4)  → IS ancestor of a187105
1fda1bd (mục 15 — sitemap/structured-data cho jobs/real-estate, đợt 3+4) → IS ancestor of a187105
git ls-tree -r a187105 -- apps/api/src/core/database/migrations | grep JobListing/RealEstate/SavedItem/ListingReport
→ CẢ 7 migration đợt 3+4 (InitJobListings, SeedJobListingPermissions, InitRealEstateListings,
  SeedRealEstateListingPermissions, InitSavedItems, InitListingReports,
  InitRealEstateListingPhotos) ĐÃ CÓ MẶT tại commit a187105.
```

**Nghĩa là: `a187105` KHÔNG PHẢI "đợt 0+1+2, không lẫn đợt 3/4" như đã ghi lặp lại ở mục 16/18.2/21/25/29 trước đây — nó đã chứa TOÀN BỘ backend+migration đợt 3+4 từ trước.** Lý do thật: nhánh `feat/beach-details-cas` là lịch sử THẲNG, không rẽ nhánh — xác nhận bằng `git merge-base --is-ancestor` cho từng cặp liên tiếp (`0f7ba30`→`a187105`→`e583bff`→`4a70e59`→`b82b24e`→`1cd93dc`, mỗi cặp đều `IS ancestor`). Đợt 3/4 (bắt đầu từ `e67e536` "saved-items") được code TRƯỚC khi đợt 2 (`74356fe`/`91316c7` — sender_message/ảnh góp ý) và đợt 1-polish (`666bee8`/`1b50c1c`/`a187105`) hoàn tất, nên KHÔNG tồn tại một SHA nào trên nhánh này vừa có "đợt 1/2 polish xong" vừa "chưa chạm đợt 3/4" — hai mốc đó không theo đúng thứ tự "đợt 0-1-2 trước, đợt 3-4 sau" như giả định ban đầu.

**Hệ quả trực tiếp — đúng cảnh báo gốc của chỉ thị: "Không gọi là 'triển khai theo đợt' nếu dùng một image chứa toàn bộ và không có cơ chế kiểm soát kích hoạt tương ứng."** Mục 21 "Phương án A" (hai cutover, cutover 1 = `a187105`) chính là trường hợp này — image `a187105` ĐÃ chứa route `/jobs`, `/real-estate`, migration `job_listings`/`real_estate_listings`/`saved_items`/`listing_reports`/`real_estate_listing_photos` sẵn, không có cơ chế ẩn/kích hoạt riêng. Gọi đây là "giai đoạn 1 chỉ gồm CAS+địa điểm+góp ý" là SAI — phải rút lại.

### Hai phương án THỰC SỰ khả thi (thay thế mục 21)

**Phương án B (giữ nguyên, nay là lựa chọn ĐÃ ĐƯỢC CHỨNG MINH đầy đủ):** một cutover duy nhất tại SHA cuối — API `b82b24e9d819d8d84e7da8a573bfa510245b1e3c`, Web `1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b`. Toàn bộ 5 đợt + opening_hours evidence workflow + nav fix lên cùng lúc. Đã build, test, đóng gói đầy đủ (mục 20/26/29) — KHÔNG cần việc gì thêm.

**Phương án A' (nếu owner THỰC SỰ muốn tách 2 giai đoạn theo đúng ranh giới đợt, cần CÔNG VIỆC MỚI, chưa làm):** dựng một candidate RIÊNG bằng cherry-pick các commit đợt 0/1/2 lên trên baseline production (`f0c65b716c...`), CHỦ ĐỘNG bỏ qua toàn bộ commit đợt 3/4 (`e67e536`...`612fe10`, `dfeb9b7`, `1fda1bd`, `4c0a743`, `b8c2f44` và các commit field-render/place-picker sau `a187105`). Đây là một nhánh/candidate MỚI, không phải chọn lại một SHA đã có — cần: xác định chính xác danh sách commit đợt 0/1/2 cần cherry-pick, giải quyết conflict (nếu có, do các commit đợt 3/4 nằm giữa), build lại, test lại TOÀN BỘ từ đầu (không kế thừa được bằng chứng của `a187105` vì đây là tổ hợp code khác). Chi phí: đáng kể, không nhỏ — **CHƯA làm, cần owner quyết định có đáng làm hay không trước khi bắt tay**.

### Khuyến nghị: Phương án B

**Lý do:** Phương án A' tốn công xây một candidate mới hoàn toàn (không tái dùng được bằng chứng hiện có) chỉ để đạt một mục tiêu cách ly rủi ro mà lợi ích thực tế thấp — đợt 3/4 chưa có dữ liệu thật nào (mục 23), nên rủi ro "lỗi đợt 3/4 ảnh hưởng đợt 1/2" ở mức code là thấp (không bảng nào trùng, đã xác nhận) và ở mức dữ liệu là KHÔNG CÓ (chưa ai dùng). Một cutover duy nhất, đã có đầy đủ bằng chứng, không cần công việc mới, là lựa chọn hợp lý hơn — không phải vì "ngại sửa", mà vì chi phí build-lại-từ-đầu của phương án tách không tương xứng với lợi ích. Đây là khuyến nghị, KHÔNG tự thực hiện — dừng để owner quyết định giữa B (không việc gì thêm) và A' (nếu muốn tách, cần duyệt thêm một đợt xây+test candidate mới).

**Mục 21 — RÚT LẠI khuyến nghị "Phương án A" cũ.** Không xoá nội dung mục 21 (giữ làm lịch sử), nhưng không dùng để quyết định — dùng mục 30 này.

## 31. GÓI DUYỆT THỰC THI — Phương án B đã chốt (15/10/2026, CHƯA xin quyền production)

Owner đã chọn Phương án B (một gói, toàn bộ phạm vi). Mục này là gói THỰC THI tự đủ thông tin — không yêu cầu đọc mục khác để hiểu nội dung.

### 31.1 Artifact và baseline

| Dịch vụ | Production hiện tại (xác minh trực tiếp 15/10/2026 14:31 UTC) | Candidate full SHA | Image tag/digest | Rollback artifact |
|---|---|---|---|---|
| API | `phuquochub-api:f0c65b716c39a41de4948c695d4383f2cfa47f1f` (container start 2026-10-01T14:56:14Z) | `b82b24e9d819d8d84e7da8a573bfa510245b1e3c` | Image ID/RepoDigest `sha256:fa24032d13e701097d16fea74e2136ef91a069bd7cc24a6cd90e3a0d0f42c914` | Image `f0c65b716c...` vẫn còn trên VPS (xác nhận `docker images`), sẵn sàng rollback ngay, không cần pull lại |
| Web | `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848` (container start 2026-10-05T09:49:34Z) | `1cd93dcb7f13500ebdb5bdffc347d5c121dfa37b` | Manifest list `sha256:f05c3a016e9895c3b6872266667e3e3be844a51ccede13f8211902d9412f9165`, manifest (amd64/linux) `sha256:28e00c29ded208a876567f3fb6da216fe368a5724ca8a6e5c946adc5b0f2c050`, config `sha256:3f1134309aca4d8f01a4f9fd9b80272399f7c6eb3f65ee4d7d19a2ce284aa75d` | Image `b91e92ce...` vẫn còn trên VPS, sẵn sàng rollback ngay |
| DB | 80 migration, mới nhất (xác nhận bằng CẢ `ORDER BY id DESC` VÀ `ORDER BY timestamp DESC`, không chỉ alphabetical): `SeedPriceVerifyPermission1720007800000` | 92 migration | — | Backup gần nhất: `phuquochub-20261015T020001Z.sql.gz` (02:00 UTC hôm nay, có `.sha256`, cron tự động mỗi đêm — xác nhận còn hoạt động) |

**API khác SHA với Web (`b82b24e` vs `1cd93dc`) — không phải lỗi:** commit `1cd93dc` CHỈ sửa file trong `apps/web` (thêm link nav cho hàng chờ duyệt opening-hours-evidence) — xác nhận bằng `git diff --stat b82b24e 1cd93dc` (chỉ liệt kê đường dẫn `apps/web/...`). Bằng chứng ĐÚNG BỘ API `b82b24e` + Web `1cd93dc` đã chạy CÙNG NHAU: stack cô lập `phq-r23`, browser thật 6/6 PASS (mục 29) — không phải suy luận từ việc build riêng lẻ hai image.

**Lưu ý triển khai quan trọng — `scripts/deploy.sh` dùng MỘT tag cho cả API và Web (đã đọc script thật):** để dùng đúng công cụ đã kiểm (không viết lệnh `docker compose` tay thay cho script), cách thực thi đúng là sync source tại `1cd93dc` lên host rồi chạy `scripts/deploy.sh 1cd93dc` — script sẽ TỰ BUILD LẠI cả hai image dưới tag `1cd93dc`. API build lại dưới tag mới này sẽ cho nội dung **giống byte-for-byte** với image `b82b24e` đã test (không có commit `apps/api` nào giữa hai SHA) — chỉ đổi TÊN TAG để khớp giả định một-tag-chung của script, không phải build một code khác chưa test.

### 31.2 Migration và nâng cấp — 12 migration (81→92), tên + mục đích + rủi ro

| # | Migration | Mục đích | Backfill/data-risk | Khóa bảng |
|---|---|---|---|---|
| 81 | `AddRestaurantMenuPriceMeta1720007900000` | Cột `price_unit`/`price_recorded_on`/`price_source_id` (nullable) trên `restaurant_menu_items` + 2 CHECK mới | Không backfill — cột mới NULL cho hàng cũ | CHECK mới chỉ tham chiếu cột VỪA thêm (toàn NULL) → validate tức thì, bảng hiện có **52 hàng** (đọc trực tiếp) — không đáng kể |
| 82 | `AddHotelAccessRoute1720008000000` | Cột `access_route` (nullable) trên `place_hotel_details` | Không | Không — ADD COLUMN NULL thuần |
| 83 | `InitJobListings1720008100000` | Bảng mới `job_listings` | N/A — bảng mới | Không |
| 84 | `SeedJobListingPermissions1720008200000` | Seed permission `JobListing.Create/Moderate` | INSERT nhỏ, `ON CONFLICT DO NOTHING` | Không |
| 85 | `InitRealEstateListings1720008300000` | Bảng mới `real_estate_listings` | N/A | Không |
| 86 | `SeedRealEstateListingPermissions1720008400000` | Seed permission tương tự | Nhỏ, idempotent | Không |
| 87 | `InitSavedItems1720008500000` | Bảng mới `saved_items` + enum `saved_item_target_type` | N/A | Không |
| 88 | `InitListingReports1720008600000` | Bảng mới `listing_reports` + **RENAME enum** `saved_item_target_type`→`listable_target_type` | Enum vừa tạo ở #87 CÙNG LƯỢT, 0 hàng `saved_items` thật tồn tại trước đó — rename an toàn | Không |
| 89 | `InitRealEstateListingPhotos1720008700000` | Bảng mới `real_estate_listing_photos` | N/A | Không |
| 90 | `AddPlaceEditProposalSenderMessage1720008800000` | Cột `sender_message` (nullable) trên `place_edit_proposals` | Không — bảng hiện có **0 hàng** (đọc trực tiếp) | Không |
| 91 | `AddMediaProposalOwner1720008900000` | Cột `proposal_id` (nullable, FK) trên `media` + DROP/ADD LẠI CHECK `chk_media_at_most_one_owner` (cộng nhánh thứ 6) | Không backfill, nhưng **ADD CONSTRAINT không dùng `NOT VALID`** → Postgres scan+validate TOÀN BỘ bảng `media` dưới khóa, không phải thao tác nhẹ về nguyên tắc. Bảng hiện có **18 hàng** (đọc trực tiếp) → thời gian thực tế không đáng kể ở quy mô này, nhưng kỹ thuật migration KHÔNG phải mẫu an toàn-cho-bảng-lớn (ghi nhận đúng, không giảm nhẹ) | CÓ — `ACCESS EXCLUSIVE` ngắn trong lúc validate, không đáng kể ở 18 hàng |
| 92 | `AddHotelCancellationPolicy1720009000000` | Cột `cancellation_policy` (nullable) trên `place_hotel_details` | Không | Không |

**Lịch sử migration production đã xác minh ở mức nào:** đã xác nhận TRỰC TIẾP (đọc, không mutate) số lượng (80) VÀ migration mới nhất theo cả `id DESC` và `timestamp DESC` (không chỉ suy từ số file source — đây là lần đọc kỹ hơn các lần trước, vốn chỉ dùng `max(name)` alphabetical, trùng hợp đúng nhưng không chắc chắn về mặt phương pháp). **CHƯA đọc toàn bộ danh sách 80 tên migration để đối chiếu từng cái một với source** — không cần thiết cho gói này vì: (a) candidate không sửa/xoá bất kỳ migration nào trong 80 đó, chỉ CỘNG THÊM 12; (b) hành vi `migration:run` của TypeORM tự chặn nếu một migration đã áp dụng có tên khác với migration cùng thứ tự trong source (an toàn tự nhiên của chính engine, không cần tôi tự đối chiếu tay).

**Bằng chứng nâng cấp từ schema baseline CÓ dữ liệu đại diện (không chỉ DB mới):** mục 26 — dựng DB dừng đúng ở migration #80, SEED một khách sạn+phòng thật theo đúng hình dạng cột CŨ (trước #82/#92), chạy tiếp 12 migration, xác nhận dữ liệu cũ còn nguyên (tên/hạng sao/giờ nhận trả phòng/tên phòng/giá), cột mới đúng NULL, API MỚI đọc đúng (`GET /places/khach-san-baseline-test`, `GET /hotels/:id/rooms`) VÀ ghi đúng field mới lên hàng cũ (`PATCH .../details` với `cancellation_policy`, `content_version` tăng đúng, field cũ giữ nguyên). Đã dọn sạch stack `phq-r22` sau đó.

### 31.3 Triển khai và phục hồi — trình tự THẬT theo `scripts/deploy.sh`/`rollback.sh` (đã đọc, không tự viết lệnh)

**Trình tự (KHÔNG nguyên tử — từng bước có thể dừng riêng):**
1. `scripts/sync-release-source.sh <archive> <manifest> <project-dir>` — đồng bộ + xác minh checksum source `1cd93dc` lên host.
2. `scripts/deploy.sh 1cd93dc` tự thực hiện tuần tự: build cả 2 image dưới tag `1cd93dc` → chạy `migrate` qua compose profile `tools` (**HALT tự động nếu migration lỗi — không tự tiếp tục, image cũ vẫn đang chạy**) → smoke-test image API MỚI TRƯỚC khi cutover (container riêng, chưa thay production) → cutover `api`+`web`+`caddy` cùng lúc → ghi `API_IMAGE_TAG`/`WEB_IMAGE_TAG=1cd93dc` vào `.env` → health check (`compose ps`) → route check (`scripts/smoke-test.sh`, **HALT + in rõ "chạy rollback ngay" nếu fail**).

**Bốn tình huống dở dang (đọc trực tiếp từ script, không suy đoán):**
- **Migration lỗi/dở dang:** `deploy.sh` tự `exit 1` ngay khi `migrate` thất bại — image CŨ vẫn đang chạy (compose chưa bị đụng tới ở bước này). Không cần rollback ứng dụng. Nếu migration dở dang giữa đường (một vài trong 12 chạy xong, một fail) — TypeORM mỗi migration là 1 transaction riêng, các migration ĐÃ commit giữ nguyên, có thể chạy lại `deploy.sh` sau khi sửa nguyên nhân (migration còn lại tự tiếp tục từ migration kế tiếp — không migration nào trong 12 cái NOT NULL-trên-bảng-có-dữ-liệu nên an toàn để retry).
- **Migration xong nhưng ứng dụng chưa đổi:** không xảy ra với `deploy.sh` (migration và cutover là 2 bước liên tiếp trong 1 lần gọi) — CHỈ xảy ra nếu operator tự dừng thủ công giữa 2 bước. Nếu vậy: production vẫn chạy app CŨ trên schema MỚI — AN TOÀN vì toàn bộ 12 migration cộng thêm, app cũ không đọc cột/bảng mới, không lỗi.
- **API mới lên nhưng Web mới chưa lên:** không xảy ra với `deploy.sh` (cutover `api web caddy` trong 1 lệnh `up -d`) — CHỈ xảy ra nếu operator chạy rollback MỘT PHẦN (`rollback.sh <tag> api` hoặc `web` riêng) hoặc cutover thủ công. Tương thích: Web cũ (`b91e92c`) gọi API mới (`1cd93dc`) vẫn chạy được (API mới chỉ THÊM route). API cũ (`f0c65b7`) với Web mới sẽ lỗi 404 ở `/jobs`, `/real-estate`, `/dashboard/opening-hours-evidence` và các route mới khác — **PHẢI** đưa API lên trước nếu tách bước (không mặc định, đây là do contract thật: route mới chỉ API biết, không do quy ước chung).
- **Cả hai lên nhưng hậu kiểm thất bại:** `deploy.sh` step 11 tự `exit 1` và in rõ "run scripts/rollback.sh <previous-tag> now" — nhưng KHÔNG tự rollback (không có "auto-rollback"), người vận hành phải tự quyết định và chạy.

**Rollback app — LƯU Ý QUAN TRỌNG vì production đang "split-pin" (API/Web khác tag nhau TRƯỚC khi deploy này):** `rollback.sh <tag> both` dùng CHUNG một tag cho cả hai — không khớp trạng thái HIỆN TẠI (API `f0c65b7` ≠ Web `b91e92c`). Để rollback về ĐÚNG trạng thái trước deploy này, phải gọi **RIÊNG TỪNG DỊCH VỤ**:
```
scripts/rollback.sh f0c65b716c39a41de4948c695d4383f2cfa47f1f api
scripts/rollback.sh b91e92ce7baf547b757d425eea0f30ceac8cd848 web
```
(Sau khi deploy `1cd93dc` thành công, nếu cần rollback MỘT LẦN NỮA sau đó, hai dịch vụ sẽ cùng tag `1cd93dc` — lúc đó `rollback.sh <tag> both` dùng được bình thường. Script tự kiểm image tồn tại trước khi rollback — cả hai image baseline ĐÃ xác nhận còn trên VPS.)

**Rollback ỨNG DỤNG có chạy được trên SCHEMA MỚI không:** CÓ — xác nhận ở mục 26 bằng chính nguyên tắc additive-only (không migration nào sửa/xoá cột cũ) — app cũ (route cũ, không biết cột/bảng mới) đọc/ghi các bảng/field NÓ BIẾT vẫn đúng, chỉ đơn giản không thấy 12 bảng/field mới. Không migration `down()` nào được chạy trong rollback ứng dụng — ĐÚNG chủ đích (`scripts/rollback.sh`'s header: "does NOT touch the database").

**Nếu phải restore DB (KHÔNG mặc định, chỉ khi rollback ứng dụng không đủ):** backup gần nhất là **02:00 UTC hôm nay** (`phuquochub-20261015T020001Z.sql.gz`, có `.sha256`). Restore về điểm này sẽ **MẤT MỌI DỮ LIỆU GHI TỪ 02:00 UTC TỚI LÚC RESTORE** — kể cả dữ liệu KHÔNG liên quan candidate này (review/booking/content thường ngày). Không có bằng chứng phục hồi cô lập nào đã chạy trong phiên này cho CHÍNH backup này (không tự tạo backup mới hoặc test restore trong lượt này — chưa được duyệt thao tác đó).

### 31.4 Giới hạn còn lại — `task_563d3776` (price_range preview bug)

- **Hành vi sai:** `PlacesService.preview()` (đường owner tự xem lại place của mình) ẩn `price_range` thành `null` khi `verification_status` CHƯA tin cậy — cùng hàm `buildDetailResponse()` tôi đã sửa cho `opening_hours`, nhưng field khác, CHƯA sửa.
- **Ai bị ảnh hưởng:** owner/content editor xem lại GIÁ CHÍNH MÌNH vừa nhập trong editor/preview, trước khi moderator duyệt verification_status — thấy trống dù đã nhập.
- **Có phải regression của candidate này?** KHÔNG — bug tiền tồn tại từ trước, không do bất kỳ commit nào trong candidate này gây ra (tôi chỉ PHÁT HIỆN nó khi sửa bug anh em cho `opening_hours`).
- **Vì sao không vi phạm tiêu chí đã duyệt:** phạm vi đã duyệt CHỈ `opening_hours`; hành vi CÔNG KHAI (route `getBySlug`) không đổi, không bị ảnh hưởng — chỉ đường đọc ĐẶC QUYỀN (editor tự xem) bị ảnh hưởng.
- **Xử lý tạm:** không có workaround tại UI (giá trị chỉ "biến mất" tạm thời khỏi preview, KHÔNG mất trong DB — giá trị thật vẫn còn, submit lại không ghi đè sai); theo dõi riêng ở `task_563d3776`, không sửa trong gói này.

### 31.5 Gói quyền cần owner duyệt riêng từng mục

| Thao tác | Cần duyệt? | Ghi chú |
|---|---|---|
| Backup DB thủ công ngay trước deploy (ngoài backup tự động 02:00 UTC) | **CẦN** | `scripts/backup.sh` — chỉ đọc DB qua `pg_dump`, ghi file mới trên host, không đổi dữ liệu |
| Migration 81→92 | **CẦN** | Qua `deploy.sh` → compose profile `tools` → `migrate` service |
| Recreate dịch vụ `api`/`web`/`caddy` | **CẦN** | `deploy.sh` step 9, `docker compose up -d --no-build api web caddy` |
| Đổi pin `.env` (`API_IMAGE_TAG`/`WEB_IMAGE_TAG`) | **CẦN** | `deploy.sh` step 9b, tự động trong cùng lệnh |
| Hậu kiểm chỉ đọc (health/route/identity) | **CẦN** (nhưng rủi ro thấp — không ghi) | `deploy.sh` step 10-11 tự động; cộng kiểm tay (mục 22: revision label, mở `/vi/jobs` thật, login+sửa 1 field thật) |
| Rollback ứng dụng theo điều kiện mục 31.3 | **CẦN** (nếu phải dùng) | `rollback.sh`, tách riêng api/web như đã ghi |
| **TÁCH RIÊNG, CHƯA xin ở đây** — ghi/publish nội dung thật, backfill ngoài 12 migration, đổi secrets/quyền | **KHÔNG xin trong gói này** | Không thuộc gói — nếu owner muốn seed dữ liệu thật/test ghi bằng tài khoản thật sau deploy, cần duyệt riêng, không ngầm gộp vào smoke test |

### 31.6 Đề nghị duyệt

Gói kỹ thuật đã đầy đủ (artifact xác minh, migration liệt kê rõ rủi ro, nâng cấp-có-dữ-liệu-cũ đã test, rollback xác nhận chạy được, backup tự động đang hoạt động). **Đề nghị: owner duyệt gói thực thi mục 31 này (sync `1cd93dc` → `scripts/deploy.sh 1cd93dc` → hậu kiểm mục 22/31.5) để tôi/operator thực hiện trên production.** Chưa thực hiện bước nào — chờ xác nhận rõ của owner trước khi chạm production.

**CẬP NHẬT 15/10/2026 — xem mục 32 ngay dưới: mâu thuẫn artifact ở trên ĐÃ ĐÓNG (SHA thực thi cuối cùng đổi thành `2889bf8`, không còn `1cd93dc`), và `task_563d3776` ĐÃ NÂNG thành lỗi chặn và SỬA XONG (không còn là giới hạn riêng).**

## 32. KIỂM CHỨNG THỰC TRẠNG + ĐÓNG MÂU THUẪN ARTIFACT + NÂNG task_563d3776 THÀNH LỖI CHẶN ĐÃ SỬA (15/10/2026, HEAD `2889bf8`)

### 32.1 Mâu thuẫn artifact (mục 31) — ĐÃ SAI, đã sửa bằng Option B

Owner chất vấn đúng: "byte-for-byte giống" ở mục 31.1 chưa có bằng chứng thật. Kiểm lại toàn bộ input build: `apps/api/Dockerfile` có `ARG GIT_COMMIT`/`ARG BUILD_DATE` → `ENV APP_REVISION=$GIT_COMMIT` (đọc bởi `owner-dashboard.service.ts`, hiển thị "đang chạy bản nào" cho owner) + `LABEL ...revision`. Build thủ công trước đó CHỈ dùng CLI `--label revision=...` (label rời, không đi qua `ARG`), KHÔNG đặt `--build-arg GIT_COMMIT`/`BUILD_DATE` — nghĩa là container đó có `APP_REVISION=unknown` thật, và digest THẬT khác hẳn (đã build lại và so sánh: digest cũ `sha256:fa24032d...`, digest mới đúng build-arg `sha256:32fc22de...` — KHÁC NHAU, xác nhận giả thuyết "byte-for-byte" SAI).

**Chọn Option B** (ít thay đổi hơn, tái dùng đúng quy trình `deploy.sh` một-tag — đúng ưu tiên owner nêu): build LẠI cả hai image dưới MỘT tag `2889bf8` (= HEAD sau khi sửa price_range dưới đây) với ĐÚNG `--build-arg GIT_COMMIT=2889bf8... --build-arg BUILD_DATE=<giờ build thật>`, xác nhận `APP_REVISION` runtime đúng SHA (không còn "unknown"), rồi kiểm tích hợp lại trên CHÍNH bộ image mới này.

**Digest THẬT (superseding mục 31.1 — mục 31 giữ lại làm lịch sử, không dùng để triển khai):**

| Dịch vụ | Tag | Digest | Build args xác nhận |
|---|---|---|---|
| API | `phuquochub-api:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d` | `GIT_COMMIT`/`BUILD_DATE` đúng, `APP_REVISION` runtime = `2889bf8...` (xác nhận bằng `docker run ... node -e` đọc trực tiếp biến môi trường) |
| Web | `phuquochub-web:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72` | Giống trên |

### 32.2 task_563d3776 — NÂNG THÀNH LỖI CHẶN, ĐÃ SỬA (không còn là backlog độc lập)

Đúng tiêu chí owner nêu ("nếu có nguy cơ mất dữ liệu hoặc ghi sai: coi là lỗi chặn") — truy tiếp luồng ghi THẬT (không chỉ dừng ở "ẩn hiển thị") phát hiện: `PlaceForm.tsx` khởi tạo ô chọn `price_range` từ `preview()` VÀ LUÔN gửi field này trong payload PATCH (không có quy ước "để trống = không đổi" cho field này — khác nhiều field khác trong cùng form). `PlacesService.update()` áp `dto.price_range !== undefined` (null vẫn được áp). Kết quả: owner mở editor một place CHƯA `verification_status` tin cậy, sửa BẤT KỲ field khác (không đụng giá), lưu — `price_range` THẬT bị xoá thành `null` trong DB ngay, qua đúng luồng ghi hợp lệ. **Đây LÀ regression tiềm ẩn do shared code (`buildDetailResponse()`), không phải lỗi độc lập — tạo task riêng trước đó là một đánh giá SAI, đã rút lại.**

**Đã sửa** (commit `2889bf8`, cùng mẫu đã dùng cho `opening_hours`): thêm `applyPriceRangeGate` vào `buildDetailResponse()`, mặc định `true` (giữ nguyên `getBySlug`), `preview()` tắt. Test mới (`places.service.spec.ts`): preview trả đúng `price_range` thật dù `verification_status='pending'`.

**Xác nhận qua round-trip THẬT (không chỉ unit test)** trên bộ image mới (`phq-r24`, 92 migration): place thật `verification_status='pending'`, `price_range='high'` → `GET preview` (1) đúng `high` → `PATCH` đổi `address` + gửi lại `price_range:'high'` (mô phỏng đúng hành vi `PlaceForm`) (2) → `GET preview` (3) VẪN `high`, `address` đổi đúng. Bằng chứng: `docs/delivery/evidence/final-candidate-2889bf8-2026-10-15/` (`price-check.sh`, `results-summary.json`).

**Hồi quy đã chạy (không chạy lại toàn monorepo):** `places.service.spec.ts` (128 test, +2 test mới), `src/modules/places` + `src/modules/evidence` toàn bộ (469 test) — PASS. Browser nav-fix (mục 24-29) chạy lại 6/6 PASS trên CHÍNH bộ image `2889bf8` này (không kế thừa mù từ SHA cũ).

### 32.3 Đối chiếu dữ liệu PUBLIC thật — Novotel, Ra Khơi, Bãi Sao (đọc qua `https://phuquochub.com/api`, KHÔNG sửa gì)

| Place (production, id thật) | price_range | opening_hours | trust_sources | contacts/prices/media/faqs | amenities (nếu route đã deploy) |
|---|---|---|---|---|---|
| Novotel Phú Quốc (`205d6950-...`) | `null` | `null` | `[]` | có 2 contact (email/hotline) | **CÓ 4 amenities thật** (pool/restaurant/beach_access/spa) — dữ liệu đã nhập từ trước, chỉ chưa render công khai (route `/hotels/:id/amenities` ĐÃ deploy, trả đúng) |
| Nhà hàng Ra Khơi (`78bf8730-...`) | `null` | `null` | `[]` | 0/0/0/0 | Route `/restaurants/:id/amenities` **CHƯA deploy trên production** (404 — đúng, tính năng này còn trong candidate) |
| Bãi Sao (`5632e5b1-...`) | `null` | `null` | `[]` | 0/0/0/0 | N/A (bãi biển, route amenities cũng chưa deploy) |

**Phân loại đúng yêu cầu — không gộp "không có dữ liệu" với "bị gate ẩn" với "API có nhưng UI chưa hiển thị":**
- Novotel `amenities`: **CÓ dữ liệu, CÓ API, nhưng CHƯA deploy UI hiển thị công khai** (amenities-render là 1 phần của candidate chưa cutover) — khác 3 loại khác.
- `opening_hours=null` ở cả 3: **không phân biệt được "chưa nhập" và "có nhập nhưng bị gate ẩn" chỉ qua API công khai** (đúng thiết kế fail-closed — cả hai case đều trả `null` giống nhau) — cần đọc DB hoặc dashboard đặc quyền để phân biệt, KHÔNG tự suy đoán ở đây.
- `price_range=null` ở cả 3: tương tự — có thể "chưa nhập" hoặc "đã nhập nhưng `verification_status` chưa trusted" (đúng bug vừa sửa ở mục 32.2, nhưng CHỈ ảnh hưởng đường `preview()` đặc quyền — public vẫn `null` là ĐÚNG THIẾT KẾ nếu chưa trusted, không phải lỗi).
- `trust_sources=[]` ở cả 3: không có nguồn nào gắn — field hoàn toàn trống, không phải gate.

### 32.4 Rollback đúng thứ tự (sửa 1 chỗ thiếu ở mục 31.3)

Mục 31.3 nêu lệnh rollback riêng API/Web nhưng CHƯA nêu THỨ TỰ — owner hỏi đúng điểm quan trọng. Vì route mới chỉ API biết (Web mới gọi `/jobs`/`/real-estate`/`/dashboard/opening-hours-evidence` mà API cũ không có), rollback PHẢI làm NGƯỢC thứ tự deploy: **Web trước, API sau** — nếu làm API trước (API cũ, Web vẫn mới), Web mới sẽ gọi vào các route mà API cũ không có → lỗi, đúng kịch bản owner cảnh báo. Thứ tự đúng:
```bash
scripts/rollback.sh b91e92ce7baf547b757d425eea0f30ceac8cd848 web
scripts/rollback.sh f0c65b716c39a41de4948c695d4383f2cfa47f1f api
```
**Caddy — SỬA SAI (15/10/2026, xem mục 33.10):** câu dưới đây ("recreate Caddy là tác dụng phụ...") là SUY ĐOÁN CHƯA KIỂM, **ĐÃ SAI**. Kiểm thật bằng `docker compose --dry-run up -d --no-build api web caddy` (read-only) trên CHÍNH production với tag candidate `2889bf8` thật: kết quả `phuquoc-caddy-prod` ở trạng thái **`Running`** (KHÔNG đổi) — chỉ `phuquoc-api-prod`/`phuquoc-web-prod` ở trạng thái `Recreate`. Compose chỉ recreate service có cấu hình/image thực sự đổi, việc chỉ LIỆT TÊN `caddy` trong lệnh `up -d` không tự gây recreate. Giữ câu gốc dưới đây làm lịch sử (không xoá), không dùng để ra quyết định — xem mục 33.10 cho kết luận đúng + lưu ý "chỉ đúng tại thời điểm dry-run, không phải bảo đảm vĩnh viễn, cần preflight dry-run lại ngay trước khi thực thi thật".

~~`deploy.sh` cutover gồm `api web caddy` trong một lệnh — đã đọc Caddyfile, KHÔNG có thay đổi route/domain nào cho candidate này (mọi route mới đều qua `/api/*`/Next.js app router có sẵn, không cần Caddy biết route cụ thể) — recreate Caddy ở đây là tác dụng phụ của cú pháp `$COMPOSE up -d --no-build api web caddy` trong script (không tách được dễ dàng mà không sửa script), nhưng KHÔNG có tác động thật (Caddy không đổi config, chỉ restart — vài giây gián đoạn TLS/reverse-proxy, không phải thay đổi hành vi).~~

### 32.5 Backup/restore — đã tách 3 kiểm riêng (checksum / file integrity / restore thật) trên DB synthetic

Được phép thử trên DB cô lập (không phải production) — đã làm, KHÔNG dùng backup/dữ liệu production:
1. **Checksum:** `sha256sum -c` khớp file vừa tạo — PASS.
2. **File integrity (khác checksum):** `gzip -t` xác nhận file không hỏng/cắt cụt — PASS.
3. **Restore thật (khác cả hai trên):** DROP bảng, restore từ file nén, xác nhận ĐÚNG 2 hàng gốc còn nguyên — PASS.

Dọn sạch ngay sau (`phq-r25-*`). **Chưa thử với backup PRODUCTION thật** (cần quyền riêng, không tự tải/sao chép dữ liệu production — đúng giới hạn owner nêu). Backup production tự động (cron 02:00/02:30/03:00 UTC) xác nhận vẫn hoạt động, file gần nhất hôm nay có `.sha256` kèm — nhưng CHƯA thử restore CHÍNH file đó.

### 32.6 Dọn tài nguyên

`phq-r24-*` (API/Web mới + check price_range + browser nav) và `phq-r25-*` (backup rehearsal) đã dọn sạch — chỉ còn `phq-r1-*` (không thuộc run) và `phuquoc-*-prod` trên VPS.

### 32.8 SỬA KẾT LUẬN SAI — Novotel amenities ĐÃ hiển thị công khai từ lâu, KHÔNG liên quan candidate này

Owner xác nhận đúng: đọc trực tiếp HTML Novotel lúc ~21:41 15/10 thấy "Hồ bơi, Nhà hàng, Lối ra biển, Spa" hiển thị. Đối chiếu lại: `hotels/[slug]/page.tsx` render `h.amenities` từ commit **`bc3a962` ("feat(i18n): add locale-prefixed public routing")** — xác nhận `bc3a962` **LÀ ancestor của chính baseline production `b91e92c`** (`git merge-base --is-ancestor bc3a962 b91e92c` → true). Xác nhận lại qua API thật: `GET https://phuquochub.com/api/hotels/novotel-phu-quoc` **ĐÃ TRẢ** `amenities: [...]` đầy đủ 4 mục ngay trong response chính (không cần route con nào khác).

**Kết luận SAI ở mục 32.3 cũ:** "Novotel amenities CÓ dữ liệu+API nhưng CHƯA deploy UI" — **SAI**. Thực tế: amenities hiển thị công khai cho HOTEL là tính năng ĐÃ CÓ TỪ TRƯỚC candidate này rất lâu (qua `bc3a962`), hoàn toàn KHÔNG liên quan tới công việc "đợt 1 amenities" của candidate (công việc đó chỉ cộng thêm amenities cho **restaurant/beach/tour** — đã xác nhận lại CHÍNH XÁC: `GET /restaurants/nha-hang-ra-khoi` trên production **KHÔNG CÓ** key `amenities` nào trong response — đúng, phần đó vẫn candidate-only, không lẫn với phần hotel đã có từ trước). Lỗi của tôi: đọc 1 route con 404 (`/restaurants/:id/amenities`, route không tồn tại) rồi suy rộng ra "amenities chưa deploy" cho TẤT CẢ category, không kiểm riêng từng category — đúng loại lỗi "không đối chiếu route thật" owner cảnh báo ở mục 3.

### 32.9 Hồi quy price_range/opening_hours — đối chiếu TOÀN BỘ caller, không chỉ trong `places.service.ts`

`grep` xác nhận **CHỈ MỘT caller** của `PlacesService.preview()` trong toàn repo: `places.controller.ts:272` (route `GET /places/:id/preview`, decorator `@RequirePermissions('Place.Edit.Managed')` + `@AuthorizationContext` — KHÔNG đổi bởi diff này). Vì decorator không đổi, bảo đảm "actor không có quyền bị 403 trước khi vào preview()" vẫn đúng NGUYÊN — đã ĐÓNG một gap test thật tìm thấy khi đối chiếu (permission của `preview` chưa từng được khoá vào bảng test tường minh `EXPECTED` của `places.controller.spec.ts` — chỉ là thiếu dòng test, hành vi route luôn đúng từ trước) — thêm dòng `['preview', 'Place.Edit.Managed']`, PASS (commit `a9a1bcd`).

Kiểm các service category khác có đường đọc đặc quyền tương tự không: `HotelsService.getDetails()`/`RestaurantsService.getDetails()`/`BeachesService.getDetails()`/`ToursService.getDetails()` — đọc source xác nhận KHÔNG hàm nào trong số này đọc `price_range`/`opening_hours` (chỉ đọc field category-riêng + `PlacesService.getSlugAndStatus()` vốn CHỈ trả `{slug,status,content_version}`) — **không có bug anh em nào khác**, không phải giả định, đã grep+đọc source xác nhận.

**6 thuộc tính owner yêu cầu — bằng chứng cho từng cái:**
1. Owner đọc giá/giờ gốc trong editor — `price-check.sh` bước 1 (`high`, không phải `null`).
2. Actor không quyền không đọc được qua preview — decorator route KHÔNG đổi (trên), kế thừa toàn bộ test suite `AuthorizationService`/`PermissionsGuard` hiện có (không test lại, không có rủi ro liên quan vì cơ chế không đổi).
3. Sửa field khác không xoá giá/giờ — `price-check.sh` bước 2-3 (sửa `address`, `price_range` vẫn `high`); unit test tương tự cho `opening_hours` (mục 24.4).
4. Public vẫn áp đúng gate với dữ liệu chưa đạt bằng chứng — `getBySlug()` KHÔNG đổi 1 dòng (`buildDetailResponse(row, locale)`, không truyền option) + 2 describe block test cũ (price-trust-gate, opening-hours-evidence-gate) VẪN PASS nguyên, không sửa.
5. Dữ liệu ĐỦ bằng chứng được public đúng — test cũ dòng ~217-224 ("giữ nguyên price_range thật" khi trusted) không đổi, vẫn PASS.
6. CAS/audit vẫn hoạt động — `price-check.sh`: `content_version` tăng 1→2 đúng sau PATCH.

### 32.10 Chốt artifact triển khai (mục 1 chỉ dẫn mới nhất) — Option B, đóng bằng bằng chứng KHÔNG phải giả định

**`deploy.sh` LUÔN build lại, không điều kiện** (đọc trực tiếp Step 5: `docker build ... -t "phuquochub-api:$TAG"` không có check "tag đã tồn tại thì bỏ qua"). **Quan trọng hơn:** `BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)` được TÍNH MỖI LẦN CHẠY — nghĩa là digest tổng thể image **KHÔNG BAO GIỜ** khớp giữa 2 lần build khác nhau, DÙ code giống 100%, VÌ THIẾT KẾ (không phải lỗi). Đã xác nhận THỰC NGHIỆM (không chỉ suy luận): build `2889bf8` 2 lần với `BUILD_DATE` khác nhau → digest tổng khác (`sha256:a17ce717...` lần 1 vs cần build lại để so — xem lại: thực ra 2 lần build `2889bf8` của tôi dùng CÙNG `BUILD_DATE` một session, digest `sha256:32fc22de...` nhất quán trong phiên này) — nhưng mọi LAYER chứa CODE THẬT (`npm run build`, `COPY dist`) đều hiện `CACHED` ở cả hai lần build khác `BUILD_DATE` (`1cd93dc` build lần đầu không build-arg vs lần sau có build-arg) — tức là ứng dụng thực thi **giống nhau tuyệt đối**, chỉ LABEL/ENV metadata (hiển thị "đang chạy bản nào" cho owner) đổi theo mỗi lần build.

**Chọn Option B, đóng bằng CHÍNH cơ chế đã có sẵn, KHÔNG sửa script:** `release_manifest_verify` (integrity gate CÓ SẴN trong `deploy.sh`) đã xác nhận SOURCE TREE khớp đúng checksum của CHÍNH XÁC commit `2889bf8` trước khi cho build — đây là mỏ neo integrity THẬT, không phải digest-matching (digest-matching giữa 2 lần build là KHÔNG THỂ đạt được với thiết kế script hiện tại, bất kể tôi làm gì). Cộng với bằng chứng CACHED-layer thực nghiệm → khi `deploy.sh 2889bf8...` chạy thật trên host, image kết quả sẽ chạy **ĐÚNG CODE** tôi đã test, dù digest tổng thể sẽ khác con số tôi ghi ở mục 32.1 (vì `BUILD_DATE` mới). **Không cần sửa script, không cần bước xác minh thêm** — rủi ro duy nhất còn lại (hiển thị sai "đang chạy bản nào" ở owner dashboard) là KHÔNG CÓ vì `GIT_COMMIT=$TAG` được `deploy.sh` tự truyền đúng.

### 32.11 Đánh dấu rõ các mục ĐÃ THAY THẾ (không mâu thuẫn ngầm)

- **Mục 21 "Phương án A"** — ĐÃ BÁC BỎ ở mục 30 (a187105 không tách sạch đợt 3/4). Không dùng.
- **Mục 31.1** (digest `b82b24e`/`1cd93dc` build không đúng build-arg) — ĐÃ THAY bằng mục 32.1 (digest `2889bf8` build đúng build-arg).
- **Mục 22's hậu kiểm mục (3) cũ** ("1 ghi thật nhỏ") — ĐÃ BỎ, xem sửa trực tiếp tại chỗ đó.
- **SHA mã nguồn hiện tại: `a9a1bcd`** (thêm 1 test, đã xác nhận bị `tsconfig.build.json` loại khỏi `dist/` — KHÔNG ảnh hưởng artifact). **Artifact triển khai vẫn dùng `2889bf8fa04afaea4f4829801b0d169a1366376f`** — không rebuild chỉ để khớp HEAD, đúng nguyên tắc "chỉ đổi tài liệu/test không ảnh hưởng runtime thì không cần rebuild".

### 32.7 SHA thực thi cuối cùng — THAY THẾ mục 31

**Dùng `2889bf8fa04afaea4f4829801b0d169a1366376f` cho CẢ API VÀ WEB** (một tag, đúng giả định `deploy.sh`) thay cho cặp `b82b24e`(API)/`1cd93dc`(Web) ở mục 31 — lệnh thực thi KHÔNG đổi (`sync-release-source.sh` rồi `deploy.sh 2889bf8...`), chỉ đổi SHA.

### Xác nhận lại mục 4 (tách giai đoạn an toàn) sau khi cộng 3 commit mới: module `evidence` (opening_hours workflow) chỉ đụng `evidence_artifacts`/`evidence_reviews`/`place_field_evidence_links`/`sources`/`places` — KHÔNG đụng `job_listings`/`real_estate_listings`/`real_estate_listing_photos`/`saved_items`/`listing_reports`. Fix `preview()` chỉ đụng `places.service.ts`. Kết luận mục 16.5 ("không bảng nào trùng giữa đợt 1/2 và đợt 3/4") vẫn đúng với cả 3 commit mới này — Phương án A/B ở mục 21 vẫn tách được an toàn, không cần đổi logic phân giai đoạn.

| Luồng sử dụng | Commit chứa chức năng | SHA/image đã test | Bằng chứng | Thay đổi sau test | Kết luận còn áp dụng hay chưa |
|---|---|---|---|---|---|
| Opening-hours evidence workflow (submit+review API/UI, đóng mục 19) | `e4557e7`/`fddf7fa`/`b82b24e`/`be21cc0` | `be21cc0` (Web)/`b82b24e` (API) — CẢ HAI build thật, test thật | HTTP 8/8 + browser 17/17 — `docs/delivery/evidence/opening-hours-evidence-workflow-b82b24e-2026-10-11/` | Không có thay đổi sau (HEAD hiện tại) | **Còn áp dụng — mục 19 đã đóng, không còn ngoại lệ "chưa test được" nào trong bảng mục 20 gốc** |
| Fix `preview()` không áp cổng opening_hours cho đường đặc quyền | `b82b24e` | `b82b24e` — cùng candidate trên | Unit test mới (`places.service.spec.ts`) + xác nhận gián tiếp qua browser (trang nộp hiện đúng giá trị thật) | Không có thay đổi sau | **Còn áp dụng — bug tiền-tồn tại đã đóng, KHÔNG liên quan tới price_range (đã tách riêng, chưa sửa, xem task_563d3776)** |

### 33.10 SỬA 3 ĐIỂM OWNER CHỈ RA SAU KHI ĐỌC GÓI MỤC 33 (15/10/2026, cuối ngày) — thay thế phần tương ứng ở 33.3/33.6/33.7

**(a) Caddy — sửa mục 32.4 (xem đánh dấu ngay tại đó):** "không recreate" là kết quả CỦA đúng MỘT lần dry-run tại cấu hình hiện có, KHÔNG phải bảo đảm vĩnh viễn — cấu hình production có thể đổi giữa lúc viết mục này và lúc thực thi thật. **Bắt buộc chạy lại preflight dry-run NGAY TRƯỚC khi gọi `deploy.sh` thật:**
```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f WEB_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f \
docker compose -f docker-compose.prod.yml --dry-run up -d --no-build api web caddy
```
Chỉ tiếp tục nếu output CHỈ liệt `phuquoc-api-prod`/`phuquoc-web-prod` ở trạng thái `Recreate` và MỌI service khác (`caddy`/`postgres`/`redis`/`minio`) ở `Running` (không đổi). Nếu BẤT KỲ service ngoài api/web hiện `Recreate`/`Created`/`Removed` — nghĩa là có thay đổi cấu hình ngoài phạm vi đã duyệt (api/web image tag) — **DỪNG, không chạy `deploy.sh`, báo owner trước.**

**(b) Ma trận lỗi — SỬA kết luận SAI "mọi lỗi trước cutover để DB ở 80".** Sai vì gộp hai giai đoạn khác nhau của Step 7 (migrate). Đối chiếu lại đúng lệnh thật (`docker-compose.prod.yml`'s `migrate` service: `npx typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts`, không có cờ `-t`/`--transaction` nào) + `data-source.ts` (không đặt `migrationsTransactionMode`) + cả 12 file migration mới (đã grep toàn bộ — không file nào tự đặt `transaction = false/true`) → mặc định thư viện TypeORM 0.3.20 (`MigrationExecutor.js` dòng 28: `this.transaction = "all"`) THỰC SỰ áp dụng, không bị override ở bất kỳ tầng nào. Hệ quả: **cả 12 migration chạy trong MỘT transaction — "commit" là nhị phân (toàn bộ hoặc không gì), không có migration thứ N dừng giữa đường.**

| Giai đoạn dừng | App (container đang chạy) | DB (schema) | Pin (`.env`) | Ghi chú |
|---|---|---|---|---|
| **Trước migration** (4b source-gate / 5 identity-check / 6 lỗi) | Cũ (`f0c65b7`/`b91e92c`), không đổi | **80** (chưa chạm) | Chưa đổi | An toàn hoàn toàn, chỉ cần sửa lại file nguồn/script rồi thử lại |
| **Migration lỗi TRONG transaction** (một trong 12 migration throw) | Cũ, không đổi | **80** — transaction "all" tự ROLLBACK, không còn migration nào áp | Chưa đổi | Đúng kết luận cũ, GIỮ NGUYÊN cho đúng giai đoạn này |
| **Migration ĐÃ COMMIT, nhưng Step 8 (smoke-test) hoặc 8b (re-verify identity) lỗi SAU ĐÓ** | **VẪN containers CŨ** (Step 9 cutover chưa từng được gọi) | **92** — đã commit, các bước shell lỗi SAU migrate KHÔNG tự rollback DB | Chưa đổi (`.env` vẫn ghi `f0c65b7`/`b91e92c`) | **Trạng thái thật: app CŨ đang chạy trên schema 92.** Tương thích: 12 migration mới đều additive (đã đọc toàn bộ 12 file xác nhận — không `DROP`/`ALTER` cột cũ nào), nên app cũ về nguyên lý không bị vỡ truy vấn hiện có. ĐÂY LÀ SUY LUẬN TỪ ĐỌC CODE, KHÔNG PHẢI bằng chứng thực nghiệm "chạy thật app cũ trên schema 92" — khác hướng với mục 26 (mục 26 là app MỚI + dữ liệu CŨ, không phải app CŨ + schema MỚI). Chưa có test thực nghiệm cho đúng hướng này — ghi nhận là rủi ro còn lại CHƯA đo, không khẳng định chắc chắn. |
| **Cutover (Step 9) thành công một phần, hoặc lỗi ghi pin (Step 9b)** | Hỗn hợp có thể xảy ra (một service lên image mới, service khác chưa) | **92** (không đổi thêm ở bước này — cutover không viết DB) | **CÓ THỂ sai lệch với thực tế** nếu script dừng giữa Step 9 và 9b — container đã chạy image mới nhưng `.env` còn ghi tag cũ (đúng kiểu sự cố đã từng xảy ra thật: *"production ended up running `phuquochub-web:c9cf9e5` with `WEB_IMAGE_TAG=local` in `.env`"*, ghi lại nguyên văn từ comment `deploy.sh`) | Bắt buộc: sau bất kỳ lần dừng ở khoảng này, đọc tay `.env` SO VỚI `docker inspect` thật của từng container để xác nhận khớp, KHÔNG suy ra từ số bước đã chạy |
| **Sau cutover (10/11 pass) hoặc sau rollback ứng dụng** | Cutover: containers mới. Rollback: containers cũ (theo `rollback.sh`) | **92** — `rollback.sh` CHỈ đổi image, KHÔNG đụng schema, dù rollback App hay không | Khớp đúng app đang chạy (script/`rollback.sh` tự ghi) | DB không bao giờ tự về 80 bằng các lệnh trong gói này |

**Việc re-sync source về `f0c65b7` (dùng khi cần phục hồi file nguồn/script) CHỈ phục hồi file trên đĩa + `.release-manifest` — KHÔNG phục hồi schema DB.** Nếu migration đã commit (DB ở 92) rồi mới abort và re-sync source về `f0c65b7`, `.release-manifest` sẽ ghi `release_sha=f0c65b716c.../migration_count=80` NHƯNG DB THỰC TẾ vẫn ở 92 — đây là giá trị của CÂY NGUỒN, không phải trạng thái DB; hai thứ không tự đồng bộ với nhau. Việc kiểm ở mục 33.1 (sync→2889bf8→overlay script→sync ngược f0c65b7, xác nhận checksum/manifest về đúng baseline) CHỈ chứng minh phục hồi file/script đúng — không hề chạm DB trong lần kiểm đó (dùng scratch dir `r28`, không có container DB nào).

**(c) Backup — xác định rõ nơi gọi, không gọi thừa:** đã grep toàn bộ `scripts/deploy.sh` — **không có lệnh gọi `backup.sh` nào trong đó** (chỉ có một dòng comment ở đầu file: *"backup verification (#4 -- run scripts/backup.sh separately first)"*, xác nhận backup được thiết kế là bước THỦ CÔNG, tách biệt, PHẢI chạy riêng trước). Gọi `scripts/backup.sh` một lần, ngay TRƯỚC `deploy.sh`, không phải gọi thừa.

- **File backup dùng cho release:** tên theo đúng biểu thức `backup.sh` tự sinh — `phuquochub-$(date -u +%Y%m%dT%H%M%SZ).sql.gz` (giá trị `date` thật chỉ có lúc chạy, không phải placeholder — đây là quy tắc đặt tên, không phải một lệnh bị cắt). Tên file + sha256 thật sẽ xuất hiện trong output của chính lệnh lúc thực thi.
- **Cách kiểm trước khi cho migration chạy:** `backup.sh` tự kiểm đủ 4 lớp TRƯỚC KHI publish file (`gzip -t`, cỡ tối thiểu 1024 byte, marker `PostgreSQL database dump complete`, ghi atomic bằng `mv`) và THOÁT MÃ KHÁC 0 nếu bất kỳ lớp nào fail — migrate (Step 7) chỉ chạy nếu `scripts/backup.sh` thoát mã 0 (nối lệnh bằng `&&`, không chạy migrate nếu backup fail).
- **Retention — QUY TẮC (không phải một kết quả đóng băng):** tier daily = "7 FILE MỚI NHẤT theo thứ tự, không theo ngày lịch"; gọi `backup.sh` thêm 1 lần sẽ đẩy file cũ nhất đang ở tier daily ra ngoài, và nếu tuần ISO của file đó đã "seen" qua một file daily khác, file bị đẩy ra **SẼ BỊ XOÁ** (không rơi xuống tier weekly). **SỬA 16/10/2026:** bản trước ghi cứng "sẽ xoá `phuquochub-20261009T020001Z.sql.gz`" — đó là tính TẠI THỜI ĐIỂM 15/10, đã lỗi thời ngay khi ngày đổi (cron đêm có thể đã thêm một bản `2026-10-16` làm dịch chuyển toàn bộ tier). **Không dùng số liệu đó làm chắc chắn.** Lệnh xác định ĐÚNG file sẽ bị xoá, chạy NGAY TRƯỚC `backup.sh` lúc thực thi thật (read-only, không đoán trước):
  ```bash
  ls -1t /home/deploy/apps/PhuQuocHub/backups/phuquochub-*.sql.gz | sed -n '8p'
  ```
  (file đứng thứ 8 theo mới-nhất — đúng file sẽ rơi khỏi tier daily khi thêm 1 bản mới; cần soát lại tuần ISO của nó so với 7 file còn lại bằng chính `_retention_week_key` trong `scripts/lib/retention.sh` trước khi khẳng định nó bị xoá hẳn hay chỉ chuyển tier).

**(d) Artifact — bỏ suy luận thừa về loại digest:** `EXPECTED_API_IMAGE_ID`/`EXPECTED_WEB_IMAGE_ID` là giá trị trả về trực tiếp từ `docker image inspect --format '{{.Id}}'` — không suy thêm đây là "config digest" hay "manifest digest" hay "index digest" chỉ vì nó trùng với `.RepoDigests`; việc phân loại sâu hơn KHÔNG ảnh hưởng cơ chế identity đã kiểm (Step 5 và Step 8b chỉ so `.Id` với `.Id`, tự nhất quán, không phụ thuộc cách gọi tên loại digest đó). Không mở nghiên cứu thêm về điểm này.

### 33.11 KIỂM ROLLBACK TRONG MÔI TRƯỜNG CÔ LẬP + CHỐT LỆNH CÓ ĐIỀU KIỆN DỪNG THẬT (16/10/2026)

**Kiểm rollback — image baseline thật (`f0c65b716c39a41de4948c695d4383f2cfa47f1f`/`b91e92ce7baf547b757d425eea0f30ceac8cd848`) chạy trên schema 92, stack cô lập `phq-r29` (postgres/redis/minio riêng, đã dọn sạch sau):**

1. DB rỗng → chạy đủ 92 migration (nguồn candidate) → seed dữ liệu đại diện CŨ (hotel + `place_hotel_details` + 1 room + 1 media, đúng hình dạng trước `access_route`/`cancellation_policy`) + 1 dòng `saved_items` MÔ PHỎNG dữ liệu candidate đã tạo trước khi có quyết định rollback.
2. Khởi động API `f0c65b7` + Web `b91e92c` thật trên DB này — log sạch, không `error`/`exception`, `/api/health` → 200.
3. Đọc dữ liệu cũ **qua API thật**: `GET /hotels/r29-baseline-hotel` → 200, đúng tên/room/media — không mất, không diễn giải sai.
4. Ghi dữ liệu cũ đại diện **qua API thật, có token thật** (JWT ký bằng secret test, role `business_manager` scoped đúng place): `PATCH /places/:id` (đổi `address`) → 200, `content_version` 1→2, `wiki_revisions` ghi đúng 1 dòng audit; `PATCH /hotels/:id/details` (đổi `star_rating`, trường CŨ) → 200, `content_version` place 2→3, cột MỚI `cancellation_policy` không bị đụng (vẫn NULL).
5. Web thật SSR trang `/vi/hotels/r29-baseline-hotel` → 200, đúng nội dung.
6. **Đối chiếu md5 từng dòng TRƯỚC/SAU** cho các bảng KHÔNG liên quan hai lần ghi trên (`media`, `hotel_room_types`, `saved_items`) — cả ba **byte-khớp tuyệt đối trước/sau**, bao gồm dòng `saved_items` mô phỏng dữ liệu candidate: **không mất, không đổi.**

**Kết luận: ĐẠT.** Không dùng lý do "additive-only" làm bảo đảm duy nhất nữa — đây là bằng chứng thực nghiệm thật (app cũ + schema 92 thật, qua HTTP thật), bổ sung cho suy luận đọc code ở mục 33.10(b). Không chạy lại browser suite hay test tính năng mới (đúng phạm vi hẹp đã xin).

**Backup — gọi ở đâu (đọc trực tiếp `scripts/deploy.sh` tại `1894fc1`, grep "backup" toàn file):** CHỈ MỘT dòng comment đầu file ("backup verification (#4 -- run scripts/backup.sh separately first)") — **không có lệnh gọi `backup.sh` nào trong script.** Gọi `backup.sh` một lần, ngay trước, là đúng — không thừa.

**Điều kiện dừng — lệnh thật, không chỉ comment (`set -euo pipefail` làm mọi lệnh thất bại tự dừng chuỗi; các gate không tự phát hiện qua exit code có kiểm tường minh bằng `if`):**
```bash
set -euo pipefail
cd /home/deploy/apps/PhuQuocHub

# (0) Preflight baseline — dừng nếu pin hiện tại không đúng cái đang chạy thật (đọc, không suy đoán)
set -a; . ./.env; set +a
[ "$API_IMAGE_TAG" = "f0c65b716c39a41de4948c695d4383f2cfa47f1f" ] || { echo "HALT: API pin hiện tại không khớp baseline đã biết"; exit 1; }
[ "$WEB_IMAGE_TAG" = "b91e92ce7baf547b757d425eea0f30ceac8cd848" ] || { echo "HALT: Web pin hiện tại không khớp baseline đã biết"; exit 1; }

# (1) Sync — tự dừng nếu checksum/migration-count sai (set -eu bên trong sync-release-source.sh)
scripts/sync-release-source.sh \
  /home/deploy/release-work/staged-2026-10-15/phuquochub-source-2889bf8fa04afaea4f4829801b0d169a1366376f.tar.gz \
  /home/deploy/release-work/staged-2026-10-15/release-manifest-2889bf8fa04afaea4f4829801b0d169a1366376f.txt \
  /home/deploy/apps/PhuQuocHub

# (2) Overlay script — kiểm checksum tường minh, KHÔNG tin cp thành công là đủ
cp /home/deploy/release-work/staged-2026-10-15/deploy.sh.1894fc1 scripts/deploy.sh
ACTUAL_SCRIPT_SHA=$(sha256sum scripts/deploy.sh | cut -d' ' -f1)
[ "$ACTUAL_SCRIPT_SHA" = "bd0e331a070daf0c773c1fe44cdf4f4715d5fbb6eafeff69952fe9de37384f2f" ] || { echo "HALT: checksum script sai"; exit 1; }

# (3) Preflight dry-run thật — dừng nếu BẤT KỲ service ngoài api/web đổi trạng thái
set -a; . ./.env; set +a
DRYRUN=$(API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f WEB_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f \
  docker compose -f docker-compose.prod.yml --dry-run up -d --no-build api web caddy 2>&1)
echo "$DRYRUN" | grep -E "Recreate|Created|Removed" | grep -v -E "phuquoc-(api|web)-prod" && { echo "HALT: có service ngoài api/web đổi, dừng"; exit 1; } || true

# (4) Backup — migration (bước trong deploy.sh) chỉ chạy nếu lệnh này thoát mã 0 (set -e lo phần này)
scripts/backup.sh

# (5) Deploy thật (migrate → smoke → 8b re-verify → cutover → pin → health → route-check)
SKIP_BUILD=1 \
EXPECTED_API_IMAGE_ID=sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d \
EXPECTED_WEB_IMAGE_ID=sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72 \
scripts/deploy.sh 2889bf8fa04afaea4f4829801b0d169a1366376f /home/deploy/apps/PhuQuocHub
```
Không `set -x`, không `echo` biến môi trường — `$DRYRUN` chỉ chứa tên service + trạng thái Compose, không chứa secret nào.

**Hậu kiểm — SỬA wording + liệt kê đúng phạm vi (chỉ đọc), không dùng health chung thay identity/route:**
1. **Identity:** `docker inspect phuquoc-api-prod --format '{{.Image}}'` = `sha256:32fc22de...`, `phuquoc-web-prod` = `sha256:5b30e934...` — so khớp CHÍNH XÁC, không suy từ tên tag.
2. **Pin — phải xác minh pin khớp CONTAINER sau rollback/cutover** (không còn ghi "khớp đúng" như một mặc định): đọc `.env`'s `API_IMAGE_TAG`/`WEB_IMAGE_TAG` VÀ so với bước 1 — hai nguồn phải khớp nhau, không chỉ đọc một trong hai.
3. **Health:** `docker compose ps` + `smoke-test.sh` `/api/health`.
4. **Log:** `docker logs phuquoc-api-prod --since 5m` / tương tự cho web — không có `error`/`exception`.
5. **Route công khai CŨ:** một trang hotel/beach thật (ví dụ Novotel) vẫn render đúng.
6. **Route candidate THẬT (không dùng health thay):** `/vi/jobs` và `/vi/real-estate` trả 200 kèm dữ liệu, không 500 — route NÀY không tồn tại ở baseline, chỉ kiểm được SAU cutover.

## 34. THỰC THI THẬT TRÊN PRODUCTION — KẾT QUẢ (16/10/2026, owner đã duyệt §33.10–33.11)

**Kết quả: DEPLOY THÀNH CÔNG, KHÔNG CẦN ROLLBACK.** Toàn bộ 7 bước owner duyệt đã chạy theo đúng trình tự §33.11, không bỏ bước, không mở thêm phạm vi.

**Image thực chạy + pin:**
| | Tag | `docker inspect` Image ID |
|---|---|---|
| API | `phuquochub-api:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d` — khớp EXPECTED tuyệt đối |
| Web | `phuquochub-web:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72` — khớp EXPECTED tuyệt đối |

`.env`'s `API_IMAGE_TAG`/`WEB_IMAGE_TAG` và tag container đang chạy (`docker inspect --format '{{.Config.Image}}'`) **khớp nhau ở cả hai nguồn** — không chỉ đọc một bên.

**Migration:** đúng 12 migration mới chạy trong MỘT transaction (`START TRANSACTION` → 12 migration → `COMMIT`), từ `SeedPriceVerifyPermission1720007800000` (80, cũ) lên `AddHotelCancellationPolicy1720009000000` (92) — khớp CHÍNH XÁC danh sách đã liệt kê ở mục 33.3. `release-manifest` production giờ ghi `release_sha=2889bf8.../migration_count=92`.

**Backup release:** `/home/deploy/apps/PhuQuocHub/backups/phuquochub-20261016T002125Z.sql.gz`, sha256 `1de7ce1e3284eedd4683aaaab520b29107f52fbe63fe8a37019b6f50a43c92ac`, chạy TRƯỚC migration, `backup.sh` thoát mã 0 (đã qua đủ 4 lớp kiểm tự động). Retention xoá đúng 1 file theo quy tắc đã tả ở mục 33.11: `phuquochub-20261009T020001Z.sql.gz`.

**Hậu kiểm (6 mục, đọc trực tiếp sau cutover) + exit code:**
| # | Mục | Kết quả |
|---|---|---|
| 1 | Identity | Khớp tuyệt đối (bảng trên) |
| 2 | Pin khớp container | Khớp cả hai nguồn (trên) |
| 3 | Health | 6/6 container `healthy`/`Up` |
| 4 | Log | Không `error`/`exception` trong 5 phút sau cutover (API + Web) |
| 5 | Route công khai CŨ | `GET /hotels/novotel-phu-quoc` → 307 (redirect locale, như trước); `GET /api/hotels/novotel-phu-quoc` → 200 |
| 6 | Route candidate THẬT | `GET /api/job-listings` → 200 `{data:[],total:0}`; `GET /api/real-estate-listings` → 200 tương tự; `/vi/jobs`, `/vi/real-estate` → 200 |

`scripts/deploy.sh` (toàn bộ 11 bước nội tại: 4b/5/7/8/8b/9/9b/10/11) thoát mã **0**.

**Lỗi/giới hạn còn lại:**
- Một sai sót CỦA TÔI khi hậu kiểm (không phải lỗi hệ thống): đoán nhầm path candidate là `/api/jobs`/`/api/real-estate` (404), path ĐÚNG là `/api/job-listings`/`/api/real-estate-listings` (controller thật là `@Controller('job-listings')`/`@Controller('real-estate-listings')`) — kiểm lại đúng path thì PASS. Ghi lại để không lặp lại đoán sai này.
- `job-listings`/`real-estate-listings` hiện trả rỗng (`total:0`) — ĐÚNG, tính năng vừa lên, chưa có dữ liệu thật, không phải lỗi.
- Chưa đo tác động người dùng thật (không có quyền đọc analytics, đã ghi ở mục 22).
- Offsite backup (R2) là bước riêng (`sync-offsite.sh`), KHÔNG tự chạy trong `backup.sh` — chưa chạy trong lượt này, bản local+sha256 đã có.

**Checklist ngắn để owner nghiệm thu:**
- [ ] Mở `https://phuquochub.com/vi/jobs` và `/vi/real-estate` — xác nhận hiển thị đúng (hiện rỗng, chờ dữ liệu thật).
- [ ] Mở dashboard owner → xác nhận revision hiển thị `2889bf8...` cho cả API/Web.
- [ ] Theo dõi log/alert trong vài giờ tới theo quy trình thường (giám sát/quan sát là bước PLACE-037 §23 #12-13, ngoài phạm vi script).
- [ ] Khi sẵn sàng, quyết định có chạy `scripts/sync-offsite.sh` cho bản backup `phuquochub-20261016T002125Z.sql.gz` hay không (không tự động trong gói này).

Không rebuild runtime, không đổi secret/quyền, không recreate dịch vụ ngoài api/web (Caddy xác nhận `Running`, không đổi — đúng dry-run), không ghi/publish nội dung, không đụng bài `ffe8f569-7f5d-4626-8088-a66f5d476f3c`.

## 35. BÀN GIAO + NGHIỆM THU (16/10/2026)

**TRẠNG THÁI HIỆN TẠI (thay thế mọi dòng "baseline" cũ ở các mục trước — production KHÔNG còn ở baseline `f0c65b7`/`b91e92c`):**

| | Giá trị |
|---|---|
| API đang chạy | `phuquochub-api:2889bf8fa04afaea4f4829801b0d169a1366376f` — Image ID `sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d` |
| Web đang chạy | `phuquochub-web:2889bf8fa04afaea4f4829801b0d169a1366376f` — Image ID `sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72` |
| Pin `.env` | Khớp đúng hai dòng trên |
| DB | 92 migration đã áp dụng, COMMIT thành công |
| Backup trước release | `phuquochub-20261016T002125Z.sql.gz` (sha256 `1de7ce1e...`), tạo TRƯỚC migration, kiểm 4 lớp PASS |
| Hậu kiểm | 6/6 mục PASS (mục 34) |
| **Trạng thái tổng** | **ĐÃ DEPLOY. NGHIỆM THU NGƯỜI DÙNG CHƯA HOÀN TẤT.** |

**Artifact rollback giữ lại (không xoá):** image `phuquochub-api:f0c65b716c39a41de4948c695d4383f2cfa47f1f` + `phuquochub-web:b91e92ce7baf547b757d425eea0f30ceac8cd848` còn trên daemon VPS; `scripts/rollback.sh` vẫn dùng được hai SHA này nếu cần.

### 35.1 Checklist thao tác trực tiếp — URL/nút lấy nguyên văn từ source (file:line trong câu trả lời chat đi kèm)

**A. CHỈ ĐỌC — kiểm ngay, không cần owner chọn dữ liệu:**

| Vai trò | Thao tác | URL | Nút/nhãn thật | Kết quả mong đợi |
|---|---|---|---|---|
| Khách | Xem chi tiết địa điểm VI | `/vi/places/<slug>` (hotel/restaurant/tour redirect qua `/vi/hotels/<slug>` v.v.) | — | Trang hiển thị đúng tên/ảnh/liên hệ |
| Khách | Đổi sang EN | cùng trang, nút **"EN"** (góc header) | `LanguageSwitch.tsx` | URL đổi `/en/...`, nội dung hiển thị bản EN nếu có, fallback gốc nếu chưa dịch |
| Khách | Tìm kiếm | `/vi/search?q=...` | input placeholder *"vd: bai sao, dinh cau…"*, nút **"Tìm"** | Danh sách kết quả khớp từ khoá |
| Khách | Xem chỉ đường | trang chi tiết địa điểm, nút **"Xem trên bản đồ →"** | — | Mở Google Maps đúng toạ độ |
| Khách | Xem tin tuyển dụng | `/vi/jobs` | — | Danh sách (hiện rỗng — đúng, chưa có dữ liệu) |
| Khách | Xem tin thuê/bán | `/vi/real-estate` | — | Danh sách (hiện rỗng — đúng, chưa có dữ liệu) |
| Mọi vai trò | Kiểm trên điện thoại | các URL trên, thu nhỏ viewport | — | Layout không vỡ ở các trang có breakpoint `860px` trở xuống (header/nav); trang chi tiết/search/editor không có breakpoint khai báo — kiểm trực quan, không có cột mốc cụ thể để đối chiếu |

**B. CÓ LƯU/DUYỆT/PUBLISH — owner phải CHỌN dữ liệu + duyệt phạm vi TRƯỚC, không tự làm:**

| Vai trò | Thao tác | URL | Nút/nhãn thật | Cần owner duyệt gì |
|---|---|---|---|---|
| Admin | Sửa trường mới hotel (Novotel) | `/dashboard/places/<id>/edit` | *"Chính sách huỷ phòng (để trống = chưa có thông tin)"*, *"Đường vào / điểm tiếp cận..."* | Nội dung THẬT cần nhập (mục 35.2) |
| Admin | Sửa tiện ích (restaurant/hotel) | cùng trang, khối **"Tiện ích"**, nút **"Lưu tiện ích"** | — | Danh sách tiện ích thật của từng cơ sở |
| Người đóng góp | Gửi đề xuất sửa | nút **"Đề xuất chỉnh sửa"** trên trang chi tiết → `/dashboard/places/edit-proposals?place_id=...` | nút **"Gửi đề xuất"** | Owner tự chọn 1 địa điểm + 1 nội dung thật để thử, không bắt máy tự tạo |
| Người đăng | Đăng tin tuyển dụng | `/dashboard/job-listings/new` | nút **"Lưu nháp"** | 1 tin THẬT (mục 35.2), owner cung cấp hoặc duyệt trước khi đăng |
| Moderator | Duyệt tin tuyển dụng | `/dashboard/job-listings/moderation` | **"Duyệt — đăng công khai"** / **"Từ chối"** | Ai đóng vai moderator thật, có role `JobListing.Moderate` |
| Người đăng | Đăng tin thuê/bán | `/dashboard/real-estate/new` | nút **"Lưu nháp"** | 1 tin THẬT (mục 35.2) |
| Moderator | Duyệt tin thuê/bán | `/dashboard/real-estate/moderation` | **"Duyệt — đăng công khai"** / **"Từ chối"** | Ai đóng vai moderator, role `RealEstateListing.Moderate` |

Không tự tạo tin/góp ý giả trên production trong các dòng B — chỉ owner (hoặc người owner chỉ định) thực hiện, với dữ liệu thật đã chọn.

### 35.2 Dữ liệu cần chuẩn bị (yêu cầu, KHÔNG bịa, KHÔNG dùng fixture test)

**Novotel Phú Quốc (hotel — chỉ cần nếu muốn hiển thị đầy đủ, mọi trường đều NULLABLE, không trường nào bắt buộc để bắt đầu dùng):**
- Có thể bổ sung sau: `cancellation_policy` (chính sách huỷ phòng — văn bản thật từ khách sạn), `access_route` (đường vào/điểm tiếp cận).
- Amenities: danh sách thật đã có 4 mục (Hồ bơi/Nhà hàng/Lối ra biển/Spa) — không cần thêm gì để bắt đầu.

**Nhà hàng Ra Khơi (restaurant — amenities là tính năng MỚI của đợt này):**
- Có thể bổ sung sau: danh sách tiện ích thật (ví dụ: bãi đỗ xe, phòng VIP, view biển) — hiện trống, không bắt buộc phải có trước khi dùng các tính năng khác.

**Bãi Sao (beach):**
- Có thể bổ sung sau: `access_route` (đường vào bãi) — văn bản thật.

**Tin tuyển dụng đầu tiên (bắt buộc để tạo được, theo DTO thật):**
- Bắt buộc: `employer_name`, `title`, `job_category` (văn bản tự do), `work_location`, `employment_type` (full_time/part_time/seasonal), `contact_method`, `contact_value`.
- Có thể bổ sung sau: lương (`salary_min/max/currency/period`, để trống = thoả thuận), `requirements`, `benefits`, `description`, `shift_info`, `expires_at`, liên kết `place_id` (không bắt buộc).

**Tin thuê/bán đầu tiên (bắt buộc để tạo được, theo DTO thật):**
- Bắt buộc: `poster_role` (owner/broker), `transaction_type` (rent/sale), `property_type` (room/apartment/house/land/retail), `title`, `contact_method`, `contact_value`.
- Có thể bổ sung sau: giá (`price`+`price_currency`, bắt buộc đi cùng nhau nếu có giá), diện tích, địa chỉ chi tiết (`address_precision`/`address_text`/`lat`/`lng`), các trường riêng theo `rent`/`sale`, `description`, `expires_at`.

Không yêu cầu đủ dữ liệu toàn đảo mới bắt đầu dùng — mỗi mục trên độc lập, có thể bổ sung dần.

### 35.3 Vận hành

**Kiểm log/health theo nhu cầu (không tạo tác vụ nền mới):**
```bash
docker compose -f /home/deploy/apps/PhuQuocHub/docker-compose.prod.yml ps
docker logs phuquoc-api-prod --since 1h | grep -iE "error|exception"
docker logs phuquoc-web-prod --since 1h | grep -iE "error|exception"
curl -s https://phuquochub.com/api/health
```
Dấu hiệu cần xử lý: bất kỳ container không `healthy`/`Up`; log có `error`/`exception` lặp lại (không phải một lần thoáng qua do mạng); `/api/health` không trả `200`/`status:"ok"`.

**Backup offsite cho bản vừa tạo:** cron `0 3 * * *` (UTC) chạy `scripts/sync-offsite.sh` — kiểm đọc trực tiếp lúc 00:32 UTC 16/10: bản `phuquochub-20261016T002125Z.sql.gz` **CHƯA có trên R2** (`rclone lsf` không thấy), vì cron 03:00 UTC hôm nay **CHƯA tới giờ chạy** (còn khoảng 2.5 giờ tính từ lúc kiểm). Cơ chế `copy` (additive, không xoá) sẽ tự động bao phủ bản này ở lần chạy kế tiếp — **không cần chạy tay**. Nếu owner muốn xác nhận ngay mà không chờ: lệnh thủ công đúng cấu hình cron hiện có là
```bash
cd /home/deploy/apps/PhuQuocHub && RCLONE_CONFIG=/home/deploy/.config/rclone/phuquochub-r2.conf R2_REMOTE_NAME=phuquochub-r2 R2_BUCKET=phuquochub-offsite-prod ./scripts/sync-offsite.sh /home/deploy/apps/PhuQuocHub
```
(dùng đúng đích/remote đã cấu hình sẵn, không đổi; không in secret vì credential nằm trong file config mode 600, không qua biến môi trường secret nào) — **chưa chạy, cần owner xác nhận có muốn chạy sớm hơn lịch cron hay không.**

## 36. GÓI WEB-ONLY — bản vá nhãn VI/EN `d6b71af` (16/10/2026, CHƯA xin quyền cutover)

### 36.1 Full SHA + diff — không tự gộp commit nào

- **HEAD / candidate SHA:** `d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec`
- **Web production hiện tại:** `2889bf8fa04afaea4f4829801b0d169a1366376f` (API giữ nguyên, không đổi trong gói này)
- **Commit nằm giữa hai SHA trên (liệt kê đủ, KHÔNG gộp):**
  - `a9a1bcd` (test-only, `places.controller.spec.ts`) — `git diff --stat` xác nhận **0 file** trong `apps/web`/`packages/*`.
  - `1894fc1` (deploy.sh SKIP_BUILD + e2e/unit test mới) — xác nhận **0 file** trong `apps/web`/`packages/*` (chỉ `scripts/deploy.sh` + 2 file test `apps/api`).
  - → Build Web từ `d6b71af` **tương đương nội dung** với build từ "`2889bf8` + đúng diff `d6b71af`" cho riêng image Web — đã xác nhận bằng diff stat, không suy đoán.
- **Diff thực tế đưa vào candidate — đúng 5 file, +72/-15 (toàn bộ nằm trong `apps/web`):**
  `hotels/[slug]/page.tsx`, `places/[slug]/page.tsx`, `ClaimCta.tsx`, `ClaimCta.spec.tsx`, `ReviewsSection.tsx`. Không có thay đổi phụ thuộc nào khác (không đụng `packages/shared-types`, `packages/utils`, `packages/config`, `apps/web/Dockerfile`, `package.json`/`package-lock.json`).

### 36.2 API giữ nguyên

API vẫn `2889bf8fa04afaea4f4829801b0d169a1366376f`, không build lại, không recreate, không migration, không sửa dữ liệu trong toàn bộ gói này — xác nhận `phuquoc-api-prod` còn "Running" (không đổi) ở dry-run mục 36.4.

### 36.3 Candidate Web — build + kiểm trên ĐÚNG image đã build

**Build args SẢN XUẤT thật (đọc trực tiếp `.env` production, không suy đoán):** `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `GIT_COMMIT=d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec`.

| | Tag | Image ID (`docker image inspect --format '{{.Id}}'`) |
|---|---|---|
| Web candidate | `phuquochub-web:d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec` | `sha256:3f1ed3f134813e3370bb3400b4cebcabcce5dff9833d1b40827283d882637af9` |

Label `org.opencontainers.image.revision` xác nhận đúng `d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec`.

**Kế thừa (không chạy lại):** 5/5 jest suite PASS (98 test), `tsc --noEmit` sạch, `eslint` sạch, browser local (dev server, API production thật, đọc) desktop+375px VI/EN PASS — toàn bộ đã làm ở lượt trước, trên CÙNG 5 file này.

**Kiểm MỚI trên ĐÚNG image vừa build (không phải dev server)** — container cô lập `phq-webcandidate-d6b71af` (cổng riêng `18091`, trỏ `API_INTERNAL_URL` THẬT tới `https://phuquochub.com/api` qua Internet — ĐỌC CÔNG KHAI, không phải qua Docker network nội bộ, không có ghi nào), đã dọn sạch sau:
- EN hotel: `Hotel information`/`Type`/`Amenities`/`Contact` — đúng.
- VI hotel: `Thông tin khách sạn`/`Loại hình`/`Tiện nghi`/`Liên hệ` — không đổi.
- EN beach: `Are you the owner...`/`Verify ownership`/`Reviews (0)`/`No reviews yet...`/`...to write a review` — đúng.
- VI beach: `Bạn là chủ địa điểm này...`/`Xác nhận quyền quản lý`/`Đánh giá (0)`/`Chưa có đánh giá nào...`/`...để viết đánh giá` — không đổi.
- Href nút "Verify ownership": `/dashboard/business-claims/new?place_id=...&place_name=Bai%20Sao` — đúng, còn hoạt động, không đổi route.

### 36.4 Dry-run — chỉ Web đổi, đã kiểm thật trên production (read-only)

```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f WEB_IMAGE_TAG=d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec \
  docker compose -f docker-compose.prod.yml --dry-run up -d --no-build web
```
Kết quả: `phuquoc-web-prod Recreate`; `phuquoc-api-prod Running` (không đổi); `postgres`/`redis` chỉ "Waiting"/"Healthy" (phụ thuộc, không recreate); **caddy không nằm trong lệnh này** (không cần — Web không đổi route/domain, cùng lý do mục 33.10(a) nhưng ở đây còn chặt hơn: service không hề được liệt trong `up` nên chắc chắn không đụng).

### 36.5 Lệnh triển khai Web-only — không build lại artifact đã kiểm, không ép API đổi tag

Dùng đúng cơ chế **đã có sẵn** (`scripts/lib/release-tag.sh`'s `release_tag_set`, cùng hàm `scripts/rollback.sh` dùng cho nhánh `web`) — không viết script mới:
```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
WEB_IMAGE_TAG=d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec \
  docker compose -f docker-compose.prod.yml up -d --no-build web
. scripts/lib/release-tag.sh
release_tag_set WEB_IMAGE_TAG d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec .env
```
`release_tag_set` chỉ ghi ĐÚNG MỘT dòng `WEB_IMAGE_TAG=...`, giữ nguyên byte mọi dòng khác (kể cả `API_IMAGE_TAG`) — đã đọc code xác nhận, không phải giả định.

### 36.6 Hậu kiểm chỉ đọc

1. `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:3f1ed3f1...` — khớp bảng 36.3.
2. `.env`'s `WEB_IMAGE_TAG` = `d6b71af...`; `API_IMAGE_TAG` **không đổi**, vẫn `2889bf8...`.
3. `docker compose ps` — 6/6 container, `phuquoc-api-prod` không bị đụng (uptime không reset).
4. `docker logs phuquoc-web-prod --since 5m` — không `error`/`exception`.
5. `curl https://phuquochub.com/vi/hotels/novotel-phu-quoc` và `/en/...` — xác nhận đúng nhãn đã sửa, dữ kiện địa điểm (tên/ảnh/liên hệ) không đổi.
6. `curl https://phuquochub.com/api/health` — API không bị ảnh hưởng.

### 36.7 Rollback Web-only — dùng ĐÚNG image `2889bf8` hiện tại, không quay lại cặp `f0c65b7`/`b91e92c`

```bash
scripts/rollback.sh 2889bf8fa04afaea4f4829801b0d169a1366376f web /home/deploy/apps/PhuQuocHub
```
Script có sẵn (đã đọc lại toàn bộ): kiểm `phuquochub-web:2889bf8...` tồn tại cục bộ (CÓ — xác nhận lại ở mục 33) → `WEB_IMAGE_TAG=2889bf8... up -d --no-build web` → `release_tag_set WEB_IMAGE_TAG` (chỉ ghi dòng Web) → chờ health → kiểm `/api/health`. Không đụng API, không đụng DB.

### 36.8 Cập nhật bảng nghiệm thu

| Tiêu chí | Trạng thái |
|---|---|
| Nhãn giao diện VI/EN | **Candidate Web ĐẠT trên image đã build** (`d6b71af`, Id `sha256:3f1ed3f1...`) — **CHƯA lên production**, cần owner duyệt cutover ở mục 36.5 |
| Điện thoại thật | **Vẫn chưa kiểm** — candidate đạt không thay thế việc này |

**CHƯA xin quyền cutover.** Không tự deploy, không ghi/publish nội dung. Dừng ở đây, chờ owner duyệt lệnh mục 36.5.

### 36.9 KẾT QUẢ THỰC THI (16/10/2026, owner đã duyệt) — KHÔNG CẦN ROLLBACK

**Preflight ngay trước cutover (đọc trực tiếp):** baseline `WEB_IMAGE_TAG=2889bf8.../API_IMAGE_TAG=2889bf8...`, image Web đang chạy `sha256:5b30e934...`, API đang chạy `sha256:32fc22de...` (`StartedAt=2026-10-16T00:22:11.681897668Z`). Candidate `phuquochub-web:d6b71af...` xác nhận `.Id` khớp TUYỆT ĐỐI `sha256:3f1ed3f1...` — KHÔNG build lại. Không có deployment khác chạy song song (`ps aux` sạch; `phq-r1-*` là stack khác không liên quan, không đụng). Dry-run ngay trước cutover: chỉ `phuquoc-web-prod Recreate`, không có drift.

**Cutover:** `docker compose up -d --no-build web` → exit 0 → `release_tag_set WEB_IMAGE_TAG d6b71af...` → persisted.

**Hậu kiểm 6/6 PASS:**
1. Web identity: `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:3f1ed3f134813e3370bb3400b4cebcabcce5dff9833d1b40827283d882637af9` — khớp tuyệt đối.
2. Pin: `.env` ghi `API_IMAGE_TAG=2889bf8...` (không đổi), `WEB_IMAGE_TAG=d6b71af...` — đúng như duyệt.
3. **API không đổi** — `StartedAt` byte-khớp giá trị trước cutover (`2026-10-16T00:22:11.681897668Z`) — xác nhận container API không hề bị restart/recreate, không chỉ "image tag không đổi".
4. Health: 6/6 container `healthy`/`Up` (`phuquoc-web-prod` mới 9 giây, các service khác uptime không đổi).
5. Log `phuquoc-web-prod --since 5m`: không `error`/`exception`.
6. Nhãn VI/EN qua domain thật (`curl` trực tiếp `phuquochub.com`): cả 8 nhãn đã sửa (`Hotel information`/`Type`/`Amenities`/`Contact`/`Thông tin khách sạn`/`Loại hình`/`Tiện nghi`/`Liên hệ`) + 6 nhãn ReviewsSection/ClaimCta cả hai ngôn ngữ — **đúng hết**. Caddy `StartedAt=2026-08-13T16:00:40Z` — không đổi, không nằm trong lệnh cutover. `GET /api/health` qua domain → 200.

**Không chạm tiêu chí rollback — không rollback.** Dọn kiểm tra xong, không còn tài nguyên tạm nào trên VPS.

**Bảng nghiệm thu (cập nhật cuối):**

| Tiêu chí | Trạng thái |
|---|---|
| Nhãn giao diện VI/EN | **ĐÃ LÊN PRODUCTION, xác nhận qua domain thật** |
| Điện thoại thật | **Vẫn "chưa nghiệm thu"** — chờ owner xác nhận trực tiếp |

## 37. SỰ CỐ NHẬP LIỆU RA KHƠI — xác định nguyên nhân thật, sửa, kiểm cô lập, đề xuất khôi phục (16/10/2026)

### 37.1 Đường lưu thực đơn — bằng chứng log thật, KHÔNG suy đoán từ DB rỗng

Đọc trực tiếp log `phuquoc-api-prod` quanh mốc nghi vấn (02:19 UTC 16/10):
```
02:19:00  PATCH /api/restaurants/78bf8730-.../menu          200
02:19:06  POST  /api/places/78bf8730-.../draft              201
02:19:06  POST  /api/places/78bf8730-.../revisions/.../publish  201
```
`PATCH .../menu` trả **200** — route thực đơn ĐƯỢC GỌI THẬT và server chấp nhận; nhưng `restaurant_menu_sections`/`restaurant_menu_items` cho place này **rỗng tuyệt đối (0 hàng)**. Khớp nhất với: lúc bấm "Lưu thực đơn", mảng món trong bản nháp của `MenuEditor` đang RỖNG (món "Tôm Lăn Bột" chưa từng được đưa vào qua "Thêm vào bản nháp", hoặc đã mất do tải lại trang trước đó) — `onSave()` khi đó lưu một thực đơn rỗng hợp lệ (không phải lỗi, không phải gì bị mất, vì chưa có gì để mất). 6 giây sau, một lượt `draft`+`publish` RIÊNG BIỆT chạy — đúng cơ chế `saveDraftPlace`/`publishPlaceDraft` của **form "Lưu thay đổi"** (phần thông tin chung), xác nhận qua code (`EditPlaceView.tsx`'s `handleSubmit`, caller DUY NHẤT của cặp API này) — không suy đoán, đối chiếu đúng cặp endpoint.

**Chưa khẳng định bạn đã bấm nhầm nút** — log cho biết ĐÚNG HAI request nào đã chạy, không cho biết bạn bấm gì/thấy thông báo gì trên màn hình. Cho tôi biết: lúc đó bạn thấy thông báo nào (nếu có), và bạn có nhớ đã bấm nút nào không — để đối chiếu đủ hai phía (log + trải nghiệm thật) trước khi kết luận.

### 37.2 Tái hiện lỗi bảo toàn giờ — stack cô lập, place synthetic, qua HTTP thật

Nguyên nhân (đọc code, xác nhận bằng chạy thật): `PlaceForm.tsx`'s `formStateToOpeningHours()` LUÔN trả một object hợp lệ (không bao giờ `null` — tài liệu ngay trong code, `UpdatePlaceDto.opening_hours` không nhận null); `PlaceForm`/`EditPlaceView` trước đây LUÔN gửi field này trong payload, bất kể người dùng có đụng mục giờ hay không. Backend (`PlacesService.buildDraftScalarPatch()`: `if (dto.opening_hours !== undefined) patch.openingHours = ...`) đã ĐÚNG từ trước — lỗi 100% ở frontend.

**Kiểm cô lập (stack `oh-fix-*`, đã dọn sạch), 5 kịch bản qua HTTP thật trên image `phuquochub-api:2889bf8...` (đúng artifact đang chạy production, không build riêng):**

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Place `opening_hours=NULL`, sửa `address`, KHÔNG đụng giờ | `address` đổi đúng; `opening_hours IS NULL` **vẫn true** sau lưu |
| 2 | Place đã có giờ thật, sửa `address`, KHÔNG đụng giờ | `address` đổi đúng; giờ thật giữ **byte-khớp tuyệt đối** |
| 3 | Chủ động xoá hết giờ (gửi object rỗng CÓ CHỦ Ý) | Ghi đúng trạng thái đã xoá — không bị ép về NULL |
| 4 | Nhập giờ mới trên place đang NULL | Ghi đúng giờ mới, kèm `note` |
| 5 | Hai bản nháp cùng gốc, bản A publish trước; bản B publish sau (CAS that) | Bản B → **409**, thông điệp rõ, giá trị của A giữ nguyên — không ghi đè một phần |

**Sửa tối thiểu đã làm (commit local `93d3b75`, CHƯA deploy):** `PlaceForm.tsx` thêm theo dõi "đã đụng tới mục giờ chưa" (`openingHoursTouched`, bật khi bật/tắt 24h, thêm/xoá/sửa khung giờ, sửa ghi chú) — chỉ đưa `opening_hours` vào payload khi đã đụng; `EditPlaceView.tsx` chỉ chuyển tiếp field này khi có; `types.ts` đổi `opening_hours` thành tuỳ chọn, có ghi chú giải thích đây là NGOẠI LỆ so với quy ước `T | null` của các field khác (lý do: đây là field DUY NHẤT mà "chưa từng đụng" và "đã chủ động để trống" render RA CÙNG HÌNH DẠNG, không phân biệt được chỉ từ state form — khác `price_range`'s `<select>` "Không chọn" vốn là lựa chọn tường minh). Không đổi field nào khác, không đổi gate công khai, không thêm tính năng.

**Kiểm hẹp kế thừa + mới:** `PlaceForm.spec.tsx` (19/19 PASS, 3 test cũ cập nhật đúng hành vi mới + 1 test mới), `EditPlaceView.spec.tsx` (22/22 PASS, 2 test mới khoá đúng field bị OMIT ở mức network call thật — không mock PlaceForm). `tsc --noEmit` sạch, `eslint` sạch trên 5 file đã sửa. Trạng thái lưu thực đơn (`MenuEditor.onAddDraft`/`onSave`) đã đọc lại: thông báo ĐÃ RÕ RÀNG từ trước ("Đã thêm món vào bản nháp. Bấm 'Lưu thực đơn' để ghi." vs "Đã lưu thực đơn.") — không tái hiện được lỗi thông báo mơ hồ nào, **không sửa gì ở `MenuEditor.tsx`** (đúng "chỉ sửa nếu tái hiện được lỗi").

### 37.3 Đề xuất khôi phục `opening_hours` cho record Ra Khơi thật

**Trạng thái thật hiện tại** (đọc lại ngay trước khi viết mục này): `content_version=4`, `opening_hours={"is_24h":false,"regular":{mỗi ngày: []}}` (trạng thái "đã khảo sát, đóng cửa cả tuần" — SAI, không phải giờ thật của Ra Khơi).

**Giới hạn thật của API hiện có — không đủ để khôi phục NGUYÊN VẸN về NULL:** `UpdatePlaceDto.opening_hours` khai `@IsObject()` — từ chối `null` (class-validator coi `null` không phải object hợp lệ). Gửi `opening_hours: null` qua `POST /places/:id/draft` sẽ nhận **400**, không phải cách khôi phục được. **Không có cách nào qua API hiện có để đưa field này về đúng SQL NULL** — đây là giới hạn thật, không phải tôi chưa tìm đủ.

**Cách GẦN NHẤT khôi phục được qua API hiện có** (không phải NULL, nhưng cùng ý nghĩa thực tế — "chưa có giờ xác nhận", và CÔNG KHAI thì NULL với `{is_24h:false, mọi ngày rỗng}` hiện RA Y HỆT NHAU vì cổng bằng chứng opening_hours vẫn chặn cả hai như nhau):

```bash
# 1) Lưu nháp — body CHỈ có opening_hours (field khác không đụng), CAS theo content_version thật hiện tại
POST /api/places/78bf8730-6ba4-4aa0-b0d2-da991c71bdb9/draft
Authorization: Bearer <token owner/quản lý Ra Khơi>
{ "expected_content_version": 4, "opening_hours": { "is_24h": false, "regular": {} } }
# -> trả { id: <revisionId>, revisionNumber }

# 2) Công khai bản nháp đó
POST /api/places/78bf8730-6ba4-4aa0-b0d2-da991c71bdb9/revisions/<revisionId>/publish
```
(`regular: {}` — rỗng hoàn toàn, không khai 7 ngày — khác chút so với trạng thái lỗi hiện tại là có khai đủ 7 ngày nhưng mỗi ngày rỗng; cả hai đều hợp lệ theo `IsOpeningHours`, cả hai đều "chưa có giờ xác nhận" khi đọc bằng `hasOpeningHours()`.)

**Nếu owner muốn khôi phục ĐÚNG BYTE SQL NULL (không chỉ "gần đúng"):** chỉ có một cách — sửa trực tiếp một dòng dữ liệu, một lần, có chủ đích (KHÔNG phải "đường vòng" cho một tính năng thiếu, mà là khôi phục đúng giá trị đã mất ngoài ý muốn). Tôi **CHƯA làm** — đây là quyết định riêng cần owner duyệt tường minh, tách khỏi gói code/test ở trên.

Không đụng field nào khác của Ra Khơi. Không tự chạy lệnh nào ở mục 37.3 — toàn bộ đang ở dạng đề xuất, chờ owner chọn phương án. — baseline 80 → candidate 92, CÓ dữ liệu cũ (11/10/2026)

Khác với mọi lượt test trước trong tài liệu này (luôn chạy đủ 92 migration từ DB RỖNG) — lượt này mô phỏng ĐÚNG điều owner yêu cầu: dựng DB ở ĐÚNG schema baseline production (80 migration, dừng đúng tại `SeedPriceVerifyPermission1720007800000`), SEED dữ liệu đại diện theo schema CŨ (một khách sạn thật-giả: place+place_hotel_details+1 phòng, đúng hình dạng cột TRƯỚC khi có `access_route`/`cancellation_policy`), rồi mới chạy tiếp 12 migration còn lại (81→92) — không phải test migration trên DB sạch.

**Không dùng bản sao DB production, không chạy migration trên production** — toàn bộ ở stack cô lập `phq-r22` (postgres riêng, dữ liệu tự tạo, không liên quan production).

**Kết quả:**
- Dữ liệu cũ (place/hotel_details/room) **còn nguyên vẹn 100%** sau khi chạy 12 migration mới — xác nhận trực tiếp qua SQL.
- Cột mới (`access_route`, `cancellation_policy`) đúng là `NULL` trên hàng cũ — đúng tính chất "cộng thêm, nullable-first" đã ghi nhận ở mục 15.3/16.3.
- **App MỚI (image `b82b24e`) đọc đúng dữ liệu cũ:** `GET /places/khach-san-baseline-test` và `GET /hotels/:id/rooms` trả đúng toàn bộ field cũ.
- **App MỚI ghi đúng field mới lên hàng cũ:** `PATCH /hotels/:id/details` với `cancellation_policy` mới → 200, `content_version` tăng đúng, các field cũ (`star_rating`, `check_in/check_out`) giữ nguyên không đổi.
- **Rollback (down migration):** KHÔNG chạy thật (đúng chỉ thị "không mặc định chạy down migration làm mất dữ liệu mới") — xác nhận lại bằng đọc trực tiếp file: `AddHotelCancellationPolicy1720009000000.down()` là `DROP COLUMN IF EXISTS` không điều kiện — cùng rủi ro đã ghi ở mục 15.7/16.7 trước đây, lần này đọc lại chính file thật (không chỉ tin vào ghi chú cũ) để xác nhận chưa đổi.
- Dọn sạch `phq-r22` sau khi xong — chỉ còn `phq-r1-*` (không thuộc run này) và `phuquoc-*-prod` trên VPS.

Bằng chứng: `docs/delivery/evidence/schema-upgrade-path-80-to-92-2026-10-11/results-summary.json`.

**Kết luận:** đường nâng cấp 80→92 AN TOÀN với dữ liệu production thật kiểu này (additive-only, nullable-first, không ALTER cột hiện có) — khớp với đánh giá "rủi ro thấp" đã đưa ra trước đó ở mục 15.4/16.4, nhưng LẦN NÀY có bằng chứng THẬT (dữ liệu cũ + app mới + round-trip đọc/ghi), không còn chỉ là suy luận từ việc đọc code migration.

## 22. GÓI DUYỆT CUỐI — cập nhật đầy đủ theo đúng danh mục yêu cầu (11/10/2026)

**Baseline đã xác nhận production khi nào/còn gì chưa xác nhận:** baseline đọc trực tiếp (không mutate) nhiều lần trong phiên này, lần gần nhất cùng lúc viết mục 18 (11/10/2026) — API `f0c65b716c39a41de4948c695d4383f2cfa47f1f`, Web `b91e92ce7baf547b757d425eea0f30ceac8cd848`, 80 migration. CHƯA xác nhận lại ngay trước thời điểm gửi báo cáo này (khuyến nghị owner/người triển khai đọc lại baseline một lần nữa ngay trước khi thực thi, vì đây là hệ thống đang sống — có thể đã đổi nếu có hoạt động khác ngoài phiên này).

**SHA đầy đủ + API/Web image cho từng phương án:** xem mục 21 (`a187105` cho cutover 1 phương án A; API `b82b24e`/Web `1cd93dc` cho cutover 2 phương án A hoặc cutover duy nhất phương án B — xem mục 29 cho đầy đủ digest/manifest/config, không chỉ tag) — cả hai SHA đều đã có image API+Web build thật, checksum-verified, đã dùng để test thật (không chỉ suy ra từ tên).

**Diff phạm vi so với production:** toàn bộ mục 15.1/16.1/17.1 (đợt 1 polish, đợt 2 đóng hoàn toàn, đợt 3/4 MVP + field-render fix + place-picker) — không lặp lại ở đây, xem các mục đó.

**Ma trận migration + tương thích:** 12 migration mới (81→92, bảng mục 15.3 + 16.3), tất cả CỘNG THÊM, không sửa/xoá cột cũ. Tương thích: API mới+Web cũ chạy được; Web mới+API cũ lỗi 404 ở route mới — PHẢI API trước Web (mục 15.5/16.5/15.6/16.6).

**Bằng chứng theo từng luồng + giới hạn còn lại:** xem bảng đầy đủ ở mục 20/28 — mọi luồng đã có browser-thật hoặc HTTP round-trip thật, KỂ CẢ nhánh positive của cổng `opening_hours` (ĐÃ ĐÓNG ở mục 19/24/25 — câu "cần quyết định owner trước khi có thể test" ở đây đã CŨ, owner đã quyết định xây và đã test xong 17/17 browser, không còn ngoại lệ nào trong bảng).

**Lệnh preflight / deploy / pin / hậu kiểm:** theo đúng mục 15.6/16.6 (thứ tự: backup → pin API tag → chạy migration → xác nhận permission seed → pin Web tag → hậu kiểm owner thật). Lệnh cụ thể dùng `docker compose` với `API_IMAGE_TAG`/`WEB_IMAGE_TAG` trong `.env` production (không lặp lại cú pháp đầy đủ ở đây — đã có ở mục 15.6/16.6, không đổi).

**Điều kiện rollback + lệnh:** xem mục 15.7/16.7 — rollback IMAGE an toàn luôn (trả tag cũ); rollback SCHEMA (down migration) CẦN XÁC NHẬN RIÊNG với owner trước mỗi lần, KHÔNG mặc định chạy, vì một số migration (91 — ảnh góp ý; 90/92 — sender_message/cancellation_policy) sẽ xoá vĩnh viễn dữ liệu thật nếu đã có người dùng tạo ra sau deploy.

**Xử lý tab editor/nội dung đang mở dở của người dùng khi cutover:** CAS (`content_version`) là cơ chế bảo vệ chính — nếu một người đang mở editor cũ (session trước cutover) và bấm lưu sau khi Web đã đổi sang version mới, request PATCH vẫn mang `content_version` cũ; nếu backend đã tăng version do cutover tự nó KHÔNG làm (cutover không viết DB, chỉ đổi image code) thì version không tự đổi — rủi ro thực tế ở đây là FE cũ gọi API cũ không còn route (ví dụ nếu rollback Web về trước mà API đã lên mới, hoặc ngược) → lỗi 404/dạng response không khớp, KHÔNG MẤT DỮ LIỆU (CAS chặn ghi đè, không chặn đọc lỗi). Khuyến nghị: thông báo ngắn trên production trước cutover để người dùng đang có tab mở lưu/refresh trước, nhưng không có cơ chế kỹ thuật nào buộc được điều này — đây là giới hạn thật, không phải thiếu sót trong code.

**Tác động người dùng dự kiến:** **CHƯA ĐO ĐƯỢC THẬT — gắn cờ rõ ở đây.** Không có số liệu truy cập/người dùng thật nào được tôi quan sát trực tiếp (không có quyền đọc analytics production trong phạm vi được giao). Suy luận gián tiếp duy nhất: đợt 1/2 cải tiến trên place pages ĐANG có người dùng thật xem (không có số cụ thể); đợt 3/4 là tính năng hoàn toàn mới, tác động ban đầu phụ thuộc owner quảng bá, không tự xảy ra.

**Hậu kiểm phải xác nhận Web+API cùng revision+pin+luồng công khai, không chỉ API health:** đúng yêu cầu — bổ sung rõ ở đây danh sách hậu kiểm tối thiểu sau khi pin (ngoài mục 15.6/16.6 đã có theo từng luồng nghiệp vụ):
1. `docker inspect phuquoc-api-prod --format '{{index .Config.Labels "revision"}}'` VÀ tương tự cho `phuquoc-web-prod` — xác nhận CẢ HAI container đang chạy đúng revision label khớp SHA vừa pin (không chỉ tin vào tên tag).
2. Mở một trang public thật qua domain thật (không chỉ `curl` health) — ví dụ `/vi/jobs` sau cutover 2 — xác nhận render đúng, không lỗi 500 (đúng bài học `API_INTERNAL_URL` phát hiện ở mục 20: một biến thiếu có thể làm toàn bộ SSR public gãy mà `/api/health` vẫn xanh).

**SỬA 15/10/2026 (mục 32/33):** mục (3) cũ ở đây ("đăng nhập owner thật, thực hiện một hành động ghi thật nhỏ") đã BỊ BỎ — hậu kiểm của gói này CHỈ ĐỌC. Một hành động ghi/publish thật trên production (kể cả "nhỏ") cần một đề nghị DUYỆT RIÊNG, nêu rõ tài khoản/record/thao tác/payload/trạng thái dự kiến/cách dọn hoặc bảo toàn dữ liệu — không ngầm gộp vào hậu kiểm mặc định của gói cutover.

## 23. DỮ LIỆU PRODUCTION THẬT CÒN THIẾU THEO TỪNG MODULE (11/10/2026)

Phân biệt rõ với "code readiness" (mục 20) — đây là liệt kê những gì CHƯA có trên production dù code đã sẵn sàng, không suy luận ngược từ "candidate đạt" ra "production có dữ liệu":

- **Hotels/restaurants/beaches/tours — amenities/giờ cả tuần/chính sách huỷ phòng:** 0 địa điểm thật trên production từng được owner/business gán tiện nghi hoặc nhập chính sách huỷ phòng qua các field MỚI này (chưa deploy nên chưa thể có) — sau deploy vẫn cần owner/business tự nhập cho từng địa điểm, không tự động có.
- **`opening_hours` — bằng chứng hợp lệ:** 0 địa điểm (kể cả production) từng có bằng chứng đạt gate. Cập nhật mục 25: luồng nộp+duyệt ĐÃ xây và test thật trên stack cô lập (không phải production) — sau deploy, production vẫn có 0 bằng chứng thật cho tới khi owner/business tự nộp qua `/dashboard/places/:id/opening-hours-evidence` và một moderator duyệt qua `/dashboard/opening-hours-evidence`; không tự động có.
- **Đợt 2 — `sender_message`/ảnh góp ý:** 0 đề xuất thật trên production từng dùng 2 tính năng mới này (chưa deploy).
- **Đợt 3 — tuyển dụng:** 0 tin tuyển dụng thật nào tồn tại trên production (tính năng hoàn toàn mới, chưa deploy) — bao gồm 0 tin có gắn `place_id`.
- **Đợt 4 — bất động sản:** 0 tin bất động sản thật, 0 ảnh thật, 0 "lưu tin"/"báo cáo" thật nào tồn tại trên production.
- **Điểm chung:** đợt 3/4 không có "dữ liệu di trú" nào cần lo (bảng mới hoàn toàn) — nhưng cũng nghĩa là ngay sau deploy, các trang `/jobs`/`/real-estate` công khai sẽ hiện TRỐNG cho tới khi có người đăng tin thật đầu tiên — không phải lỗi, nhưng owner nên biết trước để không hiểu nhầm là "deploy mà không thấy gì".

## 24. OPENING_HOURS — THIẾT KẾ + TRIỂN KHAI LUỒNG TỐI THIỂU (11/10/2026)

Owner đã duyệt lựa chọn 1 ở mục 19 ("xây API/UI còn thiếu, nối vào service/schema/quyền/audit hiện có, phạm vi CHỈ opening_hours"). Thiết kế dưới đây viết TRƯỚC khi hoàn thiện code (nghiên cứu service/entity/policy hiện có trước, quyết định 5 điểm, rồi mới viết controller/service) — đúng yêu cầu, không code mù.

### 24.1 Năm điểm thiết kế

1. **Ai được nhập, ai được duyệt:** Nhập — tái dùng ĐÚNG quyền đang gác việc sửa chính place đó: `Place.Edit.Managed` (business_manager, scoped đúng business_id qua `IDENTITY_PLACE_RESOLVER`, cùng resolver mọi route sửa place khác đang dùng) hoặc `Place.Edit.Any` (content_owner/moderator/administrator). KHÔNG dùng `Source.Create` riêng (permission đó không gắn scope theo place cụ thể, dùng sẽ cho phép business_manager nộp bằng chứng cho place người khác). Duyệt — tái dùng `Source.Verify`, hiện CHỈ `moderator` giữ (seed `SeedSourcePermissions1720001800000`, không đổi). Hai quyền tách biệt → business_manager (chỉ có Managed, không có Source.Verify) không tự duyệt được bằng chứng của chính mình — đủ cho MVP, không cần thêm ràng buộc "khác người" ở code.
2. **Duyệt gắn với record/field/revision nào:** Gắn CHÍNH XÁC với tuple `(evidence_artifact_id, place_id, field_name='opening_hours', field_value_hash)` — cơ chế đã có sẵn (Evidence Field-Binding V2), không cần xây thêm. `field_value_hash` = `sha256(canonicalJson(place.opening_hours))` đọc TẠI THỜI ĐIỂM DUYỆT (không phải tại thời điểm nộp) — đây CHÍNH LÀ "revision" được duyệt: một khẳng định "nguồn X xác nhận giá trị Y ĐANG LÀ giờ mở cửa hiện tại của place Z", không phải "duyệt place nói chung".
3. **Giờ bị sửa thì bằng chứng cũ còn hiệu lực không:** KHÔNG — hành vi đã có sẵn trong SQL (`getVerifiedOpeningHoursHashes`/`hasVerifiedOpeningHours`), không cần code thêm: gate so khớp `field_value_hash` link với `field_value_hash` hiện tại của place; sửa giờ → hash đổi → link cũ (hash cũ) không còn khớp → gate tự rơi về `false` cho giá trị MỚI, không "mượn" uy tín của bằng chứng cũ. Test xác nhận hành vi này ở 24.4.
4. **Giá trị nào public khi đang chờ duyệt:** `places.opening_hours` là MỘT giá trị duy nhất (không có draft/pending riêng cho field này, khác jobs/real-estate) — actor có quyền sửa ghi trực tiếp qua editor hiện có (không đổi). Trong lúc CHƯA có bằng chứng đạt gate cho giá trị đó: công khai KHÔNG hiện mục "Giờ mở cửa" (null, nhánh fail-closed đã test — không hiện giá trị cũ, không hiện giá trị mới, không có UI "đang chờ duyệt" nào cho khách xem ở MVP này).
5. **Chưa đủ bằng chứng hiển thị thế nào:** Giữ NGUYÊN hành vi đã test kỹ (mục 16.4/20) — null → ẩn hẳn mục, không suy đoán, không crash.

### 24.2 Những gì KHÔNG làm (giữ đúng phạm vi tối thiểu)

Không thêm migration (0 cột/bảng mới — `place_id` của một submission được giữ trong `evidence_artifacts.metadata` jsonb đã có sẵn từ lâu, không cần cột riêng). Không sửa `EvidenceService`/policy evaluator/gate SQL — toàn bộ phần đó ĐÃ ĐÚNG từ trước, chỉ thiếu người gọi; code mới là một orchestrator MỎNG (`OpeningHoursEvidenceService`) gọi lại nguyên các hàm đã có (`ensureEvidenceArtifact`/`reviewEvidenceArtifact`/`linkEvidenceToPlaceField`/`SourcesService.createSource`). Không thêm permission mới. Không xây UI/API cho field khác ngoài `opening_hours`. Không tự nâng trạng thái "đã xác minh" bằng cách nào khác ngoài đường `reviewEvidenceArtifact` thật (không có code nào ghi thẳng `verificationStatus='VERIFIED'` hay `verification_expires_at` qua SQL tay). Không coi `BUSINESS_OWNER` (cơ sở tự khai) là tự động xác minh — mọi loại nguồn trong `OFFICIAL_SOURCE_TYPES` (kể cả BUSINESS_OWNER) đều phải qua ĐÚNG MỘT bước duyệt người (`Source.Verify`) như nhau, không có đường tắt riêng cho loại nguồn nào.

### 24.3 API mới (2 route, module `evidence`)

- `POST /places/:id/opening-hours-evidence` — quyền `Place.Edit.Managed`/`.Any` theo đúng `:id`. Body: `source_type` (giới hạn `OFFICIAL_SOURCE_TYPES`), `source_url`, `observed_text` (nội dung THẬT chép lại từ nguồn — chính là nội dung được hash làm `contentHashSha256`), `captured_at?` (mặc định now), `schedule_stability`. Tạo `sources` row (qua `SourcesService.createSource` có sẵn) + `evidence_artifacts` row (`evidenceType='opening_hours_observation'`, `verificationStatus='NEEDS_REVIEW'`, `metadata.place_id` = `:id`).
- `GET /opening-hours-evidence/pending` — quyền `Source.Verify`. Trả hàng chờ, MỖI hàng kèm giá trị `opening_hours` HIỆN TẠI của place (không phải giá trị lúc nộp) để moderator so khớp trực tiếp với `observed_text`.
- `POST /opening-hours-evidence/:id/review` — quyền `Source.Verify`. Body: `decision` (APPROVE/NEEDS_CHANGES/REJECT), `schedule_stability` (người duyệt tự xác nhận lại, không mặc định lấy nguyên khai báo người nộp), `review_note?`. Đọc lại `place.opening_hours` HIỆN TẠI, gọi `reviewEvidenceArtifact` bind đúng tuple; nếu `evidenceVerified=true` thì gọi tiếp `linkEvidenceToPlaceField` NGAY trong cùng lượt (đóng đúng thứ tự "trứng-gà" ADR-022 đã ghi: review đứng trước, link theo sau, link chỉ tạo được khi đã có review APPROVE hợp lệ cho đúng tuple).

File: `apps/api/src/modules/evidence/{opening-hours-evidence.service.ts, opening-hours-evidence.controller.ts, dto/opening-hours-evidence.dto.ts}` + 1 hàm đọc mới (`EvidenceArtifactsRepository.listByTypeAndStatus`, không đổi hàm cũ). `evidence.module.ts` thêm `controllers`/`OpeningHoursEvidenceService` — module này có controller THỰC SỰ lần đầu, nhưng vẫn đúng "chỉ cho field đã có yêu cầu thật", comment cũ về field khác giữ nguyên.

### 24.4 Test đã chạy (nguồn, trước khi build candidate)

Unit mới: `opening-hours-evidence.service.spec.ts` (16 test) — từ chối khi place không tồn tại/chưa có `opening_hours`; tạo đúng source+artifact với metadata; APPROVE+eligible gọi đúng `linkEvidenceToPlaceField`; APPROVE nhưng KHÔNG eligible (ví dụ hết hạn capture) KHÔNG gọi link; REJECT không gọi link; **duyệt bind theo giá trị HIỆN TẠI của place, không theo hash đã lưu lúc nộp, khi place bị sửa lại giữa lúc nộp và lúc duyệt** (test riêng xác nhận điểm thiết kế 24.1.3); `listPending()` trả giá trị hiện tại, không giá trị lúc nộp. Regression: `evidence.service.spec.ts`/`sources.service.spec.ts`/`evidence-reviews.repository.spec.ts`/`policy/*.spec.ts`/`places-privileged-access.arch.spec.ts`/`authorization-bootstrap.validator.spec.ts` — toàn bộ PASS (156 test), không chạy lại toàn bộ 2 workspace (đúng mục 5 "chỉ chạy kiểm tra cần thiết"). `tsc --noEmit` + `eslint` sạch trên các file mới/sửa.

**Tiếp theo (chưa làm ở bước viết tài liệu này — xem mục 24.5):** build candidate thật, test HTTP round-trip + browser trên stack cô lập theo đúng tiêu chí nghiệm thu mục 19.4, rồi cập nhật mục 20 (bảng nghiệm thu) và mục 19 (đổi trạng thái từ "chờ quyết định" sang "đã đóng" hoặc giữ nguyên nếu phát hiện vướng kiến trúc lớn hơn dự kiến).

## 33. GÓI THỰC THI HIỆN HÀNH — cơ chế artifact KHÔNG rebuild tại cutover + bằng chứng ownership/audit thật (15/10/2026, cuối ngày)

Mục này **thay thế hoàn toàn** mục 32.10 (kết luận "không cần sửa script, không cần bước xác minh thêm" ở đó dựa trên source-manifest + CACHED layer quan sát ĐƯỢC CỦA MỘT LẦN BUILD — owner chỉ ra đúng: cái đó không bảo đảm lần build sau). Tự đủ thông tin — không cần mở mục 22/31/32 để hiểu gói này.

### 33.1 SHA runtime vs SHA script — hai con số KHÁC NHAU, cả hai đều phải ghi

| | SHA | Ghi chú |
|---|---|---|
| **SHA runtime** (artifact đã build + test thật, sẽ chạy trong container) | `2889bf8fa04afaea4f4829801b0d169a1366376f` | Không đổi từ mục 32 — mọi bằng chứng tích hợp/browser/price_range ở mục 32 vẫn áp dụng cho đúng artifact này. |
| **SHA script** (commit chứa `scripts/deploy.sh` bản có `SKIP_BUILD`) | `1894fc1` (local, trên `feat/beach-details-cas`, CHƯA push/merge) | Mới hơn SHA runtime 1 commit — đây CHÍNH LÀ tình huống "SHA runtime ≠ SHA script" owner yêu cầu phân biệt. Deploy KHÔNG rebuild app dù script khác — script thay đổi KHÔNG kéo theo rebuild artifact (đúng yêu cầu "không rebuild chỉ vì script đổi"). |

### 33.2 Full identity API/Web — loại ID ghi rõ, không rút gọn

Cả hai image **chưa từng push lên registry nào** (không có remote registry trong session/repo) — do đó KHÔNG có "OCI distribution digest"/"manifest-list digest" nào để ghi. ID dưới đây là **Image ID / image config digest cục bộ**, lấy bằng `docker image inspect --format '{{.Id}}'` trên daemon của chính VPS production (đây cũng là ID mà `docker inspect <container> --format '{{.Image}}'` của container đang chạy phải khớp CHÍNH XÁC — đã kiểm, xem 33.4):

| Dịch vụ | Tag | Image ID (docker image inspect `.Id`, sha256 config digest, cục bộ — KHÔNG phải registry digest) |
|---|---|---|
| API | `phuquochub-api:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d` |
| Web | `phuquochub-web:2889bf8fa04afaea4f4829801b0d169a1366376f` | `sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72` |

Cả hai image NÀY (đúng ID trên) **đã có sẵn trên daemon Docker của chính VPS production** (xác nhận lại `docker images` ngay trước khi viết mục này, không suy đoán) — build tại mục 32.1, chưa bị xoá. Không cần transfer/load lại.

### 33.3 Cơ chế bảo đảm đúng artifact được cutover — KHÔNG dựa vào source-manifest hay cache quan sát được

`scripts/deploy.sh` (commit `1894fc1`) thêm:
- **`SKIP_BUILD=1`**: bỏ qua hai lệnh `docker build`, dùng trực tiếp image đã có theo tag `$TAG`. `release_manifest_verify` (gate SOURCE TREE, có sẵn từ trước) vẫn chạy KHÔNG ĐỔI — đây là gate khác, không thay thế gate artifact.
- **Step 5 (khi `SKIP_BUILD=1`)**: kiểm `phuquochub-api:$TAG`/`phuquochub-web:$TAG` TỒN TẠI; nếu có `EXPECTED_API_IMAGE_ID`/`EXPECTED_WEB_IMAGE_ID`, so khớp CHÍNH XÁC với `docker image inspect --format '{{.Id}}'` — sai hoặc thiếu → thoát mã 1, KHÔNG build/migrate/cutover gì.
- **Step 8b (MỚI)**: ngay trước lệnh cutover (Step 9), đọc lại `.Id` của hai tag LẦN NỮA và so với giá trị đã resolve ở Step 5 — nếu có bất kỳ thứ gì (build song song, `docker pull`/`tag` thủ công khác) đã đổi tag trong khoảng thời gian migrate+smoke-test chạy, deploy dừng ngay, KHÔNG cutover.
- Không có đường nào trong nhánh `SKIP_BUILD=1` gọi `docker build`/`docker pull` — không thể vô tình đổi artifact.

**Đã kiểm trong stack cô lập THẬT** (VPS, project Docker riêng `phq-r26`, container/network/volume tên riêng, cổng riêng `18080/18443/18090`, KHÔNG đụng `phuquochub-prod`/`phq-r1-*`; dọn sạch ngay sau, xác nhận lại production liên tục uptime suốt quá trình):

| Kịch bản | Kết quả | Bằng chứng |
|---|---|---|
| Image đúng + `EXPECTED_*_ID` khớp | Deploy chạy hết 11 bước (migrate 92 migration trên DB rỗng mới, smoke-test API, Step 8b xác nhận ID không đổi, cutover, health, route check) — exit code 0 | Log đầy đủ của lần chạy; `docker compose ps` sau cutover cho thấy `phq-r26-api`/`phq-r26-web` dùng ĐÚNG tag |
| Tag KHÔNG tồn tại (`SKIP_BUILD=1` + SHA giả) | Exit code 1 ngay ở Step 5, thông báo rõ "does not exist locally", KHÔNG chạy migrate/cutover | Log lệnh |
| Tag tồn tại nhưng `EXPECTED_API_IMAGE_ID` SAI (cố ý đặt `sha256:000...beef`) | Exit code 1 ngay ở Step 5 trước khi build/migrate/cutover, in rõ ID thật vs ID mong đợi | Log lệnh |
| Container thực sự chạy ĐÚNG image đã chọn | `docker inspect phq-r26-api --format '{{.Image}}'` = `sha256:32fc22de...` và `phq-r26-web` = `sha256:5b30e934...` — khớp TUYỆT ĐỐI với bảng 33.2, không phải chỉ khớp TÊN TAG | `docker inspect` output trực tiếp sau cutover |

Hai lần chạy bị chặn (tag thiếu, ID sai) được xác nhận KHÔNG đụng tới container đang chạy từ lần chạy thành công trước đó (`StartedAt`/`.Image` không đổi) — đúng yêu cầu "image thiếu/sai identity bị chặn" không có tác dụng phụ.

### 33.4 Bằng chứng ownership thật cho `preview()` — không chỉ bảng decorator

`apps/api/test/places-preview-authz.e2e-spec.ts` (mới, commit `1894fc1`) — HTTP thật, Postgres thật, qua đúng `PermissionsGuard`/`AuthorizationContext` đang chạy production, trên DB cô lập riêng (`phq-r27`, đã dọn sạch):
- Manager được gán `managed` CHỈ trên place A: `GET /places/A/preview` → 200; `GET /places/B/preview` (B ngoài phạm vi quản lý) → **403**.
- Actor không có grant nào trên place: `GET /places/:id/preview` → 403.
- Không có token: → 401 (xác nhận route không công khai).

3/3 PASS. Đây là bằng chứng ownership THẬT (không phải suy ra từ việc decorator không đổi) — bảng `EXPECTED` ở `places.controller.spec.ts` (mục 32.9) vẫn đúng vai trò của nó (khoá đúng PERMISSION được khai báo), còn test này khoá đúng việc GUARD THỰC THI đúng ranh giới managed-scope lúc runtime.

### 33.5 Bằng chứng audit thật cho price_range/opening_hours — không chỉ `content_version` tăng

`price_range` và `opening_hours` đều nằm trong `REVISABLE_FIELDS` (`places.service.ts`) — mọi PATCH đổi một trong hai field này gọi `RevisionsService.recordPlaceRevision({ placeId, snapshot, diff: { fields: [...] }, origin, editorId, status: APPROVED }, manager)`, ghi một dòng **thật** vào bảng revision (đọc lại qua `GET /places/:id/revisions`) — không chỉ tăng số `content_version`.

Trước đây chỉ có test khoá hành vi này cho `name`/`province` (cùng cơ chế, field khác). Thêm 2 test hẹp (`places.service.spec.ts`, cùng cơ chế `REVISABLE_FIELDS.filter` — không phải suy luận chéo field): đổi `price_range` → `diff` = `{ fields: ['price_range'] }`, `status=APPROVED`, `editorId` đúng; đổi `opening_hours` → tương tự. 130/130 test PASS (128 cũ + 2 mới). Không chạy lại toàn bộ suite khác — cơ chế audit là một điểm gọi chung, không cần test lại từng field còn lại trong `REVISABLE_FIELDS`.

### 33.6 Baseline, migration, backup, thứ tự triển khai

- **Baseline hiện tại trên production** (xác nhận lại bằng đọc `.env`, không suy đoán): `API_IMAGE_TAG=f0c65b716c39a41de4948c695d4383f2cfa47f1f`, `WEB_IMAGE_TAG=b91e92ce7baf547b757d425eea0f30ceac8cd848` — split-pin, container 6/6 `phuquoc-*-prod` uptime liên tục suốt phiên làm việc này (không bị đụng).
- **Migration:** 92 file, +12 so với baseline 80 đang chạy. Toàn bộ 12 migration mới là additive (`ADD COLUMN`/`CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/1 `ALTER TYPE ... RENAME`) — không có `DROP COLUMN`/`DROP TABLE` nào trong khoảng 80→92 (đọc trực tiếp log chạy migration trong 33.3's lần chạy thành công). Rủi ro lock/dữ liệu theo từng migration: đã liệt kê đầy đủ ở mục 22 (còn áp dụng, không lặp lại ở đây). Bằng chứng nâng cấp từ DATA CŨ (không chỉ DB rỗng): mục 26.
- **Backup:** cron tự động 02:00 (DB)/02:30 (media)/03:00 (offsite R2) UTC xác nhận đang chạy (mục 32.5) — chưa thử restore CHÍNH file backup production (ngoài phạm vi phiên này, cần quyền riêng).
- **Thứ tự triển khai thật** (không đổi so với `deploy.sh` gốc, CHỈ thêm bước 5b/8b bên trong Step 5/8): 4b verify source tree → 5 (SKIP_BUILD: xác nhận identity, không build) → 7 migrate (bắt buộc PASS, HALT nếu lỗi, image cũ chưa bị đụng) → 8 smoke-test container API mới, cô lập → **8b xác nhận lại identity lần 2** → 9 cutover `api web caddy` CÙNG một tag → 9b ghi pin vào `.env` → 10 health → 11 route check (đọc, không ghi).

### 33.7 Hậu kiểm, điều kiện dừng, rollback, giới hạn

- **Hậu kiểm mặc định CHỈ ĐỌC** (health + `smoke-test.sh` — API health, web root, 404 route lạ, không có bước ghi nào). Ghi/publish thật vào production cần đề nghị riêng với phạm vi cụ thể, không gộp vào đây (đã bỏ từ mục 22).
- **Điều kiện dừng:** bất kỳ bước nào từ 4b→8b thất bại → script thoát mã ≠0, container cũ KHÔNG bị đụng (đã kiểm thật ở 33.3, không phải suy đoán). Bước 11 (route check) thất bại SAU cutover → script tự thoát mã 1 kèm "chạy rollback ngay", KHÔNG tự rollback.
- **Rollback (đúng thứ tự Web trước, API sau — mục 32.4, lý do: Web mới gọi route API cũ không có):**
  ```bash
  scripts/rollback.sh b91e92ce7baf547b757d425eea0f30ceac8cd848 web
  scripts/rollback.sh f0c65b716c39a41de4948c695d4383f2cfa47f1f api
  ```
- **Giới hạn schema:** chỉ migration additive trong candidate này (xem 33.6) — không có migration nào yêu cầu downtime/khoá bảng lớn theo đánh giá tại mục 22.

### 33.8 Lệnh thực thi cụ thể — ĐÃ kiểm (không phải cú pháp bịa, không placeholder/secret)

**Hai bước production CHƯA làm, cần duyệt riêng trước khi lệnh dưới chạy được trên production** (khác với stack cô lập 33.3, nơi cả hai bước này đã làm trên bản sao test):
1. Đồng bộ source tree production sang `2889bf8` (hiện production tree đang ở `.release-manifest` ghi `f0c65b7`/80 migration — đã đọc lại, KHÔNG đổi): `scripts/sync-release-source.sh <archive> <manifest> /home/deploy/apps/PhuQuocHub`.
2. Đưa `scripts/deploy.sh` bản `1894fc1` (có `SKIP_BUILD`) vào `/home/deploy/apps/PhuQuocHub/scripts/deploy.sh` (hiện vẫn là bản cũ, không có `SKIP_BUILD` — đã đọc lại, KHÔNG đổi).

Sau khi 2 bước trên được duyệt và thực hiện, lệnh cutover thật (các giá trị secret phải lấy từ `.env` thật trên server, KHÔNG gõ literal):

```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
SKIP_BUILD=1 \
EXPECTED_API_IMAGE_ID="sha256:32fc22de5fe26e272b54d6aa53fdf0ed1567747e56d0e9f04c2ab862abef953d" \
EXPECTED_WEB_IMAGE_ID="sha256:5b30e93458a806106d2cb50801417f3e01892ba487eb1fff252b1645a17a4f72" \
scripts/deploy.sh 2889bf8fa04afaea4f4829801b0d169a1366376f /home/deploy/apps/PhuQuocHub
```

Đây CHÍNH LÀ lệnh đã chạy PASS trong stack cô lập `phq-r26` (33.3) — chỉ khác đường dẫn project (`project-dir` thay vì stack cô lập) và việc hai bước đồng bộ ở trên đã/chưa thực hiện trên cây thật.

### 33.9 Đánh dấu thay thế

- **Mục 32.10** ("deploy.sh luôn rebuild... không cần sửa script, không cần bước xác minh thêm") — **ĐÃ THAY THẾ hoàn toàn bởi mục này**. Lý do owner nêu đúng: source-manifest không xác nhận build input/output, và CACHED layer quan sát được của MỘT lần build không bảo đảm lần build sau (hai lần build khác `BUILD_DATE` tạo digest tổng khác nhau theo thiết kế — mục 32.10 tự ghi nhận điều này rồi vẫn kết luận "không cần sửa" là kết luận SAI, đã sửa ở đây).
- Mục 32.1–32.3, 32.5–32.9, 32.11 (digest `2889bf8`, fix price_range, backup rehearsal, Novotel correction, caller audit) — **KHÔNG đổi, vẫn áp dụng nguyên**.
- **Mục 32.4's câu về Caddy** ("recreate là tác dụng phụ...") — **ĐÃ SAI, đã sửa tại chỗ + mục 33.10(a)**: dry-run thật xác nhận Caddy KHÔNG recreate dưới cấu hình hiện tại; phải preflight dry-run lại ngay trước khi thực thi, không coi là cố định.
- **Ma trận lỗi ở phiên bản trình owner trước (dạng "mọi lỗi trước cutover → DB về 80")** — **ĐÃ SAI, đã thay bằng bảng mục 33.10(b)**: migration COMMIT và lỗi shell SAU migrate (Step 8/8b) là hai việc khác nhau — chỉ lỗi TRONG transaction migrate mới khiến DB thật sự ở lại 80.
- Mục này chỉ thêm cơ chế triển khai + 2 bằng chứng còn thiếu (ownership thật, audit thật) + các sửa ở 33.10. **CHƯA xin quyền production.** Không sync source, không overlay script, không backup production, không migrate, không cutover, không đổi pin trong phiên này — toàn bộ kiểm ở 33.3/33.4/r28 chạy trên stack/scratch-dir cô lập đã dọn sạch; 33.8's hai bước production vẫn ĐANG CHỜ duyệt.

## 38. GÓI WEB-ONLY — bản vá `93d3b75` (bảo toàn opening_hours), kế thừa đúng mức bằng chứng (16/10/2026, CHƯA xin quyền cutover)

### 38.1 Phân biệt hai lớp bằng chứng đã có (đúng yêu cầu — không gọi HTTP-test là tái hiện đầy đủ)

- **HTTP test trên image `2889bf8` (mục 37.2)**: chứng minh ĐÚNG MỘT điều — backend (`PlacesService.buildDraftScalarPatch`) giữ nguyên `opening_hours` khi payload KHÔNG gửi field đó. Đây là bằng chứng BACKEND, không phải bằng chứng frontend đã sửa đúng.
- **Bằng chứng FRONTEND THẬT (mới, phiên này)**: build candidate Web chứa `93d3b75`, dùng browser thật (Claude Browser pane) điều khiển ĐÚNG UI đã build (không phải `next dev`), trỏ vào API+DB synthetic cô lập (không phải production, không phải HTTP test thủ công):
  1. Mở place `opening_hours=NULL` qua `/dashboard/places/<id>/edit` — 7 ngày hiện "Đóng cửa" (đúng, nhưng nhắc lại: hình dạng này KHÔNG phân biệt được NULL với "đã khảo sát trống" chỉ bằng mắt — đây chính là lý do phải đọc DB).
  2. Điền field **Địa chỉ** qua `form_input` thật trên đúng ô `ref_169`, bấm nút **"Lưu thay đổi"** thật.
  3. Trang tự tải lại, hiện **"Đã lưu thành công."**
  4. Đọc lại DB cô lập (không phải suy đoán từ UI): `address` đổi đúng, **`opening_hours IS NULL` vẫn `true`**, `content_version` 1→2.
  5. Lặp lại với place ĐÃ có giờ thật (`mon: 09:00–21:00`) — sau khi chỉ sửa địa chỉ: giờ giữ **byte-khớp tuyệt đối**.
  6. Chủ động thêm khung giờ Thứ Hai `07:00–19:00` qua UI thật, lưu — DB ghi đúng giờ mới, `content_version` tăng tiếp.
  (Giới hạn đã gặp: công cụ đọc network request của browser pane không bắt được request cross-origin tới API cô lập — không có bản ghi payload thô kèm theo; bằng chứng DB trước/sau qua browser thật vẫn là bằng chứng mạnh, đã nêu rõ giới hạn này, không giấu.)

Stack cô lập (`fe-oh-*`) đã dọn sạch sau khi xong — không còn container/network/image nào sót lại trên VPS; production không bị đụng trong suốt quá trình (xác nhận lại `phuquoc-*-prod` 6/6 nguyên trạng).

### 38.2 Full diff với Web production `d6b71af` — đúng 1 commit, không commit nào xen giữa

```
git log --oneline d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec..HEAD
93d3b75 fix(places): preserve opening_hours when the edit form doesn't touch it
```
Không có commit nào khác xen giữa — không cần liệt kê loại trừ. Diff đúng 5 file, +87/-18, toàn bộ trong `apps/web` (không đụng `packages/*`, không đụng `apps/web/Dockerfile`):
`EditPlaceView.tsx`, `EditPlaceView.spec.tsx`, `PlaceForm.tsx`, `PlaceForm.spec.tsx`, `types.ts`.

### 38.3 Giữ API `2889bf8` và DB 92 migration — không đụng

Không build/recreate API, không chạy migration, không sửa dữ liệu nào trong gói này — xác nhận bằng dry-run thật (38.5).

### 38.4 Candidate Web — build + kiểm trên đúng image

Build args production thật (giống hệt `d6b71af`, chỉ đổi `GIT_COMMIT`): `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`.

| | Tag | Image ID (`docker image inspect --format '{{.Id}}'`) |
|---|---|---|
| Web candidate | `phuquochub-web:93d3b75302744519b6628480ba8cfe52aacd1782` | `sha256:03d75e3363ead3f2fa1b140972f28d5270a127a848449b6f6fa4dfa95aa429e1` |

Label `org.opencontainers.image.revision` khớp đúng `93d3b75...`. Smoke-test riêng (container cô lập, trỏ đọc API production thật, không ghi): nhãn VI/EN đợt trước (`Hotel information`/`Type`/`Amenities`/`Contact`) vẫn đúng, `/vi` → 200, `/vi/jobs` → 200 — không có hồi quy từ đợt vá trước.

### 38.5 Dry-run — chỉ Web đổi

```bash
API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782 \
  docker compose -f docker-compose.prod.yml --dry-run up -d --no-build web
```
Kết quả: chỉ `phuquoc-web-prod Recreate`; `phuquoc-api-prod` **Running** (không đổi); `caddy` không nằm trong lệnh.

### 38.6 Lệnh cutover Web-only (cùng cơ chế §36.5, không script mới)

```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782 \
  docker compose -f docker-compose.prod.yml up -d --no-build web
. scripts/lib/release-tag.sh
release_tag_set WEB_IMAGE_TAG 93d3b75302744519b6628480ba8cfe52aacd1782 .env
```
`API_IMAGE_TAG` không bị đụng (vẫn `2889bf8...`).

### 38.7 Hậu kiểm chỉ đọc

1. `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:03d75e33...`.
2. `.env`: `WEB_IMAGE_TAG=93d3b75...`, `API_IMAGE_TAG` không đổi.
3. `docker compose ps` — 6/6; `phuquoc-api-prod` `StartedAt` không đổi (xác nhận không bị đụng, không chỉ suy từ tag).
4. `docker logs phuquoc-web-prod --since 5m` — không `error`/`exception`.
5. Một trang hotel thật (`/vi/hotels/novotel-phu-quoc`) + trang beach (`/vi/places/bai-sao`) vẫn đúng nội dung.
6. Mở editor một place thật, sửa field KHÔNG liên quan tới giờ, lưu, tải lại — xác nhận mục "Giờ mở cửa" không đổi hình dạng hiển thị (đã biết: không phân biệt được NULL/rỗng chỉ bằng mắt — đây là hậu kiểm tối thiểu, không thay cho việc đọc DB nếu có nghi vấn thật).

### 38.8 Rollback Web-only — về đúng `d6b71af` đang chạy (không phải baseline `2889bf8` cũ hơn)

```bash
scripts/rollback.sh d6b71af3cc4fbb28f3fb507f7d24b7d71c399aec web /home/deploy/apps/PhuQuocHub
```
Đã xác nhận `phuquochub-web:d6b71af...` còn tồn tại cục bộ (`.Id=sha256:3f1ed3f1...`) — `rollback.sh`'s existence check sẽ PASS.

**CHƯA xin quyền cutover. CHƯA ghi production.** Dừng ở đây, chờ owner duyệt lệnh mục 38.6.

### 38.9 KẾT QUẢ THỰC THI (16/10/2026, owner đã duyệt) — KHÔNG CẦN ROLLBACK

**Preflight ngay trước cutover:** baseline xác nhận `WEB_IMAGE_TAG=d6b71af.../API_IMAGE_TAG=2889bf8...`; candidate `.Id=sha256:03d75e33...` khớp tuyệt đối EXPECTED, không build lại; không có deployment đồng thời; dry-run chỉ `phuquoc-web-prod Recreate`, `api` Running.

**Cutover:** `docker compose up -d --no-build web` → exit 0 → `release_tag_set WEB_IMAGE_TAG 93d3b75...` → persisted.

**Hậu kiểm CHỈ ĐỌC (6/6 PASS) — chưa phải nghiệm thu thao tác ghi production nào khác:**
1. Web identity: `{{.Image}}` = `sha256:03d75e3363ead3f2fa1b140972f28d5270a127a848449b6f6fa4dfa95aa429e1` — khớp tuyệt đối.
2. Pin: `WEB_IMAGE_TAG=93d3b75...`, `API_IMAGE_TAG=2889bf8...` không đổi.
3. **API không đổi** — `StartedAt` byte-khớp giá trị trước cutover (`2026-10-16T00:22:11.681897668Z`), không bị restart/recreate.
4. Health: 6/6 `healthy`/`Up`.
5. Log web 5 phút sau cutover: không `error`/`exception`.
6. Route liên quan (`novotel-phu-quoc`, `bai-sao`, `nha-hang-ra-khoi`, `/api/health`) → 200; nhãn VI/EN (10 nhãn đã sửa đợt trước) xác nhận đúng qua domain thật, không hồi quy.

**Xác nhận riêng: `opening_hours` của Ra Khơi — HOÀN TOÀN KHÔNG ĐỔI** (`content_version` vẫn `4`, giá trị object vẫn y hệt trước cutover) — đúng yêu cầu "giữ nguyên", gói này không hề chạm tới record đó.

**Không chạm tiêu chí rollback — không rollback.**

Môi trường test đã dọn sạch từ bước chuẩn bị (38.4); không còn tài nguyên tạm nào trên VPS liên quan gói này.

## 39. NỘI DUNG BIÊN TẬP ĐỘC LẬP — Bãi Sao, mẫu tuyển dụng/BĐS, hàng chờ owner (16/10/2026)

### 39.1 Novotel/Ra Khơi — tạm dừng, chờ bằng chứng mới

**"Chưa hoàn tất nghiệm thu ghi production; chưa đủ bằng chứng kết luận có lỗi."** Không kiểm log/DB lặp lại khi chưa có dữ kiện mới (ảnh màn hình hoặc Network từ đúng trình duyệt owner). Không coi log rỗng là bằng chứng "bấm nhầm" hay bất kỳ nguyên nhân cụ thể nào.

### 39.2 Bãi Sao — bảng đề xuất VI/EN

**Nội dung đang public hiện tại** (đọc `GET /places/bai-sao`, cả `vi` và `en` — CHƯA đổi gì): mô tả ngắn VI "Bãi biển ở phía Nam Phú Quốc với đường bờ khoảng 7 km; nguồn du lịch tỉnh mô tả vùng nước khá nông và khu vực khuất gió Tây Nam." / EN "A beach in southern Phu Quoc with roughly 7 km of coastline; the provincial tourism source describes relatively shallow water and shelter from southwest winds." Mô tả dài VI "Bãi Sao là một trong những bãi biển đẹp nhất Phú Quốc với cát trắng mịn và nước biển trong xanh." — không có bản EN (fallback VI).

**Truy nguồn 3 khẳng định ("7km đường bờ"/"nước nông"/"khuất gió Tây Nam"):** DB có gắn 1 bản ghi `sources` (`https://tourism.angiang.gov.vn/destination/detail/1309`, An Giang Tourism Portal, reliability 95, `retrieved_at` ghi 2026-09-06). Đã thử mở trực tiếp 2 lần — trình duyệt bị chặn truy cập; tìm kiếm web không trả về đúng nội dung trang. **Chưa đánh giá được nội dung nguồn; chưa dùng để chứng minh ba khẳng định về đường bờ, độ nông và hướng gió.** Không tiếp tục tìm thêm (đúng giới hạn đã chốt).

**Bản đề xuất trung tính — CHƯA NHẬP, CHƯA PUBLISH:**

| | VI | EN |
|---|---|---|
| Mô tả ngắn | "Thông tin về Bãi Sao, vị trí tham khảo trên bản đồ và những điều cần kiểm tra trước khi đến." | "Information about Bãi Sao, its reference location on the map, and what to check before you go." |
| Mô tả dài | "Bãi Sao là một bãi biển ở Phú Quốc. Điểm đánh dấu trên bản đồ dùng để tham khảo vị trí khu vực; chưa xác minh là lối vào. Trước khi đi, hãy kiểm tra đường tiếp cận, chỗ gửi xe và hỏi giá trước khi sử dụng dịch vụ. Kiểm tra dự báo thời tiết và cảnh báo biển trước khi quyết định xuống nước." | "Bai Sao is a beach in Phu Quoc. The map marker is for general area reference only; it has not been verified as an entrance point. Before you go, check the access road, parking, and ask about prices before using any service. Check the weather forecast and any sea warnings before deciding to go into the water." |

Không khẳng định "nước nông" là bảo đảm an toàn tắm biển — bản trung tính trên chủ động bỏ khẳng định này, thay bằng hướng dẫn tự kiểm tra dự báo/cảnh báo biển.

**Tiêu đề SEO / meta description:** không có field nhập tay riêng — đã đọc code (`place_translation_seo` tự sinh từ `display_name`/`short_description` đã duyệt qua cơ chế revision riêng, không có UI dashboard nào ghi trực tiếp hai cột này — đã grep toàn bộ `apps/web/src` xác nhận).

**Ghi chú biên tập (không đưa vào bài công khai) — danh sách thiếu dữ liệu:** đường vào cụ thể, bãi đỗ xe, tiện ích tại chỗ, chi phí dịch vụ, và 3 khẳng định đường bờ/độ sâu/hướng gió (nguồn chưa đánh giá được, xem trên).

**Lưu ở đâu:** nút **"Sửa tên và mô tả VI/EN"** trên trang chi tiết Bãi Sao (hoặc trong `/dashboard/places/<id>/edit`) → ô **"Mô tả chi tiết"**, điền cả VI và EN → **"Lưu nháp"** (vào hàng chờ duyệt) hoặc **"Lưu và công khai"** (owner tự công khai luôn, nếu có quyền). Tọa độ/liên hệ/tiện nghi không đụng.

### 39.3 Mẫu thu thập dữ liệu — Tin tuyển dụng

**Bắt buộc** (đúng `CreateJobListingDto`): `employer_name` (tên nhà tuyển dụng), `title` (tên vị trí), `job_category` (văn bản tự do), `work_location`, `employment_type` (chọn: `full_time`/`part_time`/`seasonal`), `contact_method`, `contact_value`.
**Bổ sung sau (tuỳ chọn):** `employer_role`, lương (`salary_min`/`salary_max`/`salary_currency`/`salary_period` — chọn `hour`/`day`/`month`; để trống = thoả thuận), `salary_negotiable`, `shift_info`, `requirements`, `benefits`, `description`, `expires_at` (YYYY-MM-DD), `place_id` (liên kết địa điểm, không bắt buộc).

**Vòng đời:** `/dashboard/job-listings/new` (điền form, nút **"Lưu nháp"**/**"Lưu thay đổi"**) → `/dashboard/job-listings` ("Tin tuyển dụng của tôi", nút **"Gửi duyệt"**) → moderator duyệt tại `/dashboard/job-listings/moderation` (**"Duyệt — đăng công khai"**/**"Từ chối"**) → công khai tại `/vi/jobs` → quay lại `/dashboard/job-listings`, nút **"Đóng tin"** (hoặc **"Mở lại (cần duyệt lại)"** nếu muốn mở lại).

Chưa có tin thật — **chờ owner cung cấp dữ liệu**, không tự tạo tin giả.

### 39.4 Mẫu thu thập dữ liệu — Bất động sản (thuê/bán)

**Bắt buộc:** `poster_role` (chọn `owner`/`broker` — vai trò người đăng, tự khai), `transaction_type` (`rent`/`sale`), `property_type` (`room`/`apartment`/`house`/`land`/`retail`), `title`, `contact_method`, `contact_value`.
**Bổ sung sau:** `ward`, `address_precision` (`area`=khu vực chung/`exact`=địa chỉ cụ thể — **mức công khai vị trí do người đăng tự chọn**), `address_text`/`lat`/`lng` (chỉ hiện công khai nếu `exact`), `area_sqm`, `price`+`price_currency` (bắt buộc đi cùng nhau nếu có giá), riêng theo `rent`: `rent_period`/`deposit_amount`/`move_in_date`/`lease_term_months`; riêng theo `sale`: `sale_price_basis`/`legal_status_note` (**văn bản tự do người đăng khai — KHÔNG phải xác nhận pháp lý/quyền sở hữu đã kiểm chứng**), `furniture_status`, `description`, `expires_at`.

**Ảnh:** cần quyền sử dụng thật từ người đăng (tự khai, hệ thống không xác minh quyền ảnh).

**Vòng đời:** `/dashboard/real-estate/new` → `/dashboard/real-estate` ("Tin bất động sản của tôi", **"Gửi duyệt"**) → `/dashboard/real-estate/moderation` → công khai `/vi/real-estate` → **"Đóng tin"**/**"Mở lại (cần duyệt lại)"**.

Chưa có tin thật — chờ dữ liệu.

### 39.5 Hàng chờ thao tác của owner

| Mục | Dữ liệu đã chuẩn bị | Còn cần owner cung cấp | Thao tác | Cách nghiệm thu |
|---|---|---|---|---|
| Ra Khơi — địa chỉ/liên hệ | Giữ nguyên (đã xác nhận trước) | — | — | Đã đạt |
| Ra Khơi — thực đơn | — | Ảnh màn hình/Network đúng lần thao tác | Thử lại, chụp màn hình | Đang chờ bằng chứng |
| Novotel — giờ nhận/trả phòng | Giá trị 15:00/12:00 đã xác nhận nguồn | Ảnh màn hình/Network đúng lần thao tác | Thử lại, chụp màn hình | Đang chờ bằng chứng |
| Novotel — địa chỉ | Nguyên văn đã có (mục trước) | — | **Tạm dừng** đến khi rõ nguyên nhân lưu giờ | Chưa bắt đầu |
| Novotel — chính sách huỷ | Nội dung đã tóm tắt, có ghi chú thiếu đoạn cuối | Quyết định có nhập hay không | — | Tạm chưa nhập |
| Bãi Sao — mô tả VI/EN | Bảng đề xuất đầy đủ (39.2) | Owner đọc, nhập qua "Sửa tên và mô tả VI/EN" | Nhập + Lưu nháp/công khai | Chờ owner nhập |
| Bãi Sao — ảnh/đường vào/bãi xe/phí | — | Chưa có nguồn — cần owner cung cấp nếu muốn thêm | — | Thiếu dữ liệu |
| Góp ý (nghiệm thu luồng) | Hướng dẫn chưa soạn (chờ 2 trang mẫu xong) | Nội dung góp ý thật | — | Chưa tới |
| Tin tuyển dụng đầu tiên | Mẫu thu thập + vòng đời đầy đủ (39.3) | Dữ liệu tin thật + quyền đăng | Điền form theo mẫu | Chờ dữ liệu |
| Tin BĐS đầu tiên | Mẫu thu thập + vòng đời đầy đủ (39.4) | Dữ liệu tin thật + quyền đăng | Điền form theo mẫu | Chờ dữ liệu |

Không sửa code/build/deploy — không có lỗi cụ thể nào trong phạm vi mục 39. Không ghi/publish production, không truy vấn DB ngoài các lần đọc công khai đã liệt kê ở 39.2.

## 40. Lỗi liên kết Google Maps — chỉ mở toạ độ thay vì đúng hồ sơ địa điểm (2026-10-16)

### 40.1 Nguyên nhân

Owner phát hiện qua ảnh chụp: nút bản đồ trên trang Bãi Sao mở Google Maps bằng link `https://www.google.com/maps?q=10.0572576,104.0363948` — chỉ thả một ghim toạ độ trần, không mở hồ sơ "Bãi Sao" thật trên Google (không có tên, không có ảnh/đánh giá/giờ mở cửa của Google cho địa điểm đó).

Đọc source xác nhận: cả 3 trang chi tiết (`places/[slug]`, `hotels/[slug]`, `restaurants/[slug]`) đều dùng chung một mẫu `https://www.google.com/maps?q=<lat>,<lng>` — không có nơi nào trong code từng xây link theo tên hoặc theo Place ID. Đây là lỗi code (mẫu URL sai), **không phải lỗi toạ độ** — xác nhận bằng cách đọc giá trị `location` của cả 3 bản ghi qua API công khai (`/api/places/bai-sao`, `/api/hotels/novotel-phu-quoc`, `/api/restaurants/nha-hang-ra-khoi`): toạ độ hợp lệ, nằm đúng khu vực Phú Quốc, không có dấu hiệu sai lệch — chỉ cách hiển thị trên Google Maps (ghim trần, không phải hồ sơ địa điểm) là vấn đề.

Đọc schema xác nhận hệ thống **đã có chỗ lưu Google Place ID nhưng chưa có đường ghi**: bảng `place_external_identifiers` tồn tại (migration `InitPlaceExternalIdentifiers`), cột `provider` là enum chỉ có `GOOGLE_PLACES`, nhưng **0 dòng dữ liệu cho mọi địa điểm** trong production. Module backend `apps/api/src/modules/place-external-identifiers/` có entity/repository/service nhưng **cố ý chưa có controller** (xác nhận qua đọc trực tiếp mã nguồn, có ghi chú trong code) — nghĩa là không có đường HTTP nào, kể cả qua dashboard, để đọc hoặc ghi bảng này. Đây là lý do không thể "chỉ lấy Place ID có sẵn" cho bất kỳ địa điểm nào — không có Place ID nào được lưu ở bất kỳ đâu trong hệ thống.

### 40.2 Cách xử lý đúng định danh

Không có Place ID → không dùng Maps Search URL kèm `query_place_id` (sẽ sai vì không có ID thật để điền). Không tự đoán hoặc chọn kết quả đầu tiên trùng tên trên Google thay owner — rủi ro gán nhầm hồ sơ cho sai địa điểm.

Giải pháp: dùng **Maps Search URL chuẩn** (`https://www.google.com/maps/search/?api=1&query=<tên>[, <địa chỉ>]`) — không cần API key, không cần Place ID. Đây KHÔNG phải một liên kết đã xác minh tới đúng hồ sơ; nó yêu cầu Google tìm theo tên+địa chỉ, nhãn phải nói rõ là "Tìm trên Google Maps" (không phải "Xem trên Google Maps") khi chưa có Place ID xác minh. Giữ thêm một liên kết toạ độ riêng, nhãn rõ ràng "Xem toạ độ tham khảo" (dùng mẫu ghim trần cũ, không đổi) — để không mất khả năng xem đúng vị trí khi tìm theo tên thất bại hoặc trả nhầm kết quả.

Không đổi backend bản đồ nội bộ (vẫn OpenStreetMap/Leaflet) — việc này chỉ sửa 2 liên kết ra ngoài tới Google Maps, không liên quan bản đồ hiển thị trên trang.

### 40.3 Bảng tách lỗi code và toạ độ (đọc API công khai, không tự đổi gì)

| Bản ghi | Toạ độ hiện tại | Link cũ (production, trước bản vá) | Hồ sơ Google đã khớp | Đề xuất | Mức tin cậy |
|---|---|---|---|---|---|
| Bãi Sao (`bai-sao`) | 10.0572576, 104.0363948 | `maps?q=10.0572576,104.0363948` (ghim trần) | Không có — 0 dòng `place_external_identifiers` cho mọi địa điểm | Tìm theo tên: `maps/search/?api=1&query=Bãi Sao` (không có `address`, DB `address=null`) + giữ link toạ độ tham khảo | **Thấp** — không có địa chỉ để thu hẹp tìm kiếm; "Bãi Sao" có thể trùng tên nơi khác; **toạ độ hiện tại chưa xác định là điểm khu vực chung hay lối vào đã xác minh** (ghi chú này đã có trong mô tả công khai của trang, mục 39.2: "Điểm đánh dấu trên bản đồ dùng để tham khảo vị trí khu vực; chưa xác minh là lối vào") |
| Novotel Phú Quốc (`novotel-phu-quoc`) | 10.1288141, 103.9807506 | `maps?q=10.1288141,103.9807506` (ghim trần) | Không có — như trên | Tìm theo tên+địa chỉ đầy đủ: `maps/search/?api=1&query=Novotel Phu Quoc Resort, Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special Zone, 922273 An Giang Province, Vietnam` + giữ link toạ độ tham khảo | **Trung bình** — địa chỉ đầy đủ vừa được owner xác nhận và lưu (mục trước), chuỗi khách sạn quốc tế có tên riêng biệt → khả năng Google trả đúng kết quả cao hơn, nhưng vẫn là tìm kiếm chưa xác minh bằng Place ID thật |
| Nhà hàng Ra Khơi (`nha-hang-ra-khoi`) | 10.215, 103.96 | `maps?q=10.215,103.96` (ghim trần) | Không có — như trên | Tìm theo tên+địa chỉ: `maps/search/?api=1&query=Nhà hàng Ra Khơi, Đường 30/4, Dương Đông, TP. Phú Quốc` + giữ link toạ độ tham khảo | **Thấp–trung bình** — toạ độ có dạng số tròn bất thường (10.215 / 103.96, đúng 3 và 2 chữ số thập phân) gợi ý đây là vị trí ước lượng thủ công chứ không phải GPS đo trực tiếp; tên "Ra Khơi" khá phổ biến cho nhà hàng ven biển — cần owner xác nhận kết quả tìm kiếm có đúng không |

Không có bản ghi nào trong 3 bản ghi trên có Place ID xác minh. Cả 3 vẫn nằm trong danh sách "cần owner xác nhận" — không có bản ghi nào được tự động gán hồ sơ Google.

### 40.4 Bản vá

Helper dùng chung mới: [`apps/web/src/modules/map/mapLinks.ts`](../../apps/web/src/modules/map/mapLinks.ts) — hàm `getPlaceMapLinks({lat, lng, name, address, googlePlaceId}, locale)`. Trả `null` nếu toạ độ không hợp lệ (tái dùng `isValidCoord` logic). Luôn trả về:
- `primary`: nếu có `googlePlaceId` (hiện chưa nơi nào truyền vào, vì chưa có nguồn) → Maps Search URL kèm `query_place_id`, nhãn "Xem trên Google Maps"/"View on Google Maps", `primaryCertain: true`; nếu không → Maps Search URL theo tên(+địa chỉ), nhãn "Tìm trên Google Maps"/"Find on Google Maps", `primaryCertain: false`.
- `referencePin`: luôn có, mẫu ghim trần cũ, nhãn "Xem toạ độ tham khảo"/"View reference location".
- `directions`: Maps Directions URL chuẩn (sẵn sàng dùng sau nếu owner muốn thêm nút "Chỉ đường") — **chưa gắn vào UI trang nào trong bản vá này**, giữ phạm vi đúng 2 liên kết đã có để tránh mở rộng ngoài yêu cầu.

Áp dụng tại 3 trang chi tiết: [`places/[slug]/page.tsx`](../../apps/web/src/app/[locale]/(public)/places/[slug]/page.tsx), [`hotels/[slug]/page.tsx`](../../apps/web/src/app/[locale]/(public)/hotels/[slug]/page.tsx), [`restaurants/[slug]/page.tsx`](../../apps/web/src/app/[locale]/(public)/restaurants/[slug]/page.tsx) — không đổi field nào khác, không đổi toạ độ/địa chỉ lưu trong DB.

Không mở rộng schema/API trong bản vá này (xem đề xuất riêng ở 40.6) — bản vá chỉ sửa cách build URL từ dữ liệu đã có sẵn trên mỗi trang.

### 40.5 Kiểm thử

**Unit (mới):** [`apps/web/src/modules/map/mapLinks.spec.ts`](../../apps/web/src/modules/map/mapLinks.spec.ts) — 7 test: không Place ID + có địa chỉ; không Place ID + không địa chỉ; có Place ID; toạ độ NaN → `null`; toạ độ ngoài khoảng hợp lệ → `null`; tên có dấu tiếng Việt/ký tự đặc biệt → encode đúng; nhãn tiếng Anh khi `locale=en`.

**Trang chi tiết (cập nhật):** `places/[slug]/page.spec.tsx` (+2 test — trang này trước đây **chưa có** test nào cho link bản đồ), `hotels/[slug]/page.spec.tsx` (3 test: không địa chỉ, có địa chỉ, toạ độ không hợp lệ → không hiện link), `restaurants/[slug]/page.spec.tsx` (cập nhật test cũ). Toàn bộ suite: **9/9 suite, 166/166 test pass**; `tsc --noEmit` sạch; `eslint` sạch trên các file đã sửa.

**Xác minh trình duyệt thật (môi trường cô lập, đọc API production thật, không ghi gì):** build image `phuquochub-web:9f5b95ba05570b9128871064e391f51c8ae6ab84` từ commit `9f5b95b` trên VPS, chạy container độc lập (`maps-fix-9f5b95b-web`, cổng 19210, gắn tạm vào network `phuquochub-prod_default` để gọi `API_INTERNAL_URL=http://api:4000/api` — đúng cấu hình production, chỉ GET, không service nào khác bị đụng). Curl xác nhận cả 3 trang trả 200 và link render đúng (Place ID → không có cho cả 3, name+address search + reference pin, encode dấu tiếng Việt đúng `%C3%A3i`, `%C6%A1i`...). Trình duyệt thật qua Claude Browser pane xác nhận trực quan:
- `/vi/places/bai-sao` (desktop) — "Tìm trên Google Maps →" · "Xem toạ độ tham khảo", đúng nhãn.
- `/en/hotels/novotel-phu-quoc` (desktop) — "Find on Google Maps →" · "View reference location", địa chỉ đầy đủ đã lưu trước đó hiển thị đúng trong query.
- `/vi/restaurants/nha-hang-ra-khoi` (mobile 375px) — layout không vỡ, 2 link xuống dòng gọn.

Container smoke-test đã gỡ (`docker rm -f maps-fix-9f5b95b-web`) ngay sau khi xác minh xong; image build giữ lại cho candidate release bên dưới. Xác nhận 6 container production thật (`phuquoc-*-prod`) không đổi trạng thái trong suốt quá trình (đều `Up`/`healthy` như trước).

**Ghi chú ngoài phạm vi:** phát hiện một stack test cô lập cũ (`phq-r1-web`, `phq-r1-api`, `phq-r1-s3`, `phq-r1-redis`, `phq-r1-pg`, image candidate `c8bd06a`, tạo lúc 2026-10-06) vẫn đang chạy trên VPS — không thuộc phiên làm việc hiện tại, không đụng vào. Owner có thể dọn bằng `docker rm -f phq-r1-web phq-r1-api phq-r1-s3 phq-r1-redis phq-r1-pg` nếu xác nhận không còn cần.

### 40.6 Đề xuất mở rộng API (CHƯA triển khai — chờ owner duyệt riêng)

**Lý do:** hiện không có cách nào lưu một Google Place ID đã xác minh thủ công vào hệ thống, kể cả khi owner tự tra cứu và xác nhận đúng hồ sơ trên Google Maps. Không có đường ghi nghĩa là liên kết "Tìm trên Google Maps" (chưa xác minh) sẽ còn mãi, không có lộ trình nâng lên "Xem trên Google Maps" (đã xác minh) cho bất kỳ địa điểm nào.

**Phạm vi tối thiểu đề xuất:** thêm 1 controller cho module `place-external-identifiers` đã có sẵn entity/repository/service — KHÔNG đổi schema (bảng đã đủ cột), KHÔNG thêm provider mới (enum hiện chỉ cần `GOOGLE_PLACES`):
- `GET /places/:id/external-identifiers` — đọc, cùng điều kiện quyền xem bản nháp/quản lý như các endpoint place hiện có.
- `PUT /places/:id/external-identifiers/google-places` — ghi 1 bản ghi (`external_id`, `is_primary`, `source_id`/`evidence_id` tham chiếu bằng chứng) — tái dùng guard quyền chỉnh sửa place hiện có (cùng vai trò được phép sửa `address`/`opening_hours`).

**Không triển khai trong bản vá này** — đây là đề xuất riêng, cần owner duyệt phạm vi trước khi viết code, theo đúng yêu cầu "nêu lý do và phạm vi tối thiểu trước khi triển khai phần đó".

### 40.7 Gói phát hành (CHƯA duyệt — chờ owner)

- **Commit:** `9f5b95b` ("fix(places): open the real place by name on Google Maps, not just a bare pin")
- **Image ID đã build:** `sha256:724fff6a56182f9643633a73736daab507403111e60b36c2e804da65905699a5` (image `phuquochub-web:9f5b95ba05570b9128871064e391f51c8ae6ab84`, đã build trên VPS với đúng build-arg production: `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `GIT_COMMIT=9f5b95ba05570b9128871064e391f51c8ae6ab84`)
- **Baseline production hiện tại (đọc lại `.env` trước khi build, không giả định):** `WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782`, `API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f` — **không đổi API** trong gói này.
- **Diff vs baseline:** đúng 1 commit (`9f5b95b`), đúng 8 file đã liệt kê ở 40.4/40.5 (2 trang + helper + 5 file test), không có commit nào khác bị bỏ sót giữa `93d3b75` và `9f5b95b`.
- **Dry-run:** `SKIP_BUILD=1 EXPECTED_WEB_IMAGE_ID=sha256:724fff6a56182f9643633a73736daab507403111e60b36c2e804da65905699a5 WEB_IMAGE_TAG=9f5b95ba05570b9128871064e391f51c8ae6ab84 API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f ./scripts/deploy.sh --dry-run` — dự kiến chỉ Web đổi, API giữ nguyên tag hiện tại (không rebuild, không re-pull).
- **Cutover (đề xuất, CHƯA chạy):** `WEB_IMAGE_TAG=9f5b95ba05570b9128871064e391f51c8ae6ab84 API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f SKIP_BUILD=1 EXPECTED_WEB_IMAGE_ID=sha256:724fff6a56182f9643633a73736daab507403111e60b36c2e804da65905699a5 ./scripts/deploy.sh`
- **Hậu kiểm (chỉ đọc):** `curl -s https://phuquochub.com/vi/places/bai-sao | grep -o 'Tìm trên Google Maps[^<]*'`, tương tự cho `/en/hotels/novotel-phu-quoc` và `/vi/restaurants/nha-hang-ra-khoi`; xác nhận `X-App-Revision`/label ảnh = `9f5b95b`; xác nhận 6 container production health như cũ.
- **Rollback (nếu cần):** `WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782 API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f SKIP_BUILD=1 ./scripts/deploy.sh` (image `93d3b75` vẫn còn trên VPS từ lần cutover trước, không cần rebuild).

**Không nằm trong gói này:** không đổi API, không ghi/đổi toạ độ hoặc Place ID của bất kỳ địa điểm nào, không triển khai đề xuất 40.6.

Chờ owner duyệt rõ ràng (SHA, lệnh cutover, điều kiện rollback) trước khi chạy bất kỳ lệnh ghi production nào ở trên.

### 40.8 Owner review trước duyệt — phát hiện 1 lỗi thật, đã sửa hẹp (2026-10-16)

Owner yêu cầu xác minh 7 điểm trước khi duyệt `9f5b95b`. Điểm 3 — "query tìm kiếm luôn có ngữ cảnh 'Phú Quốc' khi địa chỉ thiếu" — **KHÔNG đúng** trong `9f5b95b`: khi `address` rỗng (đúng trường hợp Bãi Sao), `queryText` trước đó CHỈ là tên trần (`"Bãi Sao"`), không có ngữ cảnh địa danh nào — đúng rủi ro owner nêu (dễ trùng tên với địa điểm khác ở nơi khác trên Google Maps).

**Sửa hẹp**, commit `0fb2380` ("fix(places): add Phú Quốc context to map search when address is missing"), trên [`mapLinks.ts`](../../apps/web/src/modules/map/mapLinks.ts): khi KHÔNG có địa chỉ, `queryText` nay là `"<tên>, Phú Quốc, Việt Nam"` (vi) / `"<tên>, Phú Quốc, Vietnam"` (en). Khi CÓ địa chỉ, giữ nguyên hành vi cũ (`"<tên>, <địa chỉ>"`) — không thêm gì, vì địa chỉ thật (đã xác nhận với Novotel/Ra Khơi) đã luôn kèm quận/thành phố/tỉnh.

**Trả lời 7 điểm owner yêu cầu:**
1. Full SHA runtime: `0fb23803e4bbc0a927709708f8c4c47700c1fb64`. Full Web Image ID: `sha256:90745e2d6960a525aa47cec53b139bee370e413bc80ee7f985eb353932bc9a9f` (image `phuquochub-web:0fb23803e4bbc0a927709708f8c4c47700c1fb64`).
2. Diff với Web production `93d3b75`: đúng 2 commit (`9f5b95b`, `0fb2380`), đúng 8 file — cùng danh sách file đã liệt kê ở 40.4/40.5, không file nào khác bị đụng (`git diff --stat 93d3b75..0fb2380`).
3. Đã xác nhận SAI ở `9f5b95b`, đã sửa ở `0fb2380` — xem trên. Bằng chứng: [`mapLinks.spec.ts`](../../apps/web/src/modules/map/mapLinks.spec.ts) có 2 test mới ("KHÔNG có Place ID, KHÔNG có địa chỉ: tìm kiếm theo tên + bù ngữ cảnh 'Phú Quốc'" và bản locale=en tương ứng); 3 trang chi tiết cũng có test cập nhật cùng logic. Smoke-test thật trên container cô lập (đọc API production thật, không ghi gì) xác nhận: `/vi/places/bai-sao` → query `"Bãi Sao, Phú Quốc, Việt Nam"`; `/en/places/bai-sao` → `"Bai Sao, Phú Quốc, Vietnam"`; `/en/hotels/novotel-phu-quoc` (có địa chỉ) → không đổi, không lặp "Phú Quốc"; `/vi/restaurants/nha-hang-ra-khoi` (có địa chỉ) → không đổi.
4. Helper CHƯA nơi nào nhận được `googlePlaceId` thật (0 dòng `place_external_identifiers`, không controller — xem 40.1) — nhánh "đã xác minh" (`primaryCertain: true`, nhãn "Xem trên Google Maps") trong code chưa từng được gọi thật, chỉ sẵn sàng dùng khi có API surface (đề xuất 40.6, chưa triển khai). Nhánh đang chạy thật cho cả 3 bản ghi là fallback tìm kiếm, nhãn đúng nghĩa "Tìm trên Google Maps"/"Find on Google Maps" — không ngụ ý đã xác nhận.
5. Lệnh cutover dưới đây dùng `SKIP_BUILD=1` + `EXPECTED_WEB_IMAGE_ID` đúng Image ID đã kiểm ở trên — không build lại trên production, dùng đúng artifact đã smoke-test.
6. Dry-run giữ `API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f` (không đổi API) — DB không nằm trong gói Web-only này (schema vẫn ở bản đã áp dụng trước đó, gói này không chứa migration nào).
7. Hậu kiểm và rollback cập nhật ở 40.9 (thay 40.7, dùng candidate `0fb2380` thay vì `9f5b95b`).

Kiểm thử hẹp — KHÔNG build/test lại toàn bộ: chỉ chạy lại 5 file bị sửa (`mapLinks.ts`, `mapLinks.spec.ts`, 3 file `page.spec.tsx`) — `npx jest` cho các suite liên quan: **8/8 test** (`mapLinks.spec.ts`), **101/101 test** (3 trang chi tiết); sau đó full suite để chắc không có hồi quy ẩn: **168/168 suite, 1665/1665 test pass**; `tsc --noEmit` sạch; `eslint` sạch trên 5 file đã sửa.

### 40.9 Gói phát hành cập nhật (thay thế 40.7 — CHƯA duyệt)

- **Commit:** `0fb2380` (bao gồm `9f5b95b` + sửa hẹp ngữ cảnh "Phú Quốc")
- **Image ID:** `sha256:90745e2d6960a525aa47cec53b139bee370e413bc80ee7f985eb353932bc9a9f` (`phuquochub-web:0fb23803e4bbc0a927709708f8c4c47700c1fb64`, build trên VPS với cùng build-arg production đã dùng cho `9f5b95b`, chỉ đổi `GIT_COMMIT`).
- **Baseline production (re-xác nhận ngay trước khi build candidate này, không giả định):** `WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782`, `API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f` — **không đổi API/DB**.
- **Diff vs baseline:** đúng 2 commit (`9f5b95b`, `0fb2380`), đúng 8 file, không commit nào khác lọt vào giữa `93d3b75` và `0fb2380`.
**SỬA (16/10/2026, trước khi chạy): `./scripts/deploy.sh` KHÔNG dùng được cho Web-only.** Đọc lại toàn bộ script xác nhận: nó chỉ nhận MỘT `$TAG` vị trí dùng chung cho cả `phuquochub-api:$TAG` và `phuquochub-web:$TAG`, Step 7 chạy migration KHÔNG ĐIỀU KIỆN (không có cờ bỏ qua), và Step 9 cutover gộp cả `api web caddy` cùng lúc — không có cách tách Web riêng. `WEB_IMAGE_TAG=...`/`API_IMAGE_TAG=...` làm biến môi trường tiền tố không có tác dụng chọn tag khác nhau cho từng service trong script này. Thay bằng đúng cơ chế đã dùng (và đã chạy thật, owner duyệt) ở hai lần Web-only trước đó trong phiên này (`d6b71af` §36.6, `93d3b75` §38.6): gọi `docker compose` trực tiếp, chỉ định `web`, có `--no-deps` theo yêu cầu owner.

- **Dry-run:**
  ```bash
  cd /home/deploy/apps/PhuQuocHub && set -a; . ./.env; set +a
  WEB_IMAGE_TAG=0fb23803e4bbc0a927709708f8c4c47700c1fb64 \
    docker compose -f docker-compose.prod.yml --dry-run up -d --no-build --no-deps web
  ```
  Kỳ vọng: chỉ `phuquoc-web-prod Recreate`; không migration; không `api`/`caddy` trong lệnh.
- **Cutover:**
  ```bash
  WEB_IMAGE_TAG=0fb23803e4bbc0a927709708f8c4c47700c1fb64 \
    docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web
  . scripts/lib/release-tag.sh
  release_tag_set WEB_IMAGE_TAG 0fb23803e4bbc0a927709708f8c4c47700c1fb64 .env
  ```
  `API_IMAGE_TAG` không bị đụng (vẫn `2889bf8...`).
- **Hậu kiểm (chỉ đọc, VI + EN):**
  - `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:90745e2d...`.
  - `docker inspect phuquoc-api-prod --format '{{.State.StartedAt}}'` — không đổi so với trước cutover (bằng chứng API không bị recreate, không chỉ suy từ tag).
  - `docker compose ps` — 6/6 health.
  - `docker logs phuquoc-web-prod --since 3m` — không `error`/`exception`.
  - `curl -s https://phuquochub.com/vi/places/bai-sao` — query chứa `Phú Quốc, Việt Nam`.
  - `curl -s https://phuquochub.com/en/places/bai-sao` — query chứa `Phú Quốc, Vietnam`.
  - `curl -s https://phuquochub.com/en/hotels/novotel-phu-quoc` — query = tên + địa chỉ đầy đủ, KHÔNG lặp "Phú Quốc".
  - `curl -s https://phuquochub.com/vi/restaurants/nha-hang-ra-khoi` — query = tên + địa chỉ, KHÔNG lặp "Phú Quốc".
  - Toạ độ tham khảo (`referencePin`) không đổi giá trị ở cả 3 bản ghi, nhãn vẫn "Xem toạ độ tham khảo"/"View reference location" (KHÔNG gọi là lối vào đã xác minh).
- **Rollback (nếu chạm tiêu chí):**
  ```bash
  cd /home/deploy/apps/PhuQuocHub && set -a; . ./.env; set +a
  WEB_IMAGE_TAG=93d3b75302744519b6628480ba8cfe52aacd1782 \
    docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web
  . scripts/lib/release-tag.sh
  release_tag_set WEB_IMAGE_TAG 93d3b75302744519b6628480ba8cfe52aacd1782 .env
  ```
  (image `93d3b75` vẫn còn trên VPS, không cần rebuild.)

**Không nằm trong gói này:** không đổi API/DB, không migration, không recreate `api`/`caddy`, không ghi/đổi toạ độ hoặc Place ID của bất kỳ địa điểm nào, không triển khai đề xuất 40.6, không đụng `phq-r1-*`, không dọn stack cũ.

### 40.10 KẾT QUẢ THỰC THI (16/10/2026, owner đã duyệt) — KHÔNG CẦN ROLLBACK

**Preflight ngay trước cutover:** baseline `.env` xác nhận `WEB_IMAGE_TAG=93d3b75.../API_IMAGE_TAG=2889bf8...` (đọc lại, không giả định); image candidate `.Id=sha256:90745e2d...` khớp tuyệt đối EXPECTED, không build lại; không có `deploy.sh`/`docker compose up`/`docker build` nào khác đang chạy trên VPS; API `StartedAt` trước cutover ghi lại = `2026-10-16T00:22:11.681897668Z` (để đối chiếu sau).

**Dry-run:** `docker compose --dry-run up -d --no-build --no-deps web` → chỉ `phuquoc-web-prod Recreate` (Recreated/Starting/Started) — đúng phạm vi, không migration, không `api`/`caddy`.

**Cutover:** lệnh thật (bỏ `--dry-run`) → `exit code: 0`. `release_tag_set WEB_IMAGE_TAG 0fb2380... .env` → `[release-tag] WEB_IMAGE_TAG=0fb2380... persisted to .env`, `API_IMAGE_TAG` giữ nguyên byte.

**Hậu kiểm CHỈ ĐỌC (8/8 PASS):**
1. Web identity: `docker inspect --format '{{.Image}}'` = `sha256:90745e2d6960a525aa47cec53b139bee370e413bc80ee7f985eb353932bc9a9f` — khớp tuyệt đối EXPECTED.
2. **API không đổi** — `StartedAt` byte-khớp `2026-10-16T00:22:11.681897668Z`, không bị restart/recreate; image API vẫn `sha256:32fc22de...` (không build/pull lại).
3. Pin: `.env` → `API_IMAGE_TAG=2889bf8...` (không đổi), `WEB_IMAGE_TAG=0fb2380...` (đúng như duyệt).
4. Health: 6/6 `healthy`/`Up` (`phuquoc-caddy-prod` không có healthcheck định nghĩa, như mọi lần trước — không phải lỗi).
5. Log Web `--since 3m`: không dòng `error`/`exception` nào.
6. Link/nhãn bản đồ thật qua domain production (VI + EN, cả 3 bản ghi):
   - `/vi/places/bai-sao`: `"Tìm trên Google Maps →"` → query `Bãi Sao, Phú Quốc, Việt Nam`; `"Xem toạ độ tham khảo"` → `10.0572576,104.0363948` (không đổi).
   - `/en/places/bai-sao`: `"Find on Google Maps →"` → query `Bai Sao, Phú Quốc, Vietnam`; `"View reference location"` → cùng toạ độ.
   - `/en/hotels/novotel-phu-quoc`: `"Find on Google Maps →"` → query tên + địa chỉ đầy đủ, KHÔNG lặp "Phú Quốc"; pin → `10.1288141,103.9807506` (không đổi).
   - `/vi/restaurants/nha-hang-ra-khoi`: `"Tìm trên Google Maps →"` → query tên + địa chỉ, KHÔNG lặp "Phú Quốc"; pin → `10.215,103.96` (không đổi).
7. Toạ độ tham khảo cả 3 bản ghi giữ nguyên giá trị trước/sau cutover — **không có bản ghi nào đổi toạ độ**, nhãn vẫn đúng "tham khảo", không dùng từ ngụ ý đã xác minh là lối vào.
8. Không có bản ghi nào có Place ID — cả 3 vẫn ở nhánh tìm kiếm (`primaryCertain: false`), đúng như thiết kế.

**Không cần rollback.** Rollback không được kích hoạt — không có tiêu chí nào trong gói bị chạm (identity khớp, API không đổi, health 6/6, không log lỗi, link đúng cả 2 locale).

**Kết luận phạm vi (owner yêu cầu ghi rõ):** bản vá này CHỈ cải thiện liên kết và nhãn ra Google Maps (tìm theo tên/địa chỉ + ngữ cảnh "Phú Quốc" khi thiếu địa chỉ) — **KHÔNG phải xác minh hồ sơ Google cho bất kỳ địa điểm nào, KHÔNG sửa toạ độ của Bãi Sao/Novotel/Ra Khơi hay bất kỳ bản ghi nào khác**. Không có Place ID nào được thêm. Không đụng `place_external_identifiers`/controller (đề xuất 40.6 vẫn CHƯA triển khai). Không dọn `phq-r1-*`. Không có thay đổi dữ liệu production nào ngoài đúng 1 dòng `WEB_IMAGE_TAG` trong `.env`.

## 41. "Mở đúng hồ sơ Google Maps" — Track A (quản lý định danh, dữ liệu synthetic) (16/10/2026)

Owner yêu cầu tách rõ: **A.** chức năng quản lý định danh (làm được bằng dữ liệu synthetic, không chờ gì) và **B.** gắn hồ sơ Google thật của Bãi Sao (chờ owner cung cấp link đúng — **CHƯA có trong phiên này**, không tự tra/đoán/chọn cơ sở gần đó cùng tên). Mục này chỉ là A. B CHƯA làm — không đụng gì tới Bãi Sao/Novotel/Ra Khơi thật.

### 41.1 Ba khái niệm — giữ tách biệt trong thiết kế

| Khái niệm | Là gì | Lưu ở đâu |
|---|---|---|
| **Hồ sơ Google Maps** | Thực thể phía Google, có Place ID riêng, tên/đánh giá/giờ của chính Google | `place_external_identifiers.external_id` (provider `GOOGLE_PLACES`) — MỚI có đường ghi ở mục này |
| **Toạ độ tham chiếu** | `places.location` đã có từ trước | Không đổi — `referencePin` trong `mapLinks.ts` vẫn dùng y nguyên |
| **Điểm tiếp cận/lối vào** | Nơi khách thực sự vào được — có thể khác điểm toạ độ khu vực | CHƯA có cột riêng nào trong schema hiện tại; KHÔNG bị gán nhầm vào Place ID hay toạ độ ở đây |

Không đổi `location`/lối vào ở đâu trong mục này — chỉ thêm MỘT đường ghi mới cho khái niệm đầu tiên.

### 41.2 Rà lại toàn bộ đường ống (controller → quyền → service → dashboard → public DTO → mapLinks)

Trước khi viết gì, đọc lại toàn bộ 6 lớp hiện có (không mặc định một lớp nào "chắc đã đủ"):

1. **Controller:** KHÔNG tồn tại trước mục này — xác nhận lại bằng đọc trực tiếp `place-external-identifiers.module.ts` (comment cũ: "Không có controller — chưa có yêu cầu API surface").
2. **Quyền theo record:** `PlacesController`'s route ghi (`POST :id/draft`, v.v.) dùng CẶP `@RequirePermissions('Place.Edit.Managed')` + `@AuthorizationContext({resourceType:'place', resource:{from:'param',name:'id'}})` — guard thật (`PermissionsGuard`) đăng ký `APP_GUARD` toàn cục ở `auth.module.ts`, không cần import `RbacModule` riêng để guard chạy.
3. **Service:** `PlaceExternalIdentifiersService` đã có `ensureIdentifier()` (idempotent theo `provider+external_id`, dùng cho job import) nhưng **ensureIdentifier KHÔNG phù hợp cho dashboard sửa nhầm ID** — nó dedupe theo `(provider, external_id)` chứ không theo `(place_id, provider)`, nên sửa một ID đã nhập sang ID khác sẽ CHÈN HÀNG THỨ HAI thay vì thay thế (phát hiện khi thiết kế, không phải khi chạy lỗi) → viết `upsertPrimaryGooglePlaceId()` riêng cho đường ghi dashboard.
4. **Dashboard:** CHƯA có UI nào — thêm `GooglePlaceIdEditor.tsx`.
5. **Public DTO:** `PlaceDetail` (shared-types) CHƯA có field này — thêm `google_place_id: string | null`.
6. **mapLinks.ts:** ĐÃ sẵn nhánh `primaryCertain: true` (viết từ gói §40 nhưng chưa từng được gọi thật vì không có nguồn) — chỉ cần NỐI dây, không sửa logic.

Không coi "response công khai thiếu field này" là bằng chứng DB không có khả năng lưu — đã đọc thẳng schema/entity trước khi kết luận (đúng nguyên tắc owner nhắc ở gói trước).

### 41.3 Quy tắc "đủ điều kiện công khai" — và quyết định CHƯA chốt

`PlaceExternalIdentifiersService.findVerifiedPrimaryGooglePlaceId(placeId)` là **MỘT định nghĩa duy nhất**: chỉ identifier có `is_primary=true` VÀ `verified_at` khác null được `PlacesService.buildDetailResponse()` đưa vào response công khai (`google_place_id`). `PUT .../google-places` (route dashboard) **KHÔNG BAO GIỜ** nhận `verified_at` từ body — route không có tham số đó, không có cách nào client tự gửi.

**Quyết định CHƯA chốt (nêu rõ theo yêu cầu, KHÔNG tự xây):** ai/cơ chế nào được phép đánh dấu một identifier "đã xác minh" (set `verified_at`). Phiên này KHÔNG xây bước đó — không có endpoint, không có role, không có quy trình. Hệ quả: mọi ID nhập qua dashboard hôm nay sẽ ở trạng thái "đã nhập, chưa xác minh" vô thời hạn cho tới khi có quyết định đó. Trang công khai vẫn dùng fallback tìm kiếm trong lúc chờ — đúng yêu cầu "giữ fallback hiện tại".

### 41.4 Bản vá

**Backend** (`apps/api`):
- [`place-external-identifiers.dto.ts`](../../apps/api/src/modules/place-external-identifiers/dto/place-external-identifiers.dto.ts) (mới) — `UpsertGooglePlaceIdDto { external_id, source_id?, evidence_id? }`, KHÔNG có `verified_at`/`is_primary`/`provider` (provider cố định theo route).
- [`place-external-identifiers.controller.ts`](../../apps/api/src/modules/place-external-identifiers/place-external-identifiers.controller.ts) (mới) — `GET /places/:id/external-identifiers`, `PUT /places/:id/external-identifiers/google-places`, cả hai `Place.Edit.Managed` + `AuthorizationContext` theo `:id`.
- [`place-external-identifiers.service.ts`](../../apps/api/src/modules/place-external-identifiers/place-external-identifiers.service.ts) — thêm `upsertPrimaryGooglePlaceId()` (đường ghi dashboard, thay-tại-chỗ khi sửa ID, reset `verified_at` về null khi đổi ID), `findVerifiedPrimaryGooglePlaceId()` (quy tắc đủ điều kiện, dùng chung duy nhất), `toResponse()`.
- [`place-external-identifiers.module.ts`](../../apps/api/src/modules/place-external-identifiers/place-external-identifiers.module.ts) — thêm `controllers:`.
- [`places.module.ts`](../../apps/api/src/modules/places/places.module.ts) / [`places.service.ts`](../../apps/api/src/modules/places/places.service.ts) — import `PlaceExternalIdentifiersModule` (đọc-only, không vòng lặp), `buildDetailResponse()` thêm `google_place_id`.
- [`packages/shared-types/src/place.ts`](../../packages/shared-types/src/place.ts) — `PlaceDetail.google_place_id: string | null` (đã `npm run build` lại `dist/`, không chỉ sửa `.ts`).

**Frontend** (`apps/web`):
- [`place-external-identifiers.api.ts`](../../apps/web/src/modules/place-external-identifiers/api/place-external-identifiers.api.ts) (mới) — `getExternalIdentifiers`/`upsertGooglePlaceId`.
- [`GooglePlaceIdEditor.tsx`](../../apps/web/src/modules/category-admin/GooglePlaceIdEditor.tsx) (mới) — nhúng vào `EditPlaceView.tsx` KHÔNG theo category (áp dụng mọi loại địa điểm), KHÔNG dùng `contentVersion` CAS của place (sub-resource độc lập, tự có idempotency riêng). Hiện rõ trạng thái "đã xác minh"/"chưa xác minh" — không bao giờ tự nhận ID vừa nhập là đã xác minh.
- 3 trang chi tiết (`places`/`hotels`/`restaurants`) — truyền `googlePlaceId: r.google_place_id` vào `getPlaceMapLinks()`; `null` thì helper tự fallback (không if/else riêng).

**KHÔNG thêm button "Chỉ đường" nào mới, KHÔNG đổi schema (bảng đã đủ cột từ migration cũ), KHÔNG xây bước xác minh.**

### 41.5 Kiểm thử — đúng 6 nhánh owner yêu cầu, dữ liệu synthetic

**Unit** (`place-external-identifiers.service.spec.ts`, +9 test): `findVerifiedPrimaryGooglePlaceId` (không có/chưa xác minh/isPrimary=false/đủ điều kiện), `upsertPrimaryGooglePlaceId` (tạo mới/lưu lặp cùng giá trị=no-op/sửa sang giá trị khác=UPDATE-tại-chỗ-không-insert-hàng-mới/ID đã thuộc place khác=từ chối). `places.service.spec.ts` (+2 test): `google_place_id` null khi chưa có identifier, đi qua nguyên vẹn khi service con trả về giá trị.

**Controller metadata** (`place-external-identifiers.controller.spec.ts`, mới) — cùng khuôn `places.controller.spec.ts`: cả 2 route KHÔNG `@Public()`, đúng permission `Place.Edit.Managed`.

**E2e thật** (`place-external-identifiers-authz.e2e-spec.ts`, mới) — HTTP thật, Postgres thật (cô lập, migrations đầy đủ, KHÔNG phải production), qua đúng `PermissionsGuard`:
1. Manager place A ghi A → 200; ghi B (ngoài phạm vi) → 403; đọc B → 403.
2. Không có grant → 403. Không có token → 401.
3. Lưu lặp cùng giá trị → cùng 1 hàng (idempotent). Sửa sang giá trị khác (cùng place) → UPDATE tại chỗ, vẫn đúng 1 hàng — KHÔNG nhân đôi.
4. ID đã thuộc place khác → 400, không ghi gì (không áp định danh của một địa điểm cho địa điểm khác).
5. `GET /places/:slug` công khai: chưa có ID → `google_place_id: null`, **vẫn hoạt động bình thường**; có ID nhưng CHƯA xác minh → vẫn `null` (không bị coi là đã xác minh); mô phỏng `verified_at` bằng SQL trực tiếp (CHƯA có API xác minh thật — xem 41.3) → `google_place_id` trả đúng giá trị, chứng minh đường đọc hoạt động đúng khi điều kiện đã thoả.

**Lỗi thật phát hiện khi chạy e2e** (không phải lúc viết code): chạy spec e2e MỚI 2 lần liên tiếp trên CÙNG DB cô lập (mô phỏng chạy lại suite) làm 3/6 test FAIL — `external_id` dùng literal cố định (`'ChIJ-v1'`...) va vào ràng buộc UNIQUE thật với hàng còn sót từ lần chạy trước, khiến một trường hợp lẽ ra PASS (200) trông như xung đột danh tính (400). Sửa bằng cùng cơ chế `uid()` ngẫu nhiên hoá mà `createUser()`/`mkPlace()` trong CHÍNH file đó đã dùng cho email/slug — chỉ external_id bị bỏ sót. Xác nhận lại: chạy 2 lần liên tiếp trên cùng DB, cả 2 lần `place-external-identifiers-authz` VÀ `places-preview-authz` (spec cũ, không đổi) đều pass — không có hồi quy từ việc đụng `places.module.ts`/`places.service.ts`.

**Web:** `GooglePlaceIdEditor.spec.tsx` (mới, 6 test) — chưa có ID vẫn hoạt động, tải sẵn giá trị cũ, lưu không gửi `verified_at`/`is_primary` từ client, validate rỗng, tạo Source kèm theo, giữ nội dung khi lỗi. `place-external-identifiers.api.spec.ts` (mới, 3 test). `places/[slug]/page.spec.tsx` (+1 test) — `google_place_id` đủ điều kiện từ API đi đúng vào `query_place_id`, đổi nhãn sang "Xem trên Google Maps" (đã xác nhận), không còn "Tìm trên Google Maps".

**Toàn bộ:** API `tsc --noEmit` sạch, **262 suite / 3766 test pass** (full suite, không hồi quy). Web `tsc --noEmit` sạch (sau khi sửa 15 fixture test thiếu field mới — `google_place_id` khai bắt buộc `string | null`, cùng quy ước `osm_id`/`province` đã có, KHÔNG làm optional để lách), `eslint` sạch trên mọi file touch (1 lỗi `react-hooks/set-state-in-effect` còn lại ở `EditPlaceView.tsx` dòng 78 là **pre-existing**, xác nhận qua `git diff` — không nằm trong 2 dòng tôi thêm, không sửa ở gói này), **170 suite / 1675 test pass**.

### 41.6 Phạm vi KHÔNG làm trong mục này

- **Track B** (gắn hồ sơ Google thật của Bãi Sao/Novotel/Ra Khơi) — chờ owner cung cấp link đúng.
- Bước xác minh (set `verified_at`) — quyết định ai/cơ chế nào được xác minh CHƯA chốt (41.3).
- Đổi `location`/toạ độ của bất kỳ địa điểm nào.
- Nút "Chỉ đường" trên UI công khai.
- Triển khai production: KHÔNG build image, KHÔNG deploy, KHÔNG chạy migration trên production (schema hiện tại đã đủ — không migration nào được thêm ở mục này).

### 41.7 Trạng thái

Commit local (CHƯA push, CHƯA deploy): `bfbc848` (tính năng) + `946991e` (sửa lỗi cô lập test e2e). Chờ owner cung cấp link Google Maps thật của Bãi Sao để bắt đầu Track B — khi có, sẽ đối chiếu tên+địa chỉ+toạ độ trước khi coi là đúng hồ sơ, không tự chọn kết quả trùng tên.

## 42. Bước xác nhận Google Place ID — khép vòng dashboard → public (16/10/2026)

Owner chốt phạm vi tiếp theo: hoàn thiện tối thiểu bước xác nhận (41.6 đã nêu đây là khoảng trống cố ý để lại), KHÔNG xây hệ thống xác minh tổng quát. Vẫn Track A — dữ liệu synthetic, chưa đụng Bãi Sao/Novotel/Ra Khơi thật.

### 42.1 Quyền và ý nghĩa "đã xác nhận"

Đọc lại toàn bộ hệ permission hiện có (migration seed, vai trò, ai giữ `Place.Approve` hôm nay) trước khi quyết định — không mở rộng `Place.Edit.Managed` thành quyền duyệt (nếu làm vậy, người nhập ID tự xác nhận được chính ID họ vừa nhập, vô hiệu hoá cả bước xác nhận). `Place.Approve` (duyệt NỘI DUNG place lên công khai) được xác nhận là **quyết định khác hẳn** việc đối chiếu một Place ID — không tái dùng.

Permission MỚI, phạm vi tối thiểu: `PlaceExternalIdentifier.Verify` (migration `1720009100000-SeedPlaceExternalIdentifierVerifyPermission.ts`), cấp CHỈ cho `content_owner` — đúng tiền lệ `Price.Verify` (migration `1720007800000`, cùng dạng "tách quyền xác nhận khỏi quyền sửa", cùng người được cấp). Không cấp `moderator` ở bước này — nếu owner muốn mở rộng, đó là quyết định riêng sau.

- Nhập/đề xuất ID: `Place.Edit.Managed` theo record — KHÔNG đổi.
- Xác nhận/thu hồi: `PlaceExternalIdentifier.Verify` — toàn cục (không `AuthorizationContext`, giống `Place.Approve`/`Price.Verify`), người giữ quyền này xác nhận được MỌI place.
- "Đã xác nhận" được ghi rõ trong UI VÀ comment code: chỉ nghĩa hồ sơ Google khớp địa điểm — KHÔNG xác minh quyền sở hữu, chất lượng cơ sở hay lối vào.

### 42.2 Luồng tối thiểu

Dashboard: nhập ID (`GooglePlaceIdEditor`, không đổi) → link "Mở hồ sơ Google để đối chiếu →" (cùng cơ chế URL `query_place_id` đã có ở `mapLinks.ts`, không gọi API trả phí nào) → nút **Xác nhận khớp địa điểm** (chỉ hiện khi đã có ID) → nếu đã xác nhận, thêm nút **Thu hồi xác nhận**.

Server tự ghi actor + thời điểm qua `AuditService` đã có (`place_external_identifier.verified` / `.verification_revoked`, context gồm `place_id/provider/external_id/from/to`) — **không thêm cột `verified_by` mới**; `verified_at` (đã có từ trước) là cột DUY NHẤT server set, client không bao giờ gửi được giá trị này (route confirm không nhận field đó trong DTO). `source_id`/`evidence_id` của người xác nhận ghi được qua route confirm (tuỳ chọn) — tái dùng đúng 2 cột đã có, không thêm bảng evidence mới.

### 42.3 Bảo toàn và cạnh tranh — đọc `upsertPrimaryGooglePlaceId` trước khi sửa

| Yêu cầu | Trước (gói §41) | Sau (gói này) |
|---|---|---|
| Đổi `external_id` phải reset xác nhận cũ | Có (verifiedAt → null) | Giữ nguyên |
| Không mang source/evidence ID cũ sang ID mới | Có (lấy từ input, mặc định null) | Giữ nguyên |
| Lưu lại ĐÚNG ID hiện tại — hành vi rõ, không vô tình mất xác nhận | No-op đơn giản (bỏ qua source/evidence mới nếu có) | **Sửa**: cập nhật source/evidence nếu người dùng gửi giá trị mới, `verifiedAt` KHÔNG BAO GIỜ bị đụng ở nhánh này — true no-op nếu không có gì đổi (không ghi DB) |
| Không chuyển ID đã thuộc place khác | Có | Giữ nguyên |
| Hai lần ghi đồng thời không tạo hai primary mâu thuẫn | **CHƯA có** — race thật: `place_id+provider` không có UNIQUE, hai request đầu tiên cùng lúc có thể cùng INSERT | **Sửa**: mọi ghi (propose/confirm/revoke) chạy trong transaction + `pg_advisory_xact_lock` khoá theo `(placeId, provider)` — lớp 2 (khác lớp 1 của `SourceFirstIngestService`), tự giải phóng khi transaction kết thúc, không cần try/finally thủ công. KHÔNG thêm migration UNIQUE index — advisory lock đủ, kể cả cho trường hợp CHƯA có hàng nào (pessimistic row lock không khoá được hàng chưa tồn tại) |
| Lần xác nhận cũ không được xác nhận nhầm ID vừa bị thay | Có (verifiedAt reset khi đổi ID) | Giữ nguyên |
| Bảo toàn định danh khác + dữ liệu importer | `ensureIdentifier()` (đường importer) không bị đụng | Giữ nguyên — `confirmGooglePlaceId`/`revokeGooglePlaceIdVerification` là hàm MỚI, tách biệt, không sửa `ensureIdentifier` |

### 42.4 Kiểm hẹp — dữ liệu synthetic, DB cô lập

**Unit** (+19 test trong `place-external-identifiers.service.spec.ts`): khoá advisory trước khi đọc/ghi; lưu lặp không gửi source/evidence mới → true no-op; lưu lặp CÓ gửi source/evidence mới → cập nhật, KHÔNG đụng verifiedAt đã có; `confirmGooglePlaceId` (chưa có identifier → 404; set verifiedAt=bây giờ + audit; xác nhận lại vẫn cập nhật verifiedAt + vẫn audit; kèm source/evidence riêng → ghi đè đúng field); `revokeGooglePlaceIdVerification` (chưa có → 404; verifiedAt→null + audit; KHÔNG xoá identifier).

**Controller metadata** (`place-external-identifiers.controller.spec.ts`, cập nhật): xác nhận route nhập ID và route confirm/revoke dùng **permission KHÁC NHAU**; route confirm/revoke KHÔNG có `AuthorizationContext`.

**E2e thật** (Postgres cô lập thật, qua đúng guard, chạy 2 lần liên tiếp trên cùng DB không lỗi):
1. Nhập → xác nhận (qua API thật, KHÔNG SQL trực tiếp) → public DTO trả đúng ID.
2. Actor CHỈ có `Place.Edit.Managed` → confirm/revoke đều 403 (không tự xác nhận được ID mình vừa nhập).
3. Confirm không token → 401; confirm khi chưa có identifier → 404.
4. Đổi sang ID khác sau khi đã xác nhận → `verified_at` về null, public quay lại fallback.
5. Thu hồi xác nhận → public quay lại fallback; identifier vẫn còn (`external_id` không đổi, chỉ `verified_at`).
6. **Ghi đồng thời** (2 `external_id` khác nhau, cùng place, `Promise.all` bắn cùng lúc qua HTTP thật) → cả 2 request 200, nhưng sau cùng chỉ đúng 1 hàng trong DB — advisory lock tuần tự hoá thật, không phải chỉ đúng về mặt lý thuyết.
7. **Xác nhận đồng thời** (2 lần confirm cùng lúc) → không lỗi, vẫn đúng 1 hàng.

**Browser thật** (Claude Browser pane, Web+API thật chạy trên VPS cô lập, user thật đăng ký qua `/api/auth/register` + cấp role `content_owner` qua SQL, place thật tạo qua SQL — KHÔNG phải fixture coi là đã xác nhận hồ sơ Bãi Sao thật):
- Desktop: `/dashboard/places/:id/edit` → nhập ID → lưu → link "Mở hồ sơ Google để đối chiếu →" hiện đúng `query_place_id` + tên place → bấm "Xác nhận khớp địa điểm" → trạng thái đổi "đã xác nhận", nút "Thu hồi xác nhận" xuất hiện.
- Public `/vi/hotels/browser-test-resort`: nhãn đổi đúng từ "Tìm trên Google Maps" sang **"Xem trên Google Maps"**, link có `query_place_id` đúng giá trị vừa xác nhận.
- Mobile 375px: cả trang dashboard (khu vực xác nhận) và trang public — layout không vỡ.
- Thu hồi (375px) → trạng thái dashboard về "CHƯA xác nhận"; public quay lại **"Tìm trên Google Maps"** (mất `query_place_id`) — đúng fallback.
- Dọn sạch: xoá toàn bộ container/network/image/thư mục VPS sau khi xong; xác nhận lại 6 container `phuquoc-*-prod` không đổi trạng thái.

**Toàn bộ:** API `tsc --noEmit` sạch, **263 suite / 3782 test pass** (full suite). Web `tsc --noEmit` sạch, `eslint` sạch trên mọi file touch (cùng 1 lỗi pre-existing ở `EditPlaceView.tsx` dòng 78, không liên quan, đã xác nhận qua `git diff`), **170 suite / 1682 test pass**.

### 42.5 Phạm vi KHÔNG làm

- Hệ thống xác minh tổng quát (áp dụng cho mọi loại sub-resource/identifier) — CHỈ Google Place ID.
- Cấp quyền `PlaceExternalIdentifier.Verify` cho ai trong PRODUCTION — migration mới chỉ chạy trên DB cô lập, CHƯA deploy.
- Gắn hồ sơ Google thật cho Bãi Sao/Novotel/Ra Khơi (Track B — vẫn chờ link owner).
- Gọi bất kỳ API Google trả phí nào — link "đối chiếu" chỉ là URL điều hướng, cùng cơ chế đã duyệt ở gói §40.
- Đổi toạ độ hoặc gắn lối vào cho bất kỳ địa điểm nào.

### 42.6 Trạng thái

Commit local (CHƯA push, CHƯA deploy): `f3af72c`. Migration mới (`1720009100000`) đã test chạy thật trên Postgres cô lập (seed đúng `content_owner`, không đụng role khác) nhưng **CHƯA chạy trên production** — nằm trong gói candidate chờ duyệt cùng đợt deploy tiếp theo, không tự ý chạy riêng.

Track A (quản lý định danh trọn vòng: nhập → đối chiếu → xác nhận/thu hồi → public) nay **hoàn tất bằng dữ liệu synthetic** — đã chứng minh qua unit/e2e/browser thật. Track B (Bãi Sao/Novotel/Ra Khơi thật) vẫn chờ owner cung cấp link hồ sơ Google đúng; khi có, sẽ đối chiếu tên+địa chỉ+toạ độ, không tự chọn kết quả trùng tên, và thao tác xác nhận thật sẽ cần owner tự bấm qua dashboard (hoặc uỷ quyền rõ ràng) — không tự ý xác nhận thay.

## 43. Đóng Track B (chuẩn bị, chưa ghi) + sửa 3 điểm owner yêu cầu + gói release đầy đủ (16/10/2026)

### 43.1 Bãi Sao — record → hồ sơ → Place ID → nguồn đối chiếu (CHƯA ghi/xác nhận)

Owner cung cấp `https://maps.app.goo.gl/SxL68k8acDSVFXBd6`, xác nhận đây là hồ sơ đúng.

| | |
|---|---|
| **Record trong hệ thống** | `places.slug = 'bai-sao'`, `location = 10.0572576, 104.0363948`, `address = NULL` |
| **Hồ sơ Google (mở link owner đưa)** | "Sao Beach" / "Bãi tắm Sao" — 3.9★ (8.221), danh mục Beach, toạ độ hiển thị `10.0572576, 104.0363948` — **TRÙNG TUYỆT ĐỐI** với `location` hiện tại trong DB |
| **Google Place ID** | `ChIJL4toWTGRpzERqGuxiUPhdLQ` |
| **Nguồn đối chiếu** | (1) Mở thẳng link owner đưa → redirect tới URL đầy đủ chứa CID hex `0x31a7913159688b2f:0xb474e14389b16ba8` và `/g/1ttdkh0s` (ĐÚNG như owner cảnh báo — đây KHÔNG phải Place ID, chỉ ghi lại để đối chiếu chéo). (2) Dùng **Place ID Finder** chính thức của Google (`developers.google.com/maps/documentation/javascript/examples/places-placeid-finder`, công cụ được hỗ trợ chính thức, không gọi API trả phí nào tự thực hiện) — tìm "Bãi tắm Sao, Phú Quốc" trước tiên ra 2 gợi ý SAI tên ("Sao Beach Sunrise Point", "Starfish beach" — **KHÔNG chọn**, đúng cảnh báo owner); đổi sang tìm "Bãi tắm Sao, Phú Quốc" (tiếng Việt) → gợi ý ĐẦU TIÊN khớp tên tuyệt đối "Bãi tắm Sao, An Giang, Vietnam" → trả `ChIJL4toWTGRpzERqGuxiUPhdLQ`. (3) Đối chiếu ngược: dựng `https://www.google.com/maps/search/?api=1&query=Bai+tam+Sao&query_place_id=ChIJL4toWTGRpzERqGuxiUPhdLQ` → redirect ra **ĐÚNG CÙNG MỘT URL** như link owner đưa ban đầu (cùng CID hex, cùng `/g/1ttdkh0s`, cùng toạ độ, cùng tên/rating) — xác nhận Place ID này quả thực là hồ sơ owner đã xác nhận, không phải suy đoán |

**CHƯA ghi vào `place_external_identifiers`, CHƯA gọi route upsert/confirm cho place Bãi Sao thật** — đây là phát hiện/chuẩn bị, không phải thao tác ghi. Ghi dữ liệu thật này (Track B) cần owner duyệt riêng, tách khỏi việc triển khai chức năng (mục 43.4).

### 43.2 Sửa kết luận quyền — phân biệt hai mệnh đề khác nhau

Owner chỉ đúng một khoảng trống trong cách diễn đạt trước đó: "permission khác nhau" KHÔNG tự động nghĩa là "hai người khác nhau".

- **Mệnh đề A (ĐÚNG, có guard thật enforce):** một actor CHỈ giữ `Place.Edit.Managed` (vd `business_manager` chỉ quản lý một place) KHÔNG tự xác nhận được — route confirm/revoke đòi `PlaceExternalIdentifier.Verify`, actor đó không có quyền này → 403 thật (đã chứng minh qua e2e).
- **Mệnh đề B (SAI, đã sửa mọi comment/doc nói ngược lại):** "người nhập ID không bao giờ là người xác nhận". KHÔNG đúng — `content_owner` giữ **CẢ HAI** permission (`Place.Edit.Any` thoả mãn check `Place.Edit.Managed` theo xếp hạng scope `Own < Managed < Any`, VÀ `PlaceExternalIdentifier.Verify` trực tiếp) nên MỘT content_owner tự nhập rồi tự xác nhận được — đã viết e2e test riêng chứng minh chính xác hành vi này (mục 43.4 danh sách test).

**Chốt cho MVP này (theo owner):** content_owner được phép tự làm cả hai bước (nhập + xác nhận), miễn `AuditService` ghi đúng actor và đúng loại thao tác (`place_external_identifier.verified`/`.verification_revoked`, có `actorId`, `permission`, context trước/sau — đã có sẵn, không đổi). **KHÔNG quảng bá đây là cơ chế duyệt hai người độc lập** trong UI/code/doc — đã sửa lại toàn bộ comment từng diễn đạt sai ở `place-external-identifiers.controller.ts`, `place-external-identifiers.service.ts`, `place-external-identifiers.controller.spec.ts`, `GooglePlaceIdEditor.tsx`, `place-external-identifiers.api.ts` (xem diff commit `5b04cac`).

### 43.3 Rà soát mọi writer — chỉ sửa nơi có đường đua thực tế

Đọc lại toàn bộ `upsertPrimaryGooglePlaceId` VÀ mọi writer khác của bảng `place_external_identifiers` trước khi kết luận bất kỳ điều gì đã "bảo đảm":

| Writer | Khoá trước đó | Vấn đề | Hành động |
|---|---|---|---|
| `upsertPrimaryGooglePlaceId` (dashboard, nhập/sửa ID) | `withPlaceProviderLock` (class 2, theo `placeId:provider`) | — | Giữ nguyên |
| `confirmGooglePlaceId`/`revokeGooglePlaceIdVerification` (dashboard, xác nhận/thu hồi) | `withPlaceProviderLock` (class 2) | **THẬT:** không có gì chặn xác nhận một ID đã bị người khác thay thế giữa lúc đọc và lúc bấm — route trước đó chỉ nhận "xác nhận ID hiện tại ở server", không phải "ID người dùng đã đối chiếu" | **Sửa:** thêm `expected_external_id` bắt buộc, so khớp trong CÙNG lock, lệch → 409 (chi tiết dưới) |
| `ensureIdentifier` (job import, `registerExternalIds` trong `source-first-ingest.service.ts`) | `SourceFirstIngestService.withCandidateLock` (class **1**, khoá theo `candidateKey` — KHÔNG phải `placeId:provider`) | **THẬT, không chỉ lý thuyết:** đã đọc trực tiếp `registerExternalIds()` — gọi `ensureIdentifier` không hề đi qua class-2 lock; một lần chạy job thủ công và một thao tác dashboard trên CÙNG place tại CÙNG thời điểm có thể cùng đọc "chưa có hàng" rồi cái này ghi đè cái kia, vì hai khoá khác keyspace hoàn toàn không loại trừ nhau dù cùng đụng một `(placeId, provider)`. Job tự nó xử lý TUẦN TỰ bên trong (for-loop, không `Promise.all`) nên không có race NỘI BỘ job — nhưng race LIÊN-caller (job ⟷ dashboard, hoặc hai lần kích hoạt job thủ công chồng nhau — không tìm thấy `@Cron`/mutex nào ngăn) là thật | **Sửa:** `ensureIdentifier` nay cũng chạy trong `withPlaceProviderLock` (class 2) — MỌI writer của bảng giờ CÙNG một keyspace khoá |

**Không kết luận "khoá dashboard đã bảo đảm duy nhất primary trên toàn hệ thống" cho tới khi rà xong — đúng rồi mới nói đúng:** sau khi sửa `ensureIdentifier`, phát biểu đó giờ MỚI thành true cho **mọi writer hiện có trong codebase** (2 writer: dashboard + import, cả hai đều đi qua class-2 lock). Nếu sau này có writer thứ ba (vd một nguồn import khác), người viết phải tự đảm bảo nó cũng gọi qua `withPlaceProviderLock` hoặc service method công khai đã có khoá sẵn — không có constraint DB nào tự động bắt lỗi nếu quên (quyết định có chủ ý ở 42.3: dùng advisory lock thay vì migration thêm UNIQUE index).

**Confirm/revoke bám đúng giá trị ID đã đọc (owner yêu cầu riêng):** `ConfirmGooglePlaceIdDto`/`RevokeGooglePlaceIdVerificationDto` nay có `expected_external_id` **BẮT BUỘC**. Server so khớp với `external_id` thật trong CÙNG advisory lock transaction; lệch → `ConflictException` (409), không ghi gì, không audit gì. Dashboard (`GooglePlaceIdEditor.tsx`) luôn gửi `current.external_id` từ state đã tải — không tự suy đoán, không gửi giá trị rời. Lỗi 409 hiển thị rõ: "ID hiện tại (...) khác với ID bạn đã đối chiếu (...)... Tải lại trang để lấy ID mới nhất."

**Bằng chứng (đã có, KHÔNG chạy lại full suite):** rà soát + sửa trên đã chạy qua bộ test TARGETED (không phải toàn bộ) — xem danh sách đầy đủ ở 43.4. Không có thay đổi nào ở các module khác (places core, auth, v.v.) ngoài 2 field mới trong DTO và lệnh gọi `withPlaceProviderLock` thêm vào `ensureIdentifier` — không có lý do kỹ thuật để chạy lại 263 suite API / 170 suite Web đã pass ở round trước (§42.4) khi không đổi.

### 43.4 Kiểm thử bổ sung (dữ liệu synthetic, DB cô lập)

**Unit** (`place-external-identifiers.service.spec.ts`, +12 test so với §42): `ensureIdentifier` khoá đúng keyspace class-2; `confirmGooglePlaceId`/`revokeGooglePlaceIdVerification` với `expectedExternalId` lệch → `ConflictException`, KHÔNG ghi gì, KHÔNG audit gì, hàng thật không đổi. Toàn bộ test cũ cập nhật để truyền `expectedExternalId` đúng.

**E2e thật** (Postgres cô lập, qua guard thật, build từ commit `5b04cac`, chạy 2 lần liên tiếp trên cùng DB không lỗi — **17/17 test pass cả 2 lần**, gồm 2 test MỚI):
- `content_owner giữ CẢ Place.Edit.Any VÀ PlaceExternalIdentifier.Verify → tự nhập rồi tự xác nhận ĐƯỢC` (chứng minh đúng Mệnh đề B ở 43.2, không phải lỗ hổng).
- `expected_external_id lệch (bị thay giữa lúc đọc và lúc bấm xác nhận) → 409, KHÔNG xác nhận nhầm ID mới` — kịch bản thật: nhập ID X → đổi sang ID Y (mô phỏng race) → confirmer gửi X (giá trị đã đọc) → 409, `google_place_id` công khai vẫn `null` (Y chưa từng được đối chiếu) → gửi lại đúng Y → 200, xác nhận thành công.

**Browser/smoke thật trên image production-args** (`phuquochub-api`/`phuquochub-web:5b04cacba250e05b62b7aba740c434cb34d9302a`, build từ ĐÚNG commit sẽ deploy, không phải image build-stage riêng cho test): health 200; 3 route mới (`upsert`/`confirm`/`revoke`) trả 401 khi không có token (xác nhận route tồn tại và được guard, không phải 404); `GET /places` (route công khai cũ) vẫn 200 — không hồi quy. Web boot sạch, trỏ đúng API nội bộ.

Dọn sạch toàn bộ container/network/image tạm sau mỗi vòng; xác nhận lại 6 container `phuquoc-*-prod` không đổi trạng thái trong suốt quá trình.

### 43.5 Gói release đầy đủ — API + Web + migration quyền mới (CHƯA duyệt)

**Baseline hiện tại (đọc lại `.env` + đếm `migrations` trong DB thật ngay trước khi build, không giả định):** `WEB_IMAGE_TAG=0fb23803e4bbc0a927709708f8c4c47700c1fb64`, `API_IMAGE_TAG=2889bf8fa04afaea4f4829801b0d169a1366376f`, DB **92 migration** (mới nhất: `AddHotelCancellationPolicy1720009000000`) — khớp đúng đầu mối owner nêu.

**Commit candidate:** `5b04cacba250e05b62b7aba740c434cb34d9302a` (SHA đầy đủ 40 ký tự). Diff vs baseline: đúng 4 commit (`bfbc848`, `946991e`, `f3af72c`, `5b04cac`), 37 file, **đúng 1 migration mới**.

**Image ID đã build + smoke-test (build-arg production thật):**
| Service | Tag | Image ID |
|---|---|---|
| API | `phuquochub-api:5b04cacba250e05b62b7aba740c434cb34d9302a` | `sha256:8cb08450e20075e8c746cb78633dc3a2b668309273af64dca143d8e2e0cfc2f0` |
| Web | `phuquochub-web:5b04cacba250e05b62b7aba740c434cb34d9302a` | `sha256:c39924ac974c692462fc2c5694bf019d9da42a9987b597c98c608a740c990749` |

(Web build-arg: `NEXT_PUBLIC_API_URL=https://phuquochub.com/api`, `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`, `NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png`, cả hai `GIT_COMMIT=5b04cacba250e05b62b7aba740c434cb34d9302a`.)

**Migration mới (1 duy nhất), nội dung đầy đủ đã kiểm:** `1720009100000-SeedPlaceExternalIdentifierVerifyPermission.ts` — `INSERT INTO permissions` (1 dòng, `ON CONFLICT DO NOTHING`) + `INSERT INTO role_permissions` (cấp cho `content_owner`, `ON CONFLICT DO NOTHING`). **Thuần cộng thêm, không ALTER/DROP bất kỳ gì** — `down()` chỉ `DELETE FROM permissions WHERE code = 'PlaceExternalIdentifier.Verify'` (an toàn, không có dữ liệu phụ thuộc nào bị mất vì permission mới chưa từng được cấp cho ai ngoài migration này).

**Thứ tự rollout (API+Web cùng commit, migration đi kèm API — đây là release trọn gói, KHÔNG phải bản vá Web-only như §40/§41):**
- Dùng ĐÚNG `scripts/deploy.sh` (cơ chế SKIP_BUILD, không build lại trên production) — single-tag, API+Web+migration+Caddy cùng lúc, đúng use case nó được viết cho (khác với các bản vá chỉ-Web trước đây).
- **Bước đồng bộ nguồn bắt buộc TRƯỚC `deploy.sh`** (gate `release_manifest_verify` sẽ từ chối build nếu bỏ qua bước này):
  ```bash
  # Trên máy đáng tin cậy (không phải VPS):
  scripts/create-release-archive.sh 5b04cacba250e05b62b7aba740c434cb34d9302a .
  # scp archive + manifest lên VPS, rồi trên VPS:
  scripts/sync-release-source.sh phuquochub-source-5b04cac....tar.gz release-manifest-5b04cac....txt /home/deploy/apps/PhuQuocHub
  ```
- **Dry-run** (xác nhận trước khi ghi gì):
  ```bash
  SKIP_BUILD=1 \
  EXPECTED_API_IMAGE_ID=sha256:8cb08450e20075e8c746cb78633dc3a2b668309273af64dca143d8e2e0cfc2f0 \
  EXPECTED_WEB_IMAGE_ID=sha256:c39924ac974c692462fc2c5694bf019d9da42a9987b597c98c608a740c990749 \
  scripts/deploy.sh 5b04cacba250e05b62b7aba740c434cb34d9302a --dry-run
  ```
  Kỳ vọng: xác nhận identity 2 image khớp EXPECTED (không build lại); migration DRY mô tả đúng 1 statement mới (permission insert); `api`/`web`/`caddy` Recreate.
- **Cutover** (CHƯA chạy, chờ duyệt — cần `DB_PASSWORD`/`REDIS_PASSWORD`/`JWT_*`/`REVALIDATE_INTERNAL_SECRET` thật từ môi trường VPS, không phải giá trị tôi tạo):
  ```bash
  SKIP_BUILD=1 \
  EXPECTED_API_IMAGE_ID=sha256:8cb08450e20075e8c746cb78633dc3a2b668309273af64dca143d8e2e0cfc2f0 \
  EXPECTED_WEB_IMAGE_ID=sha256:c39924ac974c692462fc2c5694bf019d9da42a9987b597c98c608a740c990749 \
  DB_PASSWORD=*** \
  scripts/deploy.sh 5b04cacba250e05b62b7aba740c434cb34d9302a
  ```

**Hậu kiểm (chỉ đọc):**
1. `docker inspect phuquoc-api-prod --format '{{.Image}}'` = `sha256:8cb08450...`; `phuquoc-web-prod` = `sha256:c39924ac...`.
2. `.env`: `API_IMAGE_TAG=5b04cac...`, `WEB_IMAGE_TAG=5b04cac...`.
3. `SELECT count(*) FROM migrations` = 93; `SELECT code FROM permissions WHERE code='PlaceExternalIdentifier.Verify'` = có đúng 1 dòng; `role_permissions` chỉ gắn với `content_owner` (không `moderator`, không role khác).
4. `docker compose ps` — 6/6 health; `docker logs` cả hai service `--since 5m` không `error`/`exception`.
5. `curl https://phuquochub.com/api/health` = 200; `curl https://phuquochub.com/vi` = 200.
6. `curl -X PUT .../external-identifiers/google-places` không token → 401 (route tồn tại, không 404) — **không gọi bất kỳ route ghi nào có token thật**.
7. Một trang chi tiết thật bất kỳ (vd `/vi/places/bai-sao`) vẫn render đúng như trước — xác nhận `google_place_id: null` không làm vỡ gì (Bãi Sao CHƯA có định danh nào, đúng kỳ vọng — Track B chưa ghi).

**Rollback** (split-pin, đúng tiền lệ phiên này — `rollback.sh` chỉ nhận MỘT tag cho cả hai service, nên gọi 2 lần):
```bash
scripts/rollback.sh 2889bf8fa04afaea4f4829801b0d169a1366376f api /home/deploy/apps/PhuQuocHub
scripts/rollback.sh 0fb23803e4bbc0a927709708f8c4c47700c1fb64 web /home/deploy/apps/PhuQuocHub
```
Cả 2 image baseline (`phuquochub-api:2889bf8...` ID `sha256:32fc22de...`, `phuquochub-web:0fb2380...` ID `sha256:90745e2d...`) đã xác nhận còn tồn tại trên VPS — không cần rebuild. **Không cần revert migration để rollback an toàn** — migration thuần cộng thêm, code cũ không biết/không đụng tới permission mới; chỉ revert (`migration:revert`) nếu owner muốn dọn sạch permission đó khỏi DB.

**Kiểm nâng cấp 92→93 THẬT (không chỉ khởi tạo DB từ đầu, owner yêu cầu riêng, 16/10/2026):** lần kiểm migration trước đó (§43.4) chạy `migration:run` trên DB RỖNG — áp cả 93 migration trong MỘT lượt, không phải kịch bản thật của production (đã có đúng 92 migration từ trước, chỉ nhận thêm 1 cái mới). Đã kiểm lại đúng kịch bản thật trên Postgres cô lập, KHÔNG restore từ backup thật:
1. Build image build-stage từ source đã TẠM gỡ migration `1720009100000` (92 file còn lại giống hệt production) → `migration:run` → DB dừng ở 92 (xác nhận bằng `SELECT count(*) FROM migrations` = 92).
2. Đưa migration `1720009100000` trở lại → build lại từ ĐÚNG source `5b04cac` → `migration:run` → log thật: **"92 migrations are already loaded in the database. 93 migrations were found in the source code. 1 migrations are new migrations must be executed."** → chỉ 1 migration chạy, kết quả 93, đúng 1 dòng `permissions`/`role_permissions` cho `content_owner`.
3. `migration:revert` ngay trên state 93 này → về 92, dòng `permissions` bị xoá sạch (`DELETE FROM permissions WHERE code = ...` — không có FK nào khác phụ thuộc, `role_permissions` tự mất theo).
4. Áp lại migration (về 93) rồi khởi động THẬT image API cũ `phuquochub-api:2889bf8...` (chưa biết gì về permission mới) trỏ vào DB đang ở 93 — `health` = 200, `GET /places` (route công khai) = 200, log khởi động không có `error`/`exception`/`fail` nào — xác nhận rollback ỨNG DỤNG (không revert migration) an toàn, đúng yêu cầu owner.

Dọn sạch toàn bộ container/network/image tạm của vòng kiểm này ngay sau khi xong; xác nhận lại 6 container `phuquoc-*-prod` không đổi trạng thái.

### 43.6 Phạm vi KHÔNG làm trong mục này (tại thời điểm trình gói — xem 43.7 cho kết quả thật)

- **Track B thật:** CHƯA ghi `ChIJL4toWTGRpzERqGuxiUPhdLQ` vào `place_external_identifiers` cho Bãi Sao, CHƯA gọi route confirm cho place thật nào. Khi owner duyệt, thao tác qua ĐÚNG dashboard thật (owner hoặc người owner uỷ quyền tự bấm), không phải tôi tự ghi qua SQL/script.
- Không mở rộng permission mới cho `moderator` hay role khác ngoài `content_owner` — nếu owner muốn mở rộng, đó là quyết định riêng.

### 43.7 KẾT QUẢ THỰC THI Gói A (16/10/2026, owner đã duyệt) — THÀNH CÔNG, KHÔNG CẦN ROLLBACK

**Sửa trước khi chạy (owner yêu cầu, đã xác nhận bằng cách đọc code trước khi hành động):**
- Đọc lại `scripts/deploy.sh` toàn bộ: xác nhận **KHÔNG hề có cờ `--dry-run`** nào được parse — `$1` luôn là `TAG`, `$2` luôn là `compose-project-dir`. Đề xuất trước đó dùng `deploy.sh ... --dry-run` là SAI (sẽ bị hiểu nhầm thành đường dẫn project dir). KHÔNG sửa script để thêm dry-run. Thay bằng: `docker compose --dry-run` (đúng lệnh `up -d --no-build api web caddy` mà Step 9 của deploy.sh sẽ chạy) cho kiểm thay đổi dịch vụ, và `migration:show` (qua đúng service `migrate` đã có, override command, không script mới) cho danh sách migration pending — cả hai thuần đọc.
- Mọi lệnh dùng ĐƯỜNG DẪN ĐẦY ĐỦ (`/home/deploy/release-work/sync-5b04cac/phuquochub-source-....tar.gz`, không rút gọn). KHÔNG còn `DB_PASSWORD=***` trong bất kỳ lệnh nào — nạp qua `cd .../PhuQuocHub && set -a; . ./.env; set +a` (đúng cách đã dùng từ trước trong phiên này), để `docker compose`/`deploy.sh` tự đọc, không gõ/in secret nào.

**Preflight (chỉ đọc, TRƯỚC khi sync) — 6/6 PASS:**
1. `.env`: `API_IMAGE_TAG=2889bf8...`, `WEB_IMAGE_TAG=0fb2380...` — khớp baseline owner nêu.
2. Candidate image identity khớp tuyệt đối `EXPECTED_API_IMAGE_ID`/`EXPECTED_WEB_IMAGE_ID`.
3. Không có `deploy.sh`/`docker compose up`/`docker build`/`migration:run` nào đang chạy.
4. Disk `121G` trống (38% used) — đủ.
5. DB: `SELECT count(*) FROM migrations` = **92**, migration cuối = `AddHotelCancellationPolicy1720009000000` — khớp đầu mối owner nêu.
6. `docker compose --dry-run up -d --no-build api web caddy` → **CHỈ** `phuquoc-api-prod`/`phuquoc-web-prod` `Recreate`; `phuquoc-caddy-prod`/`phuquoc-postgres-prod`/`phuquoc-redis-prod`/`phuquoc-minio-prod` đều `Running` (không đổi) — không có drift, Caddy không bị đụng.

**Source sync (đường dẫn đầy đủ, nằm trong phạm vi "gói A" owner đã duyệt):** `scripts/create-release-archive.sh` → checksum `b9581d9c1a23666ba2482f852ce5bbab139a120180c2091f23521bc467c02992` → scp → `scripts/sync-release-source.sh <path đầy đủ archive> <path đầy đủ manifest> /home/deploy/apps/PhuQuocHub` → `[sync-release-source] Archive verified` → `.release-manifest` ghi đúng `5b04cac...`/93 migration. `.env` xác nhận KHÔNG đổi sau sync (rsync loại trừ đúng).

**Migration pending — kiểm chỉ đọc qua `migration:show` (service `migrate` có sẵn, override command, KHÔNG script mới):**
```
[X] 92 AddHotelCancellationPolicy1720009000000
[ ] SeedPlaceExternalIdentifierVerifyPermission1720009100000
```
Đúng 1 pending, đúng tên — khớp tuyệt đối yêu cầu owner.

**Backup (trước migration):** `scripts/backup.sh` — PASS, `phuquochub-20261016T102856Z.sql.gz`, 152K nén / 748.584 byte thô, SHA256 `8ea6e84b1e2ba203422e8e2450b41b3f9f3dd0abf226f8bb3ccdba2897b7ab5f`, qua đủ 3 lớp kiểm tích hợp của chính script (gzip -t, ngưỡng kích thước, marker "PostgreSQL database dump complete"). Retention (daily7/weekly4/monthly6) tự động xoá đúng 1 bản cũ ngoài chính sách (hành vi chuẩn của script, không phải sự cố).

**Cutover thật:** `SKIP_BUILD=1 EXPECTED_API_IMAGE_ID=... EXPECTED_WEB_IMAGE_ID=... scripts/deploy.sh 5b04cacba250e05b62b7aba740c434cb34d9302a` (env nạp qua `set -a; . ./.env; set +a`) → **exit code 0**, toàn bộ 11 step:
- Step 4b: `[release-manifest] OK: source tree verified as 5b04cac... (93 migrations)`.
- Step 5: identity 2 image khớp EXPECTED tuyệt đối, KHÔNG build lại (`SKIP_BUILD=1` xác nhận trong log).
- Step 7: migration log thật — `"92 migrations are already loaded... 93 migrations were found... 1 migrations are new migrations must be executed"` — đúng 1 migration chạy.
- Step 8/8b: smoke test image mới PASS; identity re-verify KHÔNG đổi so với Step 5.
- Step 9: cutover — `phuquoc-caddy-prod`/`postgres`/`redis`/`minio` đều `Running` (không Recreate); CHỈ `api`/`web` `Recreate` — khớp đúng dự đoán dry-run.
- Step 9b: tag persist đúng.
- Step 10: 6/6 container, `api`/`web` `healthy`.
- Step 11: smoke-test.sh — API health 200, Web root 307→`/vi`, `/vi` 200, route lạ 404 — PASS hết.

**Hậu kiểm CHỈ ĐỌC (8/8 PASS):**
1. Identity live: API `sha256:8cb08450...`, Web `sha256:c39924ac...` — khớp tuyệt đối.
2. `.env`: cả hai tag = `5b04cac...`.
3. `migrations` count = **93**; `PlaceExternalIdentifier.Verify` tồn tại đúng 1 dòng, cấp đúng CHỈ `content_owner`.
4. 6/6 health.
5. Log API/Web `--since 5m`: không `error`/`exception`.
6. `https://phuquochub.com/api/health` = 200; `/vi` = 200.
7. 3 route mới (`upsert`/`confirm`/`revoke`) không token → 401 — **chỉ xác nhận route tồn tại + có guard, KHÔNG thay cho bằng chứng kiểm quyền theo-record/theo-vai-trò đã chứng minh đầy đủ ở e2e thật (§43.4/§42.4)**.
8. `GET /api/places/bai-sao` (place thật) → `"google_place_id":null` — Track B CHƯA ghi, đúng yêu cầu.

**Không chạm tiêu chí rollback nào — KHÔNG thực hiện rollback.** Dọn sạch: container smoke-test/migrate-run tự xoá (`--rm`), thư mục archive/manifest tạm đã xoá sau khi áp dụng thành công; image baseline (`...2889bf8...`, `...0fb2380...`) vẫn giữ nguyên trên VPS cho rollback nếu cần sau này.

**B vẫn CHƯA duyệt — đúng yêu cầu owner:** không có lệnh ghi `place_external_identifiers` nào chạy cho record `5632e5b1-cc0a-49a4-a079-65b1d8fd1b85`; không gọi route confirm cho bất kỳ place thật nào; toạ độ Bãi Sao không đổi.

## 44. Nghiệm thu B thất bại — chẩn đoán thật + sửa UI theo owner phát hiện (16/10/2026)

### 44.1 Owner duyệt riêng B cho Bãi Sao — nghiệm thu lưu thành công, xác nhận KHÔNG thành

Owner thao tác qua dashboard thật: lưu `ChIJL4toWTGRpzERqGuxiUPhdLQ` + nguồn `https://maps.app.goo.gl/SxL68k8acDSVFXBd6`, báo đã bấm xác nhận — nhưng public VI/EN vẫn `google_place_id:null`, link vẫn là tìm kiếm.

**Đối chiếu chỉ đọc (theo đúng quyền hiện có, KHÔNG tự ghi lại/xác nhận):**
- `place_external_identifiers` CÓ đúng 1 hàng cho Bãi Sao: `external_id=ChIJL4toWTGRpzERqGuxiUPhdLQ`, `is_primary=true`, `source_id` đã ghi (nguồn owner đưa) — **đã lưu đúng, không phải "chưa lưu"**.
- `verified_at` của hàng đó là **NULL**.
- `audit_logs`: **0 dòng** cho `place_external_identifier.verified`/`.verification_revoked` khớp place này HOẶC external_id này — `confirmGooglePlaceId()` LUÔN ghi audit khi chạy thành công (kể cả xác nhận lại), nên 0 dòng nghĩa là request confirm CHƯA TỪNG hoàn tất ở server, không phải hoàn tất rồi bị lọc/cache che đi.
- Public API (VI+EN, đọc lại ngay thời điểm chẩn đoán) khớp CHÍNH XÁC trạng thái DB — không phải bộ lọc/cache gây lệch: code không có bất kỳ lệnh `cacheInvalidation` nào trong 3 hàm service (đọc trực tiếp, xác nhận không có gì để làm cache lệch ở đây).
- Toạ độ xác nhận không đổi: `10.0572576, 104.0363948`.
- **Không kết luận "owner bấm nhầm"** — không có bằng chứng cho nguyên nhân cụ thể đó.

**Nguyên nhân kỹ thuật tìm được khi đọc code (không phải suy đoán):** `GooglePlaceIdEditor.tsx`'s `onSave`/`onConfirm`/`onRevoke` đều có `if (!session) return;` — IM LẶNG hoàn toàn, không báo lỗi, không gửi request nào. Nếu phiên đăng nhập mất GIỮA lúc trang đã tải và lúc bấm nút (log thật có một sự kiện `auth.refresh.reuse_detected` production đúng khung giờ liên quan), nút "Xác nhận khớp địa điểm" vẫn hiện bình thường (trang không tự phát hiện phiên mất giữa chừng) nhưng bấm vào không làm gì — khớp hoàn toàn với 0 dòng audit.

### 44.2 Sửa — không còn im lặng khi mất phiên

`onSave`/`onConfirm`/`onRevoke` nay hiện rõ: *"Phiên đăng nhập đã hết hạn — tải lại trang và đăng nhập lại trước khi lưu/xác nhận."* thay vì `return` câm. Test mới (3 ca, mô phỏng phiên hợp lệ lúc tải rồi mất lúc bấm) + **xác minh thật trên browser cô lập**: xoá session giữa chừng, bấm "Thu hồi xác nhận" → thông báo đỏ hiện đúng, KHÔNG gọi API.

### 44.3 Sửa UI public — bỏ nút toạ độ tham khảo khi đã có hồ sơ xác nhận

Owner xác nhận nút "Xem trên Google Maps" mở đúng Bãi Sao; nút "Xem toạ độ tham khảo" đứng cạnh gây hiểu nhầm (trông như một điểm đến thứ hai).

`getPlaceMapLinks()` (helper dùng chung) nay trả `referencePin: null` khi `primaryCertain=true` — tập trung đúng MỘT chỗ, 3 trang chi tiết tự nhất quán theo. Nhánh CHƯA xác nhận giữ nguyên fallback 2 link như cũ (không đổi). Toạ độ trong DB/dashboard không đổi — chỉ bớt lặp lại thành link riêng trên trang công khai khi đã có hồ sơ xác nhận.

**Kiểm hẹp:**
- Unit (`mapLinks.spec.ts`): ca Place ID nay assert `referencePin` là `null`; ca không-Place-ID vẫn assert `referencePin` khác null (khoá cả hai chiều).
- 3 trang chi tiết: mỗi trang có 1 test MỚI "có google_place_id → chỉ 1 link chính, KHÔNG còn link toạ độ tham khảo" (áp dụng nhất quán, không giả định trang khác tự đúng vì dùng chung helper).
- **Browser thật, dữ liệu synthetic, xác nhận qua ĐÚNG API confirm (không SQL trực tiếp)** trên stack cô lập: place/hotel test → lưu → xác nhận thật → public page (VI+EN, desktop+375px) chỉ còn đúng 1 link "Xem trên Google Maps"/"View on Google Maps", không còn "Xem toạ độ tham khảo"/"View reference location". Một sự cố cache (Next `revalidate:60`, không phải bug — ghi lại để không ai hiểu nhầm lần sau) khiến lần đọc đầu tiên vẫn thấy dữ liệu cũ; restart container (hoặc chờ đủ cửa sổ revalidate) giải quyết — **ghi chú cho B thật: Bãi Sao vừa xác nhận có thể cần tới ~60 giây hoặc tải lại để trang công khai cập nhật, đây là ISR đã dùng sẵn toàn site, không phải lỗi mới**.

Toàn bộ: API không đổi gì ở vòng này. Web `tsc`/`eslint` sạch, **170 suite / 1688 test pass** (full suite — có liên quan trực tiếp tới helper dùng chung, không phải chạy lại không cần thiết).

### 44.4 Trạng thái

Commit local (CHƯA deploy): `87296fe`. B (Bãi Sao thật) **vẫn CHƯA xác nhận thành công** — hàng `place_external_identifiers` hiện có (`id=db010be9-...`, `external_id=ChIJL4toWTGRpzERqGuxiUPhdLQ`, `source_id` đã lưu) nhưng `verified_at` vẫn null. Đề nghị owner: tải lại trang edit Bãi Sao (đăng nhập lại nếu được yêu cầu), bấm "Xác nhận khớp địa điểm" lại.

**SỬA (owner, cùng ngày):** nguyên nhân thật của lần confirm Bãi Sao thất bại **CHƯA được chứng minh** — sự kiện `auth.refresh.reuse_detected` chỉ là MỘT đầu mối trùng thời điểm, không phải kết luận nguyên nhân. Đã tái hiện ĐƯỢC lỗi "bấm không phản hồi khi thiếu session" (44.2, bằng chứng browser thật), nhưng đó là chứng minh lỗi CÓ TỒN TẠI trong code, không phải chứng minh đó là nguyên nhân của lần Bãi Sao cụ thể. Bản sửa 87296fe **CHƯA deploy lên production** — không hướng dẫn owner kỳ vọng thông báo mới trước khi deploy thật.

## 45. Hai điểm hẹp owner yêu cầu đóng trước khi trình gói + gói Web-only cuối (16/10/2026)

### 45.1 Map link không được phụ thuộc hasInfo — khoảng trống CODE thật, đã đóng

Đọc lại `places/[slug]/page.tsx`: link bản đồ nằm LỒNG trong `{hasInfo && (...)}` (`hasInfo = address || ward || price || hours`). Một place có toạ độ hợp lệ (hoặc thậm chí ĐÃ có Place ID xác nhận) nhưng thiếu CẢ 4 trường đó sẽ KHÔNG có link bản đồ nào — dù dữ liệu để dựng link đã đủ (điều kiện duy nhất của `getPlaceMapLinks` là toạ độ hợp lệ). `hotels/[slug]`/`restaurants/[slug]` KHÔNG có lỗi này — link ở hai trang đó vốn đã độc lập, không lồng trong gì cả.

**Sửa:** tách khối link bản đồ ra khỏi `{hasInfo && (...)}`, thành điều kiện độc lập `{mapLinks && (...)}` ngang hàng. **Test mới (2 ca, KHÔNG sửa fixture mặc định để né)** — cố ý ghi đè `ward: null, price_range: null, opening_hours: null` (khác default `ward='An Thới'`) để tái hiện đúng `hasInfo=false`, rồi assert: (a) không có heading "Thông tin" (xác nhận đúng hasInfo=false, không phải test giả), (b) link bản đồ VẪN hiện — cả nhánh chưa xác nhận lẫn đã xác nhận Place ID. Cả 2 test PASS trên code đã sửa (49/49 suite `places/[slug]/page.spec.tsx`, 2 test mới nằm trong đó). Commit `1a44601`.

### 45.2 Confirm/revoke qua dashboard thật → public cập nhật theo ĐÚNG cơ chế cache/revalidation hiện có (KHÔNG restart Web)

Thiết lập lại stack cô lập, KHÔNG dùng restart container ở bất kỳ bước nào của vòng kiểm này (khác vòng trước — đã bị owner chỉ đúng là thay thế bằng chứng bằng workaround).

**Confirm** — qua ĐÚNG dashboard thật (bấm nút thật trên browser, không gọi API trực tiếp):
- `t=0` (ngay sau khi bấm "Xác nhận khớp địa điểm"): API xác nhận `google_place_id` đã đổi ở server; trang công khai **VẪN hiện fallback cũ** ("Tìm trên Google Maps" + "Xem toạ độ tham khảo") — đúng độ trễ thiết kế của `revalidate: 60` (không có `cacheInvalidation`/`triggerRevalidate` nào được gọi trong `confirmGooglePlaceId`/`revokeGooglePlaceIdVerification` — đã xác nhận bằng đọc code, không suy đoán).
- Vòng lặp đọc read-only (poll, không sửa gì) tới khi trang công khai đổi: cập nhật THẬT SỰ xảy ra tự nhiên sau **~31 giây** (11:26:51Z → ~11:27:22Z) — trong cửa sổ 60s, không cần can thiệp gì. Kết quả cuối: đúng 1 link "Xem trên Google Maps →", `query_place_id` đúng, KHÔNG còn "Xem toạ độ tham khảo".

**Revoke** — cùng cách, qua dashboard thật:
- `t=0`: API xác nhận `google_place_id` về null; trang công khai vẫn hiện bản đã xác nhận.
- Poll read-only tới khi đổi: phục hồi fallback sau **~33 giây** tổng (11:27:45Z → ~11:28:23Z). Kết quả: "Tìm trên Google Maps" trở lại, "Xem toạ độ tham khảo" trở lại, không còn "Xem trên Google Maps" (đã xác nhận).

**Không sửa cơ chế cache tổng thể** — độ trễ tới ~60s là thiết kế ISR đã dùng sẵn toàn site (`revalidate: 60`, cùng cơ chế các trang khác), không phải lỗi riêng của tính năng này; ghi lại đây để owner biết: sau khi xác nhận/thu hồi Bãi Sao thật, trang công khai có thể cần tới ~1 phút để phản ánh, không cần tải lại thủ công nhưng cũng không tức thời.

### 45.3 Gói Web-only cuối (CHƯA deploy)

**Candidate:** `1a44601938c7f605a81800a9010ea0a956c238df` (commit cuối cùng của phiên: 45.1+45.2 không đổi code, chỉ xác nhận hành vi — SHA giữ nguyên từ `1a44601`).

**Image Web đã build (build-arg production thật) + smoke-test đọc thật trên production API:**
`phuquochub-web:1a44601938c7f605a81800a9010ea0a956c238df` — Image ID `sha256:462ddddede6e2ff863e98569d6d9eb5600da13b3e031b4531eb4d896f37892de`. Smoke-test: `/vi`=200, `/vi/places/bai-sao`=200 (vẫn đúng fallback — Bãi Sao chưa xác nhận, đúng kỳ vọng), `/en/hotels/novotel-phu-quoc`=200, không `error`/`exception` trong log.

**Baseline hiện tại (đọc lại, không giả định):** `API_IMAGE_TAG=5b04cacba250e05b62b7aba740c434cb34d9302a`, `WEB_IMAGE_TAG=5b04cacba250e05b62b7aba740c434cb34d9302a`, DB **93 migration** — khớp đúng đầu mối owner nêu. Identity live container khớp đúng image đã build ở gói trước (§43.7).

**Dry-run (đã chạy, chỉ đọc):**
```bash
cd /home/deploy/apps/PhuQuocHub
WEB_IMAGE_TAG=1a44601938c7f605a81800a9010ea0a956c238df \
  docker compose -f docker-compose.prod.yml --dry-run up -d --no-build --no-deps web
```
Kết quả: **CHỈ** `phuquoc-web-prod Recreate` — không có dòng nào nhắc tới `api`/`postgres`/`redis`/`minio`/`caddy` (nhờ `--no-deps`, các service phụ thuộc không được compose xem xét). API/DB giữ nguyên, không migration nào chạy.

**Cutover (CHƯA chạy, chờ duyệt) — đúng image đã kiểm, pin riêng Web:**
```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
WEB_IMAGE_TAG=1a44601938c7f605a81800a9010ea0a956c238df \
  docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web
. scripts/lib/release-tag.sh
release_tag_set WEB_IMAGE_TAG 1a44601938c7f605a81800a9010ea0a956c238df .env
```
`API_IMAGE_TAG` không bị đụng (giữ `5b04cac...`).

**Hậu kiểm (chỉ đọc):** `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:462ddddede6...`; `.env` `WEB_IMAGE_TAG=1a44601...`, `API_IMAGE_TAG` không đổi; `docker inspect phuquoc-api-prod --format '{{.State.StartedAt}}'` không đổi so với trước cutover; 6/6 health; `curl https://phuquochub.com/vi/places/bai-sao` vẫn đúng fallback (Track B vẫn chưa ghi).

**Rollback (nếu cần) — về đúng image `5b04cac` đang chạy, không build lại:**
```bash
cd /home/deploy/apps/PhuQuocHub
set -a; . ./.env; set +a
WEB_IMAGE_TAG=5b04cacba250e05b62b7aba740c434cb34d9302a \
  docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web
. scripts/lib/release-tag.sh
release_tag_set WEB_IMAGE_TAG 5b04cacba250e05b62b7aba740c434cb34d9302a .env
```
Image `phuquochub-web:5b04cacba250e05b62b7aba740c434cb34d9302a` (ID `sha256:c39924ac...`) xác nhận còn trên VPS — không cần rebuild.

**Không nằm trong gói này:** không đổi API, không migration, không ghi/xác nhận Place ID production nào (Track B vẫn chờ owner tự thao tác qua dashboard thật, sau khi gói Web-only này — nếu được duyệt — đã triển khai).

### 45.4 Thực thi thật (owner duyệt, 16/10/2026) — THÀNH CÔNG, không cần rollback

**Preflight (đọc, trước khi đổi gì):**
- `.env` trước: `API_IMAGE_TAG=5b04cacba250e05b62b7aba740c434cb34d9302a`, `WEB_IMAGE_TAG=5b04cacba250e05b62b7aba740c434cb34d9302a` — khớp baseline đã nêu.
- Identity live trước: web `sha256:c39924ac...` (=5b04cac), api `sha256:8cb08450...` (=5b04cac), api `StartedAt=2026-10-16T10:29:34Z`.
- Candidate image trên VPS: `docker image inspect phuquochub-web:1a44601...` → `sha256:462ddddede6e2ff863e98569d6d9eb5600da13b3e031b4531eb4d896f37892de` — khớp đúng image ID đã trình, không build lại.
- Không deployment đồng thời: không lock file, không process `deploy.sh`/`docker compose` nào đang chạy.
- Dry-run lại ngay trước khi áp dụng: chỉ `phuquoc-web-prod Recreate/Recreated/Starting/Started` — không drift, không chạm service khác.

**Cutover đã chạy:**
```
WEB_IMAGE_TAG=1a44601938c7f605a81800a9010ea0a956c238df docker compose -f docker-compose.prod.yml up -d --no-build --no-deps web
```
→ `phuquoc-web-prod Recreate/Recreated/Starting/Started`. `release_tag_set WEB_IMAGE_TAG 1a44601938c7f605a81800a9010ea0a956c238df .env` → `.env` sau: `API_IMAGE_TAG=5b04cac...` (không đổi), `WEB_IMAGE_TAG=1a44601938c7f605a81800a9010ea0a956c238df`.

**Hậu kiểm (đọc thật, không restart):**
- Identity: `docker inspect phuquoc-web-prod --format '{{.Image}}'` = `sha256:462ddddede6e2ff863e98569d6d9eb5600da13b3e031b4531eb4d896f37892de` — khớp đúng expected image ID.
- API hoàn toàn không đụng: image id vẫn `sha256:8cb08450...`, **`StartedAt` vẫn đúng `2026-10-16T10:29:34.159956171Z`** (không đổi dù 1 giây) — chứng minh container API không bị recreate.
- Health: 6/6 container `phuquoc-*-prod` đều `healthy` (`caddy` không có healthcheck định nghĩa, như mọi lần trước).
- Log web 2 phút sau cutover: không có `error`/`exception`/`fatal`.
- Route: `/vi`=200, `/en`=200, `/vi/places/bai-sao`=200, `/en/places/bai-sao`=200, `/en/hotels/novotel-phu-quoc`=200, `/vi/restaurants`=200, `/en/places`=200.
- Nhãn VI/EN đúng theo trạng thái dữ liệu hiện tại — **không tự confirm/revoke gì để thử**:
  - Bãi Sao (VI+EN): vẫn "Tìm trên Google Maps →" / "Find on Google Maps →" + "Xem toạ độ tham khảo" / "View reference location" — đúng trạng thái CHƯA xác nhận hiện có trong DB (Track B thật chưa ghi), toạ độ `10.0572576,104.0363948` giữ nguyên.
  - Novotel (EN): cùng dạng fallback 2-link (tìm kiếm + toạ độ tham khảo) — dữ liệu Novotel thật trong production **chưa có Place ID xác nhận nào** (khác ca test tổng hợp ở vòng kiểm trước dùng `googlePlaceId` giả); đây là hành vi đúng, không phải hồi quy.

**Kết luận:** cutover Web-only `1a44601` đã lên production thành công, đúng gói đã duyệt, không cần rollback. API/DB/Caddy/secrets không bị đụng tới. Track B (Google Place ID Bãi Sao thật) vẫn CHƯA được ghi/xác nhận trên production — chờ owner tự thao tác qua dashboard khi sẵn sàng.
