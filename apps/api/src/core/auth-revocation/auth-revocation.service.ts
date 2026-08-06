import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

// H-1 (Production Readiness Audit, 2026-08-06) — thu hồi access token.
//
// VẤN ĐỀ: access token là JWT stateless, `JwtAuthGuard` chỉ xác thực CHỮ KÝ nên một token đã cấp
// vẫn hợp lệ tới khi hết hạn (`JWT_ACCESS_TTL`, mặc định 900s) BẤT KỂ trạng thái người dùng đổi thế
// nào. Hệ quả THẬT đã đo được: thu hồi vai trò moderator của một user -> user đó vẫn giữ quyền
// moderator tới 15 phút.
//
// CƠ CHẾ: một "mốc thu hồi" (revocation epoch) trên Redis cho mỗi user. Mọi access token có `iat`
// TRƯỚC mốc đó bị coi là đã thu hồi. KHÔNG đổi định dạng JWT: `iat` đã có sẵn trong MỌI token
// (`@nestjs/jwt` -> `jsonwebtoken` tự thêm `iat` khi không đặt `noTimestamp`; `AuthModule` chỉ đặt
// `expiresIn`) — nên token cấp TRƯỚC khi tính năng này triển khai vẫn hoạt động, không cần migration
// token, không cần deploy đồng bộ.
//
// TTL của khoá = `jwt.accessTtl`. Sau khoảng đó, MỌI token cấp trước mốc thu hồi đều TỰ hết hạn nên
// mốc không còn mang thông tin gì — khoá tự tiêu, dung lượng là O(số user vừa bị thu hồi), KHÔNG
// phải O(tổng số user), và không cần job dọn dẹp.
//
// CHI PHÍ: đúng MỘT `GET` Redis cho mỗi request đã xác thực. KHÔNG truy vấn DB (Owner Decision:
// "no unnecessary DB lookup on every request"). Route `@Public()` thoát ra TRƯỚC khi chạm tới đây.
//
// ĐỘ PHÂN GIẢI 1 GIÂY (giới hạn nội tại, nêu thẳng): `iat` của JWT tính theo GIÂY (RFC 7519), nên
// mốc thu hồi cũng được làm tròn xuống giây và so sánh `iat < revokedAtSec`. Hệ quả: một token được
// cấp TRONG CÙNG một giây với lệnh thu hồi sẽ KHÔNG bị thu hồi (cửa sổ bỏ sót <= 1s). Đây là lựa
// chọn CÓ CHỦ ĐÍCH thay cho hướng ngược lại (so sánh theo mili-giây), vì hướng ngược lại sẽ từ chối
// SAI một token vừa được cấp hợp lệ ngay sau lệnh thu hồi (vd logout-all rồi đăng nhập lại trong
// cùng một giây) — hỏng chức năng còn tệ hơn cửa sổ bỏ sót 1 giây. Muốn xoá hẳn cửa sổ này thì phải
// thêm claim độ phân giải mili-giây vào token, tức ĐỔI định dạng JWT (Owner đã chốt: giữ nguyên).
@Injectable()
export class AuthRevocationService {
  private readonly logger = new Logger(AuthRevocationService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private key(userId: string): string {
    return `authrev:${userId}`;
  }

  /**
   * PRIMITIVE (Owner Decision D1-A): vô hiệu hoá NGAY mọi access token đã cấp cho `userId` trước
   * thời điểm gọi. Đây là hàm mà MỌI luồng tương lai cần thu hồi phiên PHẢI gọi — deactivate/ban
   * (`User.Ban` hiện đã seed nhưng CHƯA có endpoint nào), đổi/đặt lại mật khẩu (chưa có luồng nào).
   *
   * QUAN TRỌNG (Owner "security-side-effect rule"): KHÔNG nuốt lỗi Redis. Nếu ghi mốc thất bại,
   * hàm NÉM `ServiceUnavailableException` để caller (và người dùng cuối) biết việc thu hồi KHÔNG
   * xảy ra — im lặng ở đây sẽ tạo ra cảm giác an toàn giả. Caller nào đã ghi DB trước khi gọi hàm
   * này PHẢI tự nêu rõ rằng mutation DB có thể đã commit dù thu hồi thất bại (hai hệ thống khác
   * nhau, không có transaction chung) — xem `UsersService.assignRole/revokeRole`.
   *
   * @returns mốc thu hồi vừa ghi (epoch giây).
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const revokedAtSec = Math.floor(Date.now() / 1000);
    try {
      await this.redis.getClient().set(this.key(userId), String(revokedAtSec), 'EX', accessTtl);
    } catch (err) {
      this.logger.error(
        `Thu hồi access token THẤT BẠI cho user ${userId} — Redis không ghi được mốc thu hồi. ` +
          `Các access token hiện có của user này VẪN CÒN HIỆU LỰC tới khi hết hạn.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException(
        'Không thể thu hồi phiên đăng nhập ngay lúc này — vui lòng thử lại.',
      );
    }
    this.logger.log(`Đã thu hồi mọi access token của user ${userId} (mốc ${revokedAtSec}).`);
    return revokedAtSec;
  }

  /**
   * Đường GUARD: xác nhận token chưa bị thu hồi. Ném `UnauthorizedException` (401) khi bị thu hồi.
   *
   * FAIL CLOSED (Owner Decision D2): Redis lỗi -> TỪ CHỐI request (401) + log mức `error`, TUYỆT
   * ĐỐI không quay về "chỉ tin chữ ký". Lý do: đây là một kiểm soát bảo mật, và `/api/health` đã
   * báo Redis `down` nên orchestrator sẽ tự rút instance khỏi vòng phục vụ.
   *
   * PHÂN BIỆT MỨC LOG (Owner Decision D2): chỉ lỗi HẠ TẦNG/điều khiển (Redis không đọc được, giá
   * trị mốc hỏng, token thiếu `iat`) mới log `error`. Token bị thu hồi bình thường là một thất bại
   * xác thực THÔNG THƯỜNG — KHÔNG log error (nếu không, mỗi lần logout-all sẽ bơm rác vào log lỗi
   * và làm loãng tín hiệu thật).
   */
  async assertNotRevoked(userId: string, issuedAtSeconds: number | undefined): Promise<void> {
    let raw: string | null;
    try {
      raw = await this.redis.getClient().get(this.key(userId));
    } catch (err) {
      this.logger.error(
        `Kiểm tra thu hồi token THẤT BẠI cho user ${userId} — Redis không đọc được. ` +
          `Từ chối request (fail closed).`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new UnauthorizedException('Không xác minh được trạng thái phiên đăng nhập');
    }

    if (raw === null) {
      return; // Chưa từng thu hồi (hoặc mốc đã tự hết hạn) — token hợp lệ.
    }

    const revokedAtSec = Number(raw);
    if (!Number.isFinite(revokedAtSec)) {
      // Giá trị hỏng = lỗi điều khiển, KHÔNG phải thất bại xác thực thông thường -> log error.
      this.logger.error(
        `Mốc thu hồi của user ${userId} không phải số hợp lệ (${JSON.stringify(raw)}) — ` +
          `từ chối request (fail closed).`,
      );
      throw new UnauthorizedException('Không xác minh được trạng thái phiên đăng nhập');
    }

    if (issuedAtSeconds === undefined) {
      // Không có `iat` thì không thể so sánh với mốc thu hồi -> fail closed. Bất thường về điều
      // khiển (mọi token do TokenService cấp đều có `iat`), nên log error.
      this.logger.error(
        `Access token của user ${userId} thiếu claim 'iat' nên không thể đối chiếu mốc thu hồi — ` +
          `từ chối request (fail closed).`,
      );
      throw new UnauthorizedException('Không xác minh được trạng thái phiên đăng nhập');
    }

    if (issuedAtSeconds < revokedAtSec) {
      // Thất bại xác thực THÔNG THƯỜNG — KHÔNG log error.
      throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại');
    }
  }
}
