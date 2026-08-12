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

**`POST /media/presign` KHÔNG nhận trường owner nào** — kể cả `place_id`. Đây là luồng **mồ côi**
duy nhất (ảnh review, gắn + auto-publish khi tạo review). Mọi trường owner
(`place_id`/`business_id`/`post_id`/`event_id`/`review_id`) bị từ chối `400`
(`forbidNonWhitelisted`), không âm thầm bỏ qua.

> **Thay đổi (Owner Place Photos, 2026-08-11).** `place_id` TỪNG được chấp nhận ở endpoint này và
> đã bị **gỡ bỏ**. Nó chỉ xác nhận "Place có tồn tại", trong khi permission của route
> (`Media.Upload.Own`) gắn với CHÍNH người gọi — nghĩa là bất kỳ `member` nào cũng gắn được ảnh vào
> cơ sở của người khác. Hệ quả trước đây còn tiềm ẩn (ảnh `pending` không hiển thị công khai và
> không có gì đưa nó vào hàng chờ duyệt); nhưng milestone này ĐƯA ảnh `pending` của cơ sở vào hàng
> chờ kiểm duyệt, nên nếu giữ nguyên, kẻ tấn công có thể bơm ảnh vào cơ sở bất kỳ rồi chờ moderator
> vô tình duyệt. Không consumer nào từng gửi trường này.

### 4.1 Ảnh của cơ sở — vòng đời (Owner Place Photos)

Chủ cơ sở / người quản lý được gán đăng ảnh qua **`POST /places/{placeId}/media/presign`** rồi
**`POST /places/{placeId}/media`**. Place id nằm trên **path**, không phải trong body: đó là điều
kiện để `PermissionsGuard` phân giải `@AuthorizationContext(place)` và cưỡng chế
`Media.Upload.Managed` trên đúng cơ sở đó (guard chỉ đọc resource id từ `param`/`principal`, không
đọc từ body). Giá trị guard đã kiểm tra CHÍNH LÀ giá trị được khoá vào phiên presign, nên
`place_id` không thể bị tráo giữa hai bước.

```
chủ cơ sở tải ảnh lên
  -> media.status = pending           (KHÔNG BAO GIỜ tự công khai — quyết định sản phẩm, MVP)
  -> moderation_cases (source=new_content)   ← tạo TRONG CÙNG transaction với dòng media
  -> kiểm duyệt viên quyết định (Media.Moderate):
       approve -> published   -> hiện ở gallery công khai
       reject  -> rejected    -> vẫn ẩn vĩnh viễn
```

Case được tạo trong **cùng transaction** với dòng media một cách có chủ đích: nếu tách ra sau
commit, một sự cố giữa chừng sẽ để lại ảnh `pending` mà không có case nào — tức ảnh mắc kẹt vĩnh
viễn không ai duyệt (đúng lỗ hổng ADR-018 §Context từng mô tả với ảnh review).

FSM `assertValidMediaTransition` đã có sẵn từ M3 và **không đổi**: `approve` chỉ hợp lệ từ
`pending`, `reject` chỉ hợp lệ từ `pending`; mọi transition khác trả `422`.

### 4.2 Xem ảnh chưa duyệt

Ảnh `pending`/`rejected` **không có URL công khai nào**. Hai kênh nội bộ, mỗi kênh gác một quyền
riêng, đều trả `302` tới signed URL ngắn hạn với `Cache-Control: private`:

| Kênh | Quyền | Dành cho |
|---|---|---|
| `GET /places/{placeId}/media/{mediaId}/file` | `Media.Upload.Managed` trên cơ sở **+** ảnh phải thuộc đúng cơ sở đó | chủ cơ sở |
| `GET /media/{id}/moderation-file` | `Media.Moderate` | kiểm duyệt viên |

`GET /media/{id}/file` (công khai) **không bị nới lỏng** — vẫn chỉ phục vụ `published`.

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
| GET | `/places/{placeId}/media` | `Media.Upload.Managed` trên cơ sở | Ảnh của cơ sở cho màn hình quản lý — MỌI trạng thái. Không trả `object_key`/`bucket`/`checksum`. |
| POST | `/places/{placeId}/media/presign` | `Media.Upload.Managed` trên cơ sở, 10/phút | Khoá `placeId` vào phiên presign ngay lúc quyền được kiểm tra. |
| POST | `/places/{placeId}/media` | `Media.Upload.Managed` trên cơ sở, 10/phút | Tạo media `pending` + case `new_content` trong CÙNG transaction. |
| DELETE | `/places/{placeId}/media/{mediaId}` | `Media.Upload.Managed` trên cơ sở | Xoá **mềm**; `place_id` nằm trong WHERE nên ảnh của cơ sở khác trả `404`. |
| GET | `/places/{placeId}/media/{mediaId}/file` | `Media.Upload.Managed` trên cơ sở | `302` signed URL, mọi trạng thái. |
| GET | `/media/{id}/moderation-file` | `Media.Moderate` | `302` signed URL, mọi trạng thái — kiểm duyệt viên xem ảnh chờ duyệt. |

`Media.Upload.Managed` đã tồn tại từ `SeedPlacePermissions1720000600000` (cấp cho
`business_manager`; `business_owner` kế thừa qua DAG vai trò) — milestone này **không tạo quyền
mới nào**.

`/media/{id}/moderate` (stub cũ) vẫn chưa có handler: quyết định kiểm duyệt đi qua
`POST /moderation/cases/{id}/decide` đã có sẵn.

### 8.1 Audit

| Sự kiện | Khi nào |
|---|---|
| `media.place_submitted` | chủ cơ sở đăng ký một ảnh cho cơ sở (sau commit) |
| `media.place_removed` | chủ cơ sở gỡ ảnh khỏi cơ sở |
| `moderation.decided` | kiểm duyệt viên duyệt/từ chối (đã có sẵn, `ModerationService.decide()`) |

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

**Cập nhật 2026-08-12 (Owner Cover & Photo Ordering)** — luồng đặt cover nay đã tồn tại; xem §14.

