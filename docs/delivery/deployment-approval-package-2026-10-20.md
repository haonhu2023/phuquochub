# Gói duyệt triển khai — 20/10/2026

Candidate: commit `7629b50c444045728796349b7d2a25e0921bb153` (nhánh `feat/beach-details-cas`,
HEAD tại thời điểm viết tài liệu này). Tài liệu này tự thân đủ để owner duyệt bước cutover — KHÔNG
có bước ghi/mutating nào đã chạy trên production. Dừng đúng ở đây, chờ owner duyệt tiếp.

## 1. Phạm vi + định danh artifact

**Phạm vi nội dung** (điểm 1-5 của yêu cầu "73a5"): sửa lỗi rent-listing CAS (`27d9517`), hoàn
thành Gói D rich-text cho places/hotels/restaurants/tours (`c6feeb2`/`502f685`/`404c4a7`), sửa SEO
hreflang/canonical job+real-estate (`bf3fff9` → sửa lại `2448b7f`), sửa audit log/5 suite e2e đã
phân loại (không sửa — xem checkpoint.md), security fix rich-text length guard (`404c4a7`), fix
e2e state leakage (`1e54227`), sửa comment sitemap (`7629b50`). KHÔNG mở rộng tính năng tương tác/AI
mới (đúng yêu cầu owner) — chỉ viết backlog (§4 checkpoint.md), chưa xây.

**Full SHA:** `7629b50c444045728796349b7d2a25e0921bb153`
**API candidate image ID:** `sha256:b34f52bfa6a0d1f3de529476e2bdb869f4a45ffe93ace85ebffaf7ef92d76fee`
**Web candidate image ID:** `sha256:09d896659017a38274f836dd9734849ca81c7ae91b253a96bea0714d7bcd70d7`

Cả hai image build TRÊN CHÍNH VPS (không phải máy dev), từ source đã khoá bằng
`scripts/create-release-archive.sh` + `scripts/sync-release-source.sh` (sha256 archive xác minh:
`2eb6391dd951276f0d46afb228f13bfd9a5c216e270de919cdece0418848a487`), dùng ĐÚNG build-args
production thật (`NEXT_PUBLIC_API_URL=https://phuquochub.com/api`,
`NEXT_PUBLIC_SITE_URL=https://phuquochub.com`), vào một thư mục CÔ LẬP
(`/home/deploy/release-candidates/7629b50.../`) — KHÔNG đụng cây `/home/deploy/apps/PhuQuocHub`
đang chạy thật.

## 2. Baseline production + danh sách migration đầy đủ

**Xác nhận LẠI qua SSH read-only hôm nay (không suy đoán từ bộ nhớ cũ — bộ nhớ trước đó, `1f0c2c3`
26/9, đã lỗi thời, có ít nhất một lần deploy khác chưa ghi nhận):**

| | API | Web |
|---|---|---|
| Tag đang pin (`.env`) | `5b04cacba250e05b62b7aba740c434cb34d9302a` | `d2f5bf8b6a0efa00b7edae8d3650ec15696e35e5` |
| Container tạo lúc | 2026-10-16 (4 ngày trước) | 2026-10-17 (3 ngày trước) |
| Trạng thái hiện tại | `Up ... (healthy)` | `Up ... (healthy)` |
| Image còn giữ trên VPS | Có (xác nhận `docker images`) | Có |

→ API và Web ĐANG pin khác commit nhau (đúng như thiết kế rollback độc lập đã tài liệu hoá).
Migration count tại CHÍNH commit `5b04cac` (đọc qua `git show`, không phải suy đoán) = **93** —
khớp con số baseline đã dùng xuyên suốt phiên làm việc này.

**10 migration mới (94→103, đã test — xem mục 3):**

| # | File | Mục đích | Rủi ro |
|---|---|---|---|
| 94 | `InitJobListingTranslations` | Bảng `job_listing_translations` (bản dịch EN job) | Thấp — CREATE TABLE mới |
| 95 | `AddJobListingTranslationCasAndSnapshot` | CAS (`content_version`) + snapshot published cho bản dịch job | Thấp — ADD COLUMN có default |
| 96 | `InitRealEstateListingTranslations` | Bảng `real_estate_listing_translations` | Thấp — CREATE TABLE mới |
| 97 | `AddJobListingDescriptionRich` | `job_listings.description_rich` (JSONB nullable) | Thấp — ADD COLUMN nullable |
| 98 | `AddJobListingRichTextHashesAndFields` | `requirements_rich`/`benefits_rich` + 3 cột hash | Thấp — ADD COLUMN nullable |
| 99 | `AddJobListingTranslationDescriptionRich` | Rich cho mô tả bản dịch job (nháp+published) | Thấp — ADD COLUMN nullable |
| 100 | `AddRealEstateListingRichText` | Rich cho description/utilities_note/legal_status_note (gốc+dịch) | Thấp — ADD COLUMN nullable |
| 101 | `AddJobListingTranslationCriticalFieldsHash` | Hash hẹp phát hiện lệch dữ kiện quan trọng (job) | Thấp — ADD COLUMN nullable |
| 102 | `AddRealEstateListingTranslationCriticalFieldsHash` | Hash hẹp tương ứng cho BĐS | Thấp — ADD COLUMN nullable |
| 103 | `AddPlaceTranslationRichDoc` | `place_translations.rich_doc` (JSONB nullable, dùng chung mọi field_key) | Thấp — ADD COLUMN nullable |

