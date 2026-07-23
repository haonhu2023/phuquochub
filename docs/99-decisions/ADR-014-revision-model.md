# ADR-014 — Mô hình phiên bản (Revision Model)

## Status
**Accepted** — 2026-07-12. *(Hồi sinh từ Superseded: quyết định `wiki_revisions` luôn đúng nhưng ADR từng bị rút khi tái cấu trúc register; nay ghi nhận Active để đúng nguyên tắc "mọi quyết định có ADR".)* Supersedes phác thảo `place_revisions` ([places.md §10](../data/modules/places.md)).

## Context
- `place_revisions` (places.md §10) là **phác thảo tối giản** ban đầu (place-only: `place_id, snapshot, change_note, edited_by`) — chính tài liệu này đã ghi "đã đổi tên `wiki_revisions` trong source.md §6".
- `wiki_revisions` (source.md §6) là thực thể phiên bản **đầy đủ, polymorphic** (`entity_type/entity_id, revision_number, parent_revision_id, snapshot, diff, origin, change_note, editor_id, status, reviewed_by`), có **trích nguồn** qua `source_attributions(entity_type='wiki_revision')`.
- Thực trạng: **toàn bộ** Workflow (WF-06/07/08/09/14/15), RBAC (`Revision.*`), API (`/places/:id/revisions`), AI (origin=`ai_generation`), ERD §2, product/* **đã dùng `wiki_revisions`**; `place_revisions` chỉ còn là tên cũ ở places.md + vài cờ ⚠️.
- Tầm nhìn "Wikipedia" cần lịch sử **thống nhất** cho Place và sau này Topic/Area/Business.

## Decision
Chuẩn hóa hoàn toàn về **`wiki_revisions`** (polymorphic) làm **thực thể phiên bản duy nhất**; **retire `place_revisions`**.

- Lịch sử của một Place = `wiki_revisions` với `entity_type='place'`, `entity_id=places.id`.
- Mở rộng loại nội dung mới (`topic, area, business…`) = thêm giá trị `entity_type`, **không đổi schema**.
- Toàn vẹn `entity_id` ở tầng ứng dụng (đa hình — **ngoại lệ ADR-003** cho tham chiếu lỏng/nhiều loại + audit, nhất quán `source_attributions`); **không cascade** — đúng bản chất audit log **bất biến** (giữ lịch sử kể cả khi entity bị archive/soft-delete).

## Alternatives Considered
- **A — Giữ `place_revisions` (place-only):** FK/cascade sạch nhưng đi ngược thiết kế hiện hành + không version Topic/Area/Business; phải viết lại Workflow/RBAC/Product. → **Loại.**
- **C — Revision generic (`revisions`):** về bản chất **giống** `wiki_revisions` polymorphic; chỉ khác **tên** → đổi tên tốn kém, mất ngữ nghĩa "citation/Wikipedia". → Không chọn.
- **D — Riêng từng entity (`PlaceRevision/BusinessRevision/…`):** toàn vẹn FK mạnh nhất nhưng **nhân bản N bảng + logic**, phá hàng chờ kiểm duyệt/recent-changes thống nhất (phải UNION N bảng). → **Loại** (over-engineer cho mô hình wiki).
- **B — `wiki_revisions` polymorphic (chọn):** đã là chuẩn đang dùng; audit thống nhất; mở rộng không đổi schema.

## Consequences
### Positive
- Một lịch sử phiên bản thống nhất cho mọi nội dung; audit trail đầy đủ + trích nguồn (Wikipedia model).
- **Không phải sửa** Workflow/RBAC/API/AI/Product (đã dùng `wiki_revisions`).
- Mở rộng Topic/Area/Business không đổi schema; gỡ ⚠️ chặn Prisma cho Revision.

### Negative / đánh đổi
- Polymorphic → không FK/cascade gốc từ entity (Prisma biểu diễn bằng `entity_type + entity_id`, ràng buộc ở tầng app).
- `place_revisions` cũ trở thành **legacy** (không dùng); cần ghi rõ để tránh nhầm.

## Migration
- **Schema:** không có bảng `place_revisions` thực tế (mới ở mức thiết kế) → **không cần migrate dữ liệu**; chỉ **retire tên** khỏi tài liệu.
- ✅ **B6 đóng (kiểm chứng 2026-07-13):** rà soát **toàn repository** — mọi lần xuất hiện `place_revisions`/`PlaceRevision` đều chỉ còn là **ghi chú legacy/retire**; 5 file đồng bộ (database.md, erd.md, api.md, workflow.md, ADR-014) đều trỏ về `wiki_revisions` là thực thể phiên bản **duy nhất**.
- **Tài liệu:** places.md §10 → con trỏ tới `wiki_revisions`; database.md §11 catalog ⚠️ → `wiki_revisions` ✅; erd.md §4 gỡ mục tranh chấp; source.md §6 giữ câu "tiến hóa từ place_revisions" như **ghi chú legacy**.
- **Khi hiện thực:** nếu về sau có dữ liệu `place_revisions` (không có ở giai đoạn này), map `place_id → (entity_type='place', entity_id)`, `edited_by → editor_id`, bổ sung `revision_number/origin/status`.

## References
- [source.md §6](../data/modules/source.md) (thiết kế `wiki_revisions`) · [places.md §10](../data/modules/places.md) · [database.md §11](../data/database.md) · [erd.md §2/§4](../data/erd.md) · [rbac.md](../security/rbac.md) (`Revision.*`) · workflow WF-06/07/08/09/14/15
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (ngoại lệ polymorphic) · [ADR-005](ADR-005-contact-entity.md) · [ADR-006](ADR-006-price-history.md) (cùng mẫu polymorphic)
- Nguồn: Blocker B6 trong rà soát docs/ chuẩn bị Prisma. Quyết định 2026-07-12 (Chief Data Architect).
