# PhuQuocHub — Thiết kế Database Module Media Upload Foundation

> **Đã triển khai** (2026-07-30) — migration `AddMediaUploadFoundation`/`SeedMediaPermissions`,
> module `apps/api/src/modules/media/` (presign/register) + `apps/api/src/core/storage/`
> (S3-compatible `StorageService`). Tài liệu này mô tả ĐÚNG những gì đã tồn tại trong repo tại
> thời điểm viết. Bảng `media` (entity/mapper/gallery-read) đã tồn tại từ trước (ADR-009) — đây là
> phần **ghi** (upload) được thêm vào, không phải bảng mới.
>
> Migration đã chạy thành công trên database dev sống (`migration:show` → `[X]`), và bộ e2e
> `media.e2e-spec.ts` xác nhận round-trip thật với MinIO (presign → PUT thật → register → xác
> thực HeadObject/checksum).

## 1. Phạm vi

| Có | Không (ngoài phạm vi milestone này) |
|---|---|
| `StorageService` (S3-compatible: MinIO dev, AWS S3, Cloudflare R2) | Frontend upload UI |
| `POST /media/presign`, `POST /media` | Thumbnail/resize/WebP/AVIF |
| Xác thực object (HEAD → checksum, fallback GET+stream) | EXIF, OCR, AI tagging |
| Chống trùng theo người upload (checksum) | Kiểm duyệt (moderation), quét virus |
| Presign-session integrity (Redis) | CDN optimization, bulk upload |
| Bucket cô lập theo môi trường (dev/test) | Cấu hình R2 production thật |

## 2. Nguyên tắc thiết kế (design review, 2026-07-30 — 3 quyết định bắt buộc)

### 2.1 Chỉ lưu metadata, KHÔNG BAO GIỜ lưu URL

Cột `media.url` (trước đây `NOT NULL`, luôn là URL tuyệt đối) nay **nullable**. Media do luồng
upload này tạo LUÔN có `url = NULL` — chỉ 5 cột metadata object storage được lưu:

| Cột | Ý nghĩa |
|---|---|
| `object_key` | Khoá object trong bucket, server sinh (`media/{uuid-v4}.{ext}`) |
| `bucket` | Tên bucket đã dùng lúc upload (không phải config HIỆN TẠI — ghi lại sự thật lịch sử) |
| `content_type` | MIME đã xác thực khớp lúc đăng ký |
| `size_bytes` | Kích thước byte thật (từ HeadObject, không phải client khai) |
| `checksum_sha256` | SHA-256 đã xác thực khớp |

Không có cột `presigned_url`/`signed_url`/`absolute_url` nào được thêm. URL công khai (nếu/khi
media được công bố) phải sinh **động** lúc đọc — chưa cần triển khai trong milestone này vì mọi
upload mới đều dừng ở `status=pending` (xem §5), và tầng đọc hiện có
(`MediaRepository.listPublishedByPlace` + `toMedia()`) chỉ bao giờ trả về media `published` —
media `pending` từ luồng này không bao giờ chạm code path đó. Một luồng kiểm duyệt/công bố tương
lai sẽ cần bổ sung việc sinh signed GET URL động tại đúng điểm đó.

Cột `url` cũ vẫn được legacy/external rows (YouTube/Vimeo embed, hoặc media pre-existing) dùng
nguyên trạng — hoàn toàn tương thích ngược, không cần backfill.

### 2.2 Cô lập bucket theo môi trường

`S3_BUCKET` (env var) là override DUY NHẤT cho production — client KHÔNG BAO GIỜ gửi/ảnh hưởng
tên bucket. Bỏ trống → app tự chọn theo `NODE_ENV`:

| `NODE_ENV` | Bucket mặc định |
|---|---|
| `test` (Jest tự đặt cho mọi lần chạy jest, kể cả e2e) | `phuquochub-test` |
| khác (development/production nếu `S3_BUCKET` trống) | `phuquochub-dev` |
| bất kỳ, nếu `S3_BUCKET` được đặt | giá trị đó (production thật) |