Đã đọc trực tiếp `up()`/`down()` của cả 10 file: KHÔNG có `DROP COLUMN`/`RENAME`/`ALTER ... SET NOT
NULL`/đổi kiểu dữ liệu nào trên bảng ĐANG CÓ dữ liệu trong `up()` (các `DROP COLUMN` duy nhất nằm
trong `down()` — đường rollback CỦA CHÍNH migration, không chạy khi deploy xuôi). Toàn bộ additive.

## 3. Kết quả test + lỗi còn lại + tác động thật

**Test suite tĩnh:** 789 test API + 622 test Web pass (chạm đủ job-listings/real-estate-listings/
place-translations/places/rich-doc/common). 1 lỗi e2e thật tìm + sửa qua chính lượt chạy (state
leak giữa 2 test, commit `1e54227`). 5 suite e2e còn lỗi — ĐÃ phân loại root-cause cụ thể, 0 cần
sửa trước release (bảng đầy đủ: [checkpoint.md](checkpoint.md) mục "Làm rõ 5 suite e2e còn lỗi").

**Test nâng cấp thật (hôm nay, trên chính 2 image candidate ở trên, không phải máy dev):**
1. Dựng Postgres+Redis CÔ LẬP trên VPS (network/container riêng, không đụng `postgres-prod`/
   `redis-prod`). Chạy ĐÚNG 93 migration đầu (bỏ 10 file mới) → xác nhận khớp baseline production.
2. Chèn dữ liệu TỔNG HỢP (synthetic) mô phỏng bản ghi CŨ thật — 1 job listing published + 1 tin
   BĐS cho thuê published, cả hai chỉ có cột plain (KHÔNG có rich/hash) — đúng hình dạng dữ liệu
   production đang có trước migration này.
3. Chạy tiếp 10 migration mới → cả 10 áp dụng sạch, **103/103** migration trong bảng `migrations`.
   Dữ liệu cũ nguyên vẹn: cột plain giữ nguyên, cột rich/hash mới đều `NULL` (không bị hỏng/default
   sai) — xác nhận bằng SQL trực tiếp.
4. Boot image API candidate (`phuquochub-api:candidate-...`) trỏ vào DB vừa nâng cấp → health
   check `200 {"status":"ok", database: up, redis: up}`. `GET /api/job-listings/:id` và
   `GET /api/real-estate-listings/:id` cho 2 bản ghi cũ trả **200**, field `*_rich` đúng `null`,
   field plain hiển thị nguyên văn — chứng minh dữ liệu cũ phục vụ đúng qua code MỚI.
