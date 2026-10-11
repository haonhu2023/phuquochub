import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpeningHoursEvidenceService } from './opening-hours-evidence.service';
import { EvidenceService } from './evidence.service';
import { SourcesService } from '../sources/sources.service';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { Source } from '../sources/entities/source.entity';
import { SourceType } from '../sources/sources.enums';
import { Clock } from '../../common/clock';
import { computeFieldValueHash } from './field-value-hash';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makePlace(overrides: Partial<PlaceDetailRow> = {}): PlaceDetailRow {
  return {
    id: 'place-1',
    name: 'Nhà hàng Test',
    slug: 'nha-hang-test',
    opening_hours: { regular: { mon: ['09:00-17:00'] } },
    ...overrides,
  } as PlaceDetailRow;
}

function makeArtifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  const a = new EvidenceArtifact();
  Object.assign(a, {
    id: 'evd-1',
    sourceId: 'src-1',
    businessKey: 'opening_hours_submission:place-1:abc',
    evidenceType: 'opening_hours_observation',
    sourceUrl: 'https://example.com/hours',
    capturedAt: new Date('2026-10-10T00:00:00.000Z'),
    contentHashSha256: 'a'.repeat(64),
    verificationStatus: 'NEEDS_REVIEW',
    metadata: { place_id: 'place-1', observed_text: '9h-17h thứ 2' },
    createdAt: new Date('2026-10-10T00:00:00.000Z'),
    ...overrides,
  });
  return a;
}

