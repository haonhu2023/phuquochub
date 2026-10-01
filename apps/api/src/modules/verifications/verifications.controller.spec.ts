import { ForbiddenException } from '@nestjs/common';
import { VerificationsController } from './verifications.controller';
import { VerificationTargetType } from './verification.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Price verification ownership (2026-10-01, P0 permission audit, SeedPriceVerifyPermission).
// submit()/verify() bỏ @RequirePermissions tĩnh vì cần permission KHÁC NHAU tuỳ target_type —
// test này là nơi DUY NHẤT khoá lại hành vi OR thủ công đó, vì PermissionsGuard không chạy trong
// unit test (chỉ chạy qua e2e thật). Place/contact PHẢI giữ nguyên moderator-only tuyệt đối.
describe('VerificationsController — submit()/verify() OR permission (Verification.Verify | Price.Verify chỉ cho giá)', () => {
  type Ctor = ConstructorParameters<typeof VerificationsController>;
  let service: LooseMock<Ctor[0]>;
  let authz: LooseMock<Ctor[1]>;
  let controller: VerificationsController;

  beforeEach(() => {
    service = createMock<Ctor[0]>({ submit: jest.fn(), verify: jest.fn(), getById: jest.fn() });
    authz = createMock<Ctor[1]>({ can: jest.fn() });
    controller = new VerificationsController(service, authz);
  });

  describe('submit()', () => {
    it('target_type=price_history, chỉ giữ Price.Verify (không Verification.Verify) -> cho qua', async () => {
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Price.Verify'));
      const dto = { target_type: VerificationTargetType.PRICE_HISTORY, target_id: 'p1' } as Parameters<typeof controller.submit>[0];

      await controller.submit(dto, { sub: 'u1' } as Parameters<typeof controller.submit>[1]);

      expect(service.submit).toHaveBeenCalledWith(dto, 'u1');
    });

    it('target_type=place, chỉ giữ Price.Verify (KHÔNG Verification.Verify) -> 403, KHÔNG gọi service', async () => {
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Price.Verify'));
      const dto = { target_type: VerificationTargetType.PLACE, target_id: 'pl1' } as Parameters<typeof controller.submit>[0];

      await expect(
        controller.submit(dto, { sub: 'u1' } as Parameters<typeof controller.submit>[1]),
      ).rejects.toThrow(ForbiddenException);
      expect(service.submit).not.toHaveBeenCalled();
    });

    it('giữ Verification.Verify (moderator) -> cho qua bất kể target_type nào', async () => {
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Verification.Verify'));
      const dto = { target_type: VerificationTargetType.CONTACT, target_id: 'c1' } as Parameters<typeof controller.submit>[0];

      await controller.submit(dto, { sub: 'u1' } as Parameters<typeof controller.submit>[1]);

      expect(service.submit).toHaveBeenCalledWith(dto, 'u1');
    });

    it('không giữ quyền nào -> 403', async () => {
      authz.can.mockResolvedValue(false);
      const dto = { target_type: VerificationTargetType.PRICE_HISTORY, target_id: 'p1' } as Parameters<typeof controller.submit>[0];

      await expect(
        controller.submit(dto, { sub: 'u1' } as Parameters<typeof controller.submit>[1]),
      ).rejects.toThrow('Thiếu quyền: Verification.Verify');
    });
  });

  describe('verify()', () => {
    it('dòng hiện có là price_history, actor chỉ giữ Price.Verify -> đọc getById rồi cho qua', async () => {
      service.getById.mockResolvedValue({ id: 'v1', price_history_id: 'p1' });
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Price.Verify'));
      const dto = {} as Parameters<typeof controller.verify>[1];

      await controller.verify('v1', dto, { sub: 'u1' } as Parameters<typeof controller.verify>[2]);

      expect(service.getById).toHaveBeenCalledWith('v1');
      expect(service.verify).toHaveBeenCalledWith('v1', dto, 'u1');
    });

    it('dòng hiện có là place (price_history_id null), actor chỉ giữ Price.Verify -> 403, KHÔNG gọi service.verify', async () => {
      service.getById.mockResolvedValue({ id: 'v1', price_history_id: null });
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Price.Verify'));
      const dto = {} as Parameters<typeof controller.verify>[1];

      await expect(
        controller.verify('v1', dto, { sub: 'u1' } as Parameters<typeof controller.verify>[2]),
      ).rejects.toThrow(ForbiddenException);
      expect(service.verify).not.toHaveBeenCalled();
    });

    it('moderator (Verification.Verify) vẫn xác minh được dòng place như trước', async () => {
      service.getById.mockResolvedValue({ id: 'v1', price_history_id: null });
      authz.can.mockImplementation((_uid: string, perm: string) => Promise.resolve(perm === 'Verification.Verify'));
      const dto = {} as Parameters<typeof controller.verify>[1];

      await controller.verify('v1', dto, { sub: 'u1' } as Parameters<typeof controller.verify>[2]);

      expect(service.verify).toHaveBeenCalledWith('v1', dto, 'u1');
    });
  });
});
