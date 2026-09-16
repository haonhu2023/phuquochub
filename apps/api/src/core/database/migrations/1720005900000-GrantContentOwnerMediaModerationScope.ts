import { MigrationInterface, QueryRunner } from 'typeorm';

// content_owner — quyền kiểm duyệt ẢNH của NGƯỜI KHÁC (2026-09-17), không chỉ tự duyệt ảnh mình.
//
// Bối cảnh: `SeedContentOwnerModerationPermissions1720005800000` chỉ cấp `Media.Moderate.Own`
// (ngoại lệ INV-12 hẹp — chỉ tự duyệt ảnh CHÍNH MÌNH tải lên). Owner làm rõ thêm: content_owner
// phải "vừa tự duyệt nội dung của mình, vừa xử lý đóng góp cần duyệt của người khác trong phạm vi
// quản trị nội dung" — tức là cần MỘT quyền THỰC SỰ khác, không phải mở rộng ý nghĩa của
// `Media.Moderate.Own`.
//
// LỰA CHỌN THIẾT KẾ (chủ ý, không phải mặc định): đặt `content_owner` làm con của `moderator`
// trong role_parents đã bị LOẠI BỎ — `moderator` giữ trực tiếp 23 permission (xem migration seed
// gốc), trong đó có Role liên quan tới Booking.Cancel/Confirm/MarkExpired, Verification.Verify/
// Reject, Place.Approve/Archive/Merge, Event.Approve/Archive, Business.Verify, Search.Reindex,
// Category.Manage, Availability.Manage — không cái nào trong số đó là "quản trị NỘI DUNG" theo
// nghĩa owner mô tả (địa điểm/khách sạn, ảnh, bản dịch). Kế thừa cả moderator chỉ để lấy
// `Media.Moderate` sẽ cấp thêm 22 khả năng KHÔNG được yêu cầu — đúng thứ owner nói rõ "không kế
// thừa cả moderator chỉ để lấy một quyền".
//
// Thay vào đó, cấp TRỰC TIẾP đúng hai permission cần cho "quản trị nội dung ảnh":
//   1) Media.Moderate (KHÔNG có hậu tố .Own, cùng permission moderator giữ) — quyết định (duyệt/
//      từ chối/dismiss) trên MỌI case kiểm duyệt ảnh, không chỉ ảnh content_owner tự tải lên. Route
//      quyết định (`POST /moderation/cases/:id/decide`) không có @RequirePermissions tĩnh — quyền
//      kiểm tra ĐỘNG theo target_type trong ModerationService, nên permission này áp dụng đúng cho
//      nhánh Media, không phải Review (không cấp Review.Moderate — nhận xét: người dùng viết review
//      không phải "nội dung" content_owner tạo ra hay được giao quản trị theo yêu cầu ban đầu).
//   2) Moderation.Queue.View — CẦN để thấy danh sách case đang chờ trước khi quyết định được (không
//      có quyền này, content_owner có thể `decide` một case nếu biết ID nhưng không cách nào TỰ
//      TÌM ra case đó qua UI/API — "xử lý đóng góp cần duyệt của người khác" đòi hỏi nhìn thấy hàng
//      chờ trước). Route CHỈ ĐỌC (`GET /moderation/cases`, `GET /moderation/cases/:id`).
//
// AN TOÀN với INV-12 exact-match (moderation.service.ts's canSelfApproveOwnMedia()): cấp thêm
// `Media.Moderate` (plain) cho content_owner KHÔNG làm hỏng ngoại lệ exact-match đã xây — allow-list
// của content_owner giờ chứa CẢ HAI chuỗi `'Media.Moderate'` VÀ `'Media.Moderate.Own'`;
// `canSelfApproveOwnMedia()` vẫn kiểm tra `allow.includes('Media.Moderate.Own')` (so khớp chuỗi
// chính xác, không phải grantSatisfies) nên vẫn đúng cho content_owner (có) và vẫn đúng cho một
// moderator thường chỉ giữ `Media.Moderate` plain (không có, vẫn 403 khi tự duyệt — xem
// moderation.service.spec.ts's test "moderator thường vẫn không tự duyệt" cho hồi quy này).
//
// KHÔNG cấp Place.Approve (duyệt địa điểm MỚI tạo) — phạm vi "quản trị nội dung" owner mô tả xoay
// quanh khách sạn/địa điểm ĐÃ publish (ảnh, mô tả), không phải quy trình duyệt-tạo-địa-điểm-mới,
// một quyết định sản phẩm khác. Cố tình để ngoài, không phải quên.
export class GrantContentOwnerMediaModerationScope1720005900000 implements MigrationInterface {
  name = 'GrantContentOwnerMediaModerationScope1720005900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      ['content_owner', ['Media.Moderate', 'Moderation.Queue.View']],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions"
       WHERE "role_id" = (SELECT id FROM "roles" WHERE code = 'content_owner')
         AND "permission_id" IN (SELECT id FROM "permissions" WHERE code = ANY($1))`,
      [['Media.Moderate', 'Moderation.Queue.View']],
    );
  }
}