Nhờ Jest tự đặt `NODE_ENV=test` (hành vi mặc định của Jest CLI, không cần cấu hình gì thêm) và
`dotenv` không ghi đè biến môi trường đã có sẵn, bộ e2e `media.e2e-spec.ts` **luôn** chạy trên
`phuquochub-test`, không bao giờ lẫn với `phuquochub-dev` dùng khi chạy `npm run dev` thủ công —
không cần thêm bất kỳ override test-riêng nào ngoài quy ước sẵn có của Jest.

`StorageService.onModuleInit()` tự tạo bucket dev/test nếu chưa tồn tại (HeadBucket → CreateBucket
nếu 404) — **không bao giờ** chạy khi `NODE_ENV=production` (production bucket được provision
ngoài băng tần, milestone này không cấu hình R2 thật).

### 2.3 Xác thực object — HEAD trước, GET+stream dự phòng

```
verifyUploadedObject({ key, expectedContentType, expectedSize, expectedChecksumSha256 })
  → HeadObject
    → object không tồn tại / 0 byte / > 10 MiB / content_type sai / size sai → xoá object, từ chối
    → có ChecksumSHA256 đáng tin cậy (server-validated) từ HEAD → so khớp, xong
    → không có → GetObject, stream + tính SHA-256 (không buffer toàn bộ vào RAM,
      tự huỷ nếu vượt 10 MiB khi đang đọc) → so khớp
  → không khớp bất kỳ bước nào → xoá object khỏi storage, KHÔNG tạo row DB
```

**"Đáng tin cậy" nghĩa là checksum do SERVER (S3-compatible) tự tính và xác nhận lúc PUT — KHÔNG
phải metadata client tự khai** (một client có ác ý có thể khai đúng giá trị mong đợi trong khi tải
lên bytes khác — metadata không phải bằng chứng mật mã về nội dung thật). `createPresignedPutUrl`
CỐ Ý không yêu cầu checksum trailer (`ChecksumAlgorithm`) trên presigned URL — làm vậy sẽ buộc MỌI
client tải lên phải tự tính và gửi đúng header `x-amz-checksum-sha256`, một yêu cầu không cần
thiết khi milestone này chưa có frontend upload UI nào. Kết quả: trong thực tế, **mọi** upload qua
luồng này xác thực qua nhánh GET+stream (provider-agnostic 100%, luôn đúng dù MinIO/S3/R2) — nhánh
HEAD-checksum vẫn được triển khai đầy đủ và sẽ tự động kích hoạt nếu một client/SDK tương lai cung
cấp checksum đã xác thực, không cần đổi API của `StorageService`.

Toàn bộ logic AWS SDK (`S3Client`, `*Command`) chỉ tồn tại bên trong
`apps/api/src/core/storage/storage.service.ts` — không lộ ra bất kỳ file nào khác.

## 3. Presign-session integrity (Redis, không phải bảng DB mới)

`POST /media` không thể tự chứng minh người gọi CHÍNH LÀ người đã presign, hay đang đăng ký ĐÚNG
file đã khai — vì vậy mỗi lần presign lưu một phiên ngắn hạn:

```
Redis key:   media-presign:{object_key}
Redis value: { userId, contentType, size, checksumSha256, placeId }
TTL:         900s (dài hơn presigned URL 600s — đủ thời gian PUT xong rồi gọi POST /media)
```

Dùng `RedisService` sẵn có (`core/redis/`), cùng khuôn `TokenService`'s refresh-token record
(`PREFIX:key` + `.set(key, value, 'EX', ttl)`), KHÔNG tạo bảng DB mới. `POST /media`:

1. Không có phiên (chưa presign/hết hạn/đã đăng ký) → `422`.
2. Phiên tồn tại nhưng `userId` khác người gọi hiện tại → `403` (không xoá phiên của người kia —
   họ vẫn có thể hoàn tất đăng ký trước khi hết hạn).
3. Dùng `content_type`/`size`/`checksum_sha256` **từ phiên Redis**, không phải từ
   `CreateMediaDto` (DTO đăng ký thậm chí không có các trường này) — client không thể khai lại
   giá trị khác ở bước đăng ký.
4. Xoá phiên sau khi đăng ký thành công HOẶC sau khi xác thực thất bại (không để phiên mồ côi).

