# Gói nội dung mẫu 3 trang + 2 cẩm nang (bản nháp v2, chưa xuất bản)

Ngày kiểm tra: 2026-10-03. Trạng thái: **bản nháp chờ owner duyệt**. Không ghi production, không xuất bản trong tài liệu này.

Quy ước nguồn:
- **Chính thức**: website của cơ sở (đã mở và đọc đoạn nguồn trong lượt này).
- **Dữ liệu production**: đọc từ API công khai hoặc admin (chỉ khi có phiên owner).
- **Google Maps**: listing hoặc feature pin, dùng cho vị trí và danh tính cơ sở, không dùng cho thông tin chính sách.
- **Blog**: nguồn không chính thức, không đủ để khẳng định giá, an toàn, chính sách. Chỉ dùng để gợi ý hướng khảo sát.

---

## 0. Các lỗi đã sửa so với v1

| # | Kết luận v1 | Sửa đổi | Căn cứ |
|---|---|---|---|
| 1 | "Website chính thức không có tọa độ" | **Sai.** Website có `Latitude 10.1298248`, `Longitude 103.9810484` (xuất hiện hai lần trong mã nguồn trang chủ). Lỗi do tôi chỉ tìm iframe bản đồ và liên kết Google Maps | novotelphuquoc.com, trang chủ |
| 2 | "Biệt thự" cho 120 đơn vị | Đổi thành **bungalow**, theo chữ website | novotelphuquoc.com: "120 bungalows" |
| 3 | "Cách sân bay 10 phút" như sự thật | Là **cơ sở tự giới thiệu** ("only 10 minutes from the airport"); thời gian thực tế phụ thuộc giao thông | novotelphuquoc.com, trang chủ |
| 4 | Gói all-inclusive "tối thiểu 7 đêm" | Cụm "minimum of 07 nights" chỉ thấy ở **trang chủ**. Trang ưu đãi (`/special-offers/`) nêu gói All-Inclusive nhưng **không có điều kiện 7 đêm còn hiệu lực**. Bỏ chi tiết này khỏi nội dung chính; hướng người đọc đến trang ưu đãi | novotelphuquoc.com/special-offers/ |
| 5 | Hạng sao "5 sao" như đã kiểm chứng | Ghi đúng nguồn: "hạng 5 sao theo cơ sở công bố" (trang chủ ghi ☆☆☆☆☆). **Chưa kiểm tra quyết định xếp hạng độc lập** | novotelphuquoc.com |
| 6 | Quyền ảnh "trống" nên được hiểu là không có quyền | Đã đọc đúng tầng: API công khai **trả** cả ba trường `attribution`, `license_type`, `license_url` nhưng cả 5 ảnh đều **null** (trường rỗng). Hồ sơ kiểm duyệt phía admin chưa đọc được vì chưa có phiên owner. Không kết luận vi phạm | API công khai `/api/places/novotel-phu-quoc` |
| 7 | Tọa độ Novotel "chưa có nguồn" | Có hai điểm tham chiếu, xem mục 2 | Website và Google Maps |
| 8 | Bãi Trường "cách sân bay 25–30 phút"; "phía đông Phú Quốc" | **Không có nguồn đủ**. Đã bỏ | — |
| 9 | Đường đi Bãi Sao, mùa sao biển, mùa khô | Chỉ đến từ blog (cùng một nội dung lặp lại), **không đủ để khẳng định**. Đã đưa ra khỏi nội dung công khai, chuyển thành câu hỏi cần kiểm chứng | Blog |
| 10 | Số điện thoại Ra Khơi | Ghi rõ là **đề xuất từ bên thứ ba** (Google Maps), chưa xác minh với cơ sở. Không đánh dấu verified | Google Maps |

---

## 1. Novotel Phú Quốc Resort

**Record production**: `205d6950-ffb4-42cb-98ca-c8d155ad72af` (slug `novotel-phu-quoc`), content_version 2. **Không ghi vào `74ec766b-…`** (ID cũ trong gói, không có trên API công khai).

### 1.1 Bảng field → giá trị → nguồn

