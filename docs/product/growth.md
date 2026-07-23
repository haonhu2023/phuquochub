# PhuQuocHub — Kiến trúc Tăng trưởng & Cộng đồng (Growth & Community Architecture)

> **Trạng thái: OUTLINE (khung).** Tài liệu thiết kế **sản phẩm** cho hệ tăng trưởng & gắn kết cộng đồng (reputation, gamification, động lực đóng góp). *Không* code. Định hình chiến lược & thành phần; chi tiết bổ sung sau. Liên quan: [community.md](modules/community.md), [rbac.md](../security/rbac.md) (Local Guide, karma), [review.md](modules/review.md), [business.md](modules/business.md), [analytics.md](../data/modules/analytics.md), [vision.md](../overview/vision.md) (trụ cột Reddit).

---

## 0. Nguyên tắc chung *(khung)*

- **Thưởng cho chất lượng, không cho số lượng** — chống farm điểm/spam.
- **Uy tín gắn với quyền** — karma cao → mở thêm quyền (Local Guide/Contributor) theo [rbac.md](../security/rbac.md).
- **Minh bạch & công bằng** — quy tắc rõ ràng, chống lạm dụng, không mua được uy tín.
- **Human-in-the-loop** — nội dung vẫn qua kiểm duyệt; gamification không bỏ qua chất lượng.

> Mỗi mục dưới đây gồm 5 phần: **Mục tiêu · Cách hoạt động · Quy tắc · KPI · Roadmap** *(khung — chưa viết chi tiết)*.

---

## 1. Reputation System
- **Mục tiêu:** đo & thể hiện độ tin cậy/đóng góp của người dùng (nền của mọi cơ chế khác). *(khung)*
- **Cách hoạt động:** điểm uy tín (karma) tăng/giảm theo hành vi được duyệt & vote. *(khung)*
- **Quy tắc:** chống tự vote/farm; giảm điểm khi nội dung bị ẩn/vi phạm. *(khung)*
- **KPI:** phân bố karma, số người uy tín hoạt động. *(khung)*
- **Roadmap:** MVP (karma cơ bản) → Scale (đa chiều theo lĩnh vực). *(khung)*

## 2. XP (Điểm kinh nghiệm)
- **Mục tiêu:** đơn vị tiến trình cho hoạt động (khác reputation — XP là "chơi", reputation là "tin"). *(khung)*
- **Cách hoạt động:** nhận XP khi hoàn thành hành động (đóng góp, review, mission). *(khung)*
- **Quy tắc:** trần XP/hành động, chống lặp; XP không mua được. *(khung)*
- **KPI:** XP trung bình/người hoạt động, tần suất hành động. *(khung)*
- **Roadmap:** MVP → Scale (nguồn XP đa dạng). *(khung)*

## 3. Level
- **Mục tiêu:** cột mốc tiến trình tạo cảm giác thành tựu. *(khung)*
- **Cách hoạt động:** ngưỡng XP → lên level; mở khóa quyền lợi/hiển thị. *(khung)*
- **Quy tắc:** đường cong level; không tụt level tùy tiện. *(khung)*
- **KPI:** phân bố level, tỷ lệ lên level. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 4. Badge
- **Mục tiêu:** huy hiệu ghi nhận thành tích/kỹ năng cụ thể. *(khung)*
- **Cách hoạt động:** cấp badge theo điều kiện (số đóng góp, lĩnh vực). *(khung)*
- **Quy tắc:** điều kiện rõ ràng, không trùng lặp, thu hồi khi gian lận. *(khung)*
- **KPI:** số badge cấp, tỷ lệ người có badge. *(khung)*
- **Roadmap:** MVP (bộ badge lõi) → Scale. *(khung)*

## 5. Achievement
- **Mục tiêu:** thành tựu dài hạn/cột mốc lớn (khác badge lẻ). *(khung)*
- **Cách hoạt động:** chuỗi điều kiện tích lũy → mở achievement. *(khung)*
- **Quy tắc:** không thể farm nhanh; gắn chất lượng. *(khung)*
- **KPI:** tỷ lệ hoàn thành, thời gian đạt. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 6. Mission
- **Mục tiêu:** nhiệm vụ định hướng hành vi đóng góp (vd "thêm 1 địa điểm còn thiếu"). *(khung)*
- **Cách hoạt động:** danh sách nhiệm vụ + phần thưởng XP/badge. *(khung)*
- **Quy tắc:** nhiệm vụ hướng tới lỗ hổng dữ liệu (nối 0-kết-quả Search). *(khung)*
- **KPI:** tỷ lệ nhận/hoàn thành nhiệm vụ. *(khung)*
- **Roadmap:** MVP (nhiệm vụ tĩnh) → Scale (cá nhân hóa). *(khung)*

## 7. Weekly Challenge
- **Mục tiêu:** thử thách tuần tạo nhịp quay lại. *(khung)*
- **Cách hoạt động:** mục tiêu theo tuần + thưởng; reset hằng tuần. *(khung)*
- **Quy tắc:** công bằng theo múi giờ; chống gian lận cuối kỳ. *(khung)*
- **KPI:** tỷ lệ tham gia tuần, retention tuần. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 8. Monthly Challenge
- **Mục tiêu:** thử thách tháng cho mục tiêu lớn hơn. *(khung)*
- **Cách hoạt động:** mục tiêu tháng + phần thưởng cao hơn. *(khung)*
- **Quy tắc:** như weekly, quy mô tháng. *(khung)*
- **KPI:** tham gia tháng, đóng góp/tháng. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 9. Local Guide
- **Mục tiêu:** vai trò người bản địa uy tín (đã có trong RBAC). *(khung)*
- **Cách hoạt động:** đạt ngưỡng karma + lịch sử sạch → thăng Local Guide ([rbac.md §4.3](../security/rbac.md)). *(khung)*
- **Quy tắc:** quyền/đặc lợi (đóng góp tin cậy nhanh, vote xác minh); thu hồi khi vi phạm. *(khung)*
- **KPI:** số Local Guide hoạt động, chất lượng đóng góp. *(khung)*
- **Roadmap:** MVP (ngưỡng thủ công) → Scale (tự động hóa). *(khung)*

