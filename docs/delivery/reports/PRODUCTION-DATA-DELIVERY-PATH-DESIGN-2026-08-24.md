# Production Data Delivery Path — Design (Slice 0.5)

**Loại:** read-only architecture design. Không triển khai code, không migration, không sửa dữ liệu,
không chạy ingestion, không kết nối production/SSH, không git add/commit/push/deploy.
**Phạm vi:** thiết kế đường đưa dữ liệu địa điểm đã phê duyệt tới production — an toàn, kiểm toán
được, rollback được — **mà không xoá, vô hiệu hoá hoặc làm yếu `assertNotProduction()`**.

---

## 0. Git state — trước và sau

| | Trước | Sau |
|---|---|---|
| Branch | `feat/place-administrative-backfill` | `feat/place-administrative-backfill` |
| HEAD | `cc6d9691dddcf326049311020ba52f9fa6b883ea` | `cc6d9691dddcf326049311020ba52f9fa6b883ea` |
| Tracked changes | *(none)* | *(none)* |
| Untracked | `deploy-c9cf9e5.sh`, `SMART-TRAVEL-CAPABILITY-AUDIT-2026-08-24.md`, `research-round-2-21-places.md` | *(3 file trên, nguyên vẹn)* + **báo cáo này** |

Thay đổi duy nhất là file báo cáo này. `deploy-c9cf9e5.sh` không bị đụng.

---

## 1. Executive summary

Đường ghi production không bị chặn bởi một bức tường. Nó bị chặn bởi **một khoảng trống**: guard
hiện tại bảo vệ *ba script CLI*, còn ứng dụng thì vốn đã được thiết kế để ghi trong production —
và không ai nối hai thứ đó lại.

Bốn phát hiện định hình toàn bộ thiết kế:

1. **`assertNotProduction()` KHÔNG bảo vệ ứng dụng — nó chỉ bảo vệ ba entrypoint CLI.**
   `PlacesController.update()` (`places.controller.ts:69-77`) chạy trong production mỗi ngày, ghi
   thẳng vào `places` qua `PlacesService.update()`, và guard không hề chạm tới nó. Vì vậy thiết kế
   đúng **không phải** là "nới guard", mà là **thêm một entrypoint thứ hai có cổng riêng, chặt hơn**
   — guard cũ giữ nguyên từng ký tự.

2. **Service ingestion đã đúng và đã đầy đủ.** `VerifiedFactsIngestionService` đi qua đúng
   `sources → source_attributions → wiki_revisions → verifications`, idempotent, có `dryRun`, không
   giả mạo `method` (luôn `SOURCE_MATCH`), không nâng `reliability` của nguồn `search_index`. **Cái
   thiếu là entrypoint chạy được trong production, không phải logic nghiệp vụ.**

3. **Không có rollback ở cấp dữ liệu.** `RevisionsService` chỉ có `listByPlace()` và
   `recordPlaceRevision()` — **không có `revert()`, không có controller** (`revisions/` không chứa
   file `.controller.ts`). Đơn vị rollback dữ liệu duy nhất hiện có là **khôi phục toàn bộ CSDL**
   từ `scripts/backup.sh` + `scripts/restore.sh`. Đây là ràng buộc thiết kế nghiêm trọng nhất và là
   lý do canary phải cực nhỏ.

4. **Production baseline là UNKNOWN từ bằng chứng repository.** Không có git tag nào (0 tag). Tag
   ảnh production nằm trong `.env` **trên VPS**, không nằm trong repo. Xem §2.1 — con số "43 commit"
   trong báo cáo audit trước **phải được sửa**.

**Kiến trúc khuyến nghị: Phương án D (Hybrid).** Manifest bất biến có checksum, được tạo và review
ngoài production; một job chạy **bên trong** môi trường production (đúng khuôn `migrate` service đã
có), nhập qua chính `VerifiedFactsIngestionService`, giữ nguyên revision/attribution/verification/
audit. Guard cũ không đổi một dòng nào.

---

## 2. Current-state evidence

### 2.1. Production baseline — **UNKNOWN**, có biên xác định

Không được suy đoán. Bằng chứng thật trong repo:

| Bằng chứng | Nội dung |
|---|---|
| `git tag -l` | **0 tag** — không có release tag nào |
| `git branch -r` | chỉ `origin/feat/place-administrative-backfill` |
| `docker-compose.prod.yml:228,333` | `image: phuquochub-api:${API_IMAGE_TAG:-local}` / `phuquochub-web:${WEB_IMAGE_TAG:-local}` |
| `.env` (local) | **không chứa** `API_IMAGE_TAG`/`WEB_IMAGE_TAG` — đây là `.env` dev, không phải của production |
| `release-eb63a4b.txt` | `release_commit: eb63a4b`, `previous_web_release: c9cf9e5`, và ghi rõ **"IMAGES (built locally, NOT deployed)"** |
| `.release-transfer/` | chứa `phuquochub-{api,web}-eb63a4b.tar.gz` (2026-08-14 18:20) — đã đóng gói để chuyển, **không có bằng chứng đã nạp** |
| `docs/delivery/reports/` | **không có** report deployment nào sau 2026-08-14 xác nhận `eb63a4b` đã lên production |

**Kết luận: `PRODUCTION_BASELINE = UNKNOWN`.** Hai kịch bản có biên:

| Kịch bản | Baseline | Khoảng cách tới HEAD `cc6d969` |
|---|---|---|
| `eb63a4b` **chưa** deploy (khớp văn bản manifest) | `c9cf9e5` (web) | **44 commit** |
| `eb63a4b` **đã** deploy sau khi manifest được viết | `eb63a4b` | **15 commit** |

> **SỬA LỖI báo cáo trước:** `SMART-TRAVEL-CAPABILITY-AUDIT-2026-08-24.md` §1.2 ghi "43 commit".
> Con số đúng tại HEAD `a045a8f` là 43; tại HEAD hiện tại `cc6d969` là **44** (Slice 0 thêm 1). Quan
> trọng hơn: con số đó **giả định baseline = `c9cf9e5`**, mà giả định này không được chứng minh
> bằng bằng chứng repository. Phải đọc là "44 **nếu** baseline là `c9cf9e5`", không phải một sự thật.

**Cách xác minh sau (read-only, KHÔNG làm trong lượt này):** trên VPS chạy
`scripts/verify-release-pins.sh` — script này chỉ `docker images -q` + `docker inspect`, đọc đúng
hai khoá không-bí-mật từ `.env`, **không khởi động/build/ghi gì** (header script tự khai điều đó).
Đây là bằng chứng đáng tin duy nhất cho baseline.

*Lưu ý phân biệt:* cây **mã nguồn** trên VPS từng được đối soát về `2764511` (2026-08-15). Đó
**không phải** mã đang chạy — container chạy từ ảnh đã pin. Hai thứ này lệch nhau được, và
`deploy.sh` build **từ cây nguồn trên VPS** (`scripts/deploy.sh:34,50` — `docker build … "$PROJECT_DIR"`),
nên cây nguồn quan trọng ở lần deploy *tiếp theo*, còn ảnh quyết định *hiện tại*.

