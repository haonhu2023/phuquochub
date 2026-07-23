# PhuQuocHub — Xác thực & Phiên (Authentication)

> **Mục đích:** mô tả cách người dùng đăng nhập, cơ chế token/phiên và các biện pháp bảo mật liên quan. Đây là khung (outline) — bổ sung chi tiết luồng sau.

## 1. Các mục chính

### 1.1 Phương thức xác thực
- Local (email + mật khẩu).
- OAuth Google.
- (Tương lai) phương thức khác nếu cần.

### 1.2 Token & phiên
- **Access token**: JWT ngắn hạn (vd 15 phút), gửi qua `Authorization: Bearer`.
- **Refresh token**: lưu trong Redis, có thể thu hồi.
- Vòng đời & xoay vòng (rotation) refresh token.

### 1.3 Bảo mật mật khẩu
- Hash bằng bcrypt/argon2; chính sách độ mạnh; quên/đặt lại mật khẩu.

### 1.4 Thu hồi & vô hiệu hóa
- Đăng xuất (thu hồi refresh), blacklist, đăng xuất mọi thiết bị.

### 1.5 Chống lạm dụng
- Rate limit đăng nhập/đăng ký, khóa tạm khi thử sai nhiều lần.
- Không đưa dữ liệu nhạy cảm vào URL/query string.

### 1.6 Liên kết phân quyền
- Sau xác thực → gắn vai trò/claims cho RBAC (xem [rbac.md](./rbac.md)).

## 2. Ghi chú — nội dung bổ sung sau

- [ ] Sơ đồ luồng đăng nhập local & OAuth (sequence diagram).
- [ ] Luồng refresh token & xử lý hết hạn.
- [ ] Cấu trúc payload JWT (claims).
- [ ] Chính sách phiên (thời hạn, thiết bị, ghi nhớ đăng nhập).
- [ ] Xác thực email / chống bot khi đăng ký.

---

*Tài liệu liên quan: [rbac.md](./rbac.md), [api.md](../api/api.md), [architecture.md](../architecture/architecture.md)*
