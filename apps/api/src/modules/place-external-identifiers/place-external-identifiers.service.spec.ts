import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from './place-external-identifiers.enums';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuditService } from '../../core/audit/audit.service';

function makeIdentifier(overrides: Partial<PlaceExternalIdentifier> = {}): PlaceExternalIdentifier {
  const row = new PlaceExternalIdentifier();
  Object.assign(row, {
    id: 'ext-1',
    placeId: 'place-1',
    provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
    externalId: 'ChIJ-existing',
    isPrimary: true,
    sourceId: null,
    evidenceId: null,
    verifiedAt: null,
    ...overrides,
  });
  return row;
}

describe('PlaceExternalIdentifiersService', () => {
  let service: PlaceExternalIdentifiersService;
  let repo: jest.Mocked<PlaceExternalIdentifiersRepository>;
  let dataSource: jest.Mocked<DataSource>;
  let audit: jest.Mocked<AuditService>;
  let managerQuery: jest.Mock;

  beforeEach(() => {
    repo = {
      findByProviderAndExternalId: jest.fn(),
      findByPlaceAndProvider: jest.fn(),
      listByPlace: jest.fn(),
      create: jest.fn((data) => Object.assign(new PlaceExternalIdentifier(), data)),
      save: jest.fn(async (row) => row),
    } as unknown as jest.Mocked<PlaceExternalIdentifiersRepository>;

    // Mô phỏng dataSource.transaction(cb) — chạy cb với một "manager" giả, chỉ cần hỗ trợ .query()
    // (advisory lock gọi qua manager.query ngay dòng đầu withPlaceProviderLock). Repo đã mock ở
    // trên bỏ qua manager (không phân biệt gọi với/không manager) — đủ để test LOGIC, việc khoá
    // advisory lock THẬT (transaction/Postgres thật) được chứng minh ở e2e spec riêng.
    managerQuery = jest.fn().mockResolvedValue(undefined);
    const fakeManager = { query: managerQuery } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn((cb: (manager: EntityManager) => Promise<unknown>) => cb(fakeManager)),
    } as unknown as jest.Mocked<DataSource>;

    audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;

    service = new PlaceExternalIdentifiersService(repo, dataSource, audit);
  });

  describe('ensureIdentifier', () => {
    it('inserts a new row when the (provider, externalId) pair does not exist', async () => {
      repo.findByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.ensureIdentifier({
        placeId: 'place-vinwonders',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-vinwonders',
        sourceId: 'src-1',
        evidenceId: null,
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.placeId).toBe('place-vinwonders');
      expect(result.externalId).toBe('ChIJ-vinwonders');
    });

    it('is idempotent — same place, same provider, same external id returns the existing row without a second write', async () => {
      const existing = makeIdentifier({ placeId: 'place-vinwonders', externalId: 'ChIJ-vinwonders' });
      repo.findByProviderAndExternalId.mockResolvedValue(existing);

      const result = await service.ensureIdentifier({
        placeId: 'place-vinwonders',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-vinwonders',
      });

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects mapping the same external id to a different place (identity conflict, not silent overwrite)', async () => {
      const existing = makeIdentifier({ placeId: 'place-vinwonders', externalId: 'ChIJ-shared' });
      repo.findByProviderAndExternalId.mockResolvedValue(existing);

      await expect(
        service.ensureIdentifier({
          placeId: 'place-honthom',
          provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
          externalId: 'ChIJ-shared',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('defaults isPrimary to true and stores null source/evidence when not provided', async () => {
      repo.findByProviderAndExternalId.mockResolvedValue(null);
      const result = await service.ensureIdentifier({
        placeId: 'place-1',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-new',
      });
      expect(result.isPrimary).toBe(true);
      expect(result.sourceId).toBeNull();
      expect(result.evidenceId).toBeNull();
    });
  });

  describe('listByPlace', () => {
    it('delegates to the repository', async () => {
      const rows = [makeIdentifier()];
      repo.listByPlace.mockResolvedValue(rows);
      await expect(service.listByPlace('place-1')).resolves.toBe(rows);
      expect(repo.listByPlace).toHaveBeenCalledWith('place-1');
    });
  });

  describe('findVerifiedPrimaryGooglePlaceId — quy tắc "đủ điều kiện công khai"', () => {
    it('không có identifier nào cho place → null (record chưa có ID vẫn hoạt động)', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('CÓ identifier nhưng verifiedAt=null (vừa nhập qua dashboard, chưa ai xác minh) → null, KHÔNG coi là đã xác minh', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(makeIdentifier({ verifiedAt: null }));
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('CÓ identifier, verifiedAt khác null nhưng isPrimary=false → null', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(makeIdentifier({ verifiedAt: new Date('2026-10-16'), isPrimary: false }));
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('identifier đủ điều kiện (isPrimary=true, verifiedAt khác null) → trả externalId thật', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(
        makeIdentifier({ externalId: 'ChIJ-qualified', isPrimary: true, verifiedAt: new Date('2026-10-16') }),
      );
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBe('ChIJ-qualified');
    });
  });

  describe('upsertPrimaryGooglePlaceId — đường ghi dashboard (KHÁC ensureIdentifier)', () => {
    it('khoá advisory (place+provider) trong một transaction trước khi đọc/ghi gì', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      repo.findByProviderAndExternalId.mockResolvedValue(null);

      await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-new' });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1, hashtext($2))', [2, 'place-1:GOOGLE_PLACES']);
    });

    it('place chưa có identifier nào → tạo mới, verifiedAt luôn null', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      repo.findByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-new', sourceId: 'src-1' });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.externalId).toBe('ChIJ-new');
      expect(result.verifiedAt).toBeNull();
      expect(result.isPrimary).toBe(true);
    });

    it('lưu lặp CÙNG giá trị, KHÔNG gửi source/evidence mới → no-op thật, không ghi DB (idempotent)', async () => {
      const existing = makeIdentifier({ placeId: 'place-1', externalId: 'ChIJ-same' });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-same' });

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.findByProviderAndExternalId).not.toHaveBeenCalled();
    });

    it('lưu lặp CÙNG giá trị ID, CÓ gửi source/evidence mới → cập nhật source/evidence, KHÔNG đụng verifiedAt đã xác nhận', async () => {
      const existing = makeIdentifier({
        placeId: 'place-1',
        externalId: 'ChIJ-same',
        sourceId: 'src-old',
        verifiedAt: new Date('2026-10-01'),
      });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-same', sourceId: 'src-new' });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.sourceId).toBe('src-new');
      expect(result.verifiedAt).toEqual(new Date('2026-10-01')); // KHÔNG mất xác nhận đã có
    });

    it('sửa sang ID KHÁC cho CÙNG place → UPDATE hàng đã có tại chỗ, KHÔNG insert hàng thứ hai, verifiedAt reset về null', async () => {
      const existing = makeIdentifier({
        id: 'ext-1',
        placeId: 'place-1',
        externalId: 'ChIJ-old',
        sourceId: 'src-old',
        evidenceId: 'ev-old',
        verifiedAt: new Date('2026-10-01'),
      });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);
      repo.findByProviderAndExternalId.mockResolvedValue(null); // ID mới chưa ai dùng

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-corrected' });

      expect(repo.create).not.toHaveBeenCalled(); // KHÔNG tạo hàng mới
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(existing, expect.anything()); // cùng instance, chỉ sửa field tại chỗ
      expect(result.id).toBe('ext-1'); // vẫn là hàng cũ, không phải hàng mới
      expect(result.externalId).toBe('ChIJ-corrected');
      expect(result.verifiedAt).toBeNull(); // xác minh cũ gắn với ID cũ, không tự áp dụng cho ID mới
      expect(result.sourceId).toBeNull(); // KHÔNG mang nguồn của ID cũ sang như thể vẫn hợp lệ
      expect(result.evidenceId).toBeNull();
    });

    it('ID mới đã thuộc place KHÁC → từ chối, không ghi gì (không áp định danh của Bãi Sao cho địa điểm khác)', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      repo.findByProviderAndExternalId.mockResolvedValue(makeIdentifier({ placeId: 'place-other', externalId: 'ChIJ-taken' }));

      await expect(
        service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-taken' }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmGooglePlaceId — xác nhận hồ sơ Google khớp địa điểm', () => {
    it('chưa có identifier nào → NotFoundException, không ghi gì', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      await expect(service.confirmGooglePlaceId({ placeId: 'place-1', actorId: 'user-1' })).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('CÓ identifier, CHƯA xác nhận → set verifiedAt = bây giờ, ghi audit với actor/thời điểm', async () => {
      const existing = makeIdentifier({ verifiedAt: null });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.confirmGooglePlaceId({ placeId: 'place-1', actorId: 'user-mod-1' });

      expect(result.verifiedAt).not.toBeNull();
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'place_external_identifier.verified',
          entityType: 'place_external_identifier',
          actorId: 'user-mod-1',
          permission: 'PlaceExternalIdentifier.Verify',
        }),
      );
    });

    it('đã xác nhận TỪ TRƯỚC → confirm lại vẫn cập nhật verifiedAt (đối chiếu lại định kỳ hợp lệ), vẫn ghi audit', async () => {
      const oldDate = new Date('2026-10-01T00:00:00Z');
      const existing = makeIdentifier({ verifiedAt: oldDate });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.confirmGooglePlaceId({ placeId: 'place-1', actorId: 'user-mod-2' });

      expect(result.verifiedAt).not.toEqual(oldDate);
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it('kèm source_id/evidence_id của người xác nhận → ghi đè đúng field đó', async () => {
      const existing = makeIdentifier({ sourceId: 'src-proposer', evidenceId: null });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.confirmGooglePlaceId({ placeId: 'place-1', actorId: 'user-mod-1', evidenceId: 'ev-confirmer' });

      expect(result.sourceId).toBe('src-proposer'); // không gửi -> giữ nguyên
      expect(result.evidenceId).toBe('ev-confirmer'); // gửi -> cập nhật
    });
  });

  describe('revokeGooglePlaceIdVerification — thu hồi xác nhận', () => {
    it('chưa có identifier nào → NotFoundException, không ghi gì', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      await expect(service.revokeGooglePlaceIdVerification({ placeId: 'place-1', actorId: 'user-1' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('CÓ identifier đã xác nhận → set verifiedAt = null, ghi audit với actor/thời điểm', async () => {
      const existing = makeIdentifier({ verifiedAt: new Date('2026-10-16') });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.revokeGooglePlaceIdVerification({ placeId: 'place-1', actorId: 'user-mod-1' });

      expect(result.verifiedAt).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'place_external_identifier.verification_revoked',
          actorId: 'user-mod-1',
          permission: 'PlaceExternalIdentifier.Verify',
        }),
      );
    });

    it('không xoá identifier — chỉ đưa verifiedAt về null, external_id vẫn còn nguyên', async () => {
      const existing = makeIdentifier({ externalId: 'ChIJ-stays', verifiedAt: new Date('2026-10-16') });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.revokeGooglePlaceIdVerification({ placeId: 'place-1', actorId: 'user-1' });

      expect(result.externalId).toBe('ChIJ-stays');
    });
  });
});