### 2.2. `assertNotProduction()` bảo vệ đúng những gì?

| Entrypoint | Có guard? | Ghi được place facts? |
|---|---|---|
| `scripts/audit-data-quality.ts:134` | ✅ (bản sao riêng, `:31`) | ❌ chỉ đọc |
| `scripts/backfill-administrative-data.ts:58` | ✅ (bản gốc, `:33`) | ✅ province/admin_area |
| `scripts/ingest-verified-facts.ts:23` | ✅ (import từ backfill, `:6`) | ✅ opening_hours + contacts |
| **`PlacesController.update()` (HTTP)** | ❌ **KHÔNG** | ✅ **mọi trường revisable** |
| **`ContactsController.create/update` (HTTP)** | ❌ **KHÔNG** | ✅ contacts |
| **`VerificationsController.*` (HTTP)** | ❌ **KHÔNG** | ✅ verification state |
| **`BusinessClaimsController.decide` (HTTP)** | ❌ **KHÔNG** | ✅ verification official |

> **Phát hiện phụ (nợ kỹ thuật, không chặn Slice 0.5):** `assertNotProduction()` được **định nghĩa
> hai lần** với thân hàm **giống hệt nhau** — `audit-data-quality.ts:31` và
> `backfill-administrative-data.ts:33`. Chỉ bản thứ hai được import lại. Hai bản sao của cùng một
> guard an toàn là rủi ro trôi dạt: sửa một bên, quên bên kia. Nên hợp nhất, **nhưng không phải
> trong Slice 0.5** — đụng vào guard trong chính slice mở đường ghi production là sai thứ tự niềm tin.

### 2.3. Kiểm kê đường ghi place facts

| # | Đường | Transaction | Idempotent | Revision | Attribution | Verification | Auto-APPROVED | RBAC | Audit actor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `PlacesController.update()` → `PlacesService.update()` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ **có** (`places.service.ts:315`) | ✅ `Place.Edit.Managed` | ✅ `userId` |
| 2 | `AdministrativeBackfillService` → (1) | ❌ | ✅ | ✅ | ✅ 3 lớp | ✅ | ✅ (kế thừa 1) | ❌ CLI | ⚠️ actorId truyền tay |
| 3 | `VerifiedFactsIngestionService` → (1)+contacts | ⚠️ **một phần** | ✅ | ✅ | ✅ 3 lớp | ✅ | ✅ (kế thừa 1) | ❌ CLI | ⚠️ actorId truyền tay |
| 4 | `VerificationsService.syncTargetCache()` → `updateScalars()` | ✅ | n/a | ❌ | ❌ | ✅ | n/a | ✅ | ✅ |
| 5 | `BusinessClaimsService.decide()` → `ensureOfficialFromClaim()` | ✅ | ✅ | ❌ | ✅ (sources) | ✅ | n/a | ✅ | ✅ |

**Chi tiết quan trọng về (3):** transaction **chỉ bao** lệnh gọi `ensureOfficialFromClaim()`
(`verified-facts-ingestion.service.ts:366`). Việc tạo source, PATCH `opening_hours`, tạo contacts và
tạo attributions **nằm ngoài transaction**. Nghĩa là một lần chạy hỏng giữa chừng để lại **trạng
thái một phần**; an toàn khi chạy lại là nhờ **idempotency**, không nhờ atomicity. Thiết kế bên dưới
phải chấp nhận điều này thay vì giả vờ nó là atomic.

**Dry-run:** chỉ (3) có (`--dry-run`, `ingest-verified-facts.ts:20`). (1), (2) không có.

**Conflict detection trước khi ghi:** không đường nào có. (3) có so sánh idempotency
(`canonicalJson`, `:66-77`) — phát hiện "đã giống" chứ **không** phát hiện "đã khác do người khác sửa".

### 2.4. ⚠️ Sửa lỗi báo cáo audit trước — trust/commercial

`SMART-TRAVEL-CAPABILITY-AUDIT-2026-08-24.md` §3.1 khẳng định `BusinessClaimsService.decide()` ghi
**thẳng** `places.verification_status = 'official'`, bỏ qua state machine, không tạo `sources`.

**Khẳng định đó SAI so với code hiện tại.** Bằng chứng:

- `business-claims.service.ts:53-54`: *"KHÔNG còn ghi `places.verificationStatus`/`verifiedAt` trực
  tiếp. Thay vào đó, nó gọi `VerificationsService.ensureOfficialFromClaim()`"*
- `business-claims.service.ts:257-260`: tạo `sources` qua callback lười, chỉ khi thật sự sắp transition
- `business-claims.service.ts:358,366`: `type: SourceType.BUSINESS_OWNER`, reliability lấy từ bảng mặc định
- `verifications.service.ts:52-56`: *"Bảng `verifications` giờ LÀ nguồn sự thật duy nhất cho MỌI
  trạng thái xác minh tin cậy … VÀ business claim approval qua `ensureOfficialFromClaim()`"*

Milestone **CLAIM → SOURCE → VERIFICATION CORRECTION** đã triển khai. Đúng theo quy tắc "code và
migration đang chạy là bằng chứng chính", báo cáo trước phải được đọc là **lỗi thời ở điểm này**.

**Điều còn đúng, ở phạm vi hẹp hơn nhiều:** `trust.ts:36-49` vẫn ánh xạ `official` — mà chủ cơ sở
đạt được bằng claim, với `sources.reliability = 85` — sang **cùng một badge công khai "Đã xác minh"**
với một xác minh nguồn chính phủ (reliability 95). Đây là câu hỏi **nhãn hiển thị**, không phải lỗ
hổng bypass. Nó thuộc Slice 6, không thuộc Slice 0.5.

### 2.5. Hạ tầng deploy/rollback đã có

| Năng lực | Có? | Bằng chứng |
|---|---|---|
| Build + tag ảnh có OCI provenance | ✅ | `deploy.sh:33-55` (`GIT_COMMIT`, `BUILD_DATE`) |
| Migration tách khỏi boot | ✅ | compose `migrate` service, `profiles: [tools]` (`:204-205`), `migrationsRun:false` |
| Smoke test **trước** cutover | ✅ | `deploy.sh:75-91` |
| Health + route check sau cutover | ✅ | `deploy.sh:116-130` |
| Persist release tag | ✅ | `deploy.sh:100` Step 9b |
| Drift detector cho pin | ✅ | `scripts/verify-release-pins.sh` (read-only) |
| Rollback ảnh | ✅ | `scripts/rollback.sh` (kiểm tra ảnh tồn tại trước khi thử) |
| Backup có checksum + kiểm toàn vẹn | ✅ | `backup.sh:56-88` (pipefail, `gzip -t`, completion marker, sha256) |
| Restore | ✅ | `scripts/restore.sh` + `migration-rollback-rehearsal.sh` |
| **Rollback dữ liệu ở cấp revision/fact** | ❌ | `RevisionsService` không có `revert()`; không có controller |

---

## 3. Code/data delivery separation

Năm loại thay đổi, **rủi ro khác nhau, không được gộp**:

