# BUILD_002 — Place Priority Remediation Report

> Task: BUILD_002 — Place Module Priority Remediation
> Input: BUILD_001 — Place Module Repository Inspection & Gap Analysis
> Date: 2026-07-21
> Scope: một remediation duy nhất (narrow-scope implementation)

---

## 1. Selected Gap

| Field | Value |
|---|---|
| Gap ID | **GAP-02** (chính) + **GAP-04** (không tách rời) |
| Title | Địa điểm chưa `published` bị lộ ra kênh công khai (chi tiết theo slug; danh sách qua `?status=`) |
| Category | Security |
| Severity | High |
| Priority | **P0** |
| Target category | **Option D — Place Repository Correction** |

### Evidence

- `places.repository.ts:140-149` (trước sửa) — `getDetailBySlug` chỉ lọc `deleted_at IS NULL`, **không** lọc `status`. Trong khi các truy vấn công khai cùng file `nearby()` (`:252`) và `bbox()` (`:272`, `:299`) đều lọc `status = 'published'`. → `GET /api/places/:slug` trả cả Place `draft`/`pending`.
- `dto/places.dto.ts:95-96` (trước sửa) — `ListPlacesQueryDto.status` nhận `PlaceStatus` bất kỳ, trong khi `GET /api/places` là `@Public()` (`places.controller.ts:29-33`). → `GET /api/places?status=pending` liệt kê được nội dung chưa kiểm duyệt.
- `places.service.ts:54` (trước sửa) — chuyển thẳng `query.status` từ query string công khai xuống repository.

### Vì sao GAP-02 và GAP-04 không tách rời

Cả hai là **một bất biến duy nhất**: *nội dung chưa `published` không hiển thị trên kênh công khai*. Sửa một endpoint mà bỏ endpoint kia thì lỗ hổng vẫn còn nguyên, chỉ đổi đường vào. BUILD_001 §14 cũng gộp hai gap này thành một bước.

---

## 2. Scope

### Included

- Lọc `status = 'published'` cho đường đọc chi tiết công khai (`getDetailBySlug`).
- Gỡ `status` khỏi contract query công khai (`ListPlacesQueryDto`) + gỡ pass-through ở service.
- Tài liệu hoá `status` của `PlacesRepository.list()` là tham số **đặc quyền**.
- Test hồi quy cho cả hai (repository + DTO).

### Excluded (giữ nguyên, có lý do)

| Excluded | Lý do |
|---|---|
| GAP-01 (workspace unlink) | **Không sửa được từ trong repo** — xem §10. |
| GAP-03 (resource-scoped authz) | Thay đổi kiến trúc AuthN/AuthZ, vượt phạm vi một remediation. |
| GAP-05 / GAP-10 (sort/cursor, response shape) | BUILD_001 §16 ghi nhận **cần phán quyết của chủ sở hữu** về thứ bậc authority contract-vs-implementation. |
| GAP-06 (partial index) | Cần migration mới — remediation riêng. |
| GAP-11 (shared-types) | Cross-package, remediation riêng. |
| `getCardBySlug` (`places.repository.ts:123`) | Cùng lớp lỗi nhưng **hiện không có caller nào** (dead code ⇒ không khai thác được). Sửa khi chưa có caller là suy đoán. Ghi nhận ở §10. |
| Mọi module ngoài Place | Ngoài phạm vi. |

---

## 3. Root Cause

`PlacesRepository` áp dụng quy ước "truy vấn công khai lọc `status='published'` ngay tại tầng repository" — thấy rõ ở `nearby()` và `bbox()`. `getDetailBySlug()` **được viết lệch khỏi quy ước đó**: nó kế thừa mệnh đề `WHERE` từ `getCardBySlug()` (vốn là hàm nội bộ, không phải đường công khai) nên chỉ mang theo `deleted_at IS NULL`.

Hệ quả: `deleted_at` (soft-delete) bị dùng thay cho *publication state*. Hai khái niệm này khác nhau — `archive()` set cả `status='archived'` **và** `deleted_at`, nên Place đã lưu trữ tình cờ bị loại; nhưng `draft`/`pending` có `deleted_at IS NULL` nên lọt qua.

Ở tầng danh sách, `list()` đã có mặc định an toàn (`params.status ?? PUBLISHED`) nhưng DTO công khai lại cho phép caller **ghi đè** mặc định đó — biến một mặc định an toàn thành tuỳ chọn của người gọi ẩn danh.

---

## 4. Implementation