| Field | Hiện tại (production) | Đề xuất | Nguồn | Ngày kiểm tra | Ghi chú |
|---|---|---|---|---|---|
| Tên | Novotel Phú Quốc Resort | Giữ | novotelphuquoc.com | 2026-10-03 | Khớp |
| Thương hiệu | Mô tả ngắn có "thuộc thương hiệu Accor" | Giữ | novotelphuquoc.com | 2026-10-03 | Khớp |
| Hạng sao | Không có | Ghi: "5 sao theo cơ sở công bố" | novotelphuquoc.com (☆☆☆☆☆) | 2026-10-03 | Không phải xác minh độc lập |
| Địa chỉ | Bãi Trường, Dương Tơ, TP. Phú Quốc | Giữ khu vực. Bổ sung: Sonasea Villas and Resort, Group 5, Đường Bào, Phú Quốc Special Zone, An Giang | novotelphuquoc.com | 2026-10-03 | Hai địa chỉ cùng một cơ sở |
| Điện thoại | `+842976260999` (HOTLINE, pending) | Giữ, hiển thị `+84 297 626 0999` | novotelphuquoc.com | 2026-10-03 | Đã duyệt bởi owner |
| Email | `H9770@accor.com` (EMAIL, pending) | Giữ | novotelphuquoc.com | 2026-10-03 | Đã duyệt bởi owner |
| Fax | Không lưu | Không đưa vào | — | — | Theo quyết định owner |
| Tọa độ | 10.1288141, 103.9807506 | **Giữ hiện tại** (xem mục 2) | Google Maps pin; website | 2026-10-03 | Chưa xác định điểm tiếp cận |
| Số phòng | Không có | "246 phòng trong tòa nhà chính" | novotelphuquoc.com | 2026-10-03 | Khớp |
| Bungalow | Không có | "120 bungalow trong khu vườn nhiệt đới hoặc hướng biển" | novotelphuquoc.com | 2026-10-03 | Chữ theo website |
| Thời gian sân bay | Không có | "Cơ sở giới thiệu khoảng 10 phút từ sân bay" | novotelphuquoc.com | 2026-10-03 | Ước tính của cơ sở |
| Tiện ích | Không có | Hồ bơi; spa In Balance; phòng gym; sân tennis; ballroom; bãi biển | novotelphuquoc.com | 2026-10-03 | Khớp |
| Ẩm thực | Không có | Nhà hàng hải sản (Seafood); Ocean Bar | novotelphuquoc.com | 2026-10-03 | Khớp |
| Gói All-Inclusive | Không có | "Có gói All-Inclusive; kiểm tra điều kiện trên trang ưu đãi" (không ghi số đêm) | novotelphuquoc.com/special-offers/ | 2026-10-03 | Không xác nhận điều kiện hiện hành |
| Giờ ăn uống gói | Không có | Ghi trong nội dung gói: 06:30–23:00 (theo website) | novotelphuquoc.com | 2026-10-03 | Là giờ dịch vụ ăn uống, không phải giờ mở cửa resort |
| Giờ check-in/out | — | **Không đụng** | — | — | Ngoài phạm vi |
| Giá | Không có | **Không tạo** | — | — | Thiếu nguồn |
| Đối tượng | — | Gia đình có trẻ em, cặp đôi, nhóm, khách công tác, tiệc cưới, hội nghị | novotelphuquoc.com | 2026-10-03 | Khớp |

### 1.2 Trang khách (bản nháp)

**Novotel Phú Quốc Resort**

Khách sạn 5 sao theo cơ sở công bố, thuộc thương hiệu Accor, nằm trong khu phức hợp Sonasea Villas and Resort trên bãi biển Bãi Trường, Phú Quốc.

Resort có 246 phòng trong tòa nhà chính và 120 bungalow trong khu vườn nhiệt đới hoặc hướng biển. Các tiện ích gồm hồ bơi, spa In Balance, phòng gym, sân tennis, nhà hàng hải sản và Ocean Bar. Resort có chương trình hoạt động cho trẻ em và dịch vụ trông trẻ theo khung giờ.

Phù hợp với gia đình có trẻ em, cặp đôi, nhóm bạn, khách công tác và khách tổ chức tiệc cưới hoặc hội nghị.

Theo website, cơ sở tự giới thiệu cách sân bay khoảng 10 phút; thời gian thực tế phụ thuộc giao thông.

Gói All-Inclusive có trên website; khách nên kiểm tra điều kiện và giá tại trang ưu đãi chính thức.

**Liên hệ**: điện thoại +84 297 626 0999; email H9770@accor.com. Đặt phòng qua website chính thức.

