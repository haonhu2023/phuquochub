import { apiGetAuth } from '@/lib/http';
import { capabilitiesFromRoles, NO_CAPABILITIES, type UserCapabilities } from '../capabilities';

// `GET /users/me` — endpoint ĐÃ TỒN TẠI từ trước (users.controller.ts `getMe`), đã trả `roles`.
// Milestone Operator Bootstrap chỉ bắt đầu ĐỌC nó ở frontend; không thêm endpoint, không thêm
// trường nào vào response.
interface MeResponse {
  id: string;
  email: string;
  display_name: string;
  roles?: unknown[];
}

/**
 * Năng lực hiển thị của người dùng hiện tại. Lỗi mạng/401/403 -> KHÔNG có năng lực nào (ẩn hết lối
 * vào) thay vì ném: một lỗi tạm thời khi nạp menu không được phép làm hỏng cả trang bảng điều
 * khiển, và ẩn nhầm là hướng sai an toàn (backend vẫn chặn thật).
 */
export async function fetchCapabilities(accessToken: string): Promise<UserCapabilities> {
  try {
    const me = await apiGetAuth<MeResponse>('/users/me', accessToken, { cache: 'no-store' });
    return capabilitiesFromRoles(me.roles);
  } catch {
    return NO_CAPABILITIES;
  }
}
