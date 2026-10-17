# Gói C — Addendum: hành vi public khi bản dịch lỗi thời, và phạm vi ngôn ngữ nguồn

- **Date:** 2026-10-17
- **Scope:** Làm rõ hai điểm owner chỉ ra còn thiếu trong báo cáo Gói C trước đó. Không đổi
  schema/API contract — chỉ sửa một dòng copy hiển thị (banner fallback) và bổ sung ghi chú/tài
  liệu hoá hành vi đã có sẵn bằng chứng (test đã pass từ trước), theo đúng yêu cầu "chỉ bổ sung
  kiểm tra khi hành vi đó chưa có bằng chứng; không chạy lại toàn bộ Gói C".

## 1. Hành vi public khi `is_published_stale=true`

**Hai khái niệm lỗi thời, KHÁC NHAU, không gộp:**

| | `is_stale` | `is_published_stale` (trả về API dưới tên `is_translation_stale`) |
|---|---|---|
| So sánh | Vùng NHÁP đang soạn (`title/description/...`) vs. dữ kiện tiếng Việt hiện tại | Vùng ĐÃ DUYỆT đang công khai (`published_title/...`) vs. dữ kiện tiếng Việt hiện tại |
| Ai thấy | Chủ tin, trong editor (`JobListingTranslationEditor`/`RealEstateListingTranslationEditor`) | Người đọc public, trên trang chi tiết `/en/...` |
| Nguồn dữ liệu | `job_listing_translation_hash.ts` so `sourceContentHash` | So `publishedSourceContentHash` — field riêng, snapshot tại thời điểm DUYỆT gần nhất |
| Có thể đồng thời? | Có — độc lập. Một bản dịch có thể `is_stale=true` (nháp đang soạn khác dữ kiện mới) NHƯNG bản `published` vẫn `is_published_stale=false` (nếu dữ kiện mới xuất hiện sau khi bản published đã chốt nhưng trước khi nháp mới được soạn) — hoặc ngược lại. | |

**Hành vi public THẬT khi `is_published_stale=true`** (`JobListingsService.getPublicById()`,
[job-listings.service.ts:292-343](../../../apps/api/src/modules/job-listings/job-listings.service.ts:292),
mirror ở `RealEstateListingsService`):

- **KHÔNG fallback về nguồn tiếng Việt.** Bản dịch tiếng Anh đã duyệt vẫn được phục vụ nguyên
  vẹn — một bản dịch đã qua duyệt không bị rút khỏi công khai chỉ vì một dữ kiện phụ trợ (lương,
  ca làm, khu vực, điều kiện giao dịch, …) đổi sau đó. Đây là quyết định đã chốt từ thiết kế gốc
  Gói C (ưu tiên giữ bản đã duyệt, xem ADR gốc) — addendum này không đổi quyết định, chỉ làm rõ
  phần "qua API" chưa đủ.
- **Có cảnh báo hiển thị thật trên trang, không chỉ là cờ JSON im lặng.** Response API trả
  `is_translation_stale: true`; trang public (`jobs/[id]/page.tsx:68-74`,
  `real-estate/[id]/page.tsx` mirror) đọc cờ này và render một `<p role="note">` NGAY TRÊN đầu
  nội dung, bằng đúng ngôn ngữ của route đang xem (`/en` → tiếng Anh, `/vi` → tiếng Việt dù đang
  xem overlay EN — trường hợp hiếm nhưng route `/vi` không lọc theo `locale` overlay):
  > "This English listing may not reflect the latest details — some information was updated
  > after translation." / "Phiên bản tiếng Anh của tin này có thể chưa phản ánh thông tin mới
  > nhất — một số dữ kiện đã thay đổi sau khi dịch."
- **Bằng chứng đã có từ trước** (không cần test mới): `jobs/[id]/page.spec.tsx:143-156` và
  `real-estate/[id]/page.spec.tsx:140-152` — cả hai đều assert banner XUẤT HIỆN khi
  `is_translation_stale=true` và KHÔNG xuất hiện khi `false`, cho cả hai route locale.

**Vì sao không tự động fallback thay vì cảnh báo:** một bản dịch "lỗi thời" không có nghĩa là
"sai" — phần lớn trường hợp chỉ một trường phụ (vd lương) đổi, tiêu đề/mô tả bằng tiếng Anh vẫn
đúng nghĩa. Rút về tiếng Việt sẽ làm người đọc không biết tiếng Việt MẤT HẲN nội dung đã đọc được,
đổi lấy một lợi ích nhỏ (một trường có thể lệch). Cảnh báo + giữ nguyên bản dịch là lựa chọn ít
mất mát hơn, và đúng với chủ ý gốc "ưu tiên giữ bản đã duyệt" owner đã yêu cầu.