### 1.3 Thiếu / cần owner
- Giá phòng và giá gói: không tạo.
- Điều kiện All-Inclusive hiện hành (số đêm tối thiểu): cần xác nhận với cơ sở hoặc trang ưu đãi.
- Giờ mở cửa tổng: không có nguồn; không gán.
- Hồ sơ bản quyền ảnh: xem mục 3.

---

## 2. Tọa độ Novotel: hai điểm tham chiếu, chưa xác định điểm tiếp cận

| Nguồn | Tọa độ | Điểm này đại diện cho | Mức xác định |
|---|---|---|---|
| Website chính thức (`Latitude/Longitude` trên trang chủ) | 10.1298248, 103.9810484 | Không rõ: website không ghi là khuôn viên, tòa chính, lễ tân hay cổng | Chưa xác định |
| Google Maps feature pin (URL `!3d10.1288141!4d103.9807506`) | 10.1288141, 103.9807506 | Điểm đánh dấu địa điểm trên Google, không ghi rõ là tòa chính hay lối vào | Chưa xác định |

Hai điểm cách nhau khoảng 117 m và đều nằm trong khu cơ sở. Không kết luận điểm nào là cổng vào chỉ từ một marker.

**Quyết định cho tài liệu**: giữ production hiện tại `10.1288141, 103.9807506`. Trạng thái: **hai điểm tham chiếu trong khu vực cơ sở, chưa xác minh điểm tiếp cận**. Nếu owner muốn chuyển sang điểm website, cần một quyết định riêng và ghi rõ đó là điểm nào.

---

## 3. Ảnh Novotel: kiểm tra quyền đúng tầng

| # | Media ID | Trạng thái (API công khai) | Chú thích (alt/caption) | `attribution` | `license_type` | `license_url` |
|---|---|---|---|---|---|---|
| 1 | `9c800b07-d511-411d-8f22-282294027fa3` | published | Khu hồ bơi và quầy bar mái lá nhìn từ trên cao | null (trường rỗng) | null | null |
| 2 | `5b9c574f-b9a3-4232-9257-d0f1a991f961` | published | Toàn cảnh khu biệt thự trong Sonasea | null | null | null |
| 3 | `6c103834-da63-46a3-8a22-92c5a744c4d9` | published | (không có) | null | null | null |
| 4 | `c37bc8e7-4f23-4876-9f24-f9d9f6a00674` | published | Phòng khách biệt thự, không gian gia đình | null | null | null |
| 5 | `97a79357-a622-4468-aa08-3c00dd023de7` | published | Tầm nhìn ban công xuống hồ bơi | null | null | null |

**Phân biệt đúng**:
- API công khai **có trả** ba trường quyền (không phải "không trả trường").
- Giá trị của cả ba trường là **null** trên cả 5 ảnh: đây là trường rỗng, không phải bằng chứng quyền.
- Trạng thái `published` không phải bằng chứng quyền sử dụng.
- Hồ sơ kiểm duyệt phía admin (nguồn ảnh, người cấp quyền) **chưa đọc được** vì chưa có phiên owner. Đây là thiếu quyền truy cập, không phải kết luận ảnh vi phạm.

**Đề xuất ảnh bìa**: chưa đề xuất chính thức. Ảnh #1 (hồ bơi và quầy bar) là ứng viên, nhưng cần đọc hồ sơ kiểm duyệt trước khi quyết định. Trang khách hiện đã dùng `media[0]` làm ảnh đầu trang khi không có cover, nên không bị trống ảnh.

**Không tự gỡ ảnh production trong phiên này.**

---

## 4. Ra Khơi (`nha-hang-ra-khoi`, ID `78bf8730-6ba4-4aa0-b0d2-da991c71bdb9`)

### 4.1 Danh tính