## 4. Phạm vi ownership được hỗ trợ

Chỉ **`place_id`** hoặc **không owner nào** (mồ côi, `pending`) được chấp nhận ở `POST
/media/presign` — `business_id`/`post_id`/`event_id`/`review_id` bị từ chối `400`
(`forbidNonWhitelisted`), không âm thầm bỏ qua. Gắn vào review vẫn qua luồng
`MediaRepository.attachToReview()` đã có sẵn (`uploaded_by` + mồ côi hoàn toàn).

Với `place_id`: chỉ xác nhận Place tồn tại (chưa xoá mềm) — **không** claim quyền sở hữu doanh
nghiệp chính thức. Ảnh luôn tạo `status=pending` — một ảnh cộng đồng đóng góp chờ kiểm duyệt, không
phải nội dung chính thức của cơ sở.

## 5. CHECK nới lỏng — từ đúng-một sang tối-đa-một chủ sở hữu

`chk_media_one_owner` (`= 1`) → `chk_media_at_most_one_owner` (`<= 1`). `MediaRepository
.attachToReview()` đã tồn tại từ trước và giả định một hàng "mồ côi hoàn toàn" (cả 5 cột owner
NULL) là trạng thái hợp lệ trung gian — nhưng CHECK cũ khiến trạng thái đó **không thể INSERT
được**, một khoảng trống tồn tại sẵn (chưa từng lộ ra vì chưa có endpoint nào tạo hàng mồ côi cho
tới milestone này). Đã sửa đúng gốc, không phải patch tạm.

## 6. Orphan handling (media mồ côi, chờ gắn)

Một media `place_id=NULL` (không presign kèm `place_id`) là trạng thái HỢP LỆ, không phải lỗi —
tương đương "đã upload, chưa gắn vào đâu cả", chờ một trong hai:

1. **Gắn vào review** qua `attachToReview()` (đã có, `POST /reviews` với `media_ids`) — chỉ gắn
   được media mồ côi CỦA CHÍNH người upload.
2. **Không bao giờ gắn** — hiện KHÔNG có cơ chế dọn tự động (background cleanup job nằm ngoài
   phạm vi milestone này, theo đúng chỉ đạo). Một media mồ côi tồn tại vĩnh viễn cho tới khi có
   luồng dọn dẹp riêng (task tương lai) hoặc bị xoá thủ công. Rủi ro này được ghi nhận, không phải
   bị bỏ sót — object storage thực tế (bucket dev/test) cũng tích luỹ các object mồ côi tương ứng
   nếu client presign nhưng không bao giờ gọi `POST /media` (phiên Redis tự hết hạn sau 900s,
   nhưng object trên storage thì KHÔNG tự xoá — cùng rủi ro, cùng lý do hoãn).

## 7. Chống trùng theo người upload

`idx_media_uploader_checksum` — unique index `(uploaded_by, checksum_sha256)`, partial (`WHERE
deleted_at IS NULL AND checksum_sha256 IS NOT NULL`). Nếu người dùng đăng ký hai lần cùng nội dung
(cùng checksum): lần 2 bị từ chối `409`, object thừa vừa tải lên bị xoá khỏi storage ngay (không
để lại object mồ côi từ chính tình huống này). Không chặn hai người KHÁC NHAU upload cùng nội
dung — đó không phải trùng lặp cần chặn (ảnh giống nhau do hai người độc lập chụp/tải vẫn hợp lệ).

## 8. API

| Method | Route | Permission | Ghi chú |
|---|---|---|---|
| POST | `/media/presign` | `Media.Upload.Own` (role `member`), 10/phút | Trả `{key, upload_url, expires_in}`. `upload_url` KHÔNG BAO GIỜ được log. |
| POST | `/media` | `Media.Upload.Own` (role `member`) | Yêu cầu phiên presign-session hợp lệ, đúng người. Trả `Media` (`url=null` vì luôn `pending`). |

Không có endpoint đọc/liệt kê media pending, không có endpoint xoá/kiểm duyệt trong milestone
này — `/media/{id}` (DELETE) và `/media/{id}/moderate` vẫn PROPOSED trong `openapi.yaml`, chưa có
handler nào.

