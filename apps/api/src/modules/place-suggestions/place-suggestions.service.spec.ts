/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlaceSuggestionsService } from './place-suggestions.service';
import { PlaceEditSuggestion } from './entities/place-edit-suggestion.entity';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof PlaceSuggestionsService>;

const makeItem = (overrides: Partial<PlaceEditSuggestion> = {}): PlaceEditSuggestion =>
  ({
    id: 'sugg-uuid',
    placeId: 'place-uuid',
    field: 'address',
    currentValue: 'Cũ, Dương Đông',
    proposedValue: 'Mới, Dương Đông',
    sourceUrl: 'https://maps.example/place',
    sourceNote: null,
    submittedBy: 'submitter-uuid',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date('2026-09-24'),
    updatedAt: new Date('2026-09-24'),
    ...overrides,
  } as PlaceEditSuggestion);

describe('PlaceSuggestionsService', () => {
  let repo: LooseMock<Ctor[0]>;
  let placesRepo: LooseMock<Ctor[1]>;
  let auditService: LooseMock<Ctor[2]>;
  let authzService: LooseMock<Ctor[3]>;
  let service: PlaceSuggestionsService;

  beforeEach(() => {
    repo = createMock<Ctor[0]>({
      findById: jest.fn(),
      save: jest.fn().mockImplementation((item) => Promise.resolve(item)),
      create: jest.fn().mockImplementation((d) => d),
      findByPlace: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    });
    placesRepo = createMock<Ctor[1]>({
      getCardByIdIncludingInactive: jest.fn().mockResolvedValue({
        id: 'place-uuid',
        name: 'Bãi Sao',
        address: 'Cũ, Dương Đông',
        ward: null,
        short_description: null,
        description: null,
        price_range: null,
        opening_hours: null,
      }),
    });
    auditService = createMock<Ctor[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    // Mặc định: actor có Place.Approve (global) — khớp mọi test hiện có trừ khi ghi đè.
    authzService = createMock<Ctor[3]>({ can: jest.fn().mockResolvedValue(true) });

    service = new PlaceSuggestionsService(repo as any, placesRepo as any, auditService as any, authzService as any);
  });

  describe('create', () => {
    it('throws NotFoundException khi place không tồn tại', async () => {
      (placesRepo.getCardByIdIncludingInactive as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create(
          { placeId: 'missing', field: 'address', proposedValue: 'x', sourceUrl: 'https://a.com' },
          'submitter-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('chụp currentValue từ giá trị hiện tại của place cho đúng field', async () => {
      const result = await service.create(
        { placeId: 'place-uuid', field: 'address', proposedValue: 'Mới', sourceUrl: 'https://a.com' },
        'submitter-uuid',
      );
      expect(result.currentValue).toBe('Cũ, Dương Đông');
      expect(result.proposedValue).toBe('Mới');
      expect(result.status).toBe('pending');
      expect(result.submittedBy).toBe('submitter-uuid');
    });

    it('field đang trống (null) -> currentValue null, KHÔNG ném lỗi', async () => {
      const result = await service.create(
        { placeId: 'place-uuid', field: 'ward', proposedValue: 'Mới', sourceUrl: 'https://a.com' },
        'submitter-uuid',
      );
      expect(result.currentValue).toBeNull();
    });

    it('field có cấu trúc (opening_hours) -> currentValue là JSON string, KHÔNG bị parse lại', async () => {
      (placesRepo.getCardByIdIncludingInactive as jest.Mock).mockResolvedValue({
        id: 'place-uuid',
        opening_hours: { mon: '08:00-17:00' },
      });
      const result = await service.create(
        { placeId: 'place-uuid', field: 'opening_hours', proposedValue: 'x', sourceUrl: 'https://a.com' },
        'submitter-uuid',
      );
      expect(result.currentValue).toBe(JSON.stringify({ mon: '08:00-17:00' }));
    });

    it('ghi audit event place_suggestion.created', async () => {
      await service.create(
        { placeId: 'place-uuid', field: 'address', proposedValue: 'Mới', sourceUrl: 'https://a.com' },
        'submitter-uuid',
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'place_suggestion.created',
          entityType: 'place_edit_suggestion',
          actorId: 'submitter-uuid',
          context: { placeId: 'place-uuid', field: 'address' },
        }),
      );
    });
  });

  describe('listForPlace — khoanh vùng quyền', () => {
    it('actor không có Place.Approve lẫn Place.Edit.Managed cho place này -> Forbidden', async () => {
      (authzService.can as jest.Mock).mockResolvedValue(false);
      await expect(service.listForPlace('place-uuid', 'actor-uuid')).rejects.toThrow(ForbiddenException);
    });

    it('actor có Place.Edit.Managed khoanh vùng đúng place -> cho phép, gọi đúng repo', async () => {
      (authzService.can as jest.Mock)
        .mockResolvedValueOnce(false) // Place.Approve
        .mockResolvedValueOnce(true); // Place.Edit.Managed
      await service.listForPlace('place-uuid', 'actor-uuid', 'pending');
      expect(repo.findByPlace).toHaveBeenCalledWith('place-uuid', 'pending');
    });
  });

  describe('resolve', () => {
    it('throws NotFoundException khi suggestion không tồn tại', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(
        service.resolve({ id: 'missing', reviewedBy: 'actor-uuid', action: 'applied' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('actor không có quyền -> Forbidden, KHÔNG đổi status', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem());
      (authzService.can as jest.Mock).mockResolvedValue(false);
      await expect(
        service.resolve({ id: 'sugg-uuid', reviewedBy: 'actor-uuid', action: 'applied' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('action=applied -> status applied, reviewedBy/reviewedAt điền, ghi audit place_suggestion.applied', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem());
      const result = await service.resolve({
        id: 'sugg-uuid',
        reviewedBy: 'owner-uuid',
        action: 'applied',
        note: 'Đã sửa qua editor.',
      });
      expect(result.status).toBe('applied');
      expect(result.reviewedBy).toBe('owner-uuid');
      expect(result.reviewedAt).toBeInstanceOf(Date);
      expect(result.reviewNote).toBe('Đã sửa qua editor.');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place_suggestion.applied', actorId: 'owner-uuid' }),
      );
    });

    it('action=rejected -> status rejected, ghi audit place_suggestion.rejected', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem());
      const result = await service.resolve({ id: 'sugg-uuid', reviewedBy: 'owner-uuid', action: 'rejected' });
      expect(result.status).toBe('rejected');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place_suggestion.rejected' }),
      );
    });

    it('resolve KHÔNG bao giờ ghi vào bảng places — không đọc/ghi gì qua placesRepo', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeItem());
      await service.resolve({ id: 'sugg-uuid', reviewedBy: 'owner-uuid', action: 'applied' });
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
    });
  });

  describe('listPending', () => {
    it('gọi repo.findAll với status pending + limit/offset — không tự kiểm tra quyền lần hai (controller đã gác)', async () => {
      await service.listPending(20, 40);
      expect(repo.findAll).toHaveBeenCalledWith('pending', 20, 40);
      expect(authzService.can).not.toHaveBeenCalled();
    });
  });
});
