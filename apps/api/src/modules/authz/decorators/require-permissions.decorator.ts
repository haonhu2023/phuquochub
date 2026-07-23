import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

// Khai báo permission mà endpoint yêu cầu (PEP). PDP đánh giá deny-by-default.
// vd @RequirePermissions('Category.Manage').
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
