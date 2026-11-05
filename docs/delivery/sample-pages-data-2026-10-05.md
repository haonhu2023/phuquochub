# Ba trang mẫu: gói dữ liệu (cập nhật 06/10/2026)

**Trạng thái:** Web `b91e92c…` đã deploy (05/10/2026 09:49Z). Owner xác nhận "Xem trước" hoạt động (phạm vi preview của cẩm nang). **Chưa ghi production.** Không publish, không đổi pin, không migration. A, B, C là ba mục độc lập.

**Nguồn và ngày đọc:**
- Novotel `address`: https://www.novotelphuquoc.com/vi/, đọc 2026-10-05 09:57Z (`evidence/sample-data-sources-2026-10-05/novotel-vi.html`).
- Novotel giờ nhận/trả: https://all.accor.com/hotel/9770/index.en.shtml, đọc 2026-10-05 09:57Z (`accor-9770-en.html`).
- Giá trị hiện tại: readback công khai 2026-10-05 09:54Z và 23:41Z (không đổi).

---

## A. Địa chỉ Novotel

| | |
|---|---|
| Record / field | `205d6950-ffb4-42cb-98ca-c8d155ad72af`, `address` (cột gốc tiếng Việt) |
| Trước | `Bãi Trường, Dương Tơ, TP. Phú Quốc` (`expected_content_version` = 7 tại 23:41Z) |
| Sau (nguyên văn) | `Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special Zone, 922273 An Giang Province, Vietnam` |
| Nguồn xác nhận | Chuỗi địa chỉ đầy đủ trên trang chính thức do cơ sở tự công bố. Không xác nhận cách gọi "Bãi Trường" hay cấp hành chính. |
| Tác động hiển thị | Trang khách sạn hiện địa chỉ đầy đủ bằng tiếng Anh. Meta description không đổi. |
| Endpoint | `PATCH /api/places/205d6950-ffb4-42cb-98ca-c8d155ad72af` (`Place.Edit.Managed`) |
| Payload tối thiểu | `{"address": "<sau>", "expected_content_version": <v>}` |
| CAS | `<v>` đọc từ `GET /api/places/novotel-phu-quoc` (`content_version`) ngay trước khi ghi. Không khớp → 409, không ghi. Sau khi ghi, đọc lại GET để lấy `content_version` mới cho B. |
| Field bảo toàn | `ward`, `location`, `name`, `description`, `contacts`, `amenities`, `hotel_details`, `media`, `province`, `admin_area` (PATCH là partial) |
| Khi nhận 409 | Dừng riêng record này. Đọc lại, so diff, không ghi đè tự động. |

## B. Giờ nhận và trả phòng Novotel

| | |
|---|---|
| Record / field | cùng record A; `hotel_details.check_in`, `hotel_details.check_out` |
| Trước | null / null (`hotel_type` = `hotel`, `star_rating` = null) |
| Sau | `15:00` / `12:00` |
| Nguồn xác nhận | Trang Accor cho mã khách sạn 9770 ghi `checkinTime` `15:00:00`, `checkoutTime` `12:00:00`. Định danh khớp: mã 9770, `H9770@accor.com`, `+84 297 6260 999` (trùng contacts đã lưu). **Không xác nhận:** trang chính thức của khách sạn có giờ này (đọc 2026-10-03: không nêu). |
| Giới hạn provenance | Schema không lưu nguồn cho giờ. Nguồn ghi trong hồ sơ này. Trang sẽ hiện giờ không kèm nhãn nguồn; owner cần chấp nhận khi duyệt. |
| Endpoint | `PATCH /api/hotels/205d6950-ffb4-42cb-98ca-c8d155ad72af/details` |
| Payload | `{"expected_content_version": <v>, "hotel_type": "hotel", "check_in": "15:00", "check_out": "12:00"}` |
| Vì sao có `hotel_type` | DTO bắt buộc `hotel_type` (ràng buộc NOT NULL của DB). Không thể bỏ. Giá trị không đổi. |
| `star_rating` | Không gửi → giữ null. `star_rating_source_id` không gửi → giữ null. |
| CAS | `<v>` = `content_version` sau A (đọc lại GET). Repository kiểm và tăng cùng token `places.content_version` trong một transaction. Không khớp → 409, không ghi, không audit. |
| Khi nhận 409 | Dừng riêng record. Không retry ghi đè. |

## C. Mô tả Bãi Sao (ngắn và dài, VI và EN)

**Quy tắc chung:** mô tả là bản dịch theo field và locale (không ghi cột gốc). Luồng: lưu nháp có CAS → publish theo id bản nháp đã xem. Không dùng PATCH `places` để né luồng này.

### C1. Mô tả ngắn (`short_description`)