## 9. Permission mới (`SeedMediaPermissions1720003000000`)

`Media.Upload.Own` — gán cho `member` (kế thừa tự động lên `moderator`/`administrator`/
`super_administrator` qua role DAG). Quy ước `.Own` khớp `Event.Edit.Own`/`Place.Edit.Own`
(`authorization.util.ts`: `Scope: Any ⊃ Managed ⊃ Own`) — permission-level chỉ xác nhận vai trò
CÓ quyền upload; việc kiểm tra "đúng CHÍNH người này" nằm ở tầng ứng dụng (presign-session, §3),
không phải ở permission guard.

## 10. Việc CHƯA làm (deferred, không phải quên)

- Thumbnail/resize/WebP/AVIF, EXIF, OCR, AI tagging, kiểm duyệt, quét virus, CDN optimization,
  bulk upload — tất cả ngoài phạm vi mọi milestone tới nay, theo đúng chỉ đạo. (Frontend upload UI
  ĐÃ có một lát cắt hẹp — xem §11 — không còn "ngoài phạm vi" hoàn toàn như trước 2026-08-01.)
- Cấu hình production R2 thật (`S3_BUCKET`/credentials thật) — milestone này chỉ có MinIO dev/test.
- ~~Background cleanup cho object/media mồ côi (§6) — không có job tự động nào.~~ **Đã có** — xem
  §12 (2026-08-02). Vẫn CHƯA có scheduler tự động gọi job này định kỳ (§12.4) — chỉ chạy thủ công.
- Sinh signed GET URL động cho media `published` — chưa cần vì chưa có luồng công bố nào tạo ra
  media `published` từ upload path này; điểm cắm sẵn ở `toMedia()`/`MediaRepository
  .listPublishedByPlace()` khi cần.

## 11. Frontend integration — Image Upload UI (2026-08-01, bounded scope)

Owner-approved bounded scope: single-file upload only, no drag-and-drop, no crop, no gallery
management, no progress bar beyond a simple loading state, no delete, no reorder, no bulk upload,
no image editing. Integrated into exactly ONE existing page/flow — the review submission form
(`ReviewsSection.tsx`, rendered on all Place detail pages) — reusing the orphan-media +
`attachToReview()` path that was already designed and implemented as part of the Reviews milestone
(`CreateReviewDto.media_ids`, `MediaRepository.attachToReview()`), not the `place_id`-owned path.

**New frontend files:**
- `apps/web/src/lib/sha256.ts` — client-side SHA-256 (Web Crypto `subtle.digest`) required by
  `PresignMediaDto.checksum_sha256`.
- `apps/web/src/modules/media/types.ts` — local `UploadedMedia` response type + a mirrored copy of
  the backend's allowed-MIME/max-size constants for client-side pre-validation (server remains the
  sole authority — this is UX-only, never trusted).
- `apps/web/src/modules/media/api/media.api.ts` — `presignMedia`/`putToPresignedUrl`/`registerMedia`,
  mirroring `reviews.api.ts`'s existing `apiPost` convention. `putToPresignedUrl` deliberately does
  NOT go through `apiPost`/`fetchEnvelope` — it PUTs directly to object storage, which has no
  `{success,data}` envelope.
- `apps/web/src/modules/media/useSingleImageUpload.ts` — one hook encapsulating
  select → client-side validate → hash → presign → PUT → register, used by `ReviewsSection.tsx`.

**Browser CORS verified live** (not assumed): a real browser (not Node `fetch`) origin
`http://localhost:3000` successfully completed presign → PUT (`http://localhost:9000`, MinIO) →
register, including a genuine CORS preflight (`OPTIONS` → `204`) on the MinIO PUT. No MinIO bucket
CORS policy change was needed — the current dev MinIO configuration already permits this.

**Explicitly still out of scope:** everything in §10, plus displaying the attached photo anywhere
(it stays `pending`/`url: null` until a future moderation flow publishes it — nothing to display
yet regardless), editing/replacing an already-submitted review's photo, and any `place_id`-owned
upload flow (still unbuilt on the frontend).

## 12. Media Orphan Cleanup (2026-08-02, Owner-approved execution plan)

