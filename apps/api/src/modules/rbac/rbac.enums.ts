// Enum cho RBAC — khớp prisma/schema.prisma (RolePermEffect, ScopeType).

/** Hiệu lực ánh xạ Role→Permission. `deny` thắng `allow` (explicit deny). */
export enum RolePermEffect {
  ALLOW = 'allow',
  DENY = 'deny',
}

/** Phạm vi gán vai trò cho principal. */
export enum ScopeType {
  GLOBAL = 'global',
  MANAGED = 'managed',
  OWN = 'own',
}
