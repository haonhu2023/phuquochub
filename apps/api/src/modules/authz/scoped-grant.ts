// ADR-019 D12 (Resource-Scoped Authorization, M0.1 — PDP Foundation).
//
// Hình dạng trả về của truy vấn recursive CTE một-câu (UserRolesRepository.getScopedGrants()) —
// thay thế chuỗi 3 truy vấn cũ (findActiveRoleIds → expandWithAncestors → getPermissionsForRoles)
// vốn ĐÁNH MẤT ràng buộc scope ngay ở bước đầu. Mỗi ScopedGrant giữ nguyên `scopeType`/`businessId`
// của DÒNG user_roles GỐC đã sinh ra nó, xuyên suốt qua kế thừa DAG — đây chính là thông tin
// `getEffectivePermissions()` cũ làm phẳng và vứt bỏ.
export interface ScopedGrant {
  /** vd 'Place.Edit.Managed' | 'Place.Edit.Any' | '*' | 'Media.Moderate' (không hậu tố scope). */
  readonly code: string;
  readonly effect: 'allow' | 'deny';
  /** scope_type của DÒNG user_roles gốc (trước khi mở rộng DAG) — 'global' | 'managed' | 'own'. */
  readonly scopeType: 'global' | 'managed' | 'own';
  /** business_id của DÒNG user_roles gốc — null nếu scope_type='global'. */
  readonly businessId: string | null;
}
