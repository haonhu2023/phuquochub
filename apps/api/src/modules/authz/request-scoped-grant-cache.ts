import type { ScopedGrant } from './scoped-grant';

// ADR-019 D11 (Resource-Scoped Authorization, M0.1 — PDP Foundation). Nền tảng ghi nhớ theo phạm
// vi request — CHƯA đấu nối vào `AuthorizationService`/`PermissionsGuard` ở M0.1 (đấu nối thật
// thuộc M0.2, khi guard thực sự cần gọi `can()` nhiều lần cho `@RequirePermissions('A','B',...)`
// trong CÙNG một request). Khai báo TRƯỚC, đã test đầy đủ, để M0.2 chỉ cần TIÊU THỤ lớp này thay vì
// tự nghĩ lại cơ chế ghi nhớ.
//
// KHÔNG phải Nest `Scope.REQUEST` provider — đó là một lựa chọn ĐẤU NỐI (thuộc M0.2: ai tạo một
// instance mới cho mỗi request, qua middleware hay provider request-scoped, là quyết định của
// PEP). Lớp này CHỈ là một cấu trúc dữ liệu thuần: TẠO MỘT INSTANCE MỚI cho mỗi request là hợp
// đồng mà CALLER phải tự đảm bảo — bản thân class không có state cấp module/singleton nào, nên nó
// an toàn để dùng theo hợp đồng đó (D11 "cấm cache toàn cục khả biến").
//
// Cấm tuyệt đối theo D11: cache xuyên request, cache TTL, Redis, dependency mới, cache toàn cục
// khả biến. Đáp ứng: Map riêng của TỪNG instance (không static, không module-level), ghi nhớ đúng
// MỘT Promise đang bay cho mỗi userId — mọi lệnh gọi `load(userId)` đồng thời trong CÙNG instance
// (= CÙNG request, theo hợp đồng) nhận lại CHÍNH Promise đó, không nạp lại.
export class RequestScopedGrantCache {
  private readonly pending = new Map<string, Promise<ScopedGrant[]>>();

  constructor(private readonly loader: (userId: string) => Promise<ScopedGrant[]>) {}

  /**
   * Trả Promise ĐÃ ghi nhớ nếu có một lệnh nạp đang bay/đã xong cho `userId` này trong phạm vi
   * request hiện tại (instance hiện tại); nếu chưa, gọi `loader` đúng MỘT lần và ghi nhớ Promise đó
   * TRƯỚC khi nó resolve/reject (đảm bảo mọi lệnh gọi đồng bộ tiếp theo trong cùng tick — hoặc bất
   * kỳ tick nào trước khi Promise settle — đều nhận CHÍNH Promise này, không có cửa sổ race nào).
   *
   * Nếu `loader` reject, mục cache của userId đó bị XOÁ ngay (không giữ lại một Promise đã rejected
   * vĩnh viễn) — một lệnh `load()` sau đó (trong CÙNG instance/request) sẽ thử nạp lại từ đầu thay
   * vì kẹt trên lỗi cũ mãi mãi. Đây KHÔNG phải retry tự động (không lặp lại bên trong hàm này) — chỉ
   * đơn thuần không để một lần thất bại làm "nhiễm độc" vĩnh viễn slot cache của userId đó.
   */
  load(userId: string): Promise<ScopedGrant[]> {
    const existing = this.pending.get(userId);
    if (existing) {
      return existing;
    }

    const promise = this.loader(userId);
    this.pending.set(userId, promise);
    promise.catch(() => {
      // Chỉ xoá nếu ĐÚNG promise này vẫn còn trong cache (phòng trường hợp hiếm: load() bị gọi lại
      // sau khi reject nhưng TRƯỚC khi catch() này chạy, ghi đè bằng một promise mới — không được
      // xoá nhầm mục mới đó).
      if (this.pending.get(userId) === promise) {
        this.pending.delete(userId);
      }
    });
    return promise;
  }

  /** Số userId đang có kết quả (đang bay hoặc đã xong) ghi nhớ trong instance này — chỉ phục vụ test/observability. */
  get size(): number {
    return this.pending.size;
  }
}
