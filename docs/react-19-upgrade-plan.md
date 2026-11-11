# Kế hoạch nâng cấp React 18 → 19 (apps/web)

Ngày lập: 2026-11-06. **CẬP NHẬT 2026-11-11: ĐÃ DEPLOY PRODUCTION.** Image
`phuquochub-web:838c69de422180661882ca5385e24e26c3ffa0a9` (commit `838c69d`) live từ 2026-11-11
05:2x UTC qua staged single-service cutover (web-only, API không đổi). Rollback target:
`WEB_IMAGE_TAG=fix-image-stretch-20261030` (bản trước, vẫn giữ trên VPS). Phần "Các bước đề xuất"
bên dưới giữ nguyên để tham khảo; thực tế đã làm và phát hiện thêm được ghi ở cuối file, mục
"Kết quả thực tế (2026-11-11)".

## Hiện trạng

| Mục | Giá trị |
|---|---|
| `react` / `react-dom` (apps/web) | `^18.3.1` (đang cài 18.3.1) |
| `@types/react` | `^18.3.3` (đang cài 18.3.31) |
| `next` | `^16.4.2` |
| `@testing-library/react` | 16.3.3 |

## Đã quét mã nguồn (apps/web/src)

Các thay đổi phá vỡ chính của React 19 và số lần xuất hiện trong dự án:

| Thay đổi trong React 19 | Số lần gặp | Mức rủi ro |
|---|---|---|
| `forwardRef` (không còn cần thiết) | 0 | Không ảnh hưởng |
| `defaultProps` trên function component | 0 | Không ảnh hưởng |
| `propTypes` | 0 | Không ảnh hưởng |
| String ref (`ref="..."`) | 0 | Không ảnh hưởng |
| `ReactDOM.render` / `hydrate` (API cũ) | 0 | Không ảnh hưởng |
| `useRef()` không có tham số | 0 | Không ảnh hưởng |
| `React.FC` | 0 | Không ảnh hưởng |
| `react-dom/test-utils` | 0 trong `src` | Không ảnh hưởng |
| Namespace `JSX` toàn cục (`JSX.Element`) | 1 | Thấp: sửa thành `React.JSX.Element` |
| `Context.Provider` | 2 | Thấp: vẫn hoạt động, có thể đổi thành `<Context>` sau |

Kết luận: mã của dự án gần như không dùng API đã bị loại bỏ. Rủi ro chủ yếu nằm ở thư viện bên thứ ba và ở kiểu dữ liệu TypeScript.

## Tương thích

- `next@16.4.2` khai báo peer `react: ^18.2.0 || ^19.0.0`, nên Next không chặn việc nâng cấp.
- `@testing-library/react@16.3.3` hỗ trợ `react ^18.0.0 || ^19.0.0`.
- `maplibre-gl` không phụ thuộc React.
- Cần kiểm tra thêm từng thư viện UI khác trước khi nâng (chạy `npm ls react` sau khi cài).

## Các bước đề xuất

1. **Nhánh riêng** từ nhánh chính. Không làm trên nhánh đang có thay đổi chưa commit.
2. Nâng `react`, `react-dom`, `@types/react`, `@types/react-dom` lên `^19`. Chạy `npm install`, rồi `npm ls react` để tìm xung đột phiên bản.
3. Sửa `JSX.Element` (1 chỗ) sang `React.JSX.Element`.
4. Chạy kiểm tra kiểu và lint: `npm run typecheck` và `npm run lint` trong `apps/web`.
5. Chạy unit test (`@testing-library/react`) và build production: `npm run build`.
6. Kiểm tra trực tiếp trên trình duyệt ở 375px và desktop: trang chủ, `/map`, trang chi tiết địa điểm, form thêm địa điểm, dashboard. Mục tiêu là không có lỗi hydration trong console.
7. Build image Docker với đầy đủ 4 `--build-arg NEXT_PUBLIC_*`, theo quy trình release hiện có.
8. Triển khai lên production như các đợt trước: tag mới (không tái sử dụng tag cũ), giữ bản rollback, kiểm tra sức khoẻ sau khi chuyển.

## Rủi ro và cách giảm

- **Lỗi hydration** (SSR khác client): kiểm tra console trên các trang có nội dung thay đổi theo thời gian hoặc theo locale.
- **Thư viện bên thứ ba chưa hỗ trợ 19**: nếu có, giữ thư viện đó ở phiên bản cũ hoặc thay thế trước khi nâng.
- **Kiểu TypeScript**: `@types/react` 19 đổi một số kiểu toàn cục; `tsc` sẽ báo lỗi, sửa theo từng chỗ.

## Quay lui

Nếu có lỗi sau triển khai: quay về tag web trước đó trong `.env` (`WEB_IMAGE_TAG`) theo quy trình rollback hiện có. Không xoá tag cũ cho đến khi bản mới ổn định ít nhất vài ngày.

## Thời điểm

Không gấp. Nên làm trước khi nâng Next lên phiên bản yêu cầu React 19 bắt buộc.

## Kết quả thực tế (2026-11-11)

Đã làm bước 1-5 trong "Các bước đề xuất" ở trên (trên nhánh đang dùng `feat/beach-details-cas`,
không tạo nhánh riêng — nhánh đó đã là nơi mọi việc trong phiên này diễn ra).

- **Phát hiện ngoài kế hoạch, quan trọng:** chỉ bump version trong `apps/web/package.json` KHÔNG
  đủ — `npm install` để lại 2 bản React trong cây phụ thuộc (root vẫn 18.3.1, apps/web lồng
  19.3.1 riêng), vì `next`, `@tiptap/react`, `@sentry/react`, `@testing-library/react` vẫn trỏ
  về bản root cũ. Phải thêm `overrides` ở `package.json` gốc ép `react`/`react-dom` về đúng
  19.3.1 toàn repo, **và xoá sạch `node_modules` + `package-lock.json` làm lại từ đầu** —
  override không tự áp dụng nếu chỉ chạy `npm install` thông thường trên cây đã có sẵn.
