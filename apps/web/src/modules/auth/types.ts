// Kiểu dữ liệu Auth phía FE. Wire format (API) là snake_case theo openapi.yaml;
// ở FE ta chuẩn hóa về camelCase (coding-standard §2) tại lớp api.

/** Hồ sơ người dùng công khai (đã map từ PublicUser snake_case của API). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Cặp token + hạn dùng, đã tính mốc hết hạn tuyệt đối (epoch ms). */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Mốc hết hạn access token (epoch ms) — suy ra từ expires_in lúc nhận. */
  expiresAt: number;
}

/** Phiên đăng nhập lưu ở client (tokens + user). */
export interface AuthSession extends AuthTokens {
  user: AuthUser;
}
