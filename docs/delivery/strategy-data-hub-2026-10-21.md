# Chiến lược: PhuQuocHub thành trung tâm dữ liệu sống của Phú Quốc

(21/10/2026 — tài liệu định hướng, CHƯA XÂY gì. Toàn bộ phần "đã có" dưới đây xác nhận bằng đọc code thật, không suy đoán.)

## Vì sao đây là việc AI (kể cả tôi) không tự làm được

Một AI tổng quát trả lời được "quán nào ngon ở Dương Đông" bằng tri thức huấn luyện — nhưng có 4 việc nó **không bao giờ làm được**, dù mạnh tới đâu:

1. **Không biết sự thật NGAY BÂY GIỜ.** AI không biết quán đó có còn mở cửa sáng nay, tin tuyển dụng còn tuyển hay đã đủ người, phòng còn trống đêm nay hay không. Tri thức AI luôn có độ trễ; một nền tảng có người thật xác nhận liên tục thì không.
2. **Không chịu trách nhiệm được.** AI có thể mô tả một khách sạn, nhưng không thể CHỨNG MINH người vừa trả lời bạn là chủ khách sạn thật, hay giữ chỗ thật cho bạn. Danh tính xác minh + hậu quả thật (giữ chỗ, mất uy tín nếu sai) là thứ chỉ một nền tảng có người thật mới tạo ra được.
3. **Không có bằng chứng, chỉ có xác suất.** AI trả lời bằng suy luận thống kê, có thể bịa. Một nền tảng ghi lại "ai xác nhận, lúc nào, dựa trên nguồn nào" tạo ra một lớp sự thật có thể kiểm chứng — chính xác điều AI không có.
4. **Không tạo ra tương tác có hệ quả.** AI chat không giữ được một chỗ ngồi, không gửi được một đơn ứng tuyển tới đúng người, không làm trung gian một cuộc trao đổi thật giữa hai người.

→ Chiến lược không phải "làm nội dung hay hơn AI" (thua chắc, AI tổng hợp nội dung nhanh hơn). Chiến lược là: **trở thành lớp sự thật xác thực, tương tác được, có hậu quả thật** mà chính AI (kể cả AI của Phú Quốc sau này) sẽ phải tham chiếu tới.

## Hiện trạng thật (đọc code, không lý tưởng hoá)

**Đã có, đang sống thật trên trang (không phải chỉ model dữ liệu):**
- Đánh giá (reviews) — viết/đọc được ngay trên trang địa điểm (`ReviewsSection.tsx`).
- Xác minh doanh nghiệp (`business_claims`/`business_members`) — luồng đầy đủ: chủ cơ sở claim → hàng chờ duyệt → xác nhận — nút đã có trên trang địa điểm (`ClaimCta.tsx`).
- Đề xuất chỉnh sửa (`place_edit_proposals`) — nút "Đề xuất chỉnh sửa" đã có ngay trên trang công khai, không chỉ dashboard.
- Báo sai/trùng (`listing_reports`) — **CHỈ có trên tin tuyển dụng/BĐS**, CHƯA có trên trang địa điểm/khách sạn/nhà hàng/tour.
- Lưu tin (`saved_items`) — **CHỈ có trên tin tuyển dụng/BĐS**, CHƯA có trên trang địa điểm.
- JSON-LD (dữ liệu có cấu trúc cho máy đọc) — phủ khá rộng (Place/Hotel/Restaurant/Tour/Event/JobPosting/RealEstateListing/FAQPage), có AggregateRating — nhưng CHƯA phát riêng từng Review theo chuẩn schema.org.
- Badge "đã xác minh" (`trust.ts`) — ba cấp rõ ràng (verified/official/community_verified), có gate giá thật theo trạng thái xác minh — không trang trí, có tác dụng thật lên UI.

**Đã XÂY nhưng CHƯA nối vào web — tài sản nằm im lớn nhất:**
- **Đặt chỗ/giữ slot (`bookings`/`availability`)** — API đầy đủ (tạo/xác nhận/huỷ/hết hạn, mã đặt chỗ, theo dõi sức chứa), **0 nơi nào trong `apps/web` gọi tới** — đây là đúng tính năng số 4 ở trên ("tương tác có hệ quả thật") nhưng đang để không.
- "AI recommendations" — tên gây hiểu nhầm, thực chất chỉ là AI hỗ trợ kiểm duyệt nội bộ (gắn cờ nội dung bị báo cáo), KHÔNG phải gợi ý cá nhân hoá cho người dùng — nếu muốn một "AI gợi ý chỗ chơi" thật thì phải xây mới, không có sẵn gì để tái dùng.

