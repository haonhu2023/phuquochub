import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { VerificationStatus } from '../places/place.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof ContactsService>;

function makeContact(overrides: Partial<Contact> = {}): Contact {
  const c = new Contact();
  c.id = 'ct1';
  c.ownerType = 'place';
  c.ownerId = 'p1';
  c.contactType = 'PHONE';
  c.value = '0900000000';
  c.label = null;
  c.isPrimary = false;
  c.verificationStatus = VerificationStatus.PENDING;
  c.verifiedAt = null;
  c.displayOrder = 0;
  c.createdAt = new Date('2026-09-01T00:00:00Z');
  c.updatedAt = new Date('2026-09-01T00:00:00Z');
  c.deletedAt = null;
  return Object.assign(c, overrides);
}

describe('ContactsService — audit (ADR-016) + CAS (2026-09-16)', () => {
  let repo: LooseMock<Ctor[0]>;
  let audit: LooseMock<Ctor[1]>;
  let service: ContactsService;

  beforeEach(() => {
    repo = createMock<Ctor[0]>({
      listByOwner: jest.fn(),
      findById: jest.fn(),
      create: jest.fn((data: Partial<Contact>) => Object.assign(new Contact(), data)),
      save: jest.fn(),
      softDelete: jest.fn(),
      clearPrimary: jest.fn(),
      updateScalars: jest.fn(),
      updateScalarsIfUnchanged: jest.fn(),
    });
    audit = createMock<Ctor[1]>({ record: jest.fn() });
    service = new ContactsService(repo, audit);
  });

  // `save()` thật (TypeORM `@UpdateDateColumn`) luôn điền `updatedAt` sau khi ghi — mock ở đây mô
  // phỏng đúng điều đó, không phải chỉ thêm `id`, để `toResponse()`'s `updated_at` (CAS token,
  // 2026-09-16) có giá trị thật thay vì `undefined`.
  function savedWith(overrides: Partial<Contact> = {}) {
    return (c: Contact) =>
      Promise.resolve(Object.assign(c, { id: 'ct1', updatedAt: new Date('2026-09-01T00:00:00Z'), ...overrides }));
  }

  describe('createForPlace', () => {
    it('ghi audit contact.created với actorId thật khi HTTP truyền', async () => {
      repo.save.mockImplementation(savedWith());

      await service.createForPlace('p1', { contact_type: 'PHONE', value: '0900000000' } as never, 'u1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'contact.created',
          entityType: 'contact',
          entityId: 'ct1',
          actorId: 'u1',
          context: expect.objectContaining({ place_id: 'p1' }),
        }),
      );
    });

    it('actorId mặc định null — caller hệ thống (batch ingestion) không bị phá', async () => {
      repo.save.mockImplementation(savedWith());

      await service.createForPlace('p1', { contact_type: 'PHONE', value: '0900000000' } as never);

      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
    });

    it('is_primary=true -> clearPrimary gọi TRƯỚC khi tạo (bất biến 1 primary/loại)', async () => {
      repo.save.mockImplementation(savedWith());

      await service.createForPlace('p1', { contact_type: 'PHONE', value: 'x', is_primary: true } as never, 'u1');

      expect(repo.clearPrimary).toHaveBeenCalledWith('place', 'p1', 'PHONE');
    });
  });

  describe('update', () => {
    it('không tìm thấy -> NotFound, KHÔNG audit', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update('ct1', { value: 'x' } as never, 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('KHÔNG có expected_updated_at -> ghi trực tiếp qua save() (hành vi cũ, không phá client cũ)', async () => {
      const existing = makeContact();
      repo.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(makeContact({ value: 'moi' }));
      repo.save.mockResolvedValue(undefined as never);

      await service.update('ct1', { value: 'moi' } as never, 'u1');

      expect(repo.save).toHaveBeenCalled();
      expect(repo.updateScalarsIfUnchanged).not.toHaveBeenCalled();
    });

    it('CÓ expected_updated_at khớp -> updateScalarsIfUnchanged áp thành công, ghi audit before/after', async () => {
      const existing = makeContact();
      repo.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(makeContact({ value: 'moi' }));
      repo.updateScalarsIfUnchanged.mockResolvedValue(true);

      await service.update(
        'ct1',
        { value: 'moi', expected_updated_at: existing.updatedAt.toISOString() } as never,
        'u1',
      );

      expect(repo.updateScalarsIfUnchanged).toHaveBeenCalledWith(
        'ct1',
        { value: 'moi' },
        new Date(existing.updatedAt.toISOString()),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'contact.updated',
          entityId: 'ct1',
          actorId: 'u1',
          before: expect.objectContaining({ value: '0900000000' }),
          after: expect.objectContaining({ value: 'moi' }),
        }),
      );
    });

    it('CÓ expected_updated_at nhưng ĐÃ TRÔI (ai đó sửa trước) -> Conflict, KHÔNG audit', async () => {
      const existing = makeContact();
      repo.findById.mockResolvedValue(existing);
      repo.updateScalarsIfUnchanged.mockResolvedValue(false);

      await expect(
        service.update(
          'ct1',
          { value: 'moi', expected_updated_at: existing.updatedAt.toISOString() } as never,
          'u1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('không tìm thấy -> NotFound, KHÔNG audit', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove('ct1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('thành công -> softDelete rồi ghi audit contact.removed với before=trạng thái cũ', async () => {
      const existing = makeContact();
      repo.findById.mockResolvedValue(existing);

      await service.remove('ct1', 'u1');

      expect(repo.softDelete).toHaveBeenCalledWith('ct1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'contact.removed',
          entityId: 'ct1',
          actorId: 'u1',
          before: expect.objectContaining({ id: 'ct1' }),
        }),
      );
    });
  });
});