Backend-only job — không endpoint, không frontend, không thay đổi hành vi upload hiện có. Dọn dẹp
media **mồ côi** (§6) đã quá hạn lưu giữ.

### 12.1 Điều kiện đủ điều kiện dọn dẹp (khớp CHÍNH XÁC bản phê duyệt của Owner)

```sql
status = 'pending' AND place_id IS NULL AND review_id IS NULL AND post_id IS NULL
  AND business_id IS NULL AND event_id IS NULL AND deleted_at IS NULL
  AND created_at < now() - interval '24 hours'
```

Hằng số này (`ORPHAN_ELIGIBILITY_WHERE`, `media.repository.ts`) được dùng LẠI nguyên vẹn ở cả
truy vấn quét theo lô (`findOrphanCleanupCandidates`) lẫn UPDATE có điều kiện
(`softDeleteOrphanCandidate`) — không tách hằng số riêng cho từng cột, tránh hai câu SQL lệch nhau.

### 12.1a Phân trang keyset qua nhiều lô (post-implementation review fix, 2026-08-02)

`findOrphanCleanupCandidates(limit, after?)` nhận thêm con trỏ `{createdAt, id}` tuỳ chọn, thêm
điều kiện `AND (created_at, id) > ($2::timestamptz, $3)`, `ORDER BY created_at ASC, id ASC`.
`MediaCleanupService.run()` tiến con trỏ sau MỖI lô (dòng cuối của lô vừa fetch), **bất kể** dòng
có thực sự bị ghi hay không — đây là điểm mấu chốt: phân trang phải độc lập với việc mutate dữ
liệu, vì dry-run không mutate gì cả, và một dòng lỗi storage (không phải not-found) cũng CỐ Ý
không bị ghi.

**Bẫy đã gặp và sửa:** con trỏ ban đầu dùng thẳng `candidate.createdAt` (một `Date` JS, độ chính
xác milli-giây) — nhưng `timestamptz` của Postgres giữ micro-giây. Khi gửi lại `Date` đã bị làm
tròn/cắt xén làm tham số cho lô kế tiếp, chính dòng vừa fetch vẫn có thể thoả `created_at >
cursor` so với giá trị THẬT (chưa cắt xén) của chính nó trong DB — bị fetch lại vô thời hạn (giới
hạn bởi `maxBatches`, không phải vòng lặp vô hạn thật sự, nhưng không hề tiến lên được), "đói"
mọi dòng khác phía sau. Xác nhận trực tiếp qua e2e thật (hai dòng chỉ cách nhau ~100 micro-giây):
dòng thứ hai không bao giờ được liệt kê. **Sửa:** cột `cursorCreatedAt` mang nguyên văn bản thô
Postgres tự in ra (`created_at::text`), không bao giờ đi qua `Date` — gửi lại kèm ép kiểu
`::timestamptz` để Postgres tự phân tích lại đúng y giá trị gốc, không mất độ chính xác.

### 12.2 Trình tự xử lý mỗi dòng (bắt buộc đúng thứ tự)

1. `StorageService.deleteObjectForCleanup(objectKey)` — method MỚI, KHÔNG phải `deleteObject()`
   hiện có (method đó nuốt mọi lỗi, best-effort — không phù hợp ở đây vì job cần phân biệt 3 kết
   quả). **HEAD trước, DELETE sau** — phát hiện qua e2e thật với MinIO rằng `DeleteObjectCommand`
   tự thân idempotent và KHÔNG BAO GIỜ báo lỗi cho key không tồn tại (khác `HeadObject`/
   `GetObject`, vốn đã được `verifyUploadedObject()` dùng đúng cách) — một cài đặt "thử DELETE,
   bắt lỗi NotFound" sẽ không bao giờ thực sự quan sát được `not_found`. Trả `{outcome:'deleted'}`
   hoặc `{outcome:'not_found'}` (từ HEAD); ném lại lỗi KHÁC.
2. Chỉ khi bước 1 trả `deleted`/`not_found` (hoặc `object_key` vốn đã NULL — phòng vệ, không nên
   xảy ra thực tế vì `createUploaded()` luôn set nó) → `softDeleteOrphanCandidate(id)`: `UPDATE
   media SET deleted_at = now()` với ĐẦY ĐỦ vị từ đủ điều kiện lặp lại trong WHERE (không chỉ
   `id`) — đây là cơ chế idempotency/concurrency (§12.3), không phải chỉ để an toàn thừa.