1. **`getDetailBySlug`** — thêm `AND p.status = $2` với tham số `PlaceStatus.PUBLISHED`, khớp đúng quy ước của `nearby()`/`bbox()`. Không thêm tham số tuỳ chọn (sẽ là dead code); luồng xem trước của moderator sẽ cần truy vấn riêng đã kiểm tra quyền.
2. **`ListPlacesQueryDto`** — gỡ hẳn trường `status`. Vì `main.ts:20` bật `whitelist + forbidNonWhitelisted`, request `?status=` nay bị từ chối **400** thay vì âm thầm lộ dữ liệu.
3. **`PlacesService.list`** — gỡ pass-through `status`, để repository dùng mặc định `published`.
4. **`PlacesRepository.list`** — giữ nguyên tham số `status?` (repository vẫn tổng quát cho hàng đợi kiểm duyệt Sprint 4) nhưng ghi rõ trong doc-comment rằng đây là tham số đặc quyền, không nhận trực tiếp từ query công khai.

Không đưa vào pattern kiến trúc mới; không tạo abstraction trùng lặp; không di chuyển code giữa package.

---

## 5. Files Changed

| File | Change | Reason |
|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | `getDetailBySlug` lọc `status='published'` (tham số hoá); doc-comment cho `list()` | GAP-02 |
| `apps/api/src/modules/places/dto/places.dto.ts` | Gỡ trường `status` khỏi `ListPlacesQueryDto`; gỡ import `PlaceStatus` không còn dùng | GAP-04 |
| `apps/api/src/modules/places/places.service.ts` | Gỡ pass-through `status: query.status` | GAP-04 |
| `apps/api/src/modules/places/repositories/places.repository.spec.ts` | **Mới** — 7 test | Hồi quy GAP-02 + mặc định của `list()` |
| `apps/api/src/modules/places/dto/places.dto.spec.ts` | **Mới** — 6 test | Hồi quy GAP-04 |

Ngoài repo: đã gỡ 5 thư mục rỗng hỏng trong `node_modules/@phuquochub/` khi thử sửa GAP-01 (xem §10). Không phải file nguồn.

---

## 6. Database Impact

**Không cần migration.** Lý do: thay đổi hoàn toàn nằm ở tầng truy vấn/validation. Không thêm/sửa/xoá cột, index, constraint, enum hay quan hệ nào. Schema trước và sau giống hệt nhau.

- Schema impact: không.
- Data compatibility: hoàn toàn tương thích — không đụng dữ liệu.
- Rollback: revert code là đủ; không có bước DB nào phải hoàn tác.
- Lưu ý hiệu năng: mệnh đề mới `status = 'published'` **chưa có** index hỗ trợ (GAP-06 — `BTREE(status) WHERE deleted_at IS NULL` theo `places.md §3` chưa được tạo). Truy vấn vẫn dùng `uq_places_slug` để định vị 1 row rồi lọc, nên tác động thực tế không đáng kể; GAP-06 vẫn nên làm riêng.

---

## 7. API Impact

| Endpoint | Impact | Backward compatible? |
|---|---|---|
| `GET /api/places/:slug` | Place `draft`/`pending` nay trả **404** thay vì 200 + dữ liệu | **Có chủ đích không tương thích** — đây chính là bản vá bảo mật |
| `GET /api/places` | Không còn nhận `?status=`; gửi vào → **400** | Phá vỡ contract openapi (xem dưới) |
| Các endpoint khác | Không đổi | — |

**Request contract:** `ListPlacesQueryDto` bớt một trường tuỳ chọn.
**Response contract:** không đổi (shape giữ nguyên).

**Sai lệch contract cần ghi nhận:** `docs/api/openapi.yaml:463` vẫn khai báo tham số `status` cho `listPlaces`, và `docs/api/api.md:180` vẫn ghi endpoint là public. Contract **chưa được cập nhật** trong task này vì BUILD_001 §16 xác định các xung đột contract-vs-implementation cần phán quyết của chủ sở hữu, và theo `authority-and-scope.md` không được im lặng chọn một bên. → Ghi vào §10 như rủi ro tồn đọng.

**Đánh giá tác động thực tế:** đã kiểm tra toàn bộ consumer — `apps/web/src/modules/places/api/places.api.ts` (`ListPlacesParams`) **không bao giờ** gửi `status`; không e2e/spec nào dùng; `getDetailBySlug` chỉ có 1 caller. Không có consumer nào gãy hôm nay. Hàng đợi kiểm duyệt thuộc Sprint 4 và chưa tồn tại, nên **không mất năng lực nào đang được dùng**.