5. Chèn thêm 1 bản dịch EN "published" tổng hợp cho job listing cũ (mô phỏng "đã duyệt từ trước,
   hash chưa từng tính" — `published_critical_fields_hash=NULL`, đúng case `isJobListingTranslationCriticallyStale()` đã xử lý tường minh: hash null → không suy diễn ẩn) → `GET .../?locale=en` trả
   đúng `locale:"en"`.
6. Boot image Web candidate (`phuquochub-web:candidate-...`) trỏ vào API candidate ở trên (qua
   `API_INTERNAL_URL` — biến server-side, KHÔNG phải `NEXT_PUBLIC_API_URL` baked lúc build) →
   render **CHÍNH** 2 trang:
   - `/en/jobs/22222222-...` (có bản dịch EN thật): canonical tự trỏ
     `https://phuquochub.com/en/jobs/...`, hreflang CÓ cả vi+en+x-default, **không có** thẻ
     `robots noindex` — đúng thiết kế.
   - `/en/real-estate/33333333-...` (CHƯA có bản dịch): `<meta name="robots" content="noindex,
     follow"/>`, canonical vẫn tự trỏ `/en/...`, hreflang CHỈ còn vi+x-default (không quảng cáo
     "en" giả) — đúng thiết kế, khớp 12 test jest đã viết.
   - `/vi/jobs/22222222-...`: body chứa nguyên văn mô tả cũ ("Mo ta cu, du lieu tao TRUOC khi co
     rich text.") — xác nhận dữ liệu cũ render đúng trên chính trang thật, không chỉ qua API JSON.

Đây là bằng chứng MỚI (khác evidence cũ) — phần việc evidence cũ CHƯA từng chứng minh được: "nâng
cấp từ baseline thật với dữ liệu CŨ thật có hoạt động đúng trên image production-build hay không."

**Lỗi còn lại sau khi test xong:** KHÔNG có lỗi nào phát sinh từ 10 migration/2 image candidate.
5 suite e2e bitrot (mục trên) không liên quan tới phạm vi migration này.

## 4. Backup + thứ tự chạy + điều kiện dừng (dùng ĐÚNG script có sẵn, đã đọc `scripts/deploy.sh`
thật — không giả định `--dry-run` hay chế độ chỉ-Web nào tồn tại; KHÔNG CÓ CẢ HAI)

Script thật KHÔNG hỗ trợ dry-run và KHÔNG hỗ trợ deploy chỉ-Web — `deploy.sh` luôn build/cutover
CẢ api+web+caddy cùng lúc (`$COMPOSE up -d --no-build api web caddy`). Muốn deploy TÁCH RIÊNG một
dịch vụ phải tự thao tác `docker compose up -d --no-build <service>` thủ công ngoài script này
(không khuyến nghị — mất tính năng kiểm tra toàn vẹn 2 bước của script).

**Thứ tự đúng, từng bước, dùng script thật:**

1. **Backup trước (bắt buộc, KHÔNG nằm trong `deploy.sh`):** `scripts/backup.sh` — chạy trên VPS,
   không tham số (mặc định đúng `/home/deploy/apps/PhuQuocHub`). Tạo `pg_dump` dạng SQL+gzip, có
   checksum, theo policy retention đã có (7 ngày/4 tuần/6 tháng).
2. **Đồng bộ source đã khoá vào cây PRODUCTION thật** (bước MUTATING đầu tiên, CHƯA chạy):
   `scripts/sync-release-source.sh <archive> <manifest> /home/deploy/apps/PhuQuocHub` — dùng CHÍNH
   archive/manifest đã tạo ở mục 1 (sha256 đã khớp), áp vào cây thật (khác thư mục cô lập đã test).
3. **Gắn lại tag candidate khớp đúng `$TAG`** mà `deploy.sh` cần (ảnh đã build/test tên
   `candidate-7629b50...`, cần tag thêm bản không-prefix để dùng `SKIP_BUILD=1`):
   ```
   docker tag phuquochub-api:candidate-7629b50c444045728796349b7d2a25e0921bb153 phuquochub-api:7629b50c444045728796349b7d2a25e0921bb153
   docker tag phuquochub-web:candidate-7629b50c444045728796349b7d2a25e0921bb153 phuquochub-web:7629b50c444045728796349b7d2a25e0921bb153
   ```
4. **Chạy deploy.sh với `SKIP_BUILD=1`** (dùng lại CHÍNH image đã test ở mục 3, không build lại —
   đúng khuyến nghị của chính comment trong deploy.sh: build lại sẽ âm thầm thay một artifact CHƯA
   kiểm chứng vào chỗ bản đã test):
   ```
   SKIP_BUILD=1 \
   EXPECTED_API_IMAGE_ID=sha256:b34f52bfa6a0d1f3de529476e2bdb869f4a45ffe93ace85ebffaf7ef92d76fee \
   EXPECTED_WEB_IMAGE_ID=sha256:09d896659017a38274f836dd9734849ca81c7ae91b253a96bea0714d7bcd70d7 \
   DB_PASSWORD=<từ .env thật> \
   REDIS_PASSWORD=<từ .env thật> JWT_ACCESS_SECRET=<...> JWT_REFRESH_SECRET=<...> \
   REVALIDATE_INTERNAL_SECRET=<...> \
   scripts/deploy.sh 7629b50c444045728796349b7d2a25e0921bb153
   ```
   (Các secret lấy TRỰC TIẾP từ `.env` thật trên VPS lúc chạy — KHÔNG chép vào tài liệu này.)

**Điều kiện DỪNG tường minh (script đã tự có, không cần thêm):**
- Bước 4b (integrity gate) từ chối build nếu source tree chưa khớp `release_manifest_verify` → tự
  dừng, không cần can thiệp.
- Bước 7 (migration): migration lỗi → script `exit 1`, container CŨ vẫn đang chạy, KHÔNG tự
  rollback DB — dừng lại BÁO NGAY cho owner, không tự ý `scripts/restore.sh`.
- Bước 8 (smoke test trên image mới, TRƯỚC cutover): lỗi → `exit 1`, dừng TRƯỚC khi cutover — an
  toàn nhất, chưa ảnh hưởng người dùng thật.
- Bước 8b (re-verify identity): image bị đổi giữa chừng (do build/pull khác chạy song song) →
  `exit 1`, từ chối cutover một artifact chưa smoke-test.
- Bước 11 (route check sau cutover): lỗi → script tự báo "chạy `scripts/rollback.sh <tag cũ> ngay`"
  — KHÔNG tự động rollback, cần người vận hành xác nhận.

## 5. Kế hoạch rollback + cơ chế chống RichDoc cũ che plain text mới

**Rollback ứng dụng (không đụng DB), tách riêng từng service vì api/web đang pin KHÁC tag nhau:**
```
scripts/rollback.sh 5b04cacba250e05b62b7aba740c434cb34d9302a api
scripts/rollback.sh d2f5bf8b6a0efa00b7edae8d3650ec15696e35e5 web
```
Cả hai image rollback-target ĐÃ xác nhận còn giữ nguyên trên VPS (không bị prune). KHÔNG dùng
`rollback.sh <tag> both` (sẽ ép cả hai cùng một tag — sai, vì api/web hiện khác tag nhau thật).

**Vì sao rollback ứng dụng AN TOÀN dù schema đã tiến (10 migration mới là additive, xem mục 2):**
API/web cũ KHÔNG biết tới các cột rich/hash mới — code cũ chỉ đọc/ghi cột plain như trước, các cột
mới nằm im không ai đụng tới. Không mất dữ liệu, không lỗi runtime (đã verify qua chính test mục 3
— dữ liệu cũ hình dạng y hệt cách code CŨ từng ghi).

**Cơ chế chống RichDoc cũ che plain text mới hơn (đã có sẵn, KHÔNG phải xây mới):**
`serveRichDoc(currentPlainText, rich, storedHash)` (`apps/api/src/common/rich-text-field.ts:39-42`)
— so `storedHash` (= sha256 của plain TẠI THỜI ĐIỂM rich được ghi có thẩm quyền) với hash của plain
HIỆN TẠI; lệch → trả `null` (không phục vụ RichDoc), tự động fallback về plain. Tình huống chính
xác owner lo ngại — rollback container CŨ chạy một lúc, ai đó sửa field bằng code CŨ (chỉ biết cột
plain) — sẽ làm lệch hash, và khi FORWARD lại version mới, `serveRichDoc()` phát hiện lệch NGAY,
không bao giờ phục vụ RichDoc cũ che lấp plain mới. Đã xác nhận hành vi này bằng test unit có sẵn
(`rich-text-field.spec.ts`, case "Nâng lại app mới — đọc qua serveRichDoc() PHẢI phát hiện lệch").

**KHÔNG tự rollback migration, KHÔNG tự restore DB** — nếu cần, đó là quyết định riêng của owner
dùng `scripts/restore.sh` + backup đã tạo ở mục 4 bước 1, không nằm trong phạm vi chuẩn bị này.

## 6. Xác minh read-only sau deploy (nếu owner duyệt chạy)

- `docker compose -f docker-compose.prod.yml ps` — cả 2 service `healthy`.
- `grep -E '^(API|WEB)_IMAGE_TAG=' .env` → phải đọc đúng `7629b50c444045728796349b7d2a25e0921bb153`
  cho cả hai (bước 9b của deploy.sh tự ghi).
- `scripts/verify-release-pins.sh` — xác nhận "all pins consistent and immutable".
- `scripts/smoke-test.sh https://phuquochub.com <slug thật>` — route check trên domain thật.
- Kiểm 1 trang job/BĐS thật đã có bản dịch EN (nếu có) qua trình duyệt thật — xác nhận canonical/
  hreflang khớp mục 3 (đã test synthetic, giờ xác nhận lại trên dữ liệu thật — KHÔNG sửa dữ liệu).

## 7. Chưa làm, để owner quyết (không phải lỗi, không thuộc phạm vi bắt buộc)

- Audit actor cho `close()`/`reopen()`/`markRented|Sold|Available()` (checkpoint.md mục "Đối chiếu
  điểm 3").
- Sitemap liệt kê thêm URL `/en/...` riêng cho tin đủ điều kiện EN (checkpoint.md mục "Rà SEO").
- Backlog "góp ý có phản hồi" (mục 7 yêu cầu owner) + thiết kế work queue (mục 8) — đã viết, CHƯA
  xây (checkpoint.md §4).

---

**Dừng ở đây.** Chưa chạy bất kỳ bước MUTATING nào trên production (mục 4 bước 1 trở đi). Chờ owner
duyệt scope + thời điểm cutover trước khi tiếp tục.
