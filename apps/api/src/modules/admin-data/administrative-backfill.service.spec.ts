import { DataSource, EntityManager } from 'typeorm';
import { AdministrativeBackfillService } from './administrative-backfill.service';
import { ADMINISTRATIVE_BACKFILL_TARGETS } from './administrative-backfill.manifest';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { PlacesService } from '../places/places.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { Source } from '../sources/entities/source.entity';
import { SourceAttribution } from '../sources/entities/source-attribution.entity';
import { SourceType } from '../sources/sources.enums';
import { VerificationsService, type ClaimVerificationOutcome } from '../verifications/verifications.service';
import { VerificationMethod } from '../verifications/verification.enums';
import { Verification } from '../verifications/entities/verification.entity';
import { VerificationStatus, PlaceStatus } from '../places/place.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// ADMINISTRATIVE DATA BACKFILL — Section 20 test plan: classification, provenance, revision
// origin, idempotency, structured-data downstream correctness (province/admin_area written), null
// handling (dry-run), per-place error isolation, không đụng field ngoài phạm vi.

function makeDetailRow(overrides: Partial<PlaceDetailRow> = {}): PlaceDetailRow {
  return {
    id: 'place-1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'cat-beach',
    category_slug: 'beach',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10.0466,
    lng: 104.0281,
    address: null,
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PlaceDetailRow;
}

function makeSource(overrides: Partial<Source> = {}): Source {
  const s = new Source();
  s.id = 'source-nq1654';
  s.type = SourceType.GOVERNMENT;
  s.externalRef = 'NQ-1654-NQ-UBTVQH15';
  s.reliability = 95;
  return Object.assign(s, overrides);
}

function makeAttribution(overrides: Partial<SourceAttribution> = {}): SourceAttribution {
  const a = new SourceAttribution();
  a.id = 'attr-1';
  a.sourceId = 'source-nq1654';
  a.entityType = 'place_field';
  a.entityId = 'place-1';
  a.field = 'province';
  a.isPrimary = true;
  return Object.assign(a, overrides);
}

function makeVerification(overrides: Partial<Verification> = {}): Verification {
  const v = new Verification();
  v.id = 'verif-1';
  v.placeId = 'place-1';
  v.status = VerificationStatus.OFFICIAL;
  v.method = VerificationMethod.SOURCE_MATCH;
  v.sourceId = 'source-nq1654';
  v.lockVersion = 1;
  return Object.assign(v, overrides);
}

describe('AdministrativeBackfillService', () => {
  let service: AdministrativeBackfillService;
  let placesRepo: LooseMock<PlacesRepository>;
  let placesService: LooseMock<PlacesService>;
  let revisions: LooseMock<RevisionsService>;
  let sourcesRepo: LooseMock<SourcesRepository>;
  let attributionsRepo: LooseMock<SourceAttributionsRepository>;
  let verificationsService: LooseMock<VerificationsService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;

  const ONE_TARGET = [{ slug: 'bai-sao', province: 'An Giang', adminArea: 'Đặc khu Phú Quốc' }] as const;

  beforeEach(() => {
    manager = {} as EntityManager;
    placesRepo = createMock<PlacesRepository>({ getDetailBySlug: jest.fn() });
    placesService = createMock<PlacesService>({ update: jest.fn() });
    revisions = createMock<RevisionsService>({ listByPlace: jest.fn() });
    sourcesRepo = createMock<SourcesRepository>({
      findByTypeAndExternalRef: jest.fn(),
      create: jest.fn((d: Partial<Source>) => Object.assign(new Source(), d)),
      save: jest.fn(),
    });
    attributionsRepo = createMock<SourceAttributionsRepository>({
      listByEntity: jest.fn().mockResolvedValue([]),
      create: jest.fn((d: Partial<SourceAttribution>) => Object.assign(new SourceAttribution(), d)),
      save: jest.fn((a: SourceAttribution) => Promise.resolve(a)),
    });
    verificationsService = createMock<VerificationsService>({ ensureOfficialFromClaim: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });

    service = new AdministrativeBackfillService(
      placesRepo,
      placesService,
      revisions,
      sourcesRepo,
      attributionsRepo,
      verificationsService,
      dataSource,
    );

    // Mặc định: nguồn đã tồn tại (kịch bản LẶP LẠI — phổ biến nhất trong test) — test riêng
    // "lần chạy đầu" override lại thành null.
    sourcesRepo.findByTypeAndExternalRef.mockResolvedValue(makeSource());
    placesRepo.getDetailBySlug.mockResolvedValue(makeDetailRow());
    verificationsService.ensureOfficialFromClaim.mockResolvedValue({
      verification: makeVerification(),
      sourceId: 'source-nq1654',
      sourceCreated: true,
    } as ClaimVerificationOutcome);
    revisions.listByPlace.mockResolvedValue([{ id: 'rev-1', revision_number: 2 }]);
  });

  describe('manifest', () => {
    it('48 mục tiêu, KHÔNG có Grand World (loại trừ có chủ đích — chờ owner duyệt address)', () => {
      expect(ADMINISTRATIVE_BACKFILL_TARGETS).toHaveLength(48);
      expect(ADMINISTRATIVE_BACKFILL_TARGETS.some((t) => t.slug === 'grand-world-phu-quoc')).toBe(false);
    });

    it('mọi mục tiêu đều cùng 1 cặp giá trị (kết quả thật của việc luật nhập cả đảo thành 1 đơn vị)', () => {
      const distinct = new Set(ADMINISTRATIVE_BACKFILL_TARGETS.map((t) => `${t.province}|${t.adminArea}`));
      expect(distinct.size).toBe(1);
      expect([...distinct][0]).toBe('An Giang|Đặc khu Phú Quốc');
    });
  });

  describe('place không tồn tại', () => {
    it('slug không tìm thấy → not_found, KHÔNG gọi update/attribution/verification', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(null);

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].outcome).toBe('not_found');
      expect(summary.notFound).toBe(1);
      expect(placesService.update).not.toHaveBeenCalled();
      expect(verificationsService.ensureOfficialFromClaim).not.toHaveBeenCalled();
    });
  });

  describe('CLASSIFICATION / PATCH', () => {
    it('province/admin_area đang null → patched, PATCH gọi với origin=IMPORT', async () => {
      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.patched).toBe(1);
      expect(placesService.update).toHaveBeenCalledWith(
        'place-1',
        { province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' },
        'actor-1',
        RevisionOrigin.IMPORT,
      );
    });

    it('province/admin_area ĐÃ đúng sẵn → already_correct, KHÔNG gọi update (0 mutation không cần thiết)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.alreadyCorrect).toBe(1);
      expect(summary.patched).toBe(0);
      expect(placesService.update).not.toHaveBeenCalled();
    });

    it('chỉ province lệch (admin_area đã đúng) → vẫn patched (PATCH cả hai field cùng lúc, không patch riêng lẻ)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ province: 'Kiên Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });
      expect(summary.patched).toBe(1);
    });
  });

  describe('DATA PRESERVATION — không đụng field ngoài phạm vi', () => {
    it('snapshot preserved KHÔNG gồm province/admin_area, và PHẢN ÁNH ĐÚNG dữ liệu trước khi patch', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ name: 'Bãi Sao', category_id: 'cat-beach', lat: 10.0466, lng: 104.0281, address: null, ward: 'An Thới' }),
      );

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].preservedSnapshot).toEqual({
        name: 'Bãi Sao',
        categoryId: 'cat-beach',
        lat: 10.0466,
        lng: 104.0281,
        address: null,
        ward: 'An Thới',
      });
    });

    it('PATCH payload CHỈ chứa province/admin_area — không có name/category_id/location/ward/address', async () => {
      await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      const [, patchDto] = placesService.update.mock.calls[0];
      expect(Object.keys(patchDto)).toEqual(['province', 'admin_area']);
    });
  });

  describe('PROVENANCE — sources / source_attributions', () => {
    it('nguồn đã tồn tại (dedupe theo type+external_ref) → KHÔNG tạo nguồn mới', async () => {
      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(sourcesRepo.save).not.toHaveBeenCalled();
      expect(summary.sourceCreated).toBe(false);
      expect(summary.sourceId).toBe('source-nq1654');
    });

    it('CHƯA có nguồn nào → tạo đúng 1 lần, type=government, dedupe key = external_ref', async () => {
      sourcesRepo.findByTypeAndExternalRef.mockResolvedValue(null);
      sourcesRepo.save.mockImplementation((s: Source) => Promise.resolve(Object.assign(s, { id: 'new-source' })));

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(sourcesRepo.save).toHaveBeenCalledTimes(1);
      expect(sourcesRepo.create.mock.calls[0][0]).toMatchObject({ type: SourceType.GOVERNMENT });
      expect(summary.sourceCreated).toBe(true);
      expect(summary.sourceId).toBe('new-source');
    });

    it('patch tạo revision mới → gắn 2 attribution place_field (province, admin_area) + 1 attribution wiki_revision', async () => {
      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].placeFieldAttributionsCreated).toBe(2);
      expect(summary.results[0].wikiRevisionAttributionCreated).toBe(true);
      expect(attributionsRepo.save).toHaveBeenCalledTimes(3);

      const calls = attributionsRepo.create.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entityType: 'place_field', field: 'province', entityId: 'place-1' }),
          expect.objectContaining({ entityType: 'place_field', field: 'admin_area', entityId: 'place-1' }),
          expect.objectContaining({ entityType: 'wiki_revision', entityId: 'rev-1', field: null }),
        ]),
      );
    });

    it('already_correct (không patch) nhưng ĐÃ CÓ đủ attribution → 0 attribution mới, 0 wiki_revision attribution', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );
      attributionsRepo.listByEntity.mockResolvedValue([
        makeAttribution({ field: 'province' }),
        makeAttribution({ field: 'admin_area', id: 'attr-2' }),
      ]);

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].placeFieldAttributionsCreated).toBe(0);
      expect(summary.results[0].placeFieldAttributionsAlreadyPresent).toBe(2);
      expect(summary.results[0].wikiRevisionAttributionCreated).toBe(false);
      expect(attributionsRepo.save).not.toHaveBeenCalled();
    });

    it('CATCH-UP: patch KHÔNG cần thiết nhưng attribution còn thiếu (chạy trước bị dừng giữa chừng) → vẫn bổ sung attribution', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );
      attributionsRepo.listByEntity.mockResolvedValue([]); // chưa có attribution nào dù place đã đúng giá trị

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].outcome).toBe('already_correct');
      expect(placesService.update).not.toHaveBeenCalled();
      expect(summary.results[0].placeFieldAttributionsCreated).toBe(2);
      // KHÔNG có revision mới → KHÔNG có gì để gắn attribution wiki_revision.
      expect(summary.results[0].wikiRevisionAttributionCreated).toBe(false);
    });
  });

  describe('VERIFICATION — tái dùng ensureOfficialFromClaim', () => {
    it('gọi TRONG transaction (dataSource.transaction), method=SOURCE_MATCH', async () => {
      await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const [, input] = verificationsService.ensureOfficialFromClaim.mock.calls[0];
      expect(input.method).toBe(VerificationMethod.SOURCE_MATCH);
      expect(input.actorId).toBe('actor-1');
    });

    it('ensureOfficialFromClaim báo sourceCreated=false (đã official từ trước) → verificationOutcome=already_official_noop', async () => {
      verificationsService.ensureOfficialFromClaim.mockResolvedValue({
        verification: makeVerification(),
        sourceId: 'source-nq1654',
        sourceCreated: false,
      } as ClaimVerificationOutcome);

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(summary.results[0].verificationOutcome).toBe('already_official_noop');
      expect(summary.verificationsAlreadyOfficial).toBe(1);
      expect(summary.verificationsOfficialCreated).toBe(0);
    });
  });

  describe('IDEMPOTENCY — RUN_1 vs RUN_2', () => {
    it('RUN_2 trên trạng thái do RUN_1 tạo ra → 0 patch, 0 attribution mới, verification no-op', async () => {
      // RUN_1: place chưa có gì.
      const run1 = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });
      expect(run1.patched).toBe(1);
      expect(run1.placeFieldAttributionsCreated).toBe(2);
      expect(run1.wikiRevisionAttributionsCreated).toBe(1);

      // Mô phỏng trạng thái DB SAU RUN_1: place đã đúng, attribution đã có, verification đã official.
      placesRepo.getDetailBySlug.mockResolvedValue(
        makeDetailRow({ province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );
      attributionsRepo.listByEntity.mockResolvedValue([
        makeAttribution({ field: 'province' }),
        makeAttribution({ field: 'admin_area', id: 'attr-2' }),
      ]);
      verificationsService.ensureOfficialFromClaim.mockResolvedValue({
        verification: makeVerification(),
        sourceId: 'source-nq1654',
        sourceCreated: false,
      } as ClaimVerificationOutcome);
      placesService.update.mockClear();
      attributionsRepo.save.mockClear();

      const run2 = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET });

      expect(run2.patched).toBe(0);
      expect(run2.alreadyCorrect).toBe(1);
      expect(run2.placeFieldAttributionsCreated).toBe(0);
      expect(run2.wikiRevisionAttributionsCreated).toBe(0);
      expect(run2.verificationsOfficialCreated).toBe(0);
      expect(run2.verificationsAlreadyOfficial).toBe(1);
      expect(placesService.update).not.toHaveBeenCalled();
      expect(attributionsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('DRY RUN — Section 14 null handling', () => {
    it('dry-run: KHÔNG PATCH, KHÔNG tạo attribution, KHÔNG mở transaction verification, KHÔNG tạo source', async () => {
      sourcesRepo.findByTypeAndExternalRef.mockResolvedValue(null); // giả lập lần đầu

      const summary = await service.backfill({ actorId: 'actor-1', targets: ONE_TARGET, dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(placesService.update).not.toHaveBeenCalled();
      expect(sourcesRepo.save).not.toHaveBeenCalled();
      expect(attributionsRepo.save).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(verificationsService.ensureOfficialFromClaim).not.toHaveBeenCalled();
      // Vẫn phân loại ĐÚNG dựa trên dữ liệu thật (đọc, không suy đoán) dù không ghi gì.
      expect(summary.results[0].outcome).toBe('patched');
      expect(summary.results[0].verificationOutcome).toBe('skipped_dry_run');
    });
  });

  describe('PER-PLACE ERROR ISOLATION', () => {
    it('một place lỗi KHÔNG chặn các place còn lại (cùng nguyên tắc expireOverdue)', async () => {
      const targets = [
        { slug: 'bai-sao', province: 'An Giang', adminArea: 'Đặc khu Phú Quốc' },
        { slug: 'bai-truong', province: 'An Giang', adminArea: 'Đặc khu Phú Quốc' },
      ] as const;

      placesRepo.getDetailBySlug.mockImplementation((slug: string) => {
        if (slug === 'bai-sao') return Promise.reject(new Error('kết nối DB gián đoạn'));
        return Promise.resolve(makeDetailRow({ id: 'place-2', slug: 'bai-truong' }));
      });

      const summary = await service.backfill({ actorId: 'actor-1', targets });

      expect(summary.errors).toBe(1);
      expect(summary.results[0]).toMatchObject({ slug: 'bai-sao', outcome: 'error', error: 'kết nối DB gián đoạn' });
      expect(summary.results[1]).toMatchObject({ slug: 'bai-truong', outcome: 'patched' });
      expect(summary.patched).toBe(1);
    });
  });
});
