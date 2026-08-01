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

- Frontend upload UI, thumbnail/resize/WebP/AVIF, EXIF, OCR, AI tagging, kiểm duyệt, quét virus,
  CDN optimization, bulk upload — tất cả ngoài phạm vi milestone, theo đúng chỉ đạo.
- Cấu hình production R2 thật (`S3_BUCKET`/credentials thật) — milestone này chỉ có MinIO dev/test.
- Background cleanup cho object/media mồ côi (§6) — không có job tự động nào.
- Sinh signed GET URL động cho media `published` — chưa cần vì chưa có luồng công bố nào tạo ra
  media `published` từ upload path này; điểm cắm sẵn ở `toMedia()`/`MediaRepository
  .listPublishedByPlace()` khi cần.

## Related

- [ADR-003](../../99-decisions/ADR-003-no-polymorphic.md) (đa hình `entity_type`/`entity_id` —
  không áp dụng trực tiếp cho `media`, bảng này dùng exclusive-arc theo ADR-009, không phải mẫu
  đa hình của ADR-003)
- [ADR-009](../../99-decisions/ADR-009-media-model.md) (mô hình `media` gốc, exclusive arc 5 nhánh)
- [docs/api/openapi.yaml](../api/openapi.yaml) (tag `Media`)