3. Chỉ khi UPDATE ở bước 2 thực sự khớp 1 dòng (đổi trạng thái THẬT) → ghi `audit_logs`
   (`event: 'media.orphan_cleaned'`, `isServiceAccount: true`, `context.storageOutcome` phân biệt
   `deleted`/`not_found`/`skipped_no_object_key`).
4. Lỗi storage KHÁC (không phải not-found) → dòng bị bỏ qua HOÀN TOÀN (không UPDATE, không audit),
   ghi cảnh báo log; sẽ tự động được thử lại ở lần chạy sau (job idempotent, không cần retry/backoff
   trong tiến trình).

### 12.3 Idempotency & concurrency

Không khoá pessimistic (`FOR UPDATE`). An toàn đến từ việc UPDATE (bước 2) lặp lại TOÀN BỘ vị từ
đủ điều kiện — nếu một dòng đã bị dọn bởi lần chạy khác (hoặc không còn mồ côi), UPDATE khớp 0
dòng, coi là no-op (không audit, không lỗi). `DeleteObjectCommand` của MinIO/S3 vốn idempotent
(xoá lại key đã mất trả `not_found`, không lỗi) — cùng nguyên tắc `InventoryHoldsRepository
.expireOverdueHolds()` đã dùng (UPDATE điều kiện, không khoá).

### 12.4 Không có scheduler