| # | Loại | Cơ chế hiện tại | Tần suất | Rollback unit | Đúng công cụ? |
|---|---|---|---|---|---|
| 1 | **Code deployment** | `deploy.sh` (build → migrate → smoke → cutover) | mỗi release | tag ảnh (`rollback.sh`) | ✅ đủ |
| 2 | **DB migration** | compose `migrate` (profile `tools`) | mỗi release có schema | migration `down()` / restore | ✅ đủ |
| 3 | **Reference/seed data** | migration `Seed*.ts` (idempotent, `ON CONFLICT DO NOTHING`) | một lần | migration `down()` | ✅ đủ |
| 4 | **Mutable place content** | **KHÔNG CÓ đường production** | liên tục, tăng dần | **không có** | ❌ **khoảng trống Slice 0.5** |
| 5 | **Media delivery** | MinIO + presign + `backup-media.sh` | liên tục | media status/soft delete | ✅ đủ, ngoài phạm vi |

**Nguyên tắc chốt: loại 4 KHÔNG được đi bằng cơ chế của loại 2 hoặc 3.** Migration là công cụ cho
thay đổi *một lần, theo lược đồ, gắn với một release*. Nội dung địa điểm thay đổi *liên tục, không
gắn release, cần review từng dữ kiện*. Dùng migration cho nó biến mỗi lần cập nhật giờ mở cửa thành
một lần deploy — và làm `down()` trở thành thứ vô nghĩa (làm sao "revert" một giờ mở cửa đúng?).

---

## 4. Option comparison

| Tiêu chí | **A** Migration/seed | **B** Admin API + moderation | **C** Manifest CLI trong production | **D** Hybrid (khuyến nghị) |
|---|---|---|---|---|
| Safety (chạy nhầm môi trường) | Cao — gắn release | Trung — endpoint luôn mở | Cao — chỉ chạy được trong prod env | **Cao** |
| Authorization | ❌ không có actor | ✅ RBAC đầy đủ | ⚠️ cần thiết kế | ✅ actor + RBAC |
| Auditability | ⚠️ chỉ migration log | ✅ audit + revision | ⚠️ cần thiết kế | ✅ manifest hash + audit + revision |
| Idempotency | ✅ `ON CONFLICT` | ❌ phải tự làm | ✅ tái dùng service | ✅ tái dùng service |
| Rollback | migration `down()` — vô nghĩa cho content | revision (chưa có revert) | như B | ✅ backup point + canary nhỏ |
| Conflict handling | ❌ ghi đè mù | ⚠️ tuỳ implement | ⚠️ tuỳ implement | ✅ precondition hash bắt buộc |
| Batch 2/10/100 | ❌ 1 migration/lô — không chịu nổi | ⚠️ N request, mất tính nguyên khối | ✅ tự nhiên | ✅ tự nhiên + canary phân tầng |
| Độ phức tạp | Thấp | **Cao** (cần UI + workflow) | Trung | Trung |
| Thời gian triển khai | Ngắn | **Dài** | Trung | Trung |
| Vận hành khi không staging | ⚠️ rủi ro cao | ⚠️ endpoint mới chưa từng chạy | ✅ rehearsal được | ✅ rehearsal + canary |
| Dùng lâu dài cho 300 địa điểm | ❌ không | ✅ có | ✅ có | ✅ có |
| Nguy cơ bypass business rules | **Cao** — SQL thẳng, không revision | Thấp | Thấp nếu qua service | **Thấp** — bắt buộc qua service |

### Vì sao chọn **D**

Ba lý do dựa trên code thật, không phải sở thích kiến trúc:

1. **Service đúng đã tồn tại.** `VerifiedFactsIngestionService` đã đi qua đủ `sources →
   source_attributions → wiki_revisions → verifications`, idempotent theo bốn khoá khác nhau, có
   `dryRun`, và cố ý không giả mạo `method`. Phương án B sẽ **viết lại** logic này sau một
   controller; phương án A sẽ **bỏ qua** nó hoàn toàn. D **tái dùng nguyên vẹn** — chỉ thay
   entrypoint.

2. **Guard không cần đụng tới.** `assertNotProduction()` gác *entrypoint script*, không gác
   *service*. Một entrypoint thứ hai — file khác, cổng khác — có thể chạy trong production mà
   **không có bất kỳ cờ nào tắt được guard cũ**, vì guard cũ vẫn ở nguyên ba file kia, không đổi
   một ký tự. Đây là điểm mấu chốt phân biệt D với "thêm `ALLOW_PRODUCTION=true`" — thứ mà đề bài
   cấm đúng đắn: một cờ như vậy biến guard thành lời đề nghị.

3. **Khuôn mẫu đã được chứng minh trong chính repo này.** Compose service `migrate`
   (`profiles: [tools]`) là **đúng hình dạng cần thiết**: một job chạy trong mạng production, không
   phục vụ HTTP, gọi thủ công, không bao giờ nằm trong `up -d` mặc định. Slice 0.5 nên là service
   thứ hai cùng khuôn — không phát minh cơ chế mới, và người vận hành đã quen với nó.

**Phương án C bị loại** vì bản thân "CLI chạy trong production" thiếu artifact bất biến — không có
gì ngăn người vận hành sửa manifest sau khi owner duyệt. D = C + manifest có checksum + bằng chứng
phê duyệt.

---

## 5. Recommended architecture

### 5.1. Guard: **đảo chiều khẳng định**, không nới lỏng

Guard hiện tại là **phủ định**: "không được có dấu hiệu production". Entrypoint mới cần guard
**khẳng định**: "phải LÀ đúng production đã định, và phải khớp manifest đã duyệt".

```
assertNotProduction()          — GIỮ NGUYÊN, trên 3 script cũ. Không thêm cờ. Không sửa.
assertExpectedTarget(...)      — MỚI, file riêng, chỉ dùng cho entrypoint publish.
```

`assertExpectedTarget()` **fail-closed**, đòi tất cả cùng đúng:

| Kiểm tra | Vì sao |
|---|---|
| `PUBLISH_TARGET_ID` khớp giá trị **truyền qua tham số dòng lệnh** | Chạy nhầm host thì hai giá trị lệch → abort. Không đọc được từ một nguồn duy nhất, nên không "tự khớp với chính mình" |
| DB fingerprint khớp (vd `current_database()` + `inet_server_port()` + một hàng marker) | Chạy nhầm database trong cùng host |
| `manifestSha256` truyền vào **khớp checksum tính lại từ file** | Artifact bị sửa sau phê duyệt |
| `manifestVersion` nằm trong dải mã nguồn hiểu được | Code cũ gặp manifest mới |
| Migration đã áp dụng ≥ mức manifest yêu cầu | Ghi trường mà schema chưa có |
| Có `approvedBy` + `approvedAt` + `reason` trong manifest | Không có phê duyệt thì không chạy |

Không cờ nào bỏ qua được các kiểm tra này. `--dry-run` **vẫn chạy đủ** chúng, chỉ không ghi.

### 5.2. Vị trí chạy: compose service, không phải máy dev