---

## 8. Tests

### `places.repository.spec.ts` (mới — 7 test)

| Test | Loại |
|---|---|
| `getDetailBySlug` sinh SQL có `p.status = $2` + params `[slug, PUBLISHED]` | **Hồi quy GAP-02** |
| slug tồn tại nhưng chưa published → trả `null` | Failure case |
| published → trả row chi tiết | Valid case |
| slug độc hại đi qua tham số, không nội suy vào SQL | Edge/security |
| `list()` bỏ trống status → mặc định `published` | **Hồi quy GAP-04** |
| `list()` có status tường minh (caller đặc quyền) được tôn trọng | Valid case |
| `list()` lọc category/ward đúng thứ tự placeholder | Edge |

### `places.dto.spec.ts` (mới — 6 test)

| Test | Loại |
|---|---|
| Từ chối `status=pending` | **Hồi quy GAP-04** |
| Từ chối cả `status=published` (whitelist theo trường, không theo giá trị) | Edge |
| Chấp nhận bộ lọc công khai hợp lệ | Valid case |
| Chấp nhận query rỗng | Edge |
| Vẫn từ chối `price_range` sai enum | Failure case |
| Ép kiểu `page`/`limit` từ string query sang number | Edge |

Cả hai spec **cố ý** đặt ở tầng không import workspace package, nên chạy được bất chấp GAP-01.

### Mutation check (xác minh test thật sự bắt lỗi)

Đã tạm thời revert bản vá GAP-02 rồi chạy lại: `1 failed, 6 passed` — đúng test hồi quy GAP-02 fail với `Expected substring: "p.status = $2"`. File đã được khôi phục và `diff` xác nhận trùng khớp byte-for-byte với trạng thái sau sửa. Test **không** pass một cách rỗng.

---

## 9. Verification

| # | Command | CWD | Exit | Result |
|---|---|---|---|---|
| 1 | `npx jest places` | `apps/api` | **0** | **PASS** — 4 suites, **18 tests** (trước: 2 suites, 5 tests) |
| 2 | `npx eslint "src/**/*.ts" --max-warnings=0` | `apps/api` | **0** | **PASS** — sạch |
| 3 | `npx jest` (toàn bộ unit) | `apps/api` | 1 | **FAIL — pre-existing** (xem dưới) |
| 4 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | 2 | **FAIL — pre-existing** (6 lỗi, y hệt baseline) |
| 5 | `npx jest places.repository` (mutation check) | `apps/api` | 1 | **FAIL như mong đợi** khi revert bản vá → test có hiệu lực |
| 6 | `npm run test:e2e` | `apps/api` | — | **BLOCKED** — không có Postgres/PostGIS/Redis (Docker daemon không chạy, cổng 5432 đóng) |

### So sánh baseline (chứng minh không gây hồi quy)

| | Trước BUILD_002 | Sau BUILD_002 |
|---|---|---|
| Suites failed | 6 | **6 (y hệt danh sách)** |
| Suites passed | 17 | **19** (+2) |
| Tests passed | 71 | **84** (+13) |
| Lint | PASS | PASS |
| Typecheck errors | 6 × TS2307 | **6 × TS2307 (y hệt)** |

6 suite fail vẫn đúng danh sách cũ: `transform.interceptor`, `events.service`, `hotels.service`, `restaurants.service`, `search.service`, `tours.service` — tất cả do GAP-01, **không** phải do task này.

**Không có lỗi mới nào được tạo ra.** Typecheck không báo lỗi nào liên quan tới việc gỡ `query.status`, xác nhận service/DTO nhất quán về kiểu.

---

## 10. Remaining Risks