describe('OpeningHoursEvidenceService', () => {
  let service: OpeningHoursEvidenceService;
  let evidenceService: LooseMock<EvidenceService>;
  let sourcesService: LooseMock<SourcesService>;
  let placesRepo: LooseMock<PlacesRepository>;
  let artifactsRepo: LooseMock<EvidenceArtifactsRepository>;
  let clock: LooseMock<Clock>;

  beforeEach(() => {
    evidenceService = createMock<EvidenceService>({
      ensureEvidenceArtifact: jest.fn(),
      reviewEvidenceArtifact: jest.fn(),
      linkEvidenceToPlaceField: jest.fn(),
    });
    sourcesService = createMock<SourcesService>({ createSource: jest.fn() });
    placesRepo = createMock<PlacesRepository>({ getCardByIdIncludingInactive: jest.fn() });
    artifactsRepo = createMock<EvidenceArtifactsRepository>({
      listByTypeAndStatus: jest.fn(),
      findById: jest.fn(),
    });
    clock = createMock<Clock>({ now: jest.fn().mockReturnValue(new Date('2026-10-11T00:00:00.000Z')) });
    service = new OpeningHoursEvidenceService(evidenceService, sourcesService, placesRepo, artifactsRepo, clock);
  });

  describe('submit', () => {
    it('từ chối khi place không tồn tại', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);
      await expect(
        service.submit('place-1', { source_type: SourceType.OFFICIAL_WEBSITE, source_url: 'https://x', observed_text: 'a', schedule_stability: 'STABLE' } as never, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('từ chối khi place chưa có opening_hours nào', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace({ opening_hours: null }));
      await expect(
        service.submit('place-1', { source_type: SourceType.OFFICIAL_WEBSITE, source_url: 'https://x', observed_text: 'a', schedule_stability: 'STABLE' } as never, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('tạo source + evidence artifact với metadata gồm place_id và observed_text', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      sourcesService.createSource.mockResolvedValue(Object.assign(new Source(), { id: 'src-1', type: SourceType.OFFICIAL_WEBSITE }));
      evidenceService.ensureEvidenceArtifact.mockResolvedValue(makeArtifact());

      const result = await service.submit(
        'place-1',
        {
          source_type: SourceType.OFFICIAL_WEBSITE,
          source_url: 'https://example.com/hours',
          observed_text: '9h-17h thứ 2',
          schedule_stability: 'STABLE',
        } as never,
        'user-1',
      );

      expect(sourcesService.createSource).toHaveBeenCalledWith(
        expect.objectContaining({ type: SourceType.OFFICIAL_WEBSITE, url: 'https://example.com/hours' }),
        'user-1',
      );
      const call = evidenceService.ensureEvidenceArtifact.mock.calls[0][0];
      expect(call.evidenceType).toBe('opening_hours_observation');
      expect(call.verificationStatus).toBe('NEEDS_REVIEW');
      expect(call.metadata.place_id).toBe('place-1');
      expect(call.metadata.observed_text).toBe('9h-17h thứ 2');
      expect(result).toEqual({ evidence_artifact_id: 'evd-1', place_id: 'place-1', verification_status: 'NEEDS_REVIEW' });
    });

    it('dùng captured_at mặc định là now() khi không truyền', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      sourcesService.createSource.mockResolvedValue(Object.assign(new Source(), { id: 'src-1' }));
      evidenceService.ensureEvidenceArtifact.mockResolvedValue(makeArtifact());

      await service.submit(
        'place-1',
        { source_type: SourceType.OFFICIAL_WEBSITE, source_url: 'https://x', observed_text: 'a', schedule_stability: 'STABLE' } as never,
        'user-1',
      );

      const call = evidenceService.ensureEvidenceArtifact.mock.calls[0][0];
      expect(call.capturedAt).toEqual(new Date('2026-10-11T00:00:00.000Z'));
    });
  });

  describe('review', () => {
    it('từ chối khi evidence artifact không tồn tại', async () => {
      artifactsRepo.findById.mockResolvedValue(null);
      await expect(service.review('evd-1', { decision: 'APPROVE', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('từ chối khi artifact không thuộc evidenceType opening_hours_observation', async () => {
      artifactsRepo.findById.mockResolvedValue(makeArtifact({ evidenceType: 'translation_evidence' }));
      await expect(service.review('evd-1', { decision: 'APPROVE', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('từ chối khi artifact thiếu place_id trong metadata', async () => {
      artifactsRepo.findById.mockResolvedValue(makeArtifact({ metadata: { observed_text: 'x' } }));
      await expect(service.review('evd-1', { decision: 'APPROVE', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('APPROVE + eligible: gọi reviewEvidenceArtifact với fieldValueHash của giá trị HIỆN TẠI rồi gọi linkEvidenceToPlaceField', async () => {
      const place = makePlace();
      artifactsRepo.findById.mockResolvedValue(makeArtifact());
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(place);
      evidenceService.reviewEvidenceArtifact.mockResolvedValue({
        review: {},
        evaluation: { eligible: true, reasonCodes: ['ELIGIBLE'] },
        evidenceVerified: true,
        idempotentReplay: false,
      });
      evidenceService.linkEvidenceToPlaceField.mockResolvedValue({});

      const result = await service.review(
        'evd-1',
        { decision: 'APPROVE', schedule_stability: 'STABLE', review_note: 'khớp' } as never,
        'mod-1',
        'mod@x.com',
      );

      const reviewCall = evidenceService.reviewEvidenceArtifact.mock.calls[0][0];
      expect(reviewCall.placeId).toBe('place-1');
      expect(reviewCall.fieldName).toBe('opening_hours');
      expect(reviewCall.fieldValueHash).toBe(computeFieldValueHash(place.opening_hours));
      expect(reviewCall.claimType).toBe('opening_hours');
      expect(reviewCall.reviewerName).toBe('mod@x.com');
      expect(evidenceService.linkEvidenceToPlaceField).toHaveBeenCalledWith('place-1', 'opening_hours', 'evd-1');
      expect(result).toEqual({
        decision: 'APPROVE',
        eligible: true,
        reason_codes: ['ELIGIBLE'],
        evidence_verified: true,
        linked_to_public_gate: true,
      });
    });

    it('APPROVE nhưng KHÔNG eligible (ví dụ capture quá hạn): KHÔNG gọi linkEvidenceToPlaceField', async () => {
      artifactsRepo.findById.mockResolvedValue(makeArtifact());
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      evidenceService.reviewEvidenceArtifact.mockResolvedValue({
        review: {},
        evaluation: { eligible: false, reasonCodes: ['CAPTURE_TOO_OLD'] },
        evidenceVerified: false,
        idempotentReplay: false,
      });

      const result = await service.review('evd-1', { decision: 'APPROVE', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com');

      expect(evidenceService.linkEvidenceToPlaceField).not.toHaveBeenCalled();
      expect(result.linked_to_public_gate).toBe(false);
      expect(result.reason_codes).toEqual(['CAPTURE_TOO_OLD']);
    });

    it('REJECT: không gọi link, trả evidence_verified=false', async () => {
      artifactsRepo.findById.mockResolvedValue(makeArtifact());
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      evidenceService.reviewEvidenceArtifact.mockResolvedValue({
        review: {},
        evaluation: { eligible: false, reasonCodes: ['DECISION_NOT_APPROVED'] },
        evidenceVerified: false,
        idempotentReplay: false,
      });

      const result = await service.review('evd-1', { decision: 'REJECT', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com');

      expect(evidenceService.linkEvidenceToPlaceField).not.toHaveBeenCalled();
      expect(result.evidence_verified).toBe(false);
    });

    it('duyệt bind theo giá trị opening_hours HIỆN TẠI, không theo field_value_hash_at_submission đã lưu ở metadata nếu place đã bị sửa lại', async () => {
      const changedPlace = makePlace({ opening_hours: { regular: { mon: ['10:00-18:00'] } } });
      artifactsRepo.findById.mockResolvedValue(
        makeArtifact({ metadata: { place_id: 'place-1', observed_text: 'cũ', field_value_hash_at_submission: 'stale-hash' } }),
      );
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(changedPlace);
      evidenceService.reviewEvidenceArtifact.mockResolvedValue({
        review: {},
        evaluation: { eligible: true, reasonCodes: ['ELIGIBLE'] },
        evidenceVerified: true,
        idempotentReplay: false,
      });

      await service.review('evd-1', { decision: 'APPROVE', schedule_stability: 'STABLE' } as never, 'mod-1', 'mod@x.com');

      const reviewCall = evidenceService.reviewEvidenceArtifact.mock.calls[0][0];
      expect(reviewCall.fieldValueHash).toBe(computeFieldValueHash(changedPlace.opening_hours));
      expect(reviewCall.fieldValueHash).not.toBe('stale-hash');
    });
  });

  describe('listPending', () => {
    it('trả danh sách kèm giá trị opening_hours HIỆN TẠI của place (không phải giá trị lúc nộp)', async () => {
      artifactsRepo.listByTypeAndStatus.mockResolvedValue([makeArtifact()]);
      const place = makePlace({ opening_hours: { regular: { mon: ['11:00-19:00'] } } });
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(place);

      const rows = await service.listPending();

      expect(artifactsRepo.listByTypeAndStatus).toHaveBeenCalledWith('opening_hours_observation', 'NEEDS_REVIEW');
      expect(rows).toEqual([
        expect.objectContaining({
          evidence_artifact_id: 'evd-1',
          place_id: 'place-1',
          place_name: 'Nhà hàng Test',
          place_current_opening_hours: place.opening_hours,
          observed_text: '9h-17h thứ 2',
        }),
      ]);
    });
  });
});
