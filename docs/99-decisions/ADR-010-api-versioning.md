# ADR-010 — Chiến lược phiên bản API (API Versioning)

**Status:** Accepted (2026-07-24)

> **Accepted 2026-07-24** by owner decision OD-B1 (`docs/delivery/decisions/OWNER-DECISIONS-2026-07-24.md`).
> Adjudicated alongside the list-pagination contract (GAP-05/GAP-10). The versioning strategy below
> (URI-prefix major versioning, additive-within-major, deprecation via `Deprecation`/`Sunset`) is
> now the governing policy for evolving every API contract. The list-pagination addendum below
> applies that policy to `GET /api/places`.

## Addendum — List pagination contract (GAP-05 / GAP-10, accepted 2026-07-24)

**Decision context.** `openapi.yaml listPlaces` historically advertised `status`/`sort`/`cursor`
parameters that the implementation never built; the runtime uses OFFSET `page`/`limit` and rejects
unknown params with HTTP 400 (`whitelist + forbidNonWhitelisted`). Owner decision B1-A ratifies the
**existing offset behaviour** as the authoritative contract rather than building cursor pagination.

**Selected offset-pagination contract (`GET /api/places`).**
- `page`: integer ≥ 1, default **1**. Invalid (`< 1` or non-integer) → **HTTP 400** (`VALIDATION_ERROR`).
- `limit`: integer ≥ 1, default **20**, values `> 100` are **clamped to 100** (response still 200, `meta.pageSize` reflects the clamp). Invalid (`< 1` or non-integer) → **HTTP 400**.
- Ordering: **fixed server-side** `rating_avg DESC NULLS LAST, created_at DESC, id ASC` (unique final key ⇒ deterministic paging). Client cannot control ordering.
- Response pagination metadata (`meta`): `timestamp`, `page`, `pageSize`, `total`, `totalPages`.
- Unknown / unsupported params (incl. deprecated `status`/`sort`/`cursor`) → **HTTP 400**.

**Compatibility rules.** This is a `v1` clarification, fully backward compatible — no request that
previously succeeded now fails, and no response shape changes. Correcting the documented error code
(422 → 400 for invalid `page`/`limit`/`price_range` on this endpoint) aligns the contract with the
long-standing runtime; it is a documentation correction, not a behaviour change.

**Future cursor-pagination policy.** Cursor/keyset pagination is **explicitly not adopted** for `v1`.
If introduced later it MUST arrive as a **new major version** (`/api/v2` or a `/public/v1` variant)
per this ADR's additive-vs-breaking rules — never by silently repurposing the offset params.

**Migration / versioning expectations.** The deprecated `status`/`sort`/`cursor` params are RETAINED
in the OpenAPI as `deprecated: true` (returning 400), not deleted, because no client registry exists
to rule out external consumers (obligation carried from OD-F-6). Their removal is a **breaking change**
deferred to the next major version, signalled via `Deprecation` + `Sunset` headers with the ≥ 6-month
window defined below.

**Consequences.** The public list contract is now unambiguous and matches runtime; GAP-05/GAP-10 are
resolved by decision. The cost is carrying three documented-but-deprecated params until a major bump.

**Rejected alternatives (for the list contract).** B1-B (implement cursor pagination) — rejected as
premature and breaking at current scale. B1-C (delete the deprecated params immediately) — rejected
because external consumers cannot be ruled out without version control history at the time of OD-F-6.

---


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