```yaml
# Hình dạng đề xuất — CÙNG khuôn `migrate` đã có (docker-compose.prod.yml:198-213)
publish-facts:
  profiles: [tools]          # không bao giờ nằm trong `up -d` mặc định
  build: { context: . }      # cùng ảnh/stage như migrate
  command: ["node", "dist/scripts/publish-verified-facts.js", ...]
  volumes:
    - ./publish/manifests:/manifests:ro   # read-only bind
```

Hệ quả an toàn quan trọng: **máy nghiên cứu không bao giờ có credential production.** Manifest đi
sang production như một **file** (checksum công khai), không phải như một kết nối. Điều này trực
tiếp thoả yêu cầu "không kết nối production từ máy nghiên cứu để thử".

### 5.3. Manifest bất biến, có phiên bản

```ts
interface PublishManifestV1 {
  manifestVersion: 1;              // dải hiểu được của code — kiểm ở preflight
  minSchemaVersion: number;        // số migration tối thiểu (vd 45)
  manifestId: string;              // ULID/UUID — idempotency key cấp lô
  approval: {
    approvedBy: string;            // định danh owner/moderator (KHÔNG phải "true")
    approvedAt: string;            // ISO8601
    reason: string;                // vì sao lô này được duyệt
  };
  targets: readonly VerifiedFactTarget[];  // TÁI DÙNG type đã có ở verified-facts.manifest.ts
}
```

- **Checksum** tính bằng `canonicalJson()` — **đã tồn tại và đã export**
  (`verified-facts-ingestion.service.ts:66-77`), viết ra chính vì `JSON.stringify` nhạy thứ tự khoá.
  Dùng lại nó cho checksum là tái dùng đúng chỗ, không phát minh hàm băm thứ hai.
- **Không chứa secret.** Chỉ dữ kiện + nguồn + phê duyệt. Kiểm bằng test tự động (§14).
- **Bất biến sau phê duyệt:** sửa một byte → checksum đổi → `assertExpectedTarget()` abort.

### 5.4. Idempotency ba tầng

| Tầng | Khoá | Cơ chế |
|---|---|---|
| Lô | `manifestId` + `manifestSha256` | Bảng/hàng audit ghi lô đã chạy; chạy lại cùng lô → no-op có báo cáo |
| Địa điểm | `slug` | `processOne()` xử lý độc lập từng target |
| Dữ kiện | `(type, externalRef)` / `(ownerType, ownerId, contactType, value)` / `(entityType, entityId, field, sourceId)` / `canonicalJson(opening_hours)` | **Đã có sẵn** trong service |

### 5.5. Transaction boundary — nói thật về giới hạn

Service hiện **không** bọc `processOne()` trong một transaction (§2.3). Slice 0.5 **không nên** sửa
điều đó cùng lúc với việc mở đường production — đó là hai thay đổi rủi ro trộn vào một.

**Chấp nhận có ý thức:** đơn vị an toàn là **idempotent retry**, không phải atomic rollback. Hệ quả
phải được thiết kế quanh, chứ không giấu đi:
- canary = **1 địa điểm** → thất bại một phần chỉ ảnh hưởng một địa điểm;
- backup point **trước mỗi lô**;
- post-write verification chạy **trước khi** mở lô tiếp theo.

Bọc transaction cho `processOne()` là ứng viên tốt cho Slice 0.6, **sau** khi đường đi đã chứng minh.

---

## 6. Moderation boundary

### 6.1. Slice 0.5 có cần approval gate không? — **Có, tối thiểu, dạng bằng chứng chứ không phải UI.**

| Thuộc Slice 0.5 | Để lại cho moderation UI sau |
|---|---|
| `approval` block bắt buộc trong manifest (ai/lúc nào/lý do) | Giao diện duyệt |
| Checksum ràng buộc phê duyệt với **nội dung chính xác** | Hàng đợi, phân công, SLA |
| Audit record: manifestId, hash, actor, thời điểm, kết quả từng target | Thông báo, khiếu nại |
| Chặn `PlacesService.update()` trở thành đường vòng (§6.3) | Chuyển revision sang luồng `pending` thật |

### 6.2. Manifest do owner duyệt có được coi là approval evidence tạm thời không? — **Được, với điều kiện.**

Được, vì nó thoả điều kiện mà đề bài đặt ra: **không phải checkbox hay cờ CLI**, mà là một artifact
có nội dung xác định, gắn chặt với checksum, và ghi lại được. Điều kiện bắt buộc, đủ cả sáu:

1. `approvedBy` — định danh người thật, không phải `true`/`"owner"`
2. `approvedAt` — ISO8601
3. `manifestSha256` — tính trên **toàn bộ** nội dung, gồm cả block `approval`
4. `source` — đã có sẵn trong từng `VerifiedFactTarget`
5. `reason` — vì sao lô này được duyệt
6. `manifestVersion` + `minSchemaVersion` + **kết quả ingestion** ghi lại sau khi chạy

Thiếu bất kỳ mục nào → job từ chối chạy. **Đây là ranh giới phân biệt "bằng chứng phê duyệt" với
"một cái cờ"**: cờ không nói được ai duyệt cái gì, còn cái này thì có.

### 6.3. Chống `PlacesService.update()` thành đường bypass

Đây là rủi ro thật: `places.service.ts:315` ghi `RevisionStatus.APPROVED` **không điều kiện**, và
comment ngay trên (`:305`) tự nhận *"Sprint 4 sẽ chuyển sang luồng `pending` chờ duyệt"*.

Nếu Slice 0.5 dựng cổng phê duyệt ở entrypoint publish nhưng `PlacesService.update()` vẫn tự
`APPROVED`, thì bất kỳ ai có `Place.Edit.Managed` vẫn ghi được qua HTTP mà không cần manifest —
cổng mới chỉ gác đúng cái cửa mà nó vừa tự dựng.

**Quyết định kiến trúc — phân định rõ, không sửa `PlacesService.update()` trong Slice 0.5:**

- `PlacesService.update()` là đường **người dùng có quyền, có danh tính, có RBAC, có revision mang
  `editorId`**. Nó *không phải* bypass — nó là đường biên tập hợp pháp đã tồn tại từ trước và đang
  chạy trên production hôm nay.
- Đường publish là đường **hàng loạt, không tương tác, không có người ngồi trước màn hình**. Chính
  vì thiếu người nên nó cần bằng chứng phê duyệt *thay cho* sự hiện diện đó.
- **Phân biệt bằng `origin`, và làm cho phân biệt đó kiểm toán được:** revision từ publish mang
  `RevisionOrigin.IMPORT` (đã có trong enum, service đã truyền). Slice 0.5 chỉ cần **bắt buộc**
  audit record của publish trỏ tới `manifestId` + hash, để mọi revision `IMPORT` truy về được một
  manifest đã duyệt. Một revision `IMPORT` **không** có manifest tương ứng là tín hiệu bất thường
  phát hiện được — đó chính là cơ chế chống bypass, và nó **không** đòi sửa `PlacesService.update()`.

Chuyển revision sang luồng `pending` thật là thay đổi hành vi của **đường HTTP đang chạy production**
— rủi ro cao, thuộc milestone moderation riêng, **không** thuộc Slice 0.5.

---

## 7. Threat model

