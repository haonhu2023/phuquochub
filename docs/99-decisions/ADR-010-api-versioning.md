# ADR-010 — Chiến lược phiên bản API (API Versioning)

**Status:** Proposed

## Mục đích
Chốt **chiến lược quản lý phiên bản (versioning)** cho toàn bộ bề mặt API của PhuQuocHub, để có thể phát triển hợp đồng (contract) mà không phá vỡ client hiện có — thống nhất giữa 4 kênh Web · Mobile · Public · Partner (xem [api.md §2](../api/api.md)).

## Bối cảnh
- [api.md](../api/api.md) đã quy ước **"Versioning qua prefix"** theo từng kênh:
  - Web/Mobile: `/api/v1`
  - Public API: `/public/v1` (client bên thứ ba, chỉ đọc, quota theo key)
  - Partner API: `/partner/v1` (đối tác, OAuth2 scope, ràng buộc theo SLA)
- Public/Partner là **client ngoài tầm kiểm soát**: không thể ép nâng cấp đồng loạt như app nội bộ → cần cam kết ổn định và lộ trình khai tử rõ ràng.
- Response envelope đã chuẩn hóa (`success/data/meta/error` — [api.md §4](../api/api.md)), tạo nền cho việc tiến hóa payload một cách cộng dồn (additive).

## Vấn đề cần giải quyết
1. **Đặt version ở đâu?** URI prefix (`/v1`) vs header (`Accept`/`X-Api-Version`) vs query param.
2. **Đơn vị version:** version toàn cục cho cả API hay version độc lập theo kênh?
3. **Thay đổi nào là breaking** (buộc lên `v2`) và thay đổi nào được phép cộng dồn trong `v1`.
4. **Chính sách khai tử (deprecation):** thời gian hỗ trợ tối thiểu, cách báo hiệu cho client.

## Quyết định
Chúng ta sẽ dùng **URI prefix versioning với version chính (major) duy nhất per kênh**, cụ thể:

1. **Version nằm trong đường dẫn**, chỉ đánh **major**: `/api/v1`, `/public/v1`, `/partner/v1`. Không dùng minor/patch trong URL.
2. **Tiến hóa cộng dồn (additive) trong cùng major**: thêm field, thêm endpoint, thêm giá trị enum *mới* → **không** tăng version. Client phải **bỏ qua field lạ** (tolerant reader).
3. **Chỉ tăng major khi breaking**: xóa/đổi tên field, đổi kiểu, đổi ngữ nghĩa, siết ràng buộc, đổi mã lỗi. Khi đó chạy song song `vN` và `vN+1` trong thời gian chuyển tiếp.
4. **Chính sách khai tử:** khi phát hành `vN+1`, `vN` được hỗ trợ tối thiểu **6 tháng** (Public/Partner ≥ 12 tháng theo SLA). Báo hiệu bằng header `Deprecation` + `Sunset` (RFC 8594) và ghi trong changelog.
5. **Version độc lập theo kênh:** `/public/v1` và `/partner/v1` có thể ở major khác `/api/v1` vì vòng đời khác nhau; không ép đồng bộ số.

## Alternatives Considered
- **Header-based versioning** (`Accept: application/vnd.phuquochub.v2+json`): sạch URL, đúng REST hơn, nhưng khó test/khó cache/khó debug bằng trình duyệt; rào cản cho dev Public API. → Không chọn.
- **Query param** (`?version=2`): dễ bị bỏ sót, gây nhập nhằng cache và khó cưỡng chế. → Không chọn.
- **Không version (chỉ additive mãi mãi):** bất khả thi khi buộc phải breaking; đẩy rủi ro sang client. → Không chọn.
- **SemVer đầy đủ trong URL** (`/v1.2.3`): quá chi tiết cho REST công khai, tăng chi phí bảo trì. → Không chọn.

## Tác động

### Tích cực
- Nhất quán với quy ước prefix đã có trong [api.md](../api/api.md) — không phải đổi thiết kế hiện tại.
- Client dễ đọc, dễ cache (CDN theo path cho `/public/v1`), dễ debug.
- Tách vòng đời Public/Partner khỏi app nội bộ → linh hoạt cam kết SLA.

### Tiêu cực
- Duy trì song song nhiều major khi chuyển tiếp → tăng chi phí kiểm thử và tài liệu.
- Cần kỷ luật phân loại "breaking vs additive" và quy trình changelog/`Sunset` nghiêm túc.

## Tài liệu liên quan
- [api.md §1–2 (Nguyên tắc, Đa kênh)](../api/api.md) · [security.md](../architecture/security.md) · [deployment.md](../architecture/deployment.md)

## Related ADR
- Không phụ thuộc ADR nào ở tầng dữ liệu; áp dụng cho toàn bộ bề mặt API.

## Notes
- Đề xuất: 2026-07-12. Điểm còn mở: cơ chế phát hành changelog cho Public API và ngưỡng SLA cụ thể cho Partner.