### 13.5 Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `API_PUBLIC_URL` | `http://localhost:4000` | Origin trình duyệt gọi được tới API. Production PHẢI đặt `https://phuquochub.com`. |
| `S3_ENDPOINT` | `http://localhost:9000` | **Production PHẢI đặt `https://media.phuquochub.com`** (không phải `http://minio:9000`) — StorageService dùng CHÍNH biến này để ký CẢ presigned PUT (upload) lẫn GET (đọc, §13.2), và chữ ký SigV4 bao gồm Host header. Đặt endpoint nội bộ ở đây làm mọi URL đã ký trỏ tới một tên miền trình duyệt không phân giải được. Xem §13.7. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` / `change-me-minio-password` (chỉ dev cục bộ) | **Production PHẢI là credential của USER ỨNG DỤNG chuyên dụng, KHÔNG BAO GIỜ là MinIO root/`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`.** Xem §13.8 (mô hình IAM) và §13.9 (quy trình xoay vòng). |
| `S3_BUCKET` | trống → `phuquochub-dev` (hoặc `phuquochub-test` khi `NODE_ENV=test`) | **Production PHẢI set tường minh** (`phuquochub-prod`) — để trống nghĩa là media thật lặng lẽ ghi vào bucket dev. |
| `S3_REGION` | `us-east-1` | Không ảnh hưởng hành vi với MinIO (không phải AWS thật) — giữ để tương thích SDK/chữ ký SigV4. |
| `S3_FORCE_PATH_STYLE` | `true` | Bắt buộc `true` với MinIO (URL dạng `/{bucket}/{key}`, không phải virtual-hosted-style) — khớp giả định `handle /minio/*` ở Caddyfile (§13.7). |
| `S3_PRESIGN_GET_TTL` | `300` | Tuổi thọ signed GET URL (giây), hợp lệ 30..3600. |
| `S3_PUBLIC_URL` | — | **Không còn ảnh hưởng tới URL media.** Giữ lại cho tương thích deployment. |

`StorageService.getPublicUrl()` đã bị **xoá** — đó chính là phương thức duy nhất từng dựng URL object
storage trực tiếp. Xoá nó là bằng chứng cấu trúc rằng không code path nào còn phụ thuộc vào việc
bucket đọc được ẩn danh.

### 13.6 Việc CHƯA làm

- ~~Cover image từ media upload vẫn chưa hiển thị được (subquery đọc `m.url`, luôn NULL cho upload
  row) — khoảng trống CHỨC NĂNG có sẵn từ trước, không phải do thay đổi này.~~
  **ĐÃ ĐÓNG 2026-08-12** (Owner Cover & Photo Ordering) — xem §14.

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

## 13.8 MinIO IAM — root vs application user (2026-08-10)

Trước milestone này, `S3_ACCESS_KEY`/`S3_SECRET_KEY` production trỏ thẳng vào credential **root**
của MinIO — cùng loại vấn đề với §13.1 (quyền vượt xa nhu cầu thực tế): root có toàn quyền quản
trị (tạo/xoá bucket, đổi policy, quản lý user khác), trong khi tầng ứng dụng chỉ cần đọc/ghi/xoá
từng object theo `object_key` đã biết trước.

**Mô hình đã áp dụng:**

| Vai trò | Dùng cho | Quyền trên `phuquochub-prod` |
|---|---|---|
| **Root credential** (`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`) | CHỈ thao tác quản trị thủ công (tạo user, đổi policy, kiểm tra Console) — KHÔNG BAO GIỜ nạp vào biến môi trường của `api` | Toàn quyền (mặc định MinIO) |
| **`phuquochub-app-20260810`** (user chuyên dụng) | `S3_ACCESS_KEY`/`S3_SECRET_KEY` production của `api` | CHỈ `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` — **KHÔNG** `s3:ListBucket` |

`s3:ListBucket` bị từ chối **có chủ đích** cho cả user ứng dụng: đây chính xác là quyền đã gây ra
sự cố ở §13.1 (canned policy `download` cấp `ListBucket` cho principal ẩn danh, cho phép liệt kê
toàn bộ bucket). Loại nó khỏi user ứng dụng nghĩa là dù `S3_ACCESS_KEY`/`S3_SECRET_KEY` production
có bị lộ, kẻ tấn công vẫn không liệt kê được object key — chỉ đọc/ghi được những key mà tầng ứng
dụng (đã biết `object_key` lưu trong cột `media.object_key`, §2.1) chủ động yêu cầu. Đây là lớp
phòng vệ **cộng thêm**, độc lập với bucket policy PRIVATE ở §13.2: bucket policy chặn truy cập ẩn
danh; IAM least-privilege chặn cả truy cập CÓ credential app khỏi vượt phạm vi object CRUD.

Root credential đã được **xoay vòng** (giá trị mới) SAU KHI user `phuquochub-app-20260810` được
tạo và xác nhận hoạt động đúng độc lập (§13.9). Giá trị root cũ không còn hiệu lực. Root hiện tại
**chỉ mang tính quản trị** — không được ứng dụng sử dụng ở bất kỳ đường nào, xác nhận bằng việc
`api` chạy bình thường sau rotation mà không cần thay đổi gì khác ngoài `.env` (§13.12).

## 13.9 Credential rotation runbook (MinIO app-user + root)

Trình tự BẮT BUỘC — không đảo thứ tự, mỗi bước phải xác nhận PASS trước khi sang bước kế tiếp.
Không bước nào ghi giá trị secret thật ra log/doc/commit — chỉ ghi lại KẾT QUẢ (pass/fail, HTTP
status), khớp [`PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`](../../delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md).

1. **Tạo user ứng dụng mới trước, KHÔNG đụng root/API đang chạy.** Qua MinIO Console hoặc `mc admin
   user`, tạo user mới + policy least-privilege đúng §13.8 (`GetObject`/`PutObject`/`DeleteObject`,
   không `ListBucket`) trên bucket `phuquochub-prod`.
2. **Kiểm thử user mới ĐỘC LẬP với API production** trước khi API biết tới nó — credential tạm thời
   (`mc`/AWS SDK), xác nhận cả bốn kiểm tra đều PASS:
   - `PutObject` một object thử nghiệm → thành công.
   - `GetObject` chính object đó → thành công, nội dung khớp.
   - `DeleteObject` object đó → thành công.
   - `ListBucket` bằng credential này → bị **từ chối** (đúng policy least-privilege).
3. **CHỈ SAU KHI bước 2 PASS cả bốn kiểm tra**, đổi `S3_ACCESS_KEY`/`S3_SECRET_KEY` trong `.env`
   production sang user mới, khởi động lại **chỉ service `api`** (không cần recreate MinIO ở bước
   này — chỉ đổi biến môi trường phía client).
4. **Xác minh API sau khi chuyển sang user mới**, TRƯỚC KHI đụng tới root: chạy lại bộ kiểm tra bảo
   mật ở §13.12 (unsigned 403, `/api/media/{id}/file` 302 → presigned GET 200, ảnh hiển thị được
   trên trình duyệt thật).
5. **KHÔNG BAO GIỜ xoay root TRƯỚC khi bước 4 đã PASS.** Root chỉ được xoay sau khi user ứng dụng đã
   chứng minh hoạt động đúng, độc lập với root.
6. **Xoay root credential.** Root user/password của MinIO được đặt qua biến môi trường container
   (`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`) lúc khởi động — đổi giá trị này đòi **recreate riêng
   service `minio`** (không phải toàn bộ stack; `api`/`web`/`postgres`/`redis`/`caddy` không cần
   khởi động lại). Sao lưu `.env` hiện tại TRƯỚC khi sửa (xem §13.10/§13.11).
7. **Xác minh lại API/media SAU rotation root** — chạy lại toàn bộ §13.12 một lần nữa. Root không
   được dùng ở bất kỳ đường nào của ứng dụng nên về lý thuyết không có gì đổi, nhưng đây là bước xác
   nhận bắt buộc, không phải tuỳ chọn.

## 13.10 Rollback

Bốn kịch bản, từ nhẹ tới nặng. **Không có migration DB nào liên quan tới việc hardening media này**
(§13 toàn bộ là thay đổi tầng application + hạ tầng object storage) — không kịch bản nào dưới đây
cần `migration:revert`/restore Postgres.

1. **Signed-media thất bại trước khi khoá private** (giai đoạn 87d010e/b696584). Nếu luồng
   signed-URL (302 → presigned GET) lỗi trong lúc bucket còn ở trạng thái trung gian: `git revert`
   commit hạ tầng liên quan (Caddyfile/`docker-compose.prod.yml`/`.env`), redeploy theo
   [`RELEASE-ROLLBACK-RUNBOOK.md`](../../delivery/RELEASE-ROLLBACK-RUNBOOK.md).
2. **Rollback anonymous-download khẩn cấp** (chỉ dùng khi THỰC SỰ cần thiết, tạm thời). Nếu luồng
   signed-URL lỗi diện rộng và cần khôi phục hiển thị ảnh ngay trong lúc chờ sửa gốc: có thể tạm
   thời chạy lại `mc anonymous set download local/phuquochub-prod` để quay về mô hình public-read cũ
   (§13.1). Đây là **thụt lùi bảo mật có chủ đích, chỉ chấp nhận được như biện pháp khẩn cấp ngắn
   hạn** — không phải trạng thái ổn định. Phải quay lại `mc anonymous set none` (private) ngay khi
   luồng signed-URL được sửa, rồi xác minh lại bằng §13.12.
3. **Rollback credential ứng dụng.** Nếu user `phuquochub-app-20260810` gặp sự cố (policy sai, bị vô
   hiệu hoá nhầm...): tạo lại user mới theo đúng quy trình §13.9 từ bước 1 — KHÔNG cấp lại quyền
   `ListBucket` hay tạm đổi về root để "chữa cháy" (đảo ngược đúng thứ hardening đang đóng ở
   milestone này).
4. **Rollback root credential.** Chỉ thực hiện từ bản sao `.env` được bảo vệ, sao lưu TRƯỚC lúc xoay
   (xem §13.11) — không bao giờ từ trí nhớ/log. Sau khi khôi phục, chạy lại toàn bộ §13.12.

## 13.11 Ghi chú vận hành

- **`media.phuquochub.com` PHẢI giữ nguyên Host header khi proxy tới MinIO** — SigV4 ký cả Host
  header (§13.5/§13.7). **KHÔNG được thêm `header_up Host ...`** ghi đè trong site block Caddy cho
  host này, dù đó là thói quen phổ biến ở các site block khác trong cùng file — làm vậy phá TOÀN BỘ
  chữ ký presigned URL (cả PUT lẫn GET) một cách ẩn (API vẫn trả 302 bình thường, chỉ là 302 tới một
  chữ ký sai). Chi tiết đầy đủ đã có sẵn trong comment của chính `infrastructure/caddy/Caddyfile`.
- **MinIO Console/Admin port `:9001` phải luôn ở chế độ private** — không site block Caddy nào được
  trỏ tới nó; chỉ `:9000` (S3 API) được proxy, và ngay cả `:9000` cũng chặn `/minio/*` ở edge (§13.7)
  vì MinIO phục vụ Admin API trên CÙNG cổng với S3 API.
- **Caddy là ingress công khai DUY NHẤT của toàn bộ stack** — postgres/redis/minio không publish
  cổng ra host ([deployment.md §6.2](../../architecture/deployment.md)); mọi thay đổi
  network/topology phải giữ bất biến này.
- **Backup rollback đang giữ trên VPS** (tại thời điểm viết, 2026-08-10):
  - `/home/deploy/backups/a9c25f8-pre/web-review-files.tar.gz`
  - `/home/deploy/backups/87d010e-pre/current-files.tar.gz`
  - `/home/deploy/backups/.env-before-minio-root-rotate-20260810`
  - `/home/deploy/phuquochub-deploy.tar.gz` (tạm giữ)

  Chỉ nên xoá các bản sao trên SAU KHI: (a) rollout này đã ổn định qua ít nhất một chu kỳ vận hành
  bình thường không phát sinh sự cố liên quan, VÀ (b) Owner xác nhận rõ ràng không còn cần đường
  rollback về các commit/trạng thái credential trước đó. Không tự ý xoá — đây là quyết định vận
  hành, không phải dọn dẹp tự động.

## 13.12 Kiểm tra bảo mật kỳ vọng & bằng chứng xác minh production (2026-08-10)

Bộ kiểm tra dưới đây là **kỳ vọng vận hành thường trực** (chạy lại sau MỌI thay đổi liên quan tới
credential/bucket policy, không chỉ một lần) — đồng thời là bằng chứng đã xác nhận cho milestone
đóng ngày 2026-08-10:

| Kiểm tra | Kỳ vọng | Kết quả 2026-08-10 |
|---|---|---|
| `GET` object trực tiếp, không chữ ký (unsigned) | `403` (bucket PRIVATE, §13.2) | Xác nhận `403` |
| `GET /api/media/{id}/file` với media `published` | `302` → presigned GET URL | Xác nhận `302` |
| Presigned GET URL trả về từ bước trên | `200`, `Content-Type: image/jpeg` (hoặc đúng MIME gốc) | Xác nhận `200 image/jpeg` |
| `GET /api/media/{id}/file` với `pending`/`hidden`/`rejected`/đã xoá mềm/không tồn tại | `404` đồng nhất (§13.3, bất biến không phân biệt lý do) | Không đổi (bất biến §13.3 không bị ảnh hưởng bởi rotation) |
| MinIO Console (`:9001`) | Không thể truy cập công khai | Xác nhận không public-reachable |
| Ảnh review trên trình duyệt thật | Hiển thị đúng | Xác nhận hiển thị đúng sau hardening |
| API healthy | `/api/health` OK | Xác nhận |
| MinIO healthy | Container/service khoẻ | Xác nhận |
| Root credential rotation | Không làm gián đoạn luồng media | Hoàn tất, §13.9 bước 7 PASS |

**Trạng thái milestone: HOÀN TẤT / ĐÃ XÁC MINH (COMPLETED/VERIFIED).** Không phát hiện tồn đọng
chức năng nào ở milestone này. Báo cáo đóng đầy đủ:
[`MINIO-IAM-CREDENTIAL-HARDENING-2026-08-10.md`](../../delivery/reports/MINIO-IAM-CREDENTIAL-HARDENING-2026-08-10.md).

## 14. Ảnh bìa & thứ tự ảnh của cơ sở (Owner Cover & Photo Ordering, 2026-08-12)

Nối tiếp Owner Place Photos (§13 + `place-media.controller.ts`): chủ/quản lý cơ sở nay **sắp xếp
được** ảnh của mình và **chọn được ảnh bìa**. Không có bảng mới, không có migration, không có
permission mới — dùng đúng `media.sort_order` và `places.cover_image_id` đã có sẵn trong schema.

### 14.1 Hai endpoint mới

| Endpoint | Body | Quyền |
|---|---|---|
| `PATCH /places/{placeId}/media/order` | `{ media_ids: uuid[] }` | `Media.Upload.Managed` trên `placeId` (route param) |
| `PATCH /places/{placeId}/media/cover` | `{ media_id: uuid }` | `Media.Upload.Managed` trên `placeId` (route param) |

Cả hai trả về **danh sách ảnh của cơ sở sau thay đổi** (`PlaceOwnerMedia[]`, nay có thêm
`sort_order` và `is_cover`) nên client không cần gọi thêm vòng nào và luôn thấy đúng thứ tự chuẩn
do server quyết định.

Phân quyền đi **đúng đường cũ**: place id là ROUTE PARAM, `@AuthorizationContext(place)` phân giải
từ param/principal chứ không bao giờ từ body — id mà guard đã cho phép CHÍNH LÀ id service dùng.
Không có trường `place_id` nào trong body của hai DTO này (`whitelist` + `forbidNonWhitelisted` trả
400 nếu client cố gửi). Manager và owner có **cùng** năng lực ở đây, y hệt upload/xoá ảnh:
`business_manager` được cấp `Media.Upload.Managed`, `business_owner` kế thừa qua DAG vai trò.

### 14.2 `media.sort_order` — ngữ nghĩa

- `INT NULL`, **không** default, **không** unique; phạm vi theo cơ sở qua partial index
  `idx_media_place (place_id, sort_order) WHERE place_id IS NOT NULL`.
- Ghi thành **0..n-1 liên tục** theo đúng vị trí trong `media_ids` — xác định, không phụ thuộc giá
  trị cũ, nên sắp lại nhiều lần không làm số trôi dần.
- `NULL` = **chưa từng được sắp** (mọi ảnh trước milestone này) → xếp **SAU** ảnh đã sắp.
- **Thứ tự chuẩn của gallery cơ sở** (`MediaRepository.PLACE_GALLERY_ORDER`, dùng chung cho CẢ
  `listPublishedByPlace()` công khai lẫn `listAllByPlace()` của chủ cơ sở):
  `sort_order ASC NULLS LAST, created_at DESC, id DESC`.
  Trước đây câu công khai chỉ có `sort_order ASC`: khi tất cả cùng NULL (đúng thực tế dữ liệu hiện
  có) thứ tự hoàn toàn do planner quyết định. Khoá phụ tới tận PK làm kết quả **xác định**. Hai
  danh sách PHẢI cùng thứ tự, nếu không thao tác "Lên/Xuống" của chủ cơ sở không phản ánh đúng thứ
  tự khách nhìn thấy.

**Hợp đồng "toàn bộ hay không có gì":** `media_ids` phải là ĐÚNG tập ảnh chưa gỡ của cơ sở (MỌI
trạng thái), mỗi id một lần. Thiếu / trùng / lẫn id cơ sở khác → **422**. Không có ngữ nghĩa "sắp
một phần": vị trí của ảnh bị bỏ qua là câu hỏi không có câu trả lời đúng duy nhất (giữ số cũ? đẩy
xuống cuối? xen kẽ?), mọi lựa chọn đều làm chủ cơ sở bất ngờ.

Ảnh `pending`/`rejected` **cũng được sắp** (chúng hiện trên cùng màn hình quản lý, và một ảnh chờ
duyệt phải đáp xuống đúng vị trí đã chọn ngay khi được duyệt). Việc này **không** nới lỏng gì ở
kênh công khai — `listPublishedByPlace()` vẫn chỉ trả `published`.

Toàn bộ chạy trong MỘT transaction: đọc tập hiện tại có `FOR UPDATE` (hai lần sắp đồng thời bị tuần
tự hoá), rồi MỘT câu UPDATE set-based `unnest(...) WITH ORDINALITY` cho cả danh sách — không N+1,
không có trạng thái "sắp được một nửa". `place_id` + `deleted_at IS NULL` nằm TRONG `WHERE` của
chính câu UPDATE, nên id của cơ sở khác khớp 0 dòng: không có khe TOCTOU giữa kiểm tra và ghi.

### 14.3 `places.cover_image_id` — ngữ nghĩa

Cột **đã có sẵn** từ `InitPlaces1720000400000` (`uuid`, FK → `media`, `ON DELETE SET NULL`) nhưng
**chưa luồng nào ghi** trước milestone này (xác nhận trên DB dev: 0/68 place có cover). **Không có
cột `places.cover_image_url`** — `cover_image_url` là trường của *hợp đồng API*, được **suy ra ở
tầng đọc**, không bao giờ được lưu.

Đặt bìa bằng **MEDIA ID**, không bao giờ bằng URL: URL do client cung cấp không kiểm chứng được (có
thể trỏ ra ngoài, có thể là presigned URL sắp hết hạn), còn media id thì kiểm được đầy đủ tư cách.

**Điều kiện đủ tư cách** nằm trong `EXISTS` của **chính câu UPDATE** (`setPlaceCoverImage`), không
phải "SELECT kiểm tra rồi UPDATE":

| Điều kiện | Chặn điều gì |
|---|---|
| `m.place_id = $placeId` | tráo media id sang cơ sở khác |
| `m.status = 'published'` | ảnh `pending`/`rejected`/`hidden` thành bìa công khai |
| `m.object_key IS NOT NULL` | dòng không có object thật (không ký được URL) |
| `m.deleted_at IS NULL` | ảnh đã gỡ |

Mã lỗi: **404** khi ảnh không thuộc cơ sở này (không phân biệt "không tồn tại" với "của người
khác" — cùng khuôn `removeFromPlace`); **422** khi ảnh CÓ thuộc cơ sở nhưng chưa đủ tư cách (chủ cơ
sở vốn đã thấy trạng thái đó trên màn hình của mình nên nói thẳng là hữu ích và không rò rỉ gì).

### 14.4 Đường ĐỌC: `cover_image_url` được sinh, không được lưu

`core/media-url/cover-image.ts` là **một** định nghĩa dùng chung cho cả 7 repository đọc card
(`places` + attractions/beaches/hotels/restaurants/tours/transports) — trước đây chuỗi SQL này bị
chép 7 lần nên có thể lệch nhau theo thời gian.

Nó **đóng khoảng trống §13.6**: subquery cũ đọc thẳng `m.url`, mà đường upload luôn ghi
`url = NULL`, nên mọi ảnh bìa chọn từ ảnh đã upload đều ra `NULL`. Nay subquery trả về **hai** cột:

- `cover_image_url` — `media.url` đã lưu; chỉ dòng LEGACY/nhúng ngoài (`youtube`/`vimeo`) mới có;
- `cover_image_media_id` — id của ảnh đã upload, để tầng ứng dụng dựng URL API rồi **xoá** cột này
  khỏi row (nó không thuộc hợp đồng công khai nào).

Việc dựng URL **không** làm trong SQL: `MediaUrlService` là nơi duy nhất biết `API_PUBLIC_URL` +
global prefix, và một câu SQL không nên biết gì về HTTP routing (đúng ranh giới mà §13.2 đã dựng).
Kết quả luôn là URL API **ổn định** `{API_PUBLIC_URL}/{prefix}/media/{id}/file` — không presigned,
không địa chỉ object storage, thu hồi được ngay ở lần tải kế tiếp.

Đường đọc lặp lại đủ ba vị từ (`published`, đúng cơ sở, chưa xoá mềm) **độc lập** với đường ghi:
kể cả khi `cover_image_id` bị đặt thẳng bằng SQL tay hay bởi import dữ liệu, công khai vẫn ra
`null`. Hai bài E2E ghim đúng tình huống đó.

Thêm `m.place_id = p.id` vào đường đọc cũng cưỡng chế quy tắc toàn vẹn đã ghi ở
[place.md](../../product/modules/place.md) ("`cover_image_id` phải trỏ ảnh thuộc cùng place & đã
`published`") — trước đây chỉ là quy tắc trên giấy.

### 14.5 Vòng đời: ảnh bìa không bao giờ bị treo

| Sự kiện | Xử lý | Ở đâu |
|---|---|---|
| Chủ cơ sở gỡ ảnh đang là bìa | `cover_image_id = NULL` trong CÙNG transaction với xoá mềm | `MediaService.removeFromPlace` |
| Kiểm duyệt đưa ảnh ra khỏi `published` (hide/reject) | `cover_image_id = NULL` trong CÙNG transaction với quyết định | `ModerationService.decideMedia` |
| Ảnh bị ẩn rồi được khôi phục | **KHÔNG** tự trở lại làm bìa | (hệ quả của hai dòng trên) |

**KHÔNG tự chọn ảnh thay thế.** Một "bìa mới" mà chủ cơ sở không chọn là hành vi bất ngờ; và vì
đường đọc đã an toàn sẵn, việc dọn con trỏ chỉ để **trạng thái lưu trữ nói đúng sự thật**, không
phải để bịt một lỗ hổng. Không có xử lý nền, không có job nào được thêm.

### 14.6 Bất biến được giữ nguyên

- `pending`/`rejected`/`hidden` **không bao giờ** ra kênh công khai — qua gallery lẫn qua ảnh bìa.
- `object_key`/`bucket`/`checksum_sha256` **không rời server** (`PlaceOwnerMedia` liệt kê trường
  tường minh, không spread entity).
- **Không** URL presigned nào được lưu vào DB ở bất kỳ đường nào.
- Không có bảng/cột/migration/permission mới.

## 15. Sửa mô tả ảnh & alt text (Owner Photo Metadata, 2026-08-12)

Nối tiếp §13/§14: chủ/quản lý cơ sở nay **sửa được** `caption`/`alt_text` của TỪNG ảnh sau khi đã
đăng. Cả hai cột đã tồn tại từ Media Upload Foundation (`caption VARCHAR(300)`,
`alt_text VARCHAR(200)`, cả hai nullable) — không có migration, không có permission mới.

### 15.1 Endpoint

`PATCH /places/{placeId}/media/{mediaId}` — `{ caption?: string; alt_text?: string }`, cùng quyền
`Media.Upload.Managed` trên `placeId` (route param) như mọi endpoint place-media khác. Trả về TOÀN
BỘ danh sách ảnh của cơ sở sau khi sửa (`PlaceOwnerMedia[]`, cùng hình dạng `GET`).

Đặt SAU `PATCH 'order'`/`PATCH 'cover'` trong khai báo controller: Nest/Express khớp route theo
THỨ TỰ ĐĂNG KÝ cho cùng phương thức HTTP, nên route `:mediaId` phải đứng CUỐI để không nuốt nhầm
`order`/`cover` thành một giá trị `mediaId`.

### 15.2 Ngữ nghĩa validation

- Hai trường ĐỘC LẬP tuỳ chọn (PATCH bán phần, cùng khuôn `UpdateContactDto`): trường vắng mặt
  (`undefined`) giữ nguyên giá trị cũ; trường có mặt (kể cả chuỗi rỗng) ghi đè.
- **Ít nhất một trong hai phải có mặt** — 400 nếu cả hai đều vắng mặt (một request không sửa gì là
  dấu hiệu lỗi client).
- Giới hạn độ dài khớp ĐÚNG cột DB hiện có: `caption` ≤ 300, `alt_text` ≤ 200 — không phát minh
  giới hạn riêng cho endpoint này.
- Trim rồi rỗng-thành-`null`, thực hiện Ở SERVICE (`normalizeMetadataField`), cùng ngữ nghĩa
  `dto.caption?.trim() || null` mà `MediaService.register()` đã dùng từ trước. `@IsOptional()` cho
  phép `null` lọt qua bỏ qua kiểm tra `@IsString()` của DTO (cùng hành vi đã có ở
  `UpdateContactDto.label`) — service xử lý `null` an toàn, KHÔNG gọi `.trim()` trên nó.

### 15.3 Ghi — an toàn TOCTOU

`MediaRepository.updatePlaceMediaMetadata()` dựng SET clause động (tối đa hai cột literal:
`caption`, `alt_text` — không có đường nào mass-assign cột khác), nhưng WHERE LUÔN cố định:

```sql
UPDATE media SET ... WHERE id = $1 AND place_id = $2 AND deleted_at IS NULL RETURNING id
```

Cùng khuôn `softDeletePlaceMedia()`/`setPlaceCoverImage()`: điều kiện đủ tư cách nằm TRONG câu
UPDATE, không phải "kiểm tra rồi ghi" — một `mediaId` của cơ sở khác (hoặc đã xoá mềm) khớp 0
dòng, không có khe TOCTOU. Trả `false` → service ném 404 (không phân biệt "không tồn tại" với "của
người khác", cùng khuôn `removeFromPlace`).

### 15.4 KHÔNG đụng vòng đời kiểm duyệt/thứ tự/ảnh bìa

Sửa mô tả ảnh **không phải** một quyết định kiểm duyệt: FSM ở `media-moderation.transition.ts` chỉ
định nghĩa transition cho `status`, không hề nhắc tới caption/alt_text. Vì vậy:

- `status` KHÔNG đổi — ảnh `pending`/`rejected`/`hidden` sửa được y hệt `published`;
- KHÔNG tạo case kiểm duyệt mới, KHÔNG reset trạng thái;
- `sort_order`/`cover_image_id` KHÔNG đụng — câu SQL chỉ có thể SET đúng hai cột `caption`/
  `alt_text`.

Chủ cơ sở vốn đã thấy MỌI trạng thái trên màn hình quản lý (`listForPlaceOwner`) và không có lý do
nghiệp vụ nào để khoá riêng trường mô tả theo trạng thái kiểm duyệt.

### 15.5 Hiển thị công khai — KHÔNG đổi (đã đúng từ trước)

Kiểm tra lại (không sửa code): `toMedia()` đã phát `caption`/`alt_text` cho mọi ảnh `published`;
trang chi tiết Place (`apps/web/src/app/(public)/places/[slug]/page.tsx`) đã dùng đúng thứ tự ưu
tiên `alt_text ?? caption ?? place.name` cho thuộc tính `alt` của `<img>` — KHÔNG BAO GIỜ đưa
filename/object_key/UUID vào alt. Caption chỉ tồn tại trong chuỗi fallback đó, KHÔNG được render
thành text hiển thị riêng ở bất kỳ card/search/map nào — milestone này không mở rộng phạm vi hiển
thị, chỉ thêm khả năng SỬA giá trị nguồn.

### 15.6 An toàn văn bản

`caption`/`alt_text` luôn là plain text — không `dangerouslySetInnerHTML`, không parse
markdown/HTML ở bất kỳ đâu (React tự escape khi render vào JSX/thuộc tính `alt`).

## 16. Phản hồi kiểm duyệt cho chủ cơ sở (Owner-facing Moderation Feedback, 2026-08-12)

**Quyết định sản phẩm gốc của milestone này (đã điều tra kỹ) — KHÔNG lộ lý do từ chối của moderator
cho chủ cơ sở.** `status: 'rejected'` là toàn bộ tín hiệu chủ cơ sở nhận được khi một ảnh bị từ
chối; không có trường lý do nào (`reason`/`rejection_reason`/`rejection_reason_code`) được thêm vào
`PlaceOwnerMedia`. Giao diện `/dashboard/places/[id]/photos` giữ nguyên thông điệp chung đã có từ
Owner Place Photos (§13): *"Kiểm duyệt viên đã từ chối ảnh này. Ảnh không hiển thị công khai và
không làm ảnh bìa được."*

> **SUPERSEDED (2026-08-12, cùng ngày, milestone kế tiếp) — xem §17.** §16.3 dưới đây đã liệt kê
> đúng bốn bước cần làm để cho chủ cơ sở một lý do thật sự hữu ích và an toàn; milestone
> **Controlled Media Rejection Reason** đã thực hiện đủ bốn bước đó. §16.1/§16.2 vẫn đúng và vẫn là
> lý do `moderation_cases.reason` (free text) không bao giờ lộ — chỉ phần "không lộ BẤT KỲ lý do
> nào" ở trên đã lỗi thời: nay có MỘT mã lý do có kiểm soát (`rejection_reason_code`) lộ ra, đúng
> nguyên tắc "enum có kiểm soát thì lộ được, free text thì không" mà §16.2 đã chứng minh bằng tiền
> lệ `business_claims.reason_code`.

### 16.1 Vì sao — dữ liệu duy nhất tồn tại không an toàn để lộ

`moderation_cases.reason` (`text`, nullable, bắt buộc khác rỗng khi `decision ∈ {reject, hide}` —
INV-11, xem moderation-design.md) là **text tự do do moderator gõ** vào một `<textarea>` không có
hướng dẫn về đối tượng đọc, hiện chỉ lộ qua `GET /moderation/cases/{id}` sau `Moderation.Queue.View`
(moderator-only). **Không có `reason_code`** (enum có kiểm soát) cho quyết định media ở bất kỳ đâu
trong schema — `report_reason` là một khái niệm KHÁC hẳn (lý do NGƯỜI DÙNG báo cáo nội dung, không
phải lý do MODERATOR từ chối).

### 16.2 Tiền lệ đã có trong repo — cùng câu hỏi, đã được trả lời hai lần

Đây không phải câu hỏi mới. Repo đã có HAI trường hợp y hệt ("text nhân viên gõ về một yêu cầu của
MỘT người dùng cụ thể — có nên lộ lại cho chính người đó không?") và cả hai đều trả lời **KHÔNG**:

| Trường | Chủ đích | Có lộ cho người bị ảnh hưởng? |
|---|---|---|
| `business_claims.decision_note` (free text) | Ghi chú của moderator khi duyệt/từ chối claim sở hữu | **KHÔNG** — `GET /business-claims/mine` (`toOwnBusinessClaimSummary`) chỉ trả `reason_code` |
| `business_claims.reason_code` (enum có kiểm soát) | Mã lý do từ chối claim | **CÓ** — đây chính là bằng chứng "enum có kiểm soát thì lộ được, free text thì không" |
| `bookings.internal_note` (free text) | Ghi chú nội bộ về một booking | **KHÔNG BAO GIỜ**, tài liệu hoá tường minh ở booking.md: *"Chỉ nội bộ — KHÔNG BAO GIỜ lộ qua API (kể cả `GET /bookings/:bookingCode`)"* |
| `moderation_cases.reason` (free text) | Lý do moderator từ chối/ẩn media hoặc review | **Milestone này: KHÔNG** — giữ đúng nguyên tắc trên |

`moderation_cases.reason` có đúng hình dạng và rủi ro như hai trường free-text kia: có thể nhắc tới
case khác, nghi vấn gian lận, hoặc bất cứ gì moderator thấy cần ghi lại — không có cách nào lọc an
toàn bằng máy khỏi một chuỗi tự do 2000 ký tự.

### 16.3 Điều kiện để làm ĐÚNG trong tương lai — ĐÃ TRIỂN KHAI, xem §17

Muốn cho chủ cơ sở một lý do THẬT SỰ hữu ích và an toàn, cần lặp lại đúng mô hình `business_claims`:

1. Thêm cột `reason_code` (enum có kiểm soát, ví dụ `inappropriate_content`/`low_quality`/
   `unrelated_to_place`/`copyright`/`other`) vào `moderation_cases` hoặc một bảng vệ tinh —
   **cần migration**. ✅ `1720004200000-AddModerationReasonCode` — xem §17.1.
2. Đổi `DecideModerationCaseDto`/`ModerationDecisionForm.tsx` để moderator CHỌN mã lý do (dropdown)
   thay vì chỉ gõ tự do — **đổi giao diện quyết định của moderator**. ✅ §17.3.
3. Ánh xạ mỗi mã sang nhãn tiếng Việt an toàn, KHÔNG lộ tên enum thô (`INAPPROPRIATE_CONTENT`) ra
   giao diện — cùng khuôn `PLACE_PHOTO_STATUS_LABELS` đã có. ✅ §17.5.
4. `reason` (free text) VẪN giữ nguyên vai trò nội bộ, không đổi. ✅ không đổi.

(Danh sách trên giữ nguyên như bản gốc — làm tài liệu lịch sử cho quyết định ban đầu. Chi tiết
triển khai thật ở §17.)

### 16.4 Bảo đảm được ghim lại bằng test (bản gốc milestone này — vẫn đúng, được MỞ RỘNG ở §17.6)

- `MediaService.listForPlaceOwner()` không bao giờ gọi `ModerationCasesRepository.createOpenCase`/
  các phương thức ghi khác (unit test) — riêng đọc `reason_code` qua
  `findOwnerSafeReasonCodesForMedia()` giờ CÓ xảy ra, có chủ đích, xem §17.4.
- Response cho một ảnh `rejected` không có `reason`/`resolved_by`/`case_id` — unit test + E2E trên
  Postgres thật (bộ khoá đã biết nay là 9, thêm `rejection_reason_code`, xem §17.2).
- E2E: moderator từ chối một ảnh kèm `reason` cụ thể (chứa dữ liệu "nhạy cảm" giả lập) → `GET
  /places/{placeId}/media` của CHÍNH chủ cơ sở đó không chứa nội dung `reason`, không chứa
  `resolved_by`/danh tính moderator, dù ảnh CHÍNH LÀ ảnh của họ.
- E2E: ảnh bị từ chối rồi được khôi phục (`restore` → `published`) qua MỘT case thứ hai — chủ cơ sở
  thấy đúng trạng thái hiện hành (`published`), không còn dấu vết gì của case từ chối cũ (kể cả
  `rejection_reason_code` — về `null` ngay khi status đổi, không có độ trễ).

## 17. Controlled Media Rejection Reason (2026-08-12, milestone kế tiếp §16.3)

Triển khai đầy đủ mã lý do CÓ KIỂM SOÁT cho quyết định từ chối ảnh, lặp lại đúng mô hình
`business_claims.reason_code` (§16.2) mà không đụng tới nguyên tắc "free text không bao giờ lộ" đã
chốt ở §16.1.

### 17.1 Schema

Migration `1720004200000-AddModerationReasonCode` thêm **một cột duy nhất**:
`moderation_cases.reason_code` (enum CSDL thật `media_moderation_reason_code`, nullable, KHÔNG
CHECK). Không đụng `media`/`reviews`/`reports`/cột `reason` sẵn có. Taxonomy 5 giá trị (audit từ
thực tế, không tái dùng `report_reason`/`ClaimReasonCode` — hai khái niệm khác hẳn, xem
`MediaModerationReasonCode` ở `moderation.enums.ts`):

`inappropriate_content` · `low_quality` · `unrelated_to_place` · `copyright` · `other`

**NULLABLE và KHÔNG CHECK ở CSDL — cố ý**, cùng quy ước đã có sẵn của CHÍNH cột `reason` trên bảng
này (INV-11 cũng chỉ cưỡng chế ở service, không ở entity/migration — xem chú thích trên
`ModerationCase.reason`), KHÔNG theo quy ước `ck_business_claims_rejected_reason` của
`business_claims` (một bảng khác, quy ước riêng của nó). Lý do: mọi case đã `resolved` **trước**
migration này có `reason != null` nhưng `reason_code = null` — dữ liệu HỢP LỆ, không phải hỏng.
KHÔNG backfill, KHÔNG suy đoán mã từ `reason` cũ (free text không suy ngược an toàn thành enum).

### 17.2 Hợp đồng quyết định (`POST /moderation/cases/{id}/decide`)

`reason_code` (optional trên DTO, `@IsEnum(MediaModerationReasonCode)`):

- **Bắt buộc** khi `decision=reject` trên `target_type=media` — thiếu → `422`.
- **Cấm** ở mọi decision/target_type khác (`hide`/`approve`/`restore`/`dismiss`, hoặc bất kỳ
  decision nào trên `target_type=review`) — gửi kèm → `422` tường minh (không âm thầm bỏ qua).
- **KHÔNG áp dụng cho `hide`** dù `hide` cũng gỡ nội dung khỏi công khai (cùng INV-11 với `reject`
  cho `reason` tự do) — `hide` gỡ nội dung ĐÃ từng qua duyệt, một sự kiện khác "ảnh vừa gửi không
  đạt yêu cầu ngay từ đầu"; mở rộng sang `hide` là quyết định sản phẩm riêng, ngoài phạm vi.
- Chỉ ghi vào `moderation_cases.reason_code` khi quyết định thực sự là `reject` — mọi nhánh khác
  (kể cả `dismiss`) ghi `null`, nên một case KHÔNG BAO GIỜ mang mã lý do sai mục đích.

`reason` (free text nội bộ) và `reason_code` là **hai trường, hai mục đích khác hẳn nhau** — không
gộp, không thay thế nhau (xem `DecideModerationCaseDto`).

### 17.3 UX moderator

`ModerationDecisionForm.tsx` thêm một `<select>` (bắt buộc khi `decision=reject` trên media, phân
biệt rõ với textarea `reason` cạnh nó bằng nhãn "Mã lý do cho chủ cơ sở" vs "Ghi chú nội bộ") —
KHÔNG thay thế textarea free text, cả hai cùng tồn tại cho đúng hai mục đích ở §17.2. Danh sách mã +
nhãn hiển thị lấy từ nguồn canonical DUY NHẤT `apps/web/src/modules/media/moderationReasonCodes.ts`.

### 17.4 Hợp đồng owner API (`PlaceOwnerMedia.rejection_reason_code`)

`GET /places/{placeId}/media` (`MediaService.listForPlaceOwner`) thêm **một trường**:
`rejection_reason_code: string | null`. Bốn quy tắc chi phối, mỗi quy tắc có test hồi quy riêng:

1. **KHÔNG BAO GIỜ** `reason`, `resolved_by`/danh tính moderator, `case_id`, hay lịch sử case —
   `findOwnerSafeReasonCodesForMedia()` (repository) không SELECT những cột đó, nên không có đường
   nào chúng vô tình lọt ra.
2. **CHỈ khi `status='rejected'`** — mọi trạng thái khác (kể cả `hidden`, kể cả ảnh từng bị từ chối
   rồi được khôi phục) → `null`, KHÔNG có độ trễ (điều kiện tính lúc ĐỌC, không phải cột lưu trên
   `media`).
3. **Hai nguồn phải khớp**: `media.status` (nguồn sự thật hiển thị, INV-1) và `decision` của quyết
   định gỡ MỚI NHẤT của target đó phải cùng là `reject`. Lệch nhau (ví dụ `hidden` nhưng quyết định
   cuối là `reject` từ một vòng đời cũ) → không hiện gì, thà im lặng còn hơn nói sai.
4. Case LỊCH SỬ (`reason_code=null`, mọi quyết định trước migration §17.1) → `null`, giao diện tự
   lùi về thông điệp chung sẵn có — KHÔNG suy đoán.

**Chống N+1**: một truy vấn phụ DUY NHẤT cho cả gallery (`target_id = ANY($1)`, `DISTINCT ON` lấy
đúng quyết định gỡ mới nhất mỗi media), chỉ chạy khi gallery có ít nhất một ảnh `rejected`. Gallery
toàn ảnh khác trạng thái không tốn thêm truy vấn nào so với trước milestone này.

### 17.5 Nhãn hiển thị — không đóng cứng ngôn ngữ vào API/CSDL

Backend LUÔN trả mã máy đọc thô (`rejection_reason_code: "low_quality"`), KHÔNG BAO GIỜ một câu chữ
đã dịch sẵn — cùng nguyên tắc `business_claims.reason_code` (§16.2: BE trả enum, FE dịch). Dịch
sang tiếng Việt (và tiếng Anh khi PhuQuocHub song ngữ) là việc của FE, tại nguồn canonical DUY NHẤT
`apps/web/src/modules/media/moderationReasonCodes.ts` — dùng CHUNG bởi `ModerationDecisionForm`
(moderator chọn) và `PhotosView` (chủ cơ sở đọc), tránh lặp nhãn độc lập ở hai module.
`PhotosView` không bao giờ render mã enum thô: có `rejection_reason_code` → chèn nhãn đã dịch vào
đúng câu thông báo hiện có; không có → giữ nguyên câu thông báo chung gốc.

### 17.6 Bảo đảm bổ sung, ghim bằng test

- Reject thiếu `reason_code` → `422`; các decision khác kèm `reason_code` → `422`; `hide` không
  đòi/không nhận `reason_code`.
- Case lịch sử (`reason_code=null`, seed trực tiếp SQL) vẫn hợp lệ, không throw.
- `reason_code` không xuất hiện trong response `GET /moderation/cases` khi target là review.
- Ảnh của cơ sở A không làm lộ `rejection_reason_code` của ảnh cơ sở B (IDOR) — truy vấn owner-safe
  luôn nhận đúng tập id đã lọc theo `placeId`.

## Related

- [ADR-003](../../99-decisions/ADR-003-no-polymorphic.md) (đa hình `entity_type`/`entity_id` —
  không áp dụng trực tiếp cho `media`, bảng này dùng exclusive-arc theo ADR-009, không phải mẫu
  đa hình của ADR-003)
- [ADR-009](../../99-decisions/ADR-009-media-model.md) (mô hình `media` gốc, exclusive arc 5 nhánh)
- [docs/api/openapi.yaml](../api/openapi.yaml) (tag `Media`)
- [`PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`](../../delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md)
  (§2 liệt kê credential MinIO app-user/root là thứ KHÔNG BAO GIỜ được lưu trong repo)
- [`MINIO-IAM-CREDENTIAL-HARDENING-2026-08-10.md`](../../delivery/reports/MINIO-IAM-CREDENTIAL-HARDENING-2026-08-10.md)
  (báo cáo đóng milestone IAM least-privilege + root rotation)