| # | Mối đe doạ | Preventive | Detection | Recovery |
|---|---|---|---|---|
| 1 | Chạy nhầm production | Job **chỉ** chạy trong compose prod; máy dev không có credential | `assertExpectedTarget` so `PUBLISH_TARGET_ID` truyền vào ≠ env → abort | Không có gì để recover — chưa ghi |
| 2 | Chạy nhầm database (đúng host) | DB fingerprint check (`current_database()` + marker row) | Abort trước khi mở ghi | Như trên |
| 3 | Artifact bị sửa sau phê duyệt | `manifestSha256` bắt buộc truyền riêng, đối chiếu file | Mismatch → abort | Như trên |
| 4 | Duplicate ingestion | `manifestId` ghi vào audit; idempotency 4 khoá của service | Lô đã chạy → báo no-op | Không cần |
| 5 | Retry sau khi ghi một phần | Idempotency (service đã có) | Báo cáo per-target `ingested/alreadyCurrent/errors` | **Chạy lại chính lô đó** — an toàn theo thiết kế |
| 6 | Source đã cũ / URL đổi | `retrievedAt` bắt buộc trong manifest; ngưỡng tuổi ở validator | Validator cảnh báo manifest quá cũ | Nghiên cứu lại, manifest mới |
| 7 | Conflict với dữ liệu đang có | **Precondition hash**: manifest ghi giá trị kỳ vọng hiện tại; khác → skip target đó | Báo cáo `conflict` per-target | Người quyết định, không tự ghi đè |
| 8 | Code không hiểu manifest version | `manifestVersion` trong dải cho phép | Abort ở preflight | Nâng code trước, rồi chạy lại |
| 9 | Actor không đủ quyền | Actor id phải phân giải được + có permission | Abort | — |
| 10 | Bypass moderation | Mọi revision `IMPORT` phải truy về một `manifestId` | Truy vấn đối soát revision `IMPORT` ↔ audit | Điều tra revision mồ côi |
| 11 | Log chứa secret | Manifest cấm chứa secret (test tự động); job log **chỉ** slug/field/hash | Secret scan trong CI | Xoay credential nếu lộ |
| 12 | Rollback nuốt mất cập nhật hợp lệ khác | **Không** dùng restore toàn DB làm rollback mặc định; canary nhỏ để tránh phải restore | So sánh backup timestamp với hoạt động khác | Restore + phát lại các thay đổi hợp lệ từ revision log |
| 13 | Hai ingestion chạy song song | Advisory lock (`pg_advisory_lock`) theo `manifestId`; job không phải service dài hạn | Lock giữ → job thứ hai từ chối | Chờ hoặc huỷ |
| 14 | Deploy code hỏng giữa code và data | **Thứ tự bắt buộc**: code trước, data sau, không bao giờ ngược | `verify-release-pins.sh` + health check trước khi publish | `rollback.sh`; data chưa ghi |
| 15 | Dữ liệu đúng trong DB nhưng API/UI không hiện | Kiểm tra tương thích API trước (§9) | **Post-write verification qua API công khai**, không chỉ SQL | Deploy code còn thiếu |
| 16 | Canary thành công nhưng lô lớn hỏng | Lô tăng dần 1 → 2 → 10 → phần còn lại; backup trước mỗi bậc | Báo cáo per-target | Dừng ở bậc đang chạy; idempotent retry |

**Mối đe doạ #15 đáng nhấn mạnh:** ghi đúng vào CSDL mà API không trả ra là kịch bản **rất dễ xảy
ra ở đây** — production hiện không trả `province`/`admin_area`/`trust_sources`. Vì vậy post-write
verification **phải** đi qua HTTP công khai, không được dừng ở `SELECT`.

---

## 8. End-to-end workflow

| # | Bước | Actor | Input | Output | Ghi? | Retry? | Rollback unit |
|---|---|---|---|---|---|---|---|
| 1 | Research | Claude + owner | — | Batch findings (untracked artifact) | ❌ | ✅ | file |
| 2 | Candidate facts | Claude | findings | draft manifest | ❌ | ✅ | file |
| 3 | Source validation | Claude | draft | `retrievalMethod`, reliability/confidence | ❌ | ✅ | file |
| 4 | **Owner approval** | **Owner** | draft | `approval{by,at,reason}` điền vào manifest | ❌ | ✅ | file |
| 5 | **Freeze + checksum** | tooling | manifest | `manifest.json` + `.sha256` | ❌ | ✅ | file |
| 6 | Local validation | dev | manifest | pass/fail + danh sách lỗi | ❌ | ✅ | — |
| 7 | Compat check | dev | manifest + code | `manifestVersion` ok, `minSchemaVersion` ≤ migration đã áp | ❌ | ✅ | — |
| 8 | **Backup point** | operator | — | `backup.sh` + sha256 + `gzip -t` | ✅ (backup) | ✅ | — |
| 9 | Production preflight | operator | manifest + sha | `verify-release-pins.sh` 0; health 200; target/db fingerprint khớp | ❌ | ✅ | — |
| 10 | **Dry-run** | job (prod) | manifest + sha | báo cáo dự kiến per-target | ❌ | ✅ | — |
| 11 | **Canary ingest (1 place)** | job (prod) | manifest (lọc 1 slug) | kết quả | ✅ | ✅ idempotent | 1 place |
| 12 | Post-write: API | operator | slug | `GET /api/places/:slug` chứa fact + `trust_sources` | ❌ | ✅ | — |
| 13 | Post-write: UI | operator | slug | trang chi tiết render đúng, không field bịa | ❌ | ✅ | — |
| 14 | **Audit record** | job | kết quả | manifestId, hash, actor, thời điểm, per-target outcome | ✅ | — | — |
| 15 | Batch expansion | operator | manifest | 2 → 10 → phần còn lại, backup mỗi bậc | ✅ | ✅ | bậc |
| 16 | Rollback (nếu cần) | operator | — | restore từ #8 **hoặc** sửa tiến lên | ✅ | — | toàn DB |

**Idempotency key:** `manifestId` (lô) + khoá tự nhiên từng dữ kiện (§5.4).
**Bước có ghi:** 8, 11, 14, 15 — và **chỉ** những bước đó.
**Bằng chứng nghiệm thu:** #12 + #13 phải cùng xanh mới được sang bậc tiếp.

---

## 9. Code deployment backlog

### 9.1. Baseline

`UNKNOWN` — xem §2.1. Toàn bộ phần này có **hai kịch bản**; phải chốt baseline trước khi lập kế
hoạch deploy thật.

### 9.2. Nhóm thay đổi giữa `c9cf9e5` và HEAD (kịch bản xấu nhất, 44 commit)

| Nhóm | Nội dung | Rủi ro deploy |
|---|---|---|
| Ops/hạ tầng (≈12) | backup/restore, MinIO, release pin, migrate profile, postgres decoupling, security headers | Thấp — đã rehearsal |
| Legal/identity (3) | `ef6d0fa`, `8c4b9f6`, `7fab902` | **Owner đã cố ý dừng** — cần quyết định riêng |
| Media/owner tooling (4) | cover, ordering, caption, rejection reasons | Trung — có migration |
| Place information model (2) | `b184e24`, `ea2b03e` | **Trung-cao** — đổi shape dữ liệu |
| Admin data (4) | backfill, audit, verified-facts ingestion | Thấp — không có controller |
| Web trust surface (1) | `b07ecd8` | **Cao** — web đòi API trả `trust_sources` |
| Slice 0 (1) | `cc6d969` | Rất thấp — chỉ audit nội bộ |

