// ADR-019 D3/D4/D5 (Resource-Scoped Authorization, M0.1 — PDP Foundation). Pure type contracts
// only. KHÔNG có decorator function, KHÔNG có resolver class/token nào ở đây — cả hai thuộc M0.2
// (PEP + Resolvers + Rollout, xem ADR-019 D15). File này chỉ khai báo hình dạng mà PDP
// (AuthorizationService) và, sau này, PermissionsGuard cùng dùng chung.

/**
 * D3 — ĐÚNG bốn trường. `resourceType`/`resourceId` là danh tính (mang theo cho audit/log và cho
 * chiều scope tương lai); `businessId`/`ownerId` là hai chiều scope THỰC SỰ tồn tại trong schema
 * hôm nay (`user_roles.business_id`, và chiều tự-sở-hữu ngầm định). Một chiều scope mới
 * (`organizationId`/`tenantId`) được thêm vào đây theo kiểu CỘNG THÊM, không phá vỡ consumer nào.
 */
export interface AuthorizationContext {
  /** lowercase, khớp quy ước owner_type/entity_type sẵn có (vd 'place', 'contact', 'price'). */
  readonly resourceType: string;
  readonly resourceId: string;

  /** Chiều scope cho grant `Managed`. ADR-015 Model A: businessId === places.id. */
  readonly businessId: string | null;

  /** Chiều scope cho grant `Own`. */
  readonly ownerId: string | null;
}

/**
 * D2 — phân giải ngữ cảnh LƯỜI (lazy): PDP chỉ gọi provider này ở "đường chậm" (khi không có grant
 * context-free nào thỏa permission). Trả `null` => DENY (INV-A4). Ném lỗi => DENY (INV-A5, caller
 * PHẢI tự bắt — `evaluateScopedAccess` làm việc này, xem scoped-authorization.util.ts).
 */
export type AuthorizationContextProvider = () => Promise<AuthorizationContext | null>;

/** D5 — input cho một AuthorizationContextResolver. */
export interface AuthorizationContextResolverInput {
  readonly resourceId: string;
  readonly resourceType: string;
  readonly userId: string;
}

/**
 * D5 — resolver interface. Triển khai CỤ THỂ (identity/contact/price/…) và token DI của chúng
 * thuộc M0.2 — KHÔNG khai báo ở đây. Contract này tồn tại trong M0.1 chỉ để PDP (và các unit test
 * của nó) có một hình dạng ổn định để lập trình chống lại, trước khi resolver thật nào tồn tại.
 */
export interface AuthorizationContextResolver {
  /**
   * Trả về context đầy đủ, hoặc null khi không phân giải được tài nguyên (không tồn tại, đã xoá
   * mềm, hoặc không gắn với business nào). PHẢI thuần (không side effect) và TUYỆT ĐỐI KHÔNG cưỡng
   * chế chính sách — chỉ phân giải danh tính.
   */
  resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null>;
}

/**
 * D4 — khoá metadata mà `@AuthorizationContext(...)` (decorator, M0.2) sẽ ghi và
 * `PermissionsGuard` (M0.2) sẽ đọc, cùng ngữ nghĩa gộp `reflector.getAllAndOverride` đang dùng cho
 * `PERMISSIONS_KEY`. Khai báo TRƯỚC ở đây (hằng số chuỗi, không hành vi) để M0.2 không phải phát
 * minh lại; bản thân decorator KHÔNG được implement trong M0.1.
 */
export const AUTHZ_CONTEXT_KEY = 'authorizationContext';