- Production: tên "Nhà hàng Ra Khơi", địa chỉ "Đường 30/4, Dương Đông, TP. Phú Quốc".
- Google Maps ([Ra Khoi Restaurant](https://www.google.com/maps/place/Ra+Khoi+Restaurant/@10.2137118,103.9643236,17z)): "Nhà hàng Ra Khơi", `131 Đ. 30 Tháng 4, Khu 1, Phú Quốc`, loại "Seafood restaurant", feature pin 10.2137118, 103.9643236.
- **Chưa có website chính thức** được tìm và đối chiếu trong lượt này.
- Kết luận: cùng tên và cùng phố 30/4; **số nhà và cơ sở chưa xác nhận** với chủ nhà hàng.

### 4.2 Bảng field

| Field | Hiện tại | Đề xuất | Nguồn | Trạng thái |
|---|---|---|---|---|
| Ẩm thực | Không có | "Hải sản" | Google Maps (danh mục) | Chờ owner duyệt |
| Địa chỉ | Đường 30/4, Dương Đông | Bổ sung "131 Đ. 30 Tháng 4, Khu 1" | Google Maps | Chờ owner duyệt; **chưa xác nhận với cơ sở** |
| Điện thoại | Không có | **Chưa thêm**. Số `+84 918 096 096` trên Google Maps là **đề xuất từ bên thứ ba, chưa xác minh với cơ sở**. Không đánh dấu verified | Google Maps | Để lại theo yêu cầu owner |
| Tọa độ | 10.215, 103.96 | Ngoài gói đã duyệt. Để riêng | — | Không đề xuất trong đợt này |
| Giờ | Không có | **Không ghi**. Google chỉ hiển thị giờ trong ngày, không đủ làm giờ cố định | — | Thiếu nguồn |
| Menu, giá | Không có | **Không ghi** | — | Thiếu nguồn |

### 4.3 Trang khách (bản nháp)

**Nhà hàng Ra Khơi**

Nhà hàng hải sản trên đường 30/4, Phú Quốc. Trên Google Maps, quán có đánh giá trung bình 3,9/5 với hơn 4.000 lượt. Khách hay nhắc đến cơm chiên hải sản và món mực, nhưng nhận xét về chất lượng món không đồng đều.

**Liên hệ**: đang chờ xác minh với cơ sở.

---

## 5. Bãi Sao (`bai-sao`, ID `5632e5b1-cc0a-49a4-a079-65b1d8fd1b85`)

### 5.1 Điểm tham chiếu

- Production: 10.0572576, 104.0363948. Feature pin Google "Sao Beach" (URL: https://www.google.com/maps/place/Sao+Beach/@10.056553,104.0375176,16z).
- **Điểm tham chiếu trên bản đồ, không phải lối vào duy nhất.**

### 5.2 Ranh giới thông tin chung và dịch vụ riêng

- **Bãi biển là khu công cộng**: không có điện thoại chung, giờ mở cửa chung hay giá vé chung. Không tạo các trường này.
- **Dịch vụ** (ghế, thuê thuyền, kayak, dù lượn): do từng đơn vị riêng cung cấp và tự định giá. Không liệt kê giá, không gán cho bãi biển.

### 5.3 Bảng field

| Field | Hiện tại | Đề xuất | Nguồn | Trạng thái |
|---|---|---|---|---|
| Điện thoại chung | Không có | **Không áp dụng** | — | — |
| Giờ mở cửa chung | Không có | **Không áp dụng** | — | — |
| Giá vé chung | Không có | **Không áp dụng** | — | — |
| Ảnh bìa | Không có | Thiếu. Xem mục 6 | — | — |
| Tọa độ | 10.0572576, 104.0363948 | Giữ (điểm tham chiếu) | Google Maps pin | Đã duyệt trong gói 6 tọa độ |

### 5.4 Trang khách (bản nháp)

**Bãi Sao**

Bãi biển ở Phú Quốc, có cát và nước biển được nhiều du khách nhắc đến. Điểm đánh dấu trên bản đồ là một điểm tham chiếu trong khu vực bãi, không phải lối vào duy nhất.

Các dịch vụ như ghế, thuê thuyền hay kayak do từng đơn vị riêng cung cấp; hỏi giá trực tiếp trước khi dùng.

**Lưu ý**: không có thông tin an toàn tắm biển theo thời gian thực trong nội dung này. Kiểm tra cảnh báo thời tiết và điều kiện biển của cơ quan có thẩm quyền trước khi tắm.

---

## 6. Ảnh cần owner cung cấp

| Địa điểm | Góc ảnh | Mục đích | Caption / alt dự kiến |
|---|---|---|---|
| Ra Khơi | Mặt tiền nhà hàng, biển hiệu | Ảnh bìa, nhận diện cơ sở | "Mặt tiền Nhà hàng Ra Khơi, đường 30/4, Phú Quốc" |
| Ra Khơi | Món hải sản tiêu biểu (không gắn tên món) | Minh họa ẩm thực | "Món hải sản tại Nhà hàng Ra Khơi" |
| Bãi Sao | Toàn cảnh bãi biển | Ảnh bìa | "Bãi Sao, Phú Quốc, nhìn từ bờ cát" |
| Bãi Sao | Lối đi tới bãi | Minh họa cách tiếp cận | "Lối đi tới Bãi Sao, Phú Quốc" |

Mỗi ảnh cần kèm: người chụp hoặc chủ sở hữu, và văn bản cấp quyền sử dụng.

---

## 7. Hai cẩm nang

### 7.1 Hướng dẫn đi Bãi Sao

- **Tiêu đề**: Hướng dẫn đi Bãi Sao Phú Quốc
- **Slug đề xuất**: `huong-dan-di-bai-sao-phu-quoc`
- **Chuyên mục**: `di_chuyen` (Di chuyển). Trọng tâm bài là cách đi, nên chuyên mục này phù hợp.
- **Tags**: Bãi Sao, Phú Quốc, di chuyển
- **Intro**: Hướng dẫn cách đi tới Bãi Sao, cách chuẩn bị và điều cần kiểm tra trước khi đi.
- **Meta title**: Hướng dẫn đi Bãi Sao Phú Quốc | PhuQuocHub
- **Meta description**: Cách đi tới Bãi Sao ở Phú Quốc, chuẩn bị trước chuyến đi và điều cần kiểm tra.
- **Hero**: chưa có media đã duyệt quyền sử dụng.
- **Địa điểm liên quan**: Bãi Sao (`bai-sao`)

**Blocks**:
1. `section_heading`: Cách đi tới Bãi Sao
2. `rich_text`: Bãi Sao nằm ở phía tây nam Phú Quốc. Tuyến đường tùy điểm xuất phát, nên mở bản đồ và nhập điểm tham chiếu trước khi đi. Cách đi chính xác cần đối chiếu bản đồ hiện hành; bài này chưa đưa tên đường cụ thể vì các nguồn đang có chỉ là blog lặp lại nhau.
3. `section_heading`: Chuẩn bị trước chuyến đi
4. `rich_text`: Mang nước, kem chống nắng và mũ. Kiểm tra thời tiết và điều kiện biển trước khi đi.
5. `callout` (variant `warning`): Bài không xác nhận tình trạng biển hôm nay. Kiểm tra cảnh báo chính thức trước khi tắm.
6. `section_heading`: Dịch vụ trên bãi
7. `rich_text`: Có các dịch vụ do đơn vị riêng cung cấp. Giá và điều kiện thay đổi; hỏi trực tiếp tại chỗ.
8. `faq`: (a) Bãi Sao có thu vé vào cửa không? — Chưa có nguồn chính thức xác nhận; đừng khẳng định. (b) Có phải một lối vào duy nhất không? — Không.
9. `place_collection`: Bãi Sao

**Trước khi xuất bản, cần xác minh**: đường đi cụ thể bằng bản đồ hiện hành; có thu vé hay không; nguồn thời tiết và điều kiện biển (cơ quan địa phương).

### 7.2 Chọn nơi lưu trú khu Bãi Trường

- **Tiêu đề**: Chọn nơi lưu trú khu Bãi Trường, Phú Quốc
- **Slug đề xuất**: `chon-noi-luu-tru-khu-bai-truong-phu-quoc`
- **Chuyên mục**: `luu_tru` (Lưu trú)
- **Tags**: Bãi Trường, lưu trú, Phú Quốc
- **Intro**: Tiêu chí chọn nơi lưu trú khu Bãi Trường, không xếp hạng.
- **Meta title**: Chọn nơi lưu trú khu Bãi Trường Phú Quốc | PhuQuocHub
- **Meta description**: Tiêu chí chọn nơi lưu trú khu Bãi Trường ở Phú Quốc, kèm một ví dụ có thông tin đã kiểm tra.
- **Hero**: chưa có media đã duyệt quyền sử dụng.
- **Địa điểm liên quan**: Novotel Phú Quốc Resort (`novotel-phu-quoc`)

**Blocks**:
1. `section_heading`: Tiêu chí chọn
2. `rich_text`: (a) Ngân sách và số đêm. (b) Đối tượng đi cùng: gia đình có trẻ em, cặp đôi, nhóm, khách công tác. (c) Tiện ích: hồ bơi, spa, nhà hàng, khu trẻ em. (d) Chính sách ăn uống (có gói All-Inclusive hay không). (e) Khoảng cách tới điểm cần đi, đối chiếu bản đồ.
3. `section_heading`: Một ví dụ
4. `rich_text`: Novotel Phú Quốc Resort là khách sạn 5 sao theo cơ sở công bố, thuộc Accor, có 246 phòng trong tòa nhà chính và 120 bungalow, với hồ bơi, spa và nhà hàng hải sản. Phù hợp với gia đình có trẻ em và khách tổ chức sự kiện. Giá và điều kiện gói lấy từ website chính thức, không lấy từ bài này.
5. `callout` (variant `info`): Giá thay đổi theo thời điểm. Bài không đưa giá.
6. `faq`: (a) Trẻ em có được miễn phí không? — Website ghi trẻ dưới 16 tuổi ở chung phòng với phụ huynh được miễn phí; kiểm tra điều kiện khi đặt. (b) Gói All-Inclusive có bắt buộc số đêm tối thiểu không? — Cần kiểm tra trên trang ưu đãi chính thức; bài không khẳng định.
7. `place_collection`: Novotel Phú Quốc Resort

**Chưa đưa vào**: các khu nghỉ dưỡng khác và thời gian đi từ sân bay đến Bãi Trường (chưa có nguồn đủ).

---

## 8. Diff dữ liệu production dự định cập nhật

| Record | Trường | Hiện tại | Đề xuất | Nguồn | Trạng thái |
|---|---|---|---|---|---|
| Novotel `205d6950…` | Hạng sao | Không có | "5 sao theo cơ sở công bố" | novotelphuquoc.com | Chờ owner duyệt |
| Novotel | Địa chỉ chi tiết | Bãi Trường, Dương Tơ | Thêm Sonasea Villas and Resort, Group 5, Đường Bào | novotelphuquoc.com | Chờ owner duyệt |
| Novotel | Tiện ích | Không có | Hồ bơi, spa, gym, tennis, ballroom, bãi biển, nhà hàng hải sản, Ocean Bar | novotelphuquoc.com | Chờ owner duyệt |
| Novotel | Mô tả | Mô tả hiện có | Thay bằng nội dung mục 1.2 | novotelphuquoc.com | Chờ owner duyệt |
| Novotel | Tọa độ | 10.1288141, 103.9807506 | **Không đổi** | — | Mục 2 |
| Novotel | Điện thoại, email | Đã lưu, pending | Không đổi trong đợt này | — | Đã duyệt |
| Ra Khơi `78bf8730…` | Ẩm thực | Không có | Hải sản | Google Maps | Chờ owner duyệt |
| Ra Khơi | Địa chỉ | Đường 30/4, Dương Đông | Bổ sung 131 Đ. 30 Tháng 4, Khu 1 | Google Maps | Chờ xác nhận với cơ sở |
| Ra Khơi | Điện thoại | Không có | **Không thêm** | — | Chờ xác minh |
| Bãi Sao `5632e5b1…` | Điện thoại, giờ, giá chung | Không có | **Không áp dụng** | — | — |

Không đề xuất: giá, giờ tổng, fax, đánh giá người dùng, tọa độ Ra Khơi.

---

## 9. Quyết định owner cần duyệt

1. Nội dung Novotel (mục 1.2), gồm hạng sao theo cơ sở công bố, tiện ích, bungalow, và câu "cơ sở tự giới thiệu cách sân bay khoảng 10 phút".
2. Giữ tọa độ Novotel hiện tại (`10.1288141, 103.9807506`) với nhãn "hai điểm tham chiếu, chưa xác minh điểm tiếp cận", hoặc chọn điểm website `10.1298248, 103.9810484`.
3. Hồ sơ bản quyền 5 ảnh Novotel: owner cần đọc hồ sơ kiểm duyệt phía admin để xác nhận nguồn và quyền.
4. Số điện thoại Ra Khơi: giữ ngoài đợt này, hay tìm nguồn chính thức.
5. Hai cẩm nang: duyệt cấu trúc, và xác nhận sẽ kiểm tra bản đồ, điều kiện biển và giá trước khi xuất bản.

Trạng thái: **không xuất bản**, **không ghi production**.