1. **GAP-01 không sửa được từ trong repo — nguyên nhân gốc đã xác định.**
   `F:\` là **volume FAT32** (`Get-Volume -DriveLetter F` → `FileSystemType: FAT32`). FAT32 **không hỗ trợ symlink lẫn junction**, nên npm workspace không thể tạo link. Đã thử 3 cách, đều thất bại:
   - `npm install` → `EISDIR: illegal operation on a directory, symlink`
   - gỡ 5 thư mục rỗng rồi `npm install` lại → vẫn `EISDIR`
   - `mklink /J` (junction, không cần quyền admin) → `Local NTFS volumes are required to complete the operation`

   **Hành động cần thiết (ngoài phạm vi repo):** chuyển repository sang ổ **NTFS**. Cho tới lúc đó, `typecheck`, `build` và 6 unit suite vẫn không chạy được, và **không thể tuyên bố verify đầy đủ** cho API.

2. **openapi.yaml / api.md chưa khớp implementation** — `status` vẫn còn trong contract `listPlaces`. Cần phán quyết (cùng nhóm với GAP-05/GAP-10) trước khi sửa tài liệu.

3. **Chưa có đường cho moderator xem nội dung chưa published.** Trước đây (không an toàn) làm được qua `?status=pending`. Nay đã đóng. Hàng đợi kiểm duyệt Sprint 4 sẽ cần endpoint riêng có kiểm tra quyền — và điều đó phụ thuộc GAP-03, vì `@Public()` hiện **short-circuit hoàn toàn** (`jwt-auth.guard.ts:27-29`), không gắn principal ngay cả khi request có Bearer token hợp lệ.

4. **`getCardBySlug` (`places.repository.ts:123`) vẫn thiếu lọc status.** Hiện **không có caller** ⇒ không khai thác được. Nhưng nếu sau này được nối vào đường công khai mà quên lọc thì lỗ hổng tái xuất. Nên xử lý khi có caller, hoặc xoá nếu xác nhận là dead code.

5. **E2E chưa xác minh được** — không có DB. Bản vá này *nên* có e2e khẳng định `GET /api/places/:slug` trả 404 cho Place `pending`; chưa chạy được ở môi trường hiện tại.

---

## 11. Remaining BUILD_001 Gaps

### P0 — chưa xử lý

| ID | Gap | Ghi chú |
|---|---|---|
| GAP-01 | Workspace packages unlinked | **BLOCKED — môi trường (FAT32)**, xem §10.1 |
| GAP-03 | Scope `.Managed`/`.Own` không được kiểm tra trên resource | Kiến trúc; chặn Business/claims (Sprint 6) |

### P1 — chưa xử lý

| ID | Gap |
|---|---|
| GAP-05 | `sort`/`cursor` có trong openapi nhưng bị `forbidNonWhitelisted` từ chối 400 — **cần phán quyết** |
| GAP-06 | Thiếu partial index `BTREE(status) WHERE deleted_at IS NULL` |
| GAP-07 | Chưa validate toạ độ trong phạm vi Phú Quốc (`api.md:184`) |
| GAP-08 | Chưa có unit test cho `places.service` / controller — **service test bị GAP-01 chặn** (import `@phuquochub/utils`) |
| GAP-09 | E2E tự bỏ qua assertion khi thiếu seed (`places.e2e-spec.ts:50`) |

*(GAP-02 và GAP-04 đã đóng trong task này. Các gap P2/P3 giữ nguyên như BUILD_001 §13.)*

---

## 12. Readiness Update

## **READY WITH CONSTRAINTS**

Bản vá bảo mật đã hoàn tất, có test hồi quy đã được mutation-check, lint sạch, không gây hồi quy nào.

**Ràng buộc:**
1. **Không thể verify đầy đủ** (typecheck/build/6 suite) cho tới khi repo được chuyển sang ổ NTFS. Đây là chặn môi trường, không phải chặn code.
2. E2E chưa xác minh được — thiếu Postgres/PostGIS/Redis.
3. Cần phán quyết về openapi trước khi đồng bộ tài liệu contract.

---

## 13. Next Recommended Task

**BUILD_003 — Place coordinate validation (GAP-07)**

Lý do chọn:
- Là gap P1 **hẹp nhất còn lại và không bị chặn**: sửa trong `dto/places.dto.ts`, test bằng DTO spec — **chạy được** bất chấp GAP-01 (đã chứng minh bằng `places.dto.spec.ts` trong task này).
- Yêu cầu đã ghi rõ trong SSOT (`api.md:184` — "tọa độ trong Phú Quốc"), **không cần phán quyết**.
- Không đụng authz, không cần migration, không cần DB.

Các lựa chọn khác đều vướng: GAP-08 (service test) bị GAP-01 chặn trực tiếp; GAP-06 cần migration nhưng không verify được nếu không có DB; GAP-05/GAP-10 đang chờ phán quyết; GAP-03 quá lớn cho một narrow-scope task.

> **Khuyến nghị song song (ngoài code):** chuyển repository sang ổ NTFS để mở khoá GAP-01. Đây là việc có đòn bẩy cao nhất hiện nay — nó mở lại typecheck, build, 6 unit suite và toàn bộ nhóm GAP-08.

---

*Báo cáo này ghi nhận trung thực kết quả lệnh đã chạy. Không có tuyên bố "pass" nào không kèm bằng chứng lệnh. Không commit/push.*