| | VI | EN |
|---|---|---|
| Trước (readback) | `Bãi biển ở phía Nam Phú Quốc với đường bờ khoảng 7 km; nguồn du lịch tỉnh mô tả vùng nước khá nông và khu vực khuất gió Tây Nam.` | `A beach in southern Phu Quoc with roughly 7 km of coastline; the provincial tourism source describes relatively shallow water and shelter from southwest winds.` |
| Sau (nguyên văn) | `Thông tin về Bãi Sao, vị trí tham khảo trên bản đồ và những điều cần kiểm tra trước khi đến.` | `Information about Bãi Sao, its reference location on the map, and what to check before you go.` |

**Tác động:** C1 thay card và meta description của Bãi Sao (trang dùng `short_description` trước). Các khẳng định "7 km", "nước nông", "khuất gió" chưa đọc lại được nguồn tỉnh (dulich.phuquoc.gov.vn không kết nối lúc 23:28Z ngày 05/10). **Nếu áp dụng C1 VI, meta description VI đổi theo C1.** EN của C1 chỉ là bản nháp, chưa áp dụng; bản EN hiện công khai vẫn chứa các khẳng định chưa có nguồn cho đến khi owner duyệt EN.

**Nguồn từng câu (VI và EN giống nhau về nội dung):** không có khẳng định nào cần nguồn ngoài. "Bãi Sao" và vị trí tham chiếu là dữ kiện hệ thống và tọa độ đã duyệt (v3 G#15).

### C2. Mô tả dài (`description`)

| | VI | EN |
|---|---|---|
| Trước (readback) | `Bãi Sao là một trong những bãi biển đẹp nhất Phú Quốc với cát trắng mịn và nước biển trong xanh.` | Không có bản dịch; hiện là nguyên văn VI cũ |
| Sau (nguyên văn) | `Bãi Sao là một bãi biển ở Phú Quốc. Điểm đánh dấu trên bản đồ dùng để tham khảo vị trí khu vực; chưa xác minh là lối vào. Trước khi đi, hãy kiểm tra đường tiếp cận, chỗ gửi xe và hỏi giá trước khi sử dụng dịch vụ. Kiểm tra dự báo thời tiết và cảnh báo biển trước khi quyết định xuống nước.` | `Bãi Sao is a beach in Phu Quoc. The marker on the map is a reference point for the area; it has not been verified as an entrance. Before you go, check the access road and parking, and ask about prices before using any service. Check the weather forecast and sea warnings before you decide to go into the water.` |

**Phân tách nguồn (VI; EN là bản dịch trực tiếp):**
- "Bãi Sao là một bãi biển ở Phú Quốc." — dữ kiện hệ thống (tên, category beach, tọa độ ở Phú Quốc, readback 2026-10-05).
- "Điểm đánh dấu … tham khảo … chưa xác minh là lối vào." — tọa độ đã duyệt làm điểm tham chiếu; không khẳng định đường vào.
- Các câu còn lại — lời khuyên chung, không khẳng định sự việc.
- **Không gắn nhãn "có nguồn" cho cả đoạn.** Đã bỏ: "đẹp nhất", "cát trắng mịn", "nước biển trong xanh"; mọi khẳng định về độ nông, độ dài, phí, an toàn tắm biển.

**Tác động:** đoạn mô tả trên trang Bãi Sao đổi. Meta description không đổi khi `short_description` có giá trị (C1 quyết định meta).

### C3. Luồng ghi và CAS (contract mới, đã triển khai local)

| Bước | Endpoint | Ghi chú |
|---|---|---|
| 1. Đọc | `GET /api/places/{id}/short-description/draft` và `…/description/draft` | Trả `vi.id`, `en.id` (id hàng current). Dùng làm `expected_*_id`. |
| 2. Lưu nháp | `POST …/short-description/draft` (hoặc `…/description/draft`) với `{"vi": "…", "expected_vi_id": <id đã đọc hoặc null>}` | `expected_*_id` **bắt buộc** khi gửi text. Lệch → 409, không ghi. Gửi `en` cần `expected_en_id`. Không gửi `en` → EN không bị chạm. |
| 3. Công khai | `POST …/short-description/publish` (hoặc `…/description/publish`) với `{"vi_translation_id": "<id bản nháp đã xem>"}` | Duyệt **đúng id**, chỉ locale được gửi. Id đã bị thay (không còn current) → 409. Không còn "publish tất cả bản pending". |
| Quyền | lưu: `Place.Edit.Managed`; duyệt: `PlaceTranslation.Review.Any` (content_owner) | Kiểm trong `reviewTranslation`, không có đường tắt. |
| Audit | Ghi revision qua `recordPlaceTranslationRevision` (cả lưu nháp và duyệt), như trước. | |
| Migration | **Không cần.** Dùng cột `is_current` và partial unique index sẵn có. | |

**Vì sao cần CAS:** lưu nháp trước đây không kiểm version, nên người sau có thể đè bản của người trước. Publish trước đây tra "current" tại thời điểm publish và duyệt cả EN đang chờ. Đã sửa cả hai.

**Ý nghĩa cho EN:** publish VI không duyệt EN. Bản EN đang PENDING vẫn PENDING. Hiện chưa có giao diện riêng để duyệt EN; phải có thao tác riêng (ngoài phạm vi lượt này).

### C4. Bằng chứng kiểm thử (đã chạy)

- **Integration trên Postgres/PostGIS thật + Redis + AppModule đầy đủ (DB cô lập, dựng trên VPS, đã dọn):** 8/8 PASS (`evidence/description-cas-db-2026-10-06/e2e-integration.log`). Gồm: EN PENDING giữ nguyên khi publish VI; lưu bằng expected cũ → 409, không ghi hàng mới; publish revision cũ → 409, revision mới → publish được; hai ghi đồng thời cùng expected null và cùng expected A → đúng một thành công, một 409; actor không có quyền → Forbidden, không công khai; public chỉ đọc bản đã publish đúng locale; name và short_description không đổi.
- **Unit (mock, không chứng minh CAS):** 274 PASS trong các spec places, place-translations, arch, dto.
- **Web:** `PlaceDescriptionEditor.spec.tsx` 10/10 PASS (sau khi cập nhật ba test theo contract mới).
- **Typecheck:** API `tsc --noEmit` exit 0. Web: không có lỗi trong module `place-inline-edit` (không kết luận cho toàn project web).
- **Chưa chứng minh:** test integration chưa được chạy trên code cũ để xác nhận chúng thất bại trước khi sửa.

### C5. Giới hạn còn lại

- `name` vẫn dùng luồng cũ (publish tất cả bản pending). Ngoài phạm vi lượt này; cần sửa riêng.
- Editor web không còn công khai EN khi bấm "Lưu và công khai". EN ở trạng thái nháp cho đến khi có thao tác duyệt EN riêng.
- Bản EN `description` chưa có bản dịch; bản EN `short_description` đang công khai chứa khẳng định chưa có nguồn (chờ quyết định owner).

---

## 4. Hạng sao Novotel (ngoài gói, không ghi)

Bằng chứng: trang chính thức "☆☆☆☆☆" (đọc 2026-10-03) và trang Accor "5 star" (đọc 2026-10-05 09:57Z). Cả hai là nguồn của chuỗi/cơ sở, không phải xác minh độc lập. Loại nguồn `government`, `press`, `field_survey` không tự động là xác minh độc lập về hạng sao; chỉ bằng chứng cụ thể mới xác nhận được. Còn thiếu: bản ghi `sources` loại `official_website`, và nhãn hiển thị "Cơ sở tự công bố" / "Xác minh độc lập". Chưa sửa runtime.

## 5. Checklist dữ liệu còn thiếu (gửi người cung cấp; không liên hệ cơ sở)

- **Ra Khơi:** địa chỉ hoặc điểm đến chính xác (kèm ảnh biển hiệu); điện thoại đặt bàn; giờ theo từng ngày (kèm ngày xác nhận); ảnh thực tế kèm xác nhận quyền sử dụng; menu và giá nếu cơ sở cung cấp.
- **Bãi Sao:** điểm tiếp cận cụ thể (đường vào, mốc, chỉ dẫn đi bộ; kèm ảnh hoặc ghi chú đi thực tế có ngày); vị trí gửi xe và ngày kiểm tra; phí từng dịch vụ kèm ngày và nguồn; ảnh thực tế kèm quyền sử dụng.

Một mục thiếu dữ liệu không chặn mục khác.

## 6. Trạng thái

| Mục | Code/test | Deploy | Dữ liệu | Owner |
|---|---|---|---|---|
| Preview cẩm nang | Có | Web b91e92c 05/10 | — | Đã xác nhận hoạt động (phạm vi preview) |
| A Novotel địa chỉ | Đề xuất có nguồn | Chưa ghi | Chờ duyệt | Chờ duyệt |
| B Novotel giờ | Đề xuất có nguồn | Chưa ghi | Chờ duyệt | Chờ duyệt, chấp nhận nhãn nguồn |
| C1+C2 Bãi Sao (VI+EN) | Contract CAS đã triển khai local, integration 8/8 | Chưa deploy | Chờ duyệt | Chờ duyệt VI và EN |
| Hạng sao Novotel | Chưa làm | Chưa ghi | — | Ngoài gói |
