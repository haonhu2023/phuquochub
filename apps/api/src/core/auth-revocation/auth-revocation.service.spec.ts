import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthRevocationService } from './auth-revocation.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// H-1 — Production Readiness Audit. Cơ chế thu hồi access token: mốc thu hồi trên Redis + đối chiếu
// `iat`. Test ở đây bám đúng năm cam kết của thiết kế: (1) không đổi định dạng JWT (chỉ dùng `iat`
// vốn đã có), (2) TTL khoá = accessTtl nên tự tiêu, (3) fail CLOSED khi Redis lỗi, (4) chỉ lỗi hạ
// tầng mới log `error`, (5) token cấp SAU mốc vẫn hợp lệ.
describe('AuthRevocationService', () => {
  type Deps = ConstructorParameters<typeof AuthRevocationService>;
  let redis: LooseMock<Deps[0]>;
  let config: LooseMock<Deps[1]>;
  let client: { set: jest.Mock; get: jest.Mock };
  let service: AuthRevocationService;

  beforeEach(() => {
    client = { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null) };
    redis = createMock<Deps[0]>({ getClient: jest.fn().mockReturnValue(client) });
    config = createMock<Deps[1]>({ get: jest.fn().mockReturnValue(900) });
    service = new AuthRevocationService(redis, config);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('revokeAllForUser', () => {
    it('ghi mốc thu hồi (epoch GIÂY) với TTL = jwt.accessTtl — khoá tự tiêu, không cần job dọn', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_500_123);

      const revokedAt = await service.revokeAllForUser('user-1');

      // 1_700_000_500_123 ms -> 1_700_000_500 s (làm tròn xuống giây, khớp độ phân giải của `iat`).
      expect(revokedAt).toBe(1_700_000_500);
      expect(client.set).toHaveBeenCalledWith('authrev:user-1', '1700000500', 'EX', 900);
    });

    it('TTL lấy ĐÚNG từ cấu hình (không hardcode 900)', async () => {
      config.get.mockReturnValue(60);
      await service.revokeAllForUser('user-1');
      expect(client.set).toHaveBeenCalledWith('authrev:user-1', expect.any(String), 'EX', 60);
    });

    it('Redis lỗi -> NÉM ServiceUnavailableException (KHÔNG nuốt lỗi) + log error', async () => {
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      client.set.mockRejectedValue(new Error('READONLY'));

      await expect(service.revokeAllForUser('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // Owner "security-side-effect rule": thất bại phải nhìn thấy được, không im lặng.
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('assertNotRevoked', () => {
    it('chưa từng thu hồi (khoá không tồn tại) -> hợp lệ', async () => {
      client.get.mockResolvedValue(null);
      await expect(service.assertNotRevoked('user-1', 1_700_000_000)).resolves.toBeUndefined();
    });

    it('token cấp TRƯỚC mốc -> 401 (đã thu hồi)', async () => {
      client.get.mockResolvedValue('1700000500');
      await expect(service.assertNotRevoked('user-1', 1_700_000_499)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('token cấp SAU mốc -> vẫn hợp lệ (đăng nhập lại sau logout-all phải dùng được)', async () => {
      client.get.mockResolvedValue('1700000500');
      await expect(service.assertNotRevoked('user-1', 1_700_000_501)).resolves.toBeUndefined();
    });

    it('token cấp CÙNG GIÂY với mốc -> hợp lệ (chọn bỏ sót <=1s thay vì từ chối sai token mới)', async () => {
      client.get.mockResolvedValue('1700000500');
      await expect(service.assertNotRevoked('user-1', 1_700_000_500)).resolves.toBeUndefined();
    });

    it('token bị thu hồi KHÔNG log error (chỉ là thất bại xác thực thông thường)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      client.get.mockResolvedValue('1700000500');

      await expect(service.assertNotRevoked('user-1', 1_700_000_000)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // Nếu log error ở đây, mỗi lần logout-all sẽ bơm rác vào log lỗi và làm loãng tín hiệu thật.
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('Redis lỗi -> FAIL CLOSED 401 + log error (KHÔNG quay về chỉ tin chữ ký)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      client.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.assertNotRevoked('user-1', 1_700_000_000)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(logSpy).toHaveBeenCalled();
    });

    it('mốc hỏng (không phải số) -> fail closed 401 + log error', async () => {
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      client.get.mockResolvedValue('not-a-number');

      await expect(service.assertNotRevoked('user-1', 1_700_000_000)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(logSpy).toHaveBeenCalled();
    });

    it('token thiếu claim iat -> fail closed 401 + log error (không thể đối chiếu mốc)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      client.get.mockResolvedValue('1700000500');

      await expect(service.assertNotRevoked('user-1', undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(logSpy).toHaveBeenCalled();
    });

    it('KHÔNG đọc Redis khi chưa cần: mỗi lần kiểm tra đúng MỘT lệnh GET (không truy vấn DB nào)', async () => {
      client.get.mockResolvedValue(null);
      await service.assertNotRevoked('user-1', 1_700_000_000);
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(client.get).toHaveBeenCalledWith('authrev:user-1');
    });
  });
});