**Dữ liệu thật trên production còn rất mỏng** (theo các lần kiểm trước): chỉ ~49 địa điểm có nội dung, 1 tin tuyển dụng thật, 0 tin BĐS — nghĩa là phần lớn roadmap dưới đây sẽ vô nghĩa nếu không đi kèm việc **có thêm dữ liệu/người dùng thật**, không chỉ thêm tính năng.

## Lộ trình đề xuất (có thứ tự ưu tiên, không làm cùng lúc)

### Giai đoạn 1 — Vá lỗ hổng tính năng đã có (rẻ nhất, tác động ngay)
Đưa "Báo sai/trùng" và "Lưu tin" lên ĐỦ mọi loại trang (địa điểm/khách sạn/nhà hàng/tour), không chỉ tin tuyển dụng/BĐS. Đây không phải tính năng mới — chỉ là thiếu nhất quán, 2 component đã có (`ReportButton`/`SaveButton`) chỉ cần gắn thêm. Chi phí thấp, khoá ngay một điểm yếu rõ ràng khi đối chiếu trang này với trang kia.

### Giai đoạn 2 — Vòng lặp "còn đúng không?" (lõi của luận điểm #1 — sự thật tức thời)
Dựng đúng luồng owner đã duyệt hướng ở §4.1/§4.4 (checkpoint.md): người xem báo "không liên hệ được"/"hết hàng/hết chỗ" → người đăng xác nhận "vẫn còn" → admin xử lý tin tồn đọng. Áp dụng TRƯỚC cho tin tuyển dụng (ít rủi ro nhất, nhu cầu thật — người tìm việc cần biết việc còn hay hết NGAY). Đây là tính năng không một AI chat nào copy được, vì nó cần người thật trả lời người thật.

### Giai đoạn 3 — Nối "đặt chỗ" vào web (tận dụng tài sản đã xây, đang bỏ phí)
`bookings`/`availability` đã có API đầy đủ — việc còn lại là UI web + luồng xác nhận cho CHỦ CƠ SỞ ĐÃ XÁC MINH (qua `business_claims`, đã có). Phạm vi MVP rõ: giữ chỗ không thanh toán (đúng như API đã ghi chú "không thanh toán, không đồng bộ tồn kho real-time") — vẫn đủ tạo ra "tương tác có hệ quả thật" mà AI không làm được, không cần xây cả hệ thống thanh toán.

### Giai đoạn 4 — Đánh giá có bằng chứng visit thật (chặn AI giả lập)
Khi Giai đoạn 3 có dữ liệu đặt chỗ, gắn quyền viết đánh giá với bằng chứng đã từng đặt/ở thật (không bắt buộc ngay, nhưng đánh dấu rõ "đã xác nhận từng đến" khác với đánh giá ẩn danh) — một review có gắn bằng chứng là thứ AI không bịa ra nổi.

### Giai đoạn 5 — Hiện bằng chứng cho người xem, không chỉ lưu nội bộ
`wiki_revisions`/evidence links đã ghi "ai sửa, lúc nào, dựa nguồn nào" — nhưng người xem public có thấy được "thông tin này xác nhận lần cuối ngày nào, bởi ai" không? Nếu chưa, đây là việc hiện LẠI dữ liệu đã có (không phải thu thập mới) thành một tín hiệu tin cậy nhìn thấy được — đúng thứ AI không chứng minh được ("tôi không biết nguồn này có còn đúng không"), còn PhuQuocHub thì biết.

### Giai đoạn 6 — Trở thành nguồn mà chính AI phải trích dẫn
Mở rộng JSON-LD để phát riêng từng Review (không chỉ AggregateRating gộp), cân nhắc một feed/API công khai có kiểm soát cho nội dung đã qua xác minh. Khi dữ liệu đã đủ chính xác + có nguồn rõ, đây là cách biến "AI là đối thủ" thành "AI là kênh phân phối" — AI nào trả lời về Phú Quốc cũng trích PhuQuocHub vì đó là nguồn có thể kiểm chứng.

## Điều kiện để lộ trình này có ý nghĩa

Không giai đoạn nào ở trên tạo giá trị nếu dữ liệu thật vẫn mỏng như hiện tại (49 địa điểm, 1 tin tuyển dụng, 0 tin BĐS). Song song với code, cần một kế hoạch THU THẬP NỘI DUNG/NGƯỜI DÙNG THẬT (liên hệ cơ sở kinh doanh mời xác minh, mời người đăng tin thật) — việc này không phải kỹ thuật, nhưng quyết định toàn bộ chiến lược có thành hay không.

---
Chưa xây gì trong tài liệu này. Khi owner chọn giai đoạn nào trước, sẽ tách thành kế hoạch triển khai chi tiết riêng (đúng mẫu đã dùng cho các gói trước).