## 10. Verified Local
- **Mục tiêu:** xác thực "người bản xứ thật" (tăng độ tin nội dung địa phương). *(khung)*
- **Cách hoạt động:** quy trình xác minh cư trú/địa phương → badge Verified Local. *(khung)*
- **Quy tắc:** tiêu chí xác minh, bảo mật PII, chống giả mạo. *(khung)*
- **KPI:** số Verified Local, tỷ lệ nội dung từ họ. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 11. Ambassador
- **Mục tiêu:** đại sứ cộng đồng dẫn dắt/khuếch tán. *(khung)*
- **Cách hoạt động:** đề cử/chọn lọc top contributor → quyền lợi & trách nhiệm. *(khung)*
- **Quy tắc:** tiêu chí, nhiệm kỳ, quy tắc ứng xử. *(khung)*
- **KPI:** ảnh hưởng (đóng góp/giới thiệu do ambassador dẫn). *(khung)*
- **Roadmap:** Scale (giai đoạn cộng đồng đủ lớn). *(khung)*

## 12. Referral
- **Mục tiêu:** tăng trưởng qua giới thiệu người dùng mới. *(khung)*
- **Cách hoạt động:** mã/link giới thiệu → thưởng khi người mới hoạt động thật. *(khung)*
- **Quy tắc:** chống tài khoản ảo; thưởng theo hành vi chất lượng, không chỉ đăng ký. *(khung)*
- **KPI:** K-factor, tỷ lệ referral kích hoạt. *(khung)*
- **Roadmap:** MVP (cơ bản) → Scale (chiến dịch). *(khung)*

## 13. Leaderboard
- **Mục tiêu:** bảng xếp hạng tạo động lực thi đua. *(khung)*
- **Cách hoạt động:** xếp hạng theo XP/đóng góp theo kỳ & khu vực. *(khung)*
- **Quy tắc:** chống thao túng; nhiều bảng (tuần/tháng/khu vực) tránh "kẻ thắng mãi mãi". *(khung)*
- **KPI:** tương tác với leaderboard, giữ chân top. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 14. Business Reward
- **Mục tiêu:** khuyến khích chủ cơ sở tham gia & giữ dữ liệu tươi. *(khung)*
- **Cách hoạt động:** phần thưởng phi tài chính (badge verified, nổi bật hợp lệ) khi cập nhật/tương tác tốt. *(khung)*
- **Quy tắc:** **không bán thứ hạng** (công bằng — [vision.md §5](../overview/vision.md)); thưởng theo chất lượng/độ tươi. *(khung)*
- **KPI:** tỷ lệ cơ sở hoạt động, độ tươi dữ liệu cơ sở. *(khung)*
- **Roadmap:** MVP → Scale. *(khung)*

## 15. Gamification
- **Mục tiêu:** khung tổng hợp gắn kết các cơ chế trên thành trải nghiệm mạch lạc. *(khung)*
- **Cách hoạt động:** phối hợp XP/level/badge/mission/challenge/leaderboard theo hành trình người dùng. *(khung)*
- **Quy tắc:** tránh gây nghiện độc hại; ưu tiên giá trị thật; chống lạm dụng. *(khung)*
- **KPI:** engagement, retention, đóng góp/người. *(khung)*
- **Roadmap:** MVP (lõi) → Scale (cá nhân hóa). *(khung)*

## 16. Community Health
- **Mục tiêu:** đo & duy trì "sức khỏe" cộng đồng (an toàn, tích cực, bền vững). *(khung)*
- **Cách hoạt động:** chỉ số sức khỏe (tỷ lệ độc hại, thời gian xử lý report, tỷ lệ trả lời) — nối [analytics.md](../data/modules/analytics.md), [moderation.md](../workflow/moderation.md). *(khung)*
- **Quy tắc:** cân bằng tăng trưởng vs chất lượng; can thiệp khi chỉ số xấu. *(khung)*
- **KPI:** toxicity rate, response rate, retention người đóng góp. *(khung)*
- **Roadmap:** MVP (chỉ số cơ bản) → Scale (cảnh báo sớm). *(khung)*

---

## Điểm cần quyết định sau (open questions) *(khung)*

- Phân biệt & liên hệ **Reputation (karma) vs XP** (hai hệ hay hợp nhất).
- **Ngưỡng karma/XP** cho thăng hạng Local Guide/Contributor (nối [rbac.md §8](../security/rbac.md)).
- Bộ **badge/achievement lõi** cho MVP.
- Chính sách **chống gian lận** (farm điểm, tài khoản ảo, brigading vote).
- Cơ chế **Verified Local** (tiêu chí xác minh + bảo mật PII).
- Phạm vi **Business Reward** phi tài chính đảm bảo công bằng.
- Thực thể dữ liệu cần bền hóa (XP/level/badge/mission…) — **CHƯA phê duyệt**; nếu triển khai sẽ **hỏi trước** khi bổ sung vào [docs/data/](../data/database.md).

---

*Tài liệu liên quan: [community.md](modules/community.md), [review.md](modules/review.md), [business.md](modules/business.md), [rbac.md](../security/rbac.md), [analytics.md](../data/modules/analytics.md), [moderation.md](../workflow/moderation.md), [search.md](../architecture/search.md) (tín hiệu lỗ hổng nội dung), [vision.md](../overview/vision.md).*