- Mục "JSX.Element toàn cục" trong bảng quét ở trên **không cần sửa** — file đó đã
  `import type { JSX } from 'react'` đúng chuẩn React 19 từ trước.
- 5 file test (8 test) hỏng do thay đổi thời gian xử lý của React 19 — tất cả cùng một lỗi:
  `waitFor` chỉ chờ "mock đã được gọi", không chờ `setState` sau `.then()` của nó thực sự render
  xong. Đã sửa bằng `findBy*`/`waitFor` trên kết quả render thật, không phải trên việc mock được
  gọi. Xem commit `416f6ad` để biết chi tiết từng file.
- Build production (`next build`) biên dịch sạch. Kiểm tra trình duyệt thật: **lần build đầu tiên
  thiếu `NEXT_PUBLIC_API_URL`/`SITE_URL`/`MAP_TILE_URL` tái hiện đúng sự cố
  2026-10-30** (ảnh hưởng y hệt — các lệnh gọi API phía client bị đóng cứng vào
  `localhost:4000`, gây lỗi React #441 trên `/map`). Build lại với đúng 3 biến (lấy từ `.env`
  production thật qua SSH) thì lỗi biến mất hoàn toàn — xác nhận đây không phải lỗi React 19, mà
  là lỗi thao tác build cục bộ của tôi.
- Trang chủ và `/map` kiểm tra sạch (console không lỗi, trừ 1 cảnh báo "Worker failed to load"
  của maplibre-gl đã tồn tại từ trước trên cả production React 18 — không liên quan nâng cấp).
  Trang chi tiết địa điểm chỉ kiểm tra được giới hạn cục bộ vì CORS của API production chỉ cho
  phép gọi từ đúng domain `phuquochub.com`, không cho `localhost` — cần domain thật hoặc stack
  cô lập để kiểm tra đầy đủ dashboard/form trước khi chốt deploy.
- **Chưa làm (lúc viết đoạn trên):** bước 6 (test trình duyệt đầy đủ dashboard/form) chưa xong
  trọn vẹn vì giới hạn CORS cục bộ nêu trên; bước 7-8 (build Docker image + deploy production)
  hoàn toàn chưa làm, cần owner duyệt riêng.

## Deploy production (2026-11-11)

Owner duyệt deploy ngay sau khi CI xác nhận sạch. Thực hiện qua quy trình "staged single-service
cutover" (chỉ build/deploy lại `web`, không đụng `api`), KHÔNG dùng `scripts/deploy.sh` trọn vẹn vì
script đó build + cutover cả api lẫn web cùng lúc — không cần thiết cho một thay đổi chỉ ở
`apps/web`, và theo [[release-tag-governance]] việc đổi tag luôn tốn một lần recreate container dù
image giống hệt, nên tránh recreate container api không cần thiết.

Các bước đã chạy:
1. `scripts/create-release-archive.sh 838c69de...` (local) → archive + manifest checksum cho đúng
   commit `838c69d`.
2. `scp` lên VPS, `scripts/sync-release-source.sh` áp dụng cây nguồn đã verify checksum lên
   `/home/deploy/apps/PhuQuocHub` (xác nhận qua `.release-manifest`).
3. `docker build -f apps/web/Dockerfile` trực tiếp trên VPS với đủ 4 `--build-arg NEXT_PUBLIC_*`
   (giá trị đọc từ `.env` thật qua SSH, không hard-code) + `GIT_COMMIT`/`BUILD_DATE` để image mang
   label `org.opencontainers.image.revision` — xác nhận bằng `docker image inspect`.
   `NEXT_PUBLIC_SENTRY_DSN` production hiện để trống (chưa cấu hình Sentry DSN công khai nào trong
   `.env` — giữ nguyên hiện trạng, không phải lỗi mới).
4. Smoke test image độc lập (container riêng, chưa cutover): `/` → 307 → `/vi` → 200, log sạch.
5. Cutover: `WEB_IMAGE_TAG=838c69d... docker compose -f docker-compose.prod.yml up -d --no-build
   --no-deps web`, sau đó `release_tag_set WEB_IMAGE_TAG` để `.env` khớp thực tế ngay
   (theo [[release-tag-governance]], tránh lặp lại bẫy drift tag cũ).
6. `scripts/smoke-test.sh http://127.0.0.1:8080` sau cutover: health/root-redirect/`/vi`/404 đều
   pass.
7. Kiểm tra thật trên domain production qua Browser pane: trang chủ (`phuquochub.com/vi`) console
   sạch; `/map` render đúng (marker, cluster, tile) — cảnh báo "Worker failed to load"/MIME-type
   vẫn xuất hiện nhưng đã xác nhận đây là lỗi cũ tồn tại từ trước trên cả React 18, không phải hồi
   quy của bản nâng cấp này.
8. Dọn file archive/manifest tạm trên cả hai máy sau khi xong (không để lại trong `scripts/` hay
   trên VPS ngoài `.release-manifest`).

Rollback (nếu cần sau này): `scripts/rollback.sh fix-image-stretch-20261030 web` — image cũ vẫn
còn giữ trên VPS, chưa xoá.

Còn lại CHƯA làm trong đợt này: kiểm tra trình duyệt đầy đủ các trang cần đăng nhập (dashboard,
form) trên chính domain thật (chỉ mới kiểm tra trang công khai) — rủi ro thấp vì CI đã pass unit
test cho các trang đó, nhưng chưa xác nhận bằng mắt trên production thật.