### 9.3. Ràng buộc tương thích

- **Web và API phải đi cùng nhau.** `b07ecd8` khiến web đọc `place.trust_sources`; API cũ không trả
  trường đó. Điều này khớp với kết luận đã ghi trong `release-eb63a4b.txt` ("Web image MUST follow
  API in the same window").
- **Migration là additive** theo mọi bằng chứng có trong repo (manifest 43→45, và ghi chú trong
  `rollback.sh:11-13`) — nhưng **phải xác minh lại** cho các migration sau `45`, không được suy diễn.
- Khuyến nghị: **deploy một lần**, không chia lô. Lý do: chia lô làm tăng số cửa sổ web/api lệch
  nhau, mà đó chính là rủi ro lớn nhất trong danh sách. Nhóm legal (3 commit) là ngoại lệ cần quyết
  định của owner, nhưng nó **không** chặn kỹ thuật.

### 9.4. Code nào phải lên **trước** khi data delivery hoạt động

| Bắt buộc trước | Vì sao |
|---|---|
| API trả `province`/`admin_area`/`trust_sources` | Không có thì post-write verification (#12) **không thể** xanh |
| `b07ecd8` (web trust surface) | Không có thì #13 không thể xanh |
| Migration tới mức `minSchemaVersion` của manifest | Ghi vào cột chưa tồn tại |
| `AdminDataModule` + `VerifiedFactsIngestionService` | Chính là service mà job gọi |

**Hệ quả thứ tự: Slice 0.5 KHÔNG thể nghiệm thu đầy đủ trước khi code backlog được deploy.** Các
sub-slice 0.5B/0.5C/0.5F (§12) vẫn làm được ngay và không phụ thuộc deploy — nhưng 0.5G/0.5H (canary)
thì không.

---

## 10. Canary design

### Canary 1 — `sun-world-hon-thom`

| Mục | Nội dung |
|---|---|
| Facts được phép ghi | `PHONE 0886 045 888` (label "Hòn Thơm", primary), `HOTLINE 1800 1000` (label "Tổng đài Sun World") |
| Source | `sunworld.vn/hon-thom`, `official_website`, **`direct_fetch`** → reliability 90 / confidence 90 |
| **Vẫn UNKNOWN** | `opening_hours` — nguồn **chỉ nói giờ đóng** (17:00), không nói giờ mở. Đi vào `partialFactNote` → `source_attributions.note`, **KHÔNG** vào `places.opening_hours` |
| Expected revision | ≤1 `wiki_revisions`, `origin=IMPORT`. **Có thể là 0** nếu không trường nào trên `places` đổi — chỉ contacts thì không sinh revision |
| Expected verification | `verifications` cho **từng contact** → `official`, `method=SOURCE_MATCH`, `expires_at` +12 tháng |
| Expected API | `GET /api/places/sun-world-hon-thom` → `contacts[]` có 2 mục; `trust_sources[]` không rỗng; **`opening_hours` vẫn `null`** |
| Expected UI | Badge "Đã xác minh" + publisher + ngày; khối giờ mở cửa hiện **"Chưa có thông tin giờ mở cửa"** |
| Chống hallucination | Khẳng định `opening_hours === null` trong API; audit **vẫn** phải báo `opening_hours` MISSING cho slug này. Nếu audit ngừng báo → đã bịa dữ liệu |
| Rollback unit | 1 place; restore từ backup point ngay trước |
| Điều kiện dừng | Bất kỳ trường nào ngoài 2 contact bị thay đổi; revision > 1; `opening_hours` khác `null`; API/UI không khớp |

### Canary 2 — `vinwonders-phu-quoc`

| Mục | Nội dung |
|---|---|
| Facts được phép ghi | `HOTLINE 1900 6677` (label "Tổng đài VinWonders (nhánh 2)", primary); `opening_hours` 09:00–19:30 cả 7 ngày, tz `Asia/Ho_Chi_Minh` |
| Source | `vinwonders.com/…gio-mo-cua`, `official_website`, **`search_index`** (trang trả 403) → reliability **75** / confidence **70** |
| **Vẫn UNKNOWN** | Giờ riêng từng phân khu (schema không có khái niệm phân khu con); giá vé |
| Expected revision | Đúng **1** `wiki_revisions`, `origin=IMPORT` (vì `opening_hours` đổi) |
| Expected verification | `official`, `method=SOURCE_MATCH` |
| Expected API | `contacts[]` có hotline; `opening_hours` đúng 7 ngày 09:00–19:30; `trust_sources[]` không rỗng |
| Expected UI | Badge trạng thái mở/đóng tính đúng theo giờ VN; bảng tuần 7 dòng |
| **Chống hallucination — điểm then chốt** | `sources.reliability` phải là **75**, `source_attributions.confidence` phải là **70**, `metadata.retrieval_method` = `search_index`. Nếu bất kỳ giá trị nào là 90 → hệ thống đã **nâng khống** bằng chứng |
| Rollback unit | 1 place |
| Điều kiện dừng | reliability/confidence bị làm tròn lên; giá vé xuất hiện; giờ phân khu bị gộp vào `opening_hours` |

**Vì sao đúng hai địa điểm này, và đúng thứ tự này:** Sun World kiểm chứng nhánh
**contacts-only + dữ kiện một phần bị từ chối đúng cách**; VinWonders kiểm chứng nhánh
**`opening_hours` + bằng chứng yếu không được nâng cấp**. Hai nhánh này bao phủ đúng hai cách mà
pipeline có thể nói dối. Chạy Sun World trước vì nó **không** sinh revision trên `places` — bề mặt
rủi ro nhỏ hơn.

---

## 11. No-staging strategy

Không có staging. Thay thế đề xuất: **ephemeral rehearsal cục bộ**, và nói thẳng nó không tương đương.

**Rehearsal gồm:**
- Postgres/PostGIS **cùng phiên bản** compose prod (`postgis/postgis:16-3.4`)
- **Toàn bộ migration chạy từ zero** → schema giống production theo cấu trúc
- Dữ liệu tổng hợp hoặc **đọc công khai** từ API production (49 place đã public, không có dữ liệu cá nhân)
- **Không sao chép** `.env` production, không secret, không dump người dùng
- Chạy đúng job publish với đúng manifest

**Rehearsal KHÔNG chứng minh được — nói rõ, không giấu:**

| Không chứng minh được | Vì sao |
|---|---|
| Trạng thái dữ liệu thật của production | Dữ liệu khác → conflict khác |
| Kết quả migration trên dữ liệu thật | Thời gian/khoá phụ thuộc dữ liệu |
| Hành vi mạng/Caddy/TLS | Không tái tạo |
| Ảnh production thực sự đang chạy | Baseline còn UNKNOWN (§2.1) |
| Tương tác đồng thời với người dùng thật | Không có tải thật |

**Vì vậy canary production phải nhỏ nhất có thể: một địa điểm, hai contact.** Rehearsal thu hẹp
rủi ro *lược đồ và logic*; chỉ canary mới thu hẹp rủi ro *môi trường*.

**Stop conditions (bất kỳ điều nào → dừng, không sang bậc tiếp):** manifest checksum lệch; preflight
fail; dry-run báo target ngoài dự kiến; canary sinh nhiều revision hơn dự kiến; API/UI không khớp;
audit ngừng báo MISSING cho trường lẽ ra vẫn thiếu; reliability/confidence bị nâng.

---

## 12. Sub-slice roadmap

| # | Tên | Value | Migration | Size | Model | Phụ thuộc |
|---|---|---|---|---|---|---|
| **0.5A** | Production baseline & compatibility proof | Biết đang deploy từ đâu | ❌ | S | Sonnet 5 | Owner (truy cập VPS read-only) |
| **0.5B** | Versioned immutable manifest contract | Nền móng artifact cho mọi thứ sau | ❌ | **S** | **Sonnet 5** | — |
| **0.5C** | Dry-run validator (offline) | Bắt lỗi trước khi tới gần production | ❌ | M | Sonnet 5 | 0.5B |
| **0.5D** | Approval & audit evidence | Phê duyệt truy vết được | ⚠️ có thể | M | **Opus 5** | 0.5B |
| **0.5E** | Production-scoped runner + `assertExpectedTarget` | Đường ghi thật | ❌ | L | **Opus 5** | 0.5B–D |
| **0.5F** | Rehearsal harness + rollback drill | Bằng chứng rollback dùng được | ❌ | M | Sonnet 5 | 0.5C |
| **0.5G** | Canary 1 — Sun World | Dữ kiện thật đầu tiên tới người dùng | ❌ | S | **Opus 5** | 0.5E, 0.5F, code deploy |
| **0.5H** | Canary 2 — VinWonders | Chứng minh nhánh bằng chứng yếu | ❌ | S | Sonnet 5 | 0.5G |

*Opus 5 chỉ ở 0.5D/0.5E/0.5G — nơi một quyết định sai làm hỏng bảo đảm an toàn hoặc ghi sai dữ liệu
thật. Phần còn lại là thực thi có đặc tả rõ.*

### Chi tiết 0.5B (sub-slice đầu tiên — xem §14)

- **Value:** mọi sub-slice sau đều tiêu thụ artifact này; sai định dạng ở đây làm hỏng cả chuỗi.
- **Scope:** type `PublishManifestV1`; `computeManifestChecksum()` (tái dùng `canonicalJson`);
  `validateManifest()` trả lỗi có cấu trúc; test.
- **Out of scope:** đọc/ghi DB; bất kỳ I/O production nào; CLI; compose; đụng `assertNotProduction()`.
- **Files:** `apps/api/src/modules/admin-data/publish-manifest.contract.ts` (mới) +
  `.spec.ts` (mới). **Không sửa file tracked nào khác.**
- **Migration:** ❌
- **Security controls:** test khẳng định manifest **không** chứa khoá giống secret; checksum bao
  trùm cả block `approval`.
- **Acceptance:** đổi một byte bất kỳ → checksum đổi; đổi thứ tự khoá → checksum **không** đổi;
  thiếu bất kỳ trường `approval` nào → `validateManifest()` fail.
- **Rollback:** revert một commit; không có state.

---

## 13. Owner decisions

| # | Quyết định | Khuyến nghị | Trade-off | Khi nào cần |
|---|---|---|---|---|
| 1 | **Xác minh production baseline** | Chạy `scripts/verify-release-pins.sh` trên VPS (read-only) và báo lại 2 tag | Không có nó, mọi kế hoạch deploy là phỏng đoán | **Trước 0.5A** |
| 2 | **Deploy code backlog** | Deploy **một lần**, không chia lô | Chia lô → nhiều cửa sổ web/api lệch nhau = rủi ro lớn nhất | **Trước 0.5G** |
| 3 | **Nhóm legal (3 commit)** | Quyết định riêng, không chặn kỹ thuật | Owner đã cố ý dừng trước đây | Trước #2 |
| 4 | **Danh tính actor cho publish job** | Một tài khoản vận hành riêng, least-privilege, **không** dùng tài khoản owner | Tài khoản riêng = audit sạch hơn; thêm một bước tạo | Trước 0.5E |
| 5 | **Ai được ký `approvedBy`** | Owner cho giai đoạn đầu; mở rộng khi có moderator | Một người = nút cổ chai; nhưng đúng cho 300 địa điểm đầu | Trước 0.5D |
| 6 | **Lưu audit publish ở đâu** | Bảng mới nhỏ **hoặc** tái dùng `core/audit` — đề xuất **thử `core/audit` trước** | Bảng mới = migration; tái dùng = không migration nhưng có thể không vừa | Trước 0.5D |
| 7 | **Ngưỡng tuổi manifest** | 90 ngày → cảnh báo, 180 ngày → từ chối | Quá chặt gây ma sát; quá lỏng đưa dữ liệu cũ lên | Có thể trì hoãn tới 0.5C |
| 8 | **Bọc transaction cho `processOne()`** | **Hoãn** sang Slice 0.6 | Trộn vào 0.5 là hai thay đổi rủi ro trong một | Có thể trì hoãn |

*Không hỏi lại các điều đã chốt: không staging cho release đầu; email là kênh thông báo; dữ liệu
phải có nguồn; AI không suy đoán factual fields; sponsored ≠ verified.*

---

## 14. Tác vụ implementation đầu tiên — **0.5B**

**Manifest contract có phiên bản, bất biến, có checksum.**

Thoả đủ sáu tiêu chí: không ghi production · không cần secret · gọn một commit · là nền móng cho
toàn bộ đường phát hành · có test tự động · rollback bằng một revert · **không chạm
`assertNotProduction()`**.

### Implementation prompt (chưa thực hiện)

```text
NHIỆM VỤ: Slice 0.5B — Versioned immutable manifest contract cho production data delivery.

BỐI CẢNH
Đường ghi dữ liệu production hiện không tồn tại. Ba script CLI bị assertNotProduction()
chặn (đúng, phải giữ nguyên). Thiết kế đã chốt (Phương án D, xem
docs/delivery/reports/PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md): một job chạy
TRONG môi trường production, nhập từ một manifest BẤT BIẾN có checksum, qua chính
VerifiedFactsIngestionService đã có.

Sub-slice này chỉ xây ARTIFACT CONTRACT. Không DB, không I/O, không CLI, không compose.

YÊU CẦU

1. File MỚI: apps/api/src/modules/admin-data/publish-manifest.contract.ts

   Định nghĩa:

   export const SUPPORTED_MANIFEST_VERSIONS = [1] as const;

   export interface PublishManifestApproval {
     approvedBy: string;   // định danh người thật — KHÔNG chấp nhận rỗng/"true"/"owner"
     approvedAt: string;   // ISO8601
     reason: string;       // vì sao lô này được duyệt
   }

   export interface PublishManifestV1 {
     manifestVersion: 1;
     minSchemaVersion: number;   // số migration tối thiểu
     manifestId: string;         // idempotency key cấp lô
     approval: PublishManifestApproval;
     targets: readonly VerifiedFactTarget[];   // TÁI DÙNG type từ verified-facts.manifest.ts
   }

2. computeManifestChecksum(manifest): string
   - TÁI DÙNG canonicalJson() đã export sẵn từ verified-facts-ingestion.service.ts.
     KHÔNG viết hàm chuẩn hoá JSON thứ hai — canonicalJson tồn tại chính vì
     JSON.stringify nhạy thứ tự khoá, và checksum cần đúng tính chất đó.
   - Băm bằng crypto.createHash('sha256') trên chuỗi canonical, trả hex.
   - Checksum PHẢI bao trùm CẢ block `approval` (sửa người duyệt = đổi checksum).

3. validateManifest(input: unknown): { ok: true; manifest: PublishManifestV1 }
                                    | { ok: false; errors: string[] }
   Kiểm, trả TẤT CẢ lỗi (không dừng ở lỗi đầu):
   - manifestVersion nằm trong SUPPORTED_MANIFEST_VERSIONS
   - minSchemaVersion là số nguyên dương
   - manifestId không rỗng
   - approval.approvedBy không rỗng và KHÔNG thuộc {"true","owner","admin","system"}
     (đây là ranh giới "bằng chứng phê duyệt" vs "một cái cờ")
   - approval.approvedAt parse được thành Date hợp lệ
   - approval.reason không rỗng
   - targets là mảng KHÔNG rỗng
   - slug trong targets không trùng nhau
   - mỗi target có source.url, source.externalRef, source.retrievedAt,
     và retrievalMethod ∈ {'direct_fetch','search_index'}
   - KHÔNG khoá nào trong manifest khớp /secret|password|token|key|credential/i
     (bảo vệ threat #11)

4. TUYỆT ĐỐI KHÔNG:
   - sửa/đụng assertNotProduction() ở bất kỳ file nào
   - sửa verified-facts.manifest.ts hoặc verified-facts-ingestion.service.ts
     (chỉ IMPORT type và canonicalJson từ chúng)
   - thêm migration, đổi schema, đụng API/UI
   - viết code kết nối DB hoặc đọc biến môi trường
   - thêm CLI script hoặc compose service (thuộc 0.5E)

5. Test: publish-manifest.contract.spec.ts
   - checksum ỔN ĐỊNH khi ĐỔI THỨ TỰ KHOÁ (chứng minh canonicalJson làm đúng việc)
   - checksum ĐỔI khi đổi một byte bất kỳ trong targets
   - checksum ĐỔI khi đổi approval.approvedBy  ← chống sửa sau phê duyệt
   - validateManifest fail cho: version không hỗ trợ; approvedBy rỗng;
     approvedBy = "true"; approvedAt không parse được; reason rỗng;
     targets rỗng; slug trùng; retrievalMethod lạ
   - validateManifest trả NHIỀU lỗi cùng lúc khi có nhiều lỗi
   - manifest chứa khoá giống secret → fail
   - một manifest HỢP LỆ dựng từ VERIFIED_FACTS_ROUND1 (Sun World + VinWonders) → ok:true

RÀNG BUỘC
- Không migration. Không schema. Không API. Không UI. Không production.
- Comment tiếng Việt, theo văn phong giải thích "vì sao" của các file admin-data hiện có.
- Chỉ thêm 2 file mới; không sửa file tracked nào khác.

NGHIỆM THU
- npx jest publish-manifest xanh
- npx jest (toàn bộ api) vẫn 143 suites xanh
- npx tsc --noEmit sạch
- npx eslint trên 2 file mới sạch
- git diff cho thấy ĐÚNG 2 file mới, 0 file bị sửa
```

---

## 15. Những điều tuyệt đối chưa được làm

- ❌ Không kết nối production, không SSH/VPS, không đọc `.env` production
- ❌ Không chạy ingestion, không dry-run trên bất kỳ CSDL nào
- ❌ Không sửa/xoá/làm yếu `assertNotProduction()`
- ❌ Không migration, không schema, không dữ liệu
- ❌ Không deploy, không push, không commit, không git add
- ❌ Không sửa file tracked nào
- ❌ Không nhập dữ liệu Sun World/VinWonders
- ❌ Không xác định production baseline bằng suy đoán — ghi `UNKNOWN` kèm cách xác minh

---

## 16. Kết luận

> **Nếu chỉ triển khai một commit tiếp theo để mở đường an toàn cho dữ liệu production, commit đó
> nên làm gì?**

**Tạo `apps/api/src/modules/admin-data/publish-manifest.contract.ts` — kiểu `PublishManifestV1` có
`manifestVersion` / `minSchemaVersion` / `manifestId` / block `approval` bắt buộc, hàm
`computeManifestChecksum()` **dựng trên `canonicalJson()` đã export sẵn** ở
`verified-facts-ingestion.service.ts:66`, và `validateManifest()` trả lỗi có cấu trúc — kèm file
spec đi cùng.**

Cụ thể là artifact đó, không phải một cơ chế chung chung, vì ba lý do rút ra từ chính repository này:

1. **`canonicalJson()` đã tồn tại và đã giải đúng bài toán khó nhất của checksum.** Nó được viết ra
   sau khi một lần chạy ingestion thật mất tính idempotent chỉ vì `JSON.stringify` nhạy thứ tự khoá
   (comment tại `:56-62` ghi lại chính sự cố đó). Một checksum manifest cần đúng tính chất ấy. Viết
   hàm băm mới là bỏ phí một bài học đã trả giá.

2. **Đây là ranh giới code duy nhất khiến "phê duyệt" khác với "một cái cờ".** Đề bài cấm gọi một
   checkbox là moderation — nhưng cấm thôi thì không đủ. Cấu trúc bắt buộc `approvedBy` + `approvedAt`
   + `reason`, **và cho checksum bao trùm cả ba**, là thứ *cưỡng chế* sự khác biệt đó bằng code:
   sửa người duyệt sau khi duyệt thì checksum đổi, và job từ chối chạy. Không có artifact này, mọi
   thứ dựng ở 0.5D/0.5E chỉ là quy ước.

3. **Nó không tiến gần production thêm một milimet nào.** Không DB, không secret, không env, không
   CLI, không compose — và tuyệt đối không chạm `assertNotProduction()`. Nhưng mọi sub-slice sau đều
   tiêu thụ nó: validator (0.5C) kiểm nó, audit (0.5D) ghi hash của nó, runner (0.5E) từ chối chạy
   nếu hash lệch, canary (0.5G/H) được mô tả bằng nó. Đây là viên gạch duy nhất có thể đặt ngay hôm
   nay mà không cần owner quyết định bất cứ điều gì trước.

Nói ngắn: **chưa mở cửa, nhưng đúc xong ổ khoá và chìa — và chứng minh bằng test rằng chìa giả không
tra vừa.**

---

*Báo cáo read-only. HEAD không đổi (`cc6d969`). Không file tracked nào bị sửa. `deploy-c9cf9e5.sh`
giữ nguyên untracked, không bị đụng.*