## 2. Nội dung gốc tiếng Anh và tin cũ chưa xác định ngôn ngữ

**Phạm vi thật của Gói C, nói chính xác:** hệ thống có đúng MỘT cột nguồn (`title/description/
requirements/benefits` trên `job_listings`, tương tự trên `real_estate_listings`) và MỘT overlay
tuỳ chọn (`*_translations`, duy nhất locale `en`). Hệ thống **không lưu, không phát hiện, và
không xác minh ngôn ngữ thật của cột nguồn** — không có cột `source_language`, không có logic
detect-language nào trong codebase.

**`locale:'vi'` trong response nghĩa là gì — chính xác:** đây là tên của SLOT được phục vụ (cột
nguồn), không phải một xác nhận "đã kiểm tra, cột này đúng là tiếng Việt". Khi không có bản dịch
EN đã duyệt, API trả `locale:'vi'` cho MỌI tin, bất kể nội dung cột nguồn thực sự viết bằng ngôn
ngữ gì — kể cả khi chủ tin đã gõ tiếng Anh ngay từ đầu.

**Vì sao đây KHÔNG phải một lỗi dữ liệu/hiển thị nội dung** (nội dung luôn đúng nguyên văn, cả
hai route):
- Route `/vi/jobs/[id]` không có bản dịch EN nào liên quan — luôn hiện cột nguồn, dù cột đó chứa
  tiếng gì.
- Route `/en/jobs/[id]` khi chưa có bản dịch EN đã duyệt — fallback hiện ĐÚNG cột nguồn (không
  dịch máy, không cắt xén) — nếu cột nguồn vốn đã là tiếng Anh, người đọc `/en` nhận đúng nội
  dung họ cần, dù nhãn nội bộ ghi `locale:'vi'`.
- JSON-LD (`JobPosting`) không phát `inLanguage` — không có tuyên bố ngôn ngữ sai lệch lọt ra
  structured data.

**Lỗi THẬT đã sửa trong addendum này:** banner fallback trên Web (hiện khi route `/en` nhưng
chưa có bản dịch) trước đây viết "The details below are shown **in Vietnamese** as originally
posted" — đây LÀ một tuyên bố ngôn ngữ không có căn cứ (hệ thống không biết cột nguồn có đúng là
tiếng Việt hay không). Đã sửa thành "The details below are shown exactly as originally posted by
the lister (the original language is not tracked by this system)" — bỏ tuyên bố sai, giữ đúng
mức bằng chứng thực có. Áp dụng cả `jobs/[id]/page.tsx` và `real-estate/[id]/page.tsx`. Test hiện
có chỉ regex theo cụm "has not been translated into English yet" (không đổi) nên không cần sửa
test.

**Đường cho chủ tin viết gốc bằng tiếng Anh:** không cần, và không có, một cơ chế "khai báo ngôn
ngữ gốc = English" riêng. Nếu một chủ tin viết tin gốc bằng tiếng Anh, cột nguồn ĐÃ LÀ tiếng Anh —
họ đơn giản **không cần tạo bản dịch EN**: cả hai route `/vi` và `/en` đều phục vụ đúng nội dung
họ đã nhập (route `/vi` sẽ hiện tiếng Anh dưới tiêu đề UI tiếng Việt — hành vi nhất quán, không
phải lỗi, vì trang KHÔNG dịch máy nội dung chủ tin nhập). Xây một trường "khai báo ngôn ngữ nguồn"
hoặc logic phát hiện ngôn ngữ tự động là một tính năng mới, ngoài phạm vi Gói C đã giao — nếu owner
muốn, cần một yêu cầu riêng.

**Tin cũ chưa xác định ngôn ngữ:** xử lý CÙNG quy tắc trên, không có nhánh riêng — hệ thống không
phân biệt "tin cũ" với "tin mới" theo ngôn ngữ, vì không trường nào lưu ngôn ngữ cho bất kỳ tin
nào, cũ hay mới. Không migration, không backfill cần thiết.

## Thay đổi code trong addendum này

- [`apps/web/src/app/[locale]/(public)/jobs/[id]/page.tsx`](../../../apps/web/src/app/[locale]/(public)/jobs/[id]/page.tsx) — sửa copy banner fallback + mở rộng comment.
- [`apps/web/src/app/[locale]/(public)/real-estate/[id]/page.tsx`](../../../apps/web/src/app/[locale]/(public)/real-estate/[id]/page.tsx) — sửa copy banner fallback (đồng bộ).
- [`apps/api/src/modules/job-listings/job-listings.service.ts`](../../../apps/api/src/modules/job-listings/job-listings.service.ts) — mở rộng comment `getPublicById()` ghi rõ phạm vi ngôn ngữ.
- Không đổi DTO/entity/migration/test assertion nào — hành vi thực thi không đổi ngoài dòng copy
  banner.
