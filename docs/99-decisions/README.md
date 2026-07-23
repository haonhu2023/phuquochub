# PhuQuocHub — Architecture Decision Records (ADR)

> Thư mục **[99·Decisions]** — nơi ghi vết mọi **quyết định kiến trúc** của dự án. Tài liệu thiết kế, không code. *(Thay thế thư mục `docs/decisions/` tạm thời trước đó.)*

## 1. ADR là gì?

**ADR (Architecture Decision Record)** là một bản ghi ngắn, bất biến, mô tả **một quyết định kiến trúc quan trọng**: bối cảnh dẫn tới quyết định, vấn đề, phương án đã cân nhắc, quyết định cuối và hệ quả. ADR giúp:

- Hiểu **vì sao** hệ thống được thiết kế như hiện tại (không mất ngữ cảnh khi người mới tham gia).
- Tránh tranh luận lặp lại các quyết định đã chốt.
- Cho phép thay đổi có kiểm soát (một quyết định mới *supersede* quyết định cũ, giữ lịch sử).

## 2. Quy trình tạo ADR

1. **Sao chép** [ADR-template.md](ADR-template.md) thành `ADR-XXX-<slug>.md` (số kế tiếp).
2. Điền **Context · Problem · Decision · Alternatives · Consequences**; đặt **Status = Proposed**.
3. **Thảo luận & rà soát**; khi thống nhất → đổi **Status = Accepted**.
4. **Cập nhật tài liệu** liên quan để phản ánh quyết định; ghi lại ADR-id trong tài liệu đó.
5. Nếu sau này đổi ý → tạo **ADR mới** với `Superseded by`/`Supersedes`, **không sửa nội dung ADR đã Accepted** (chỉ đổi Status → `Superseded`).

## 3. Trạng thái (Status)

| Trạng thái | Ý nghĩa |
|---|---|
| **Proposed** | Đề xuất, đang thảo luận, chưa chốt |
| **Accepted** | Đã chốt và có hiệu lực |
| **Deprecated** | Không còn khuyến khích áp dụng (nhưng chưa bị thay hẳn) |
| **Superseded** | Bị một ADR mới thay thế (ghi rõ ADR nào) |
| **Rejected** | Đã cân nhắc và **không** chọn |

## 4. Cách đánh số

- Định dạng: **`ADR-XXX-<slug-ngắn>.md`** — `XXX` là số **tăng dần, không tái sử dụng** (kể cả khi một ADR bị Rejected/Superseded).
- **Template** dùng tên `ADR-template.md` (không đánh số).
- `slug` viết thường, nối bằng gạch ngang, mô tả ngắn chủ đề (vd `rbac-model`).
- Số ADR **không phản ánh độ ưu tiên** (thứ tự xử lý xem §7 hoặc báo cáo).

## 5. Quy tắc cập nhật

- ADR **Accepted là bất biến** về nội dung quyết định; muốn đổi → ADR mới.
- Chỉ **Status** và các trường liên kết (`Superseded by`, `Related ADR`) được cập nhật sau khi Accepted.
- Mỗi khi một ADR đổi trạng thái → cập nhật **bảng §6** dưới đây.
- Tài liệu ngoài `99-decisions/` (database, rbac, api…) khi thay đổi theo một ADR phải **trích ADR-id** để truy vết.

## 6. Danh sách ADR

Bảng trạng thái đầy đủ (**nguồn chốt**) nằm ở **[decision-register.md](decision-register.md)**: ADR đang hiệu lực **Active (001–010, 014)** + mẫu [ADR-template.md](ADR-template.md).

### 6.1. Superseded ADRs

> **Không xóa** — giữ để bảo toàn lịch sử quyết định kiến trúc; đã loại khỏi danh sách Active. Chi tiết `Superseded by / Reason / Date` xem trong từng file.

| ADR | Chủ đề | Superseded by | Date |
|---|---|---|---|
| [ADR-011](ADR-011-search-architecture.md) | Kiến trúc Search | Tái cấu trúc register → [decision-register.md](decision-register.md) | 2026-07-12 |
| [ADR-012](ADR-012-ai-architecture.md) | Kiến trúc AI | Tái cấu trúc register → [decision-register.md](decision-register.md) | 2026-07-12 |
| [ADR-013](ADR-013-prisma-readiness.md) | Điều kiện sẵn sàng thiết kế Prisma | Tái cấu trúc register → [decision-register.md](decision-register.md) | 2026-07-12 |

## 7. Ghi chú

- Các ADR đang hiệu lực phần lớn ở dạng **khung (outline)** — nội dung chi tiết điền sau khi thảo luận; riêng [ADR-010](ADR-010-api-versioning.md) đã có nội dung đầy đủ.
- **[decision-register.md](decision-register.md)** là **nguồn chốt** cho các mục "Quyết định cần chốt" rải rác trong tài liệu.

---

*Tài liệu liên quan: [../data/database.md §11](../data/database.md), [../data/erd.md](../data/erd.md), [../README.md](../README.md).*
