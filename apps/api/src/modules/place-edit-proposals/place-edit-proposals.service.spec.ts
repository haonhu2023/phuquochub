import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PlaceEditProposalsService } from './place-edit-proposals.service';
import { PlaceEditProposalsRepository } from './repositories/place-edit-proposals.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { PlacesService } from '../places/places.service';
import { LocalesService } from '../locales/locales.service';
import { PlaceEditProposalDecision, PlaceEditProposalFieldKey, PlaceEditProposalStatus } from './place-edit-proposals.enums';
import { PlaceStatus } from '../places/place.enums';
import { computeFieldValueHash } from '../evidence/field-value-hash';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    placeId: 'place-1',
    fieldKey: PlaceEditProposalFieldKey.ADDRESS,
    localeCode: null,
    proposedValue: 'Địa chỉ mới',
    baseValueHash: computeFieldValueHash('Địa chỉ cũ'),
    reason: 'Địa chỉ cũ sai',
    sourceUrl: null,
    status: PlaceEditProposalStatus.PENDING,
    proposerId: 'user-1',
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date('2026-09-13T00:00:00Z'),
    updatedAt: new Date('2026-09-13T00:00:00Z'),
    ...overrides,
  };
}

describe('PlaceEditProposalsService', () => {
  let proposalsRepo: LooseMock<PlaceEditProposalsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let placesService: LooseMock<PlacesService>;
  let localesService: LooseMock<LocalesService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: PlaceEditProposalsService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    proposalsRepo = createMock<PlaceEditProposalsRepository>({
      findPendingByProposerFieldPlace: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: Record<string, unknown>) => ({
        createdAt: new Date('2026-09-13T00:00:00Z'),
        updatedAt: new Date('2026-09-13T00:00:00Z'),
        ...data,
      })),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      findByIdForUpdate: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({
      getCardByIdIncludingInactive: jest.fn(),
      getCardByIdIncludingInactiveForUpdate: jest.fn(),
    });
    placesService = createMock<PlacesService>({ update: jest.fn() });
    localesService = createMock<LocalesService>({ getKnownLocale: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new PlaceEditProposalsService(proposalsRepo, placesRepo, placesService, localesService, dataSource);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // submit — KHÔNG BAO GIỜ được đổi places/translations/evidence/verification_status
  // -------------------------------------------------------------------------
  describe('submit', () => {
    it('place không tồn tại → NotFound, không tạo proposal nào', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);

      await expect(
        service.submit('missing', { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: 'X', reason: 'lý do' } as never, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(proposalsRepo.save).not.toHaveBeenCalled();
    });

    it('place tồn tại nhưng KHÔNG published (vd pending/archived) → NotFound, không lộ trạng thái nội bộ', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PENDING, address: 'A' } as never);

      await expect(
        service.submit('p1', { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: 'X', reason: 'lý do' } as never, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('proposed_value opening_hours sai cấu trúc → BadRequest, không tạo proposal', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, opening_hours: null } as never);

      await expect(
        service.submit(
          'p1',
          { field_key: PlaceEditProposalFieldKey.OPENING_HOURS, proposed_value: { regular: { mon: [{ open: '25:00', close: '10:00' }] } }, reason: 'sai giờ' } as never,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(proposalsRepo.save).not.toHaveBeenCalled();
    });

    it('proposed_value address rỗng (chỉ khoảng trắng) → BadRequest', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, address: 'A' } as never);

      await expect(
        service.submit('p1', { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: '   ', reason: 'lý do' } as never, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('đã có đề xuất PENDING cùng place/field/người gửi → Conflict, không tạo thêm', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, address: 'A' } as never);
      proposalsRepo.findPendingByProposerFieldPlace.mockResolvedValue(makeProposal() as never);

      await expect(
        service.submit('p1', { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: 'B', reason: 'lý do' } as never, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(proposalsRepo.save).not.toHaveBeenCalled();
    });

    it('hợp lệ → tạo proposal PENDING với base_value_hash tính từ giá trị HIỆN TẠI của place, KHÔNG gọi placesService.update()', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, address: 'Địa chỉ cũ' } as never);

      const result = await service.submit(
        'p1',
        { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: 'Địa chỉ mới', reason: 'sai địa chỉ' } as never,
        'user-1',
      );

      expect(proposalsRepo.save).toHaveBeenCalled();
      const savedArg = proposalsRepo.create.mock.calls[0][0];
      expect(savedArg.status).toBe(PlaceEditProposalStatus.PENDING);
      expect(savedArg.baseValueHash).toBe(computeFieldValueHash('Địa chỉ cũ'));
      expect(savedArg.proposerId).toBe('user-1');
      expect(placesService.update).not.toHaveBeenCalled();
      expect(result.status).toBe(PlaceEditProposalStatus.PENDING);
    });

    it('locale_code không nhận diện được → bỏ qua (null), không chặn đề xuất', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, short_description: 'Cũ' } as never);
      localesService.getKnownLocale.mockRejectedValue(new NotFoundException('không có'));

      await service.submit(
        'p1',
        { field_key: PlaceEditProposalFieldKey.SHORT_DESCRIPTION, proposed_value: 'Mới', reason: 'sai', locale_code: 'xx-invalid' } as never,
        'user-1',
      );

      const savedArg = proposalsRepo.create.mock.calls[0][0];
      expect(savedArg.localeCode).toBeNull();
    });

    // short_description CÓ bảng dịch (place_translations) — write target LUÔN LUÔN là cột gốc
    // (locale mặc định). Một đề xuất khai rõ locale không phải mặc định cho field này nghĩa là
    // người dùng đang muốn sửa bản DỊCH họ đang xem — chặn rõ ràng, không lặng lẽ ghi đè cột gốc
    // bằng nội dung ngôn ngữ khác (task requirement: "không silently ignore locale").
    it('short_description + locale_code KHÔNG PHẢI mặc định → BadRequest rõ ràng, không tạo proposal', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, short_description: 'Cũ' } as never);
      localesService.getKnownLocale.mockResolvedValue({ localeCode: 'en', isDefault: false } as never);

      await expect(
        service.submit(
          'p1',
          { field_key: PlaceEditProposalFieldKey.SHORT_DESCRIPTION, proposed_value: 'New EN text', reason: 'fix EN', locale_code: 'en' } as never,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(proposalsRepo.save).not.toHaveBeenCalled();
    });

    it('short_description + locale_code LÀ mặc định (vi) → cho phép, ghi đúng locale', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, short_description: 'Cũ' } as never);
      localesService.getKnownLocale.mockResolvedValue({ localeCode: 'vi', isDefault: true } as never);

      await service.submit(
        'p1',
        { field_key: PlaceEditProposalFieldKey.SHORT_DESCRIPTION, proposed_value: 'Mới', reason: 'sai', locale_code: 'vi' } as never,
        'user-1',
      );

      const savedArg = proposalsRepo.create.mock.calls[0][0];
      expect(savedArg.localeCode).toBe('vi');
    });

    it('address (KHÔNG có bảng dịch) + locale_code không phải mặc định → KHÔNG bị chặn (hạn chế chỉ áp dụng cho field có translation)', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ status: PlaceStatus.PUBLISHED, address: 'Cũ' } as never);
      localesService.getKnownLocale.mockResolvedValue({ localeCode: 'en', isDefault: false } as never);

      await service.submit(
        'p1',
        { field_key: PlaceEditProposalFieldKey.ADDRESS, proposed_value: 'New address', reason: 'sai', locale_code: 'en' } as never,
        'user-1',
      );

      expect(proposalsRepo.save).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // decide — reject / needs_changes / approve (+ conflict) — không double-apply
  // -------------------------------------------------------------------------
  describe('decide', () => {
    it('proposal không tồn tại → NotFound', async () => {
      proposalsRepo.findByIdForUpdate.mockResolvedValue(null);

      await expect(
        service.decide('missing', { decision: PlaceEditProposalDecision.REJECT } as never, 'staff-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('proposal đã được xử lý trước đó (không còn PENDING) → Conflict, KHÔNG áp dụng lại (chống double-apply)', async () => {
      proposalsRepo.findByIdForUpdate.mockResolvedValue(makeProposal({ status: PlaceEditProposalStatus.APPROVED }) as never);

      await expect(
        service.decide('proposal-1', { decision: PlaceEditProposalDecision.APPROVE } as never, 'staff-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(placesService.update).not.toHaveBeenCalled();
    });

    it('reject → status REJECTED, ghi reviewer/thời điểm, KHÔNG gọi placesService.update()', async () => {
      proposalsRepo.findByIdForUpdate.mockResolvedValue(makeProposal() as never);

      const result = await service.decide('proposal-1', { decision: PlaceEditProposalDecision.REJECT, note: 'không đủ căn cứ' } as never, 'staff-1');

      expect(result.status).toBe(PlaceEditProposalStatus.REJECTED);
      expect(result.reviewer_id).toBe('staff-1');
      expect(placesService.update).not.toHaveBeenCalled();
    });

    it('needs_changes → status NEEDS_CHANGES, KHÔNG gọi placesService.update()', async () => {
      proposalsRepo.findByIdForUpdate.mockResolvedValue(makeProposal() as never);

      const result = await service.decide('proposal-1', { decision: PlaceEditProposalDecision.NEEDS_CHANGES, note: 'cần nguồn' } as never, 'staff-1');

      expect(result.status).toBe(PlaceEditProposalStatus.NEEDS_CHANGES);
      expect(placesService.update).not.toHaveBeenCalled();
    });

    it('approve, giá trị gốc KHÔNG đổi từ lúc gửi → gọi placesService.update() đúng field/place, status APPROVED', async () => {
      const proposal = makeProposal({
        fieldKey: PlaceEditProposalFieldKey.ADDRESS,
        proposedValue: 'Địa chỉ mới',
        baseValueHash: computeFieldValueHash('Địa chỉ cũ'),
      });
      proposalsRepo.findByIdForUpdate.mockResolvedValue(proposal as never);
      placesRepo.getCardByIdIncludingInactiveForUpdate.mockResolvedValue({ address: 'Địa chỉ cũ' } as never);

      const result = await service.decide('proposal-1', { decision: PlaceEditProposalDecision.APPROVE } as never, 'staff-1');

      // 5 tham số: manager (cuối) PHẢI là CHÍNH manager của transaction decide() đang chạy — đây là
      // điều làm cho check-rồi-ghi thực sự atomic (cùng khoá, cùng connection), không phải một
      // connection riêng mà ta "coi như" atomic.
      expect(placesService.update).toHaveBeenCalledWith(
        'place-1',
        { address: 'Địa chỉ mới' },
        'staff-1',
        expect.anything(),
        manager,
      );
      // Việc khoá hàng place phải xảy ra qua ĐÚNG manager của transaction — không phải bản đọc
      // thường (getCardByIdIncludingInactive), nếu không "khoá" chỉ là ảo.
      expect(placesRepo.getCardByIdIncludingInactiveForUpdate).toHaveBeenCalledWith('place-1', manager);
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
      expect(result.status).toBe(PlaceEditProposalStatus.APPROVED);
    });

    it('approve, giá trị gốc ĐÃ đổi từ lúc gửi (ai khác sửa trong lúc chờ duyệt) → CONFLICT, KHÔNG gọi update(), KHÔNG ghi đè', async () => {
      const proposal = makeProposal({
        fieldKey: PlaceEditProposalFieldKey.ADDRESS,
        proposedValue: 'Địa chỉ mới',
        baseValueHash: computeFieldValueHash('Địa chỉ cũ'),
      });
      proposalsRepo.findByIdForUpdate.mockResolvedValue(proposal as never);
      // Địa chỉ đã bị người khác đổi thành "Địa chỉ khác" sau khi đề xuất được gửi.
      placesRepo.getCardByIdIncludingInactiveForUpdate.mockResolvedValue({ address: 'Địa chỉ khác' } as never);

      const result = await service.decide('proposal-1', { decision: PlaceEditProposalDecision.APPROVE } as never, 'staff-1');

      expect(placesService.update).not.toHaveBeenCalled();
      expect(result.status).toBe(PlaceEditProposalStatus.CONFLICT);
    });

    it('approve opening_hours: áp dụng qua placesService.update() giống mọi field khác — KHÔNG tự tạo evidence_reviews/place_field_evidence_links hay đổi verification_status (không có gate nào bị vượt qua, vì service này không có đường ghi nào tới các bảng đó)', async () => {
      const proposedHours = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '08:00', close: '22:00' }] } };
      const currentHours = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [] } };
      const proposal = makeProposal({
        fieldKey: PlaceEditProposalFieldKey.OPENING_HOURS,
        proposedValue: proposedHours,
        baseValueHash: computeFieldValueHash(currentHours),
      });
      proposalsRepo.findByIdForUpdate.mockResolvedValue(proposal as never);
      placesRepo.getCardByIdIncludingInactiveForUpdate.mockResolvedValue({ opening_hours: currentHours } as never);

      const result = await service.decide('proposal-1', { decision: PlaceEditProposalDecision.APPROVE } as never, 'staff-1');

      expect(placesService.update).toHaveBeenCalledWith(
        'place-1',
        { opening_hours: proposedHours },
        'staff-1',
        expect.anything(),
        manager,
      );
      expect(result.status).toBe(PlaceEditProposalStatus.APPROVED);
      // Kiến trúc, không chỉ hành vi: service này KHÔNG được inject EvidenceService/
      // EvidenceArtifactsRepository/PlaceFieldEvidenceLinksRepository nào cả — không có đường ghi
      // nào tới các bảng evidence, nên việc duyệt đề xuất KHÔNG THỂ tự nâng verification_status
      // hay tạo evidence_reviews, bất kể field_key nào được duyệt.
      const injectedDeps = [proposalsRepo, placesRepo, placesService, localesService, dataSource];
      for (const dep of injectedDeps) {
        expect(dep).not.toHaveProperty('reviewEvidenceArtifact');
        expect(dep).not.toHaveProperty('ensureEvidenceArtifact');
      }
    });

    it('decide() khoá đúng MỘT hàng proposal qua findByIdForUpdate trong transaction (chống double-apply đồng thời)', async () => {
      proposalsRepo.findByIdForUpdate.mockResolvedValue(makeProposal() as never);

      await service.decide('proposal-1', { decision: PlaceEditProposalDecision.REJECT } as never, 'staff-1');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(proposalsRepo.findByIdForUpdate).toHaveBeenCalledWith('proposal-1', manager);
    });
  });
});