`@nestjs/schedule`/cron/queue KHÔNG được thêm — repo chưa có hạ tầng lập lịch nào (cùng tiền lệ
`expireOverdueHolds()`'s doc comment). Chỉ có runner thủ công: `npm run media:cleanup` (real run)
hoặc `npm run media:cleanup -- --dry-run` (chỉ đọc, KHÔNG ghi storage/DB/audit — dùng LẠI đúng
`MediaCleanupService.run()`, chỉ khác ở việc bỏ qua nhánh ghi). `apps/api/src/scripts
/clean-orphan-media.ts` dùng `NestFactory.createApplicationContext(AppModule)` — không khởi động
HTTP server.

### 12.5 Giới hạn an toàn

`batchSize` mặc định 100 (khớp trần `clampLimit` hiện có), `maxBatches` mặc định 50 (≤5.000 dòng/
lần chạy), `maxExecutionMs` mặc định 5 phút — vượt ngân sách thời gian → hoàn tất dòng ĐANG xử lý
(không bao giờ để dở dang giữa storage-delete và DB-update), rồi dừng sạch, in tổng kết, thoát
bình thường (exit 0, không ném lỗi).

### 12.6 Index hiệu năng (tuỳ chọn, không đổi tính đúng đắn)

Migration `AddMediaOrphanCleanupIndex1720003100000` — partial index trên `created_at` khớp đúng 7
điều kiện §12.1, cùng khuôn `idx_media_uploaded_by`/`idx_media_uploader_checksum`. Không cột mới,
không backfill, `down()` chỉ DROP index.

## 13. Secure Private Media — phát media qua signed URL (2026-08-10)

Thay thế HOÀN TOÀN mô hình "URL object storage công khai" trước đó. Đây là phần bổ sung cho §2.1
(chỉ lưu metadata, không lưu URL) — nay khép kín cả đường ĐỌC, không chỉ đường GHI.

### 13.1 Vấn đề đã tồn tại

Để ảnh review hiển thị được, production đã chạy `mc anonymous set download local/phuquochub-prod`.
Canned policy `download` của MinIO cấp cho principal ẩn danh **cả `s3:GetObject` LẪN
`s3:ListBucket`** — nghĩa là bất kỳ ai cũng có thể **liệt kê toàn bộ bucket** rồi tải về **mọi**
object, bất kể `media.status`. Object key là UUIDv4 (không đoán được) nhưng điều đó không cứu được
gì khi khoá có thể được liệt kê thẳng.

Hệ quả: media `pending` (chưa kiểm duyệt), `hidden` (đã bị ẩn) và `rejected` (đã bị từ chối) đều
tải về được, dù tầng ứng dụng CHƯA BAO GIỜ phát URL cho chúng (`toMedia()` chỉ resolve URL khi
`status === published`). Nghiêm trọng hơn: `hide`/`reject` chỉ đổi `media.status` trong DB —
**object KHÔNG bị xoá** (cố ý, vì `restore` phải khôi phục được, xem `media-moderation.transition.ts`),
nên object bị từ chối nằm lại trong bucket vô thời hạn và vẫn đọc được ẩn danh. Job dọn dẹp (§12)
chỉ xoá media **mồ côi + pending + quá 24h**, không đụng tới hidden/rejected.

### 13.2 Thiết kế đã chọn

```
client  ──GET {API_PUBLIC_URL}/api/media/{id}/file──►  API
                                                        │ kiểm tra published + chưa xoá + có object_key
                                                        │ ký GET URL ngắn hạn (mặc định 300s)
        ◄──────────── 302 Location: signed URL ─────────┘
        ──────────GET signed URL──────────►  object storage (bucket RIÊNG TƯ)
```

- **Bucket hoàn toàn riêng tư** — không anonymous read, không list. Presigned URL (cả PUT lúc upload
  lẫn GET lúc đọc) mang chữ ký SigV4 nên hoạt động bình thường trên bucket private; đây là lý do
  việc gỡ anonymous policy KHÔNG phá luồng upload đang chạy.
- **URL trong response là URL API ỔN ĐỊNH**, không mang chữ ký, không hết hạn:
  `{API_PUBLIC_URL}/{API_GLOBAL_PREFIX}/media/{id}/file`. `object_key`/`bucket` không bao giờ rời
  server. So với việc nhúng thẳng signed URL vào response: URL ổn định **thu hồi được** — ẩn một
  media sẽ chặn ngay ở lần tải kế tiếp, còn signed URL đã phát thì không rút lại được cho tới khi
  hết hạn.
- **302, KHÔNG stream bytes qua NestJS** — API chỉ cấp phép rồi đứng ngoài đường truyền dữ liệu.
  Giữ nguyên khả năng đặt CDN trước object storage sau này.
- **Kiểm tra publish ở MỖI request**, không phải một lần lúc render trang.

### 13.3 Bất biến 404

`GET /media/{id}/file` trả **cùng một 404** cho: không tồn tại, `pending`, `hidden`, `rejected`, đã
xoá mềm, và dòng legacy không có `object_key`. Cố ý không phân biệt — nếu phân biệt, endpoint công
khai này thành oracle cho phép dò trạng thái kiểm duyệt của một media id bất kỳ (cùng nguyên tắc
`existsPublished()` đã áp cho `POST /media/{id}/report`).

Bất biến này được thực thi **hai lớp độc lập**: `toMedia()` (không phát URL nếu chưa published) và
`MediaRepository.findPublishedObjectKey()` (4 vị từ nằm trong SQL). Một lỗi ở lớp trên không tự động
thành lỗ hổng.

### 13.4 Cover image

`cover_image_url` đi qua raw SQL riêng ở 7 repository (places + 6 module chuyên biệt), **không** qua
`toMedia()`. Đã bổ sung `AND m.status = 'published'` vào cả 7 subquery. Trên thực tế chưa từng rò rỉ
(đường upload luôn ghi `url = NULL`, và không luồng nào ghi `cover_image_id`), nên đây là phòng vệ
chiều sâu TRƯỚC khi có luồng đặt cover — không phải vá một sự cố.

### 13.5 Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `API_PUBLIC_URL` | `http://localhost:4000` | Origin trình duyệt gọi được tới API. Production PHẢI đặt `https://phuquochub.com`. |
| `S3_ENDPOINT` | `http://localhost:9000` | **Production PHẢI đặt `https://media.phuquochub.com`** (không phải `http://minio:9000`) — StorageService dùng CHÍNH biến này để ký CẢ presigned PUT (upload) lẫn GET (đọc, §13.2), và chữ ký SigV4 bao gồm Host header. Đặt endpoint nội bộ ở đây làm mọi URL đã ký trỏ tới một tên miền trình duyệt không phân giải được. Xem §13.7. |
| `S3_PRESIGN_GET_TTL` | `300` | Tuổi thọ signed GET URL (giây), hợp lệ 30..3600. |
| `S3_PUBLIC_URL` | — | **Không còn ảnh hưởng tới URL media.** Giữ lại cho tương thích deployment. |

`StorageService.getPublicUrl()` đã bị **xoá** — đó chính là phương thức duy nhất từng dựng URL object
storage trực tiếp. Xoá nó là bằng chứng cấu trúc rằng không code path nào còn phụ thuộc vào việc
bucket đọc được ẩn danh.

### 13.6 Việc CHƯA làm

- Cover image từ media upload vẫn chưa hiển thị được (subquery đọc `m.url`, luôn NULL cho upload
  row) — khoảng trống CHỨC NĂNG có sẵn từ trước, không phải do thay đổi này.

### 13.7 Caddy/topology reconciliation (2026-08-10, sau khi 87d010e lên production)

Khi 87d010e triển khai thật, việc phục vụ ảnh yêu cầu một host công khai đứng trước MinIO để
presigned URL (ký cho `S3_ENDPOINT`) có nơi phân giải được — host đó (`media.phuquochub.com`) được
cấu hình **trực tiếp trên VPS** để ảnh chạy được ngay, nhưng site block tương ứng **không có trong
repo** (`infrastructure/caddy/Caddyfile` lúc đó không đề cập `media.phuquochub.com` ở đâu cả). Một
`docker compose up` sạch từ repo tại thời điểm đó sẽ dựng ra một stack KHÔNG có host media nào —
mọi ảnh 404/NXDOMAIN, dù kiến trúc signed-URL ở tầng application vẫn đúng.

**Đã đối soát và đưa vào repo** — không phải thay đổi kiến trúc, chỉ là chép lại cấu hình đã chạy
thật trên VPS vào source control:

- `infrastructure/caddy/Caddyfile` — thêm site block `media.phuquochub.com, :8081` → `reverse_proxy
  minio:9000`, kèm `handle /minio/*  { respond 404 }` (MinIO phục vụ Admin API trên CÙNG cổng 9000
  với S3 API — chặn tường minh ở edge, không dựa vào "chỉ có credential mới gọi được" làm lớp phòng
  vệ duy nhất) và `X-Content-Type-Options: nosniff` (phòng vệ chiều sâu cho bytes người dùng tải
  lên, dù allowlist MIME hiện tại — `image/jpeg|png|webp` — không có vector script).
- `docker-compose.prod.yml` — thêm `minio` vào `depends_on` của service `caddy` (thứ tự khởi động,
  tránh 502 nhất thời trên một lần `up` sạch); sửa chú thích LỖI THỜI trên service `minio` (từng
  ghi "hiện tại CHƯA cần" — nay là bắt buộc, cả `api` lẫn `caddy` đều phụ thuộc nó); ghi chú
  `S3_ENDPOINT` phải là origin công khai dưới topology này.
- `.env.example` — giải thích đầy đủ vì sao `S3_ENDPOINT` phải là `https://media.phuquochub.com`
  trong production (SigV4 ký Host header — xem §13.5 ở trên).

**KHÔNG có gì đổi về bucket policy hay kiến trúc signed-URL** — bucket vẫn PRIVATE
(`mc anonymous set none`, đã áp dụng trên production), quyền đọc vẫn hoàn toàn tới từ chữ ký SigV4
ngắn hạn do API cấp. Việc đối soát này chỉ khép lại khoảng trống "cấu hình chạy thật khác cấu hình
trong repo", không mở lại bất kỳ đường đọc ẩn danh nào.

## Related

- [ADR-003](../../99-decisions/ADR-003-no-polymorphic.md) (đa hình `entity_type`/`entity_id` —
  không áp dụng trực tiếp cho `media`, bảng này dùng exclusive-arc theo ADR-009, không phải mẫu
  đa hình của ADR-003)
- [ADR-009](../../99-decisions/ADR-009-media-model.md) (mô hình `media` gốc, exclusive arc 5 nhánh)
- [docs/api/openapi.yaml](../api/openapi.yaml) (tag `Media`)
