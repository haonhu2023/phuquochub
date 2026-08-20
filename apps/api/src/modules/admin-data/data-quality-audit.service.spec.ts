import { PlaceStatus, VerificationStatus } from '../places/place.enums';
import { MediaStatus, MediaLicenseType } from '../media/media.enums';
import { ClaimStatus } from '../business/business.enums';
import { DataQualityAuditService, AUDIT_TARGET_SLUGS } from './data-quality-audit.service';
import type { PlaceDetailRow } from '../places/repositories/places.repository';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof DataQualityAuditService>;

function baseRow(overrides: Partial<PlaceDetailRow> = {}): PlaceDetailRow {
  return {
    id: 'p1',
    name: 'Dinh Cậu',
    slug: 'dinh-cau',
    category_id: 'c1',
    category_slug: 'attraction',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10.2199,
    lng: 103.959,
    address: null,
    ward: 'Dương Đông',
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    verified_at: null,
    ...overrides,
  };
}

describe('DataQualityAuditService', () => {
  let placesRepo: LooseMock<Ctor[0]>;
  let contactsRepo: LooseMock<Ctor[1]>;
  let pricesRepo: LooseMock<Ctor[2]>;
  let mediaRepo: LooseMock<Ctor[3]>;
  let sourceAttributionsRepo: LooseMock<Ctor[4]>;
  let sourcesRepo: LooseMock<Ctor[5]>;
  let revisionsService: LooseMock<Ctor[6]>;
  let reviewsRepo: LooseMock<Ctor[7]>;
  let businessClaimsRepo: LooseMock<Ctor[8]>;
  let placeSeoRepo: LooseMock<Ctor[9]>;
  let placeAiSummaryRepo: LooseMock<Ctor[10]>;
  let service: DataQualityAuditService;

  beforeEach(() => {
    placesRepo = createMock<Ctor[0]>({
      getDetailBySlug: jest.fn(),
      listFaqs: jest.fn().mockResolvedValue([]),
    });
    contactsRepo = createMock<Ctor[1]>({ listByOwner: jest.fn().mockResolvedValue([]) });
    pricesRepo = createMock<Ctor[2]>({ current: jest.fn().mockResolvedValue([]) });
    mediaRepo = createMock<Ctor[3]>({ listAllByPlace: jest.fn().mockResolvedValue([]) });
    sourceAttributionsRepo = createMock<Ctor[4]>({ listByEntity: jest.fn().mockResolvedValue([]) });
    sourcesRepo = createMock<Ctor[5]>({ findById: jest.fn() });
    revisionsService = createMock<Ctor[6]>({ listByPlace: jest.fn().mockResolvedValue([]) });
    reviewsRepo = createMock<Ctor[7]>({ listPublishedByPlace: jest.fn().mockResolvedValue([]) });
    businessClaimsRepo = createMock<Ctor[8]>({
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });
    placeSeoRepo = createMock<Ctor[9]>({ findOne: jest.fn().mockResolvedValue(null) });
    placeAiSummaryRepo = createMock<Ctor[10]>({ findOne: jest.fn().mockResolvedValue(null) });

    service = new DataQualityAuditService(
      placesRepo,
      contactsRepo,
      pricesRepo,
      mediaRepo,
      sourceAttributionsRepo,
      sourcesRepo,
      revisionsService,
      reviewsRepo,
      businessClaimsRepo,
      placeSeoRepo,
      placeAiSummaryRepo,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Cơ bản — 0 hàng, xử lý toàn bộ danh sách slug được truyền
  // -------------------------------------------------------------------------
  describe('audit() — cơ bản', () => {
    it('slug không tồn tại → không crash, ghi vào administrative_notes, không có trong places/issues', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(null);

      const report = await service.audit(['khong-ton-tai']);

      expect(report.places).toEqual([]);
      expect(report.issues).toEqual([]);
      expect(report.administrative_notes.some((n) => n.includes('khong-ton-tai'))).toBe(true);
    });

    it('xử lý ĐỦ mọi slug được truyền (không dừng giữa chừng khi có nhiều slug)', async () => {
      placesRepo.getDetailBySlug.mockImplementation((slug: string) =>
        Promise.resolve(baseRow({ id: slug, slug, name: slug })),
      );

      const report = await service.audit(['a', 'b', 'c']);

      expect(report.places).toHaveLength(3);
      expect(report.summary.total_places).toBe(3);
    });

    it('mặc định dùng đúng 49 slug chính thức (tái dùng administrative-backfill.manifest.ts)', () => {
      expect(AUDIT_TARGET_SLUGS).toHaveLength(49);
      expect(AUDIT_TARGET_SLUGS).toContain('grand-world-phu-quoc');
    });

    it('KHÔNG BAO GIỜ gọi bất kỳ phương thức ghi nào — chỉ đọc (Section 3: AI đề xuất, không tự xuất bản)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      await service.audit(['dinh-cau']);

      // Không repo nào trong service có method ghi được inject vào constructor — khẳng định lại
      // bằng cách kiểm KHÔNG method nào trong các mock có tên gợi ý ghi (update/save/create/delete)
      // từng được gọi (chúng thậm chí không được mock, nên gọi nhầm sẽ throw "not a function").
      expect(placesRepo.getDetailBySlug).toHaveBeenCalled();
      expect((placesRepo as unknown as Record<string, unknown>).updateScalars).toBeUndefined();
    });

    it('deterministic: cùng dữ liệu đầu vào → cùng scores/issues/coverage (chỉ audit_run_id/generated_at khác nhau)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const r1 = await service.audit(['dinh-cau']);
      const r2 = await service.audit(['dinh-cau']);

      expect(r1.summary.average_scores).toEqual(r2.summary.average_scores);
      expect(r1.places[0].scores).toEqual(r2.places[0].scores);
      expect(r1.issues.map((i) => ({ ...i }))).toEqual(r2.issues.map((i) => ({ ...i })));
      expect(r1.audit_run_id).not.toBe(r2.audit_run_id);
    });
  });

  // -------------------------------------------------------------------------
  // NO-HALLUCINATION GUARD (Section 22 của brief)
  // -------------------------------------------------------------------------
  describe('no-hallucination guard', () => {
    it('KHÔNG issue nào có proposed_value khác null — audit không bao giờ đề xuất giá trị thay thế cụ thể', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      contactsRepo.listByOwner.mockResolvedValue([
        { contactType: 'phone', value: '0123456789', verificationStatus: VerificationStatus.PENDING } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.length).toBeGreaterThan(0);
      for (const issue of report.issues) {
        expect(issue.proposed_value).toBeNull();
      }
    });

    it('status LUÔN NEEDS_HUMAN_REVIEW — không nhánh nào tự đặt trạng thái khác', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      for (const issue of report.issues) {
        expect(issue.status).toBe('NEEDS_HUMAN_REVIEW');
      }
    });

    it('place chưa từng verified → KHÔNG issue nào tự gán confidence "xác nhận" (chỉ HIGH/MEDIUM/LOW, không có nhãn xác nhận)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'pending' }));
      const report = await service.audit(['dinh-cau']);

      for (const issue of report.issues) {
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(issue.confidence);
      }
      // Không issue nào tự gọi trạng thái pending này là "verified"/"official" trong reason.
      const allReasons = report.issues.map((i) => i.reason).join(' ');
      expect(allReasons).not.toMatch(/\bđã xác minh chính thức\b/i);
    });
  });

  // -------------------------------------------------------------------------
  // MISSING_FIELD — điện thoại / website / giờ mở cửa / địa chỉ
  // -------------------------------------------------------------------------
  describe('MISSING_FIELD', () => {
    it('thiếu điện thoại → issue MISSING_FIELD field=phone, priority P1', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      const issue = report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'phone');
      expect(issue).toBeDefined();
      expect(issue?.priority).toBe('P1');
      expect(issue?.current_value).toBeNull();
    });

    it('có điện thoại (contact_type=phone) → KHÔNG có issue MISSING_FIELD/phone', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      contactsRepo.listByOwner.mockResolvedValue([
        { contactType: 'phone', value: '0123456789', verificationStatus: VerificationStatus.VERIFIED } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'phone')).toBeUndefined();
    });

    it('thiếu website → issue MISSING_FIELD field=website, priority P2', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      const issue = report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'website');
      expect(issue?.priority).toBe('P2');
    });

    it('thiếu giờ mở cửa (opening_hours=NULL) → issue MISSING_FIELD field=opening_hours', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ opening_hours: null }));
      const report = await service.audit(['dinh-cau']);

      expect(
        report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'opening_hours'),
      ).toBeDefined();
    });

    // Phân biệt NULL vs EMPTY ({}): cả hai đều KHÔNG được coi là "có giờ mở cửa" — cùng issue.
    it('opening_hours={} (object rỗng) → VẪN coi là thiếu, cùng issue như NULL (không phân biệt hai trạng thái này)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ opening_hours: {} }));
      const report = await service.audit(['dinh-cau']);

      const record = report.places[0];
      expect(record.opening_hours_present).toBe(false);
      expect(
        report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'opening_hours'),
      ).toBeDefined();
    });

    it('opening_hours có nội dung thật → opening_hours_present=true, KHÔNG có issue MISSING_FIELD/opening_hours', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        baseRow({ opening_hours: { regular: { mon: [{ open: '08:00', close: '17:00' }] } } }),
      );
      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].opening_hours_present).toBe(true);
      expect(
        report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'opening_hours'),
      ).toBeUndefined();
    });

    it('thiếu địa chỉ (address=NULL) → issue MISSING_FIELD field=address', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ address: null }));
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'address')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // MISSING_MEDIA / LICENSE_GAP (legal media gap)
  // -------------------------------------------------------------------------
  describe('MISSING_MEDIA / LICENSE_GAP', () => {
    it('không media nào → issue MISSING_MEDIA, priority P1', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      mediaRepo.listAllByPlace.mockResolvedValue([]);

      const report = await service.audit(['dinh-cau']);

      const issue = report.issues.find((i) => i.issue_type === 'MISSING_MEDIA');
      expect(issue?.priority).toBe('P1');
    });

    it('có media nhưng license_type=NULL (chưa xét quyền) → issue LICENSE_GAP, KHÔNG phải MISSING_MEDIA', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      mediaRepo.listAllByPlace.mockResolvedValue([
        { id: 'm1', status: MediaStatus.PUBLISHED, licenseType: null } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'MISSING_MEDIA')).toBeUndefined();
      const gap = report.issues.find((i) => i.issue_type === 'LICENSE_GAP');
      expect(gap).toBeDefined();
      expect(gap?.priority).toBe('P1');
    });

    it('mọi media đều đã có license_type → KHÔNG issue LICENSE_GAP', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      mediaRepo.listAllByPlace.mockResolvedValue([
        { id: 'm1', status: MediaStatus.PUBLISHED, licenseType: MediaLicenseType.OWNER_PROVIDED } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'LICENSE_GAP')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // MISSING_SOURCE / TRUST_GAP / UNVERIFIED_VALUE
  // -------------------------------------------------------------------------
  describe('MISSING_SOURCE / TRUST_GAP / UNVERIFIED_VALUE', () => {
    it('không source_attributions nào → issue MISSING_SOURCE', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'MISSING_SOURCE')).toBeDefined();
    });

    it('verification_status=pending → issue TRUST_GAP', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'pending' }));
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'TRUST_GAP')).toBeDefined();
    });

    it('verification_status=verified → KHÔNG issue TRUST_GAP', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'verified' }));
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'TRUST_GAP')).toBeUndefined();
    });

    // Đúng nguyên tắc "phone điền nhưng chưa xác minh KHÔNG được coi bằng NULL" (Section 8 của brief).
    it('có contact nhưng contact.verificationStatus KHÔNG tin cậy → issue UNVERIFIED_VALUE, KHÔNG phải MISSING_FIELD', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      contactsRepo.listByOwner.mockResolvedValue([
        { contactType: 'phone', value: '0987654321', verificationStatus: VerificationStatus.PENDING } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'MISSING_FIELD' && i.field === 'phone')).toBeUndefined();
      const unverified = report.issues.find((i) => i.issue_type === 'UNVERIFIED_VALUE');
      expect(unverified).toBeDefined();
      expect(unverified?.current_value).toBe('0987654321');
    });

    it('contact.verificationStatus=verified → KHÔNG issue UNVERIFIED_VALUE cho contact đó', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      contactsRepo.listByOwner.mockResolvedValue([
        { contactType: 'phone', value: '0987654321', verificationStatus: VerificationStatus.VERIFIED } as never,
      ]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'UNVERIFIED_VALUE')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // STALE_DATA (expired) — dùng đúng chính sách backend, không tự đặt ngưỡng
  // -------------------------------------------------------------------------
  describe('STALE_DATA', () => {
    it('verification_status=expired, KHÔNG thuộc showcase-15 → issue STALE_DATA priority P1', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'khong-showcase', verification_status: 'expired' }));
      const report = await service.audit(['khong-showcase']);

      const issue = report.issues.find((i) => i.issue_type === 'STALE_DATA');
      expect(issue?.priority).toBe('P1');
    });

    it('verification_status=expired VÀ thuộc showcase-15 (vd bai-sao) → priority nâng lên P0', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'bai-sao', verification_status: 'expired' }));
      const report = await service.audit(['bai-sao']);

      const issue = report.issues.find((i) => i.issue_type === 'STALE_DATA');
      expect(issue?.priority).toBe('P0');
    });

    it('verification_status=pending → KHÔNG issue STALE_DATA (chưa từng verified, khác với "hết hạn")', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'pending' }));
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'STALE_DATA')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // ADMINISTRATIVE_MISMATCH / CONFLICTING_DATA
  // -------------------------------------------------------------------------
  describe('ADMINISTRATIVE_MISMATCH / CONFLICTING_DATA', () => {
    it('thiếu province, place NẰM TRONG danh sách backfill đã duyệt → issue có evidence trích manifest', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'bai-sao', province: null, admin_area: null }));
      const report = await service.audit(['bai-sao']);

      const issue = report.issues.find((i) => i.issue_type === 'ADMINISTRATIVE_MISMATCH');
      expect(issue?.evidence).toContain('administrative-backfill.manifest.ts');
    });

    it('có province/admin_area đầy đủ → KHÔNG issue ADMINISTRATIVE_MISMATCH', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        baseRow({ province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' }),
      );
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'ADMINISTRATIVE_MISMATCH')).toBeUndefined();
    });

    // Grand World: address lộn xộn còn nhắc tỉnh cũ trong khi province đã cập nhật — mâu thuẫn thật.
    it('address vẫn nhắc "Kiên Giang" trong khi province đã có giá trị mới → issue CONFLICTING_DATA', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        baseRow({ address: 'Gành Dầu, Phú Quốc, Kiên Giang', province: 'An Giang' }),
      );
      const report = await service.audit(['dinh-cau']);

      const issue = report.issues.find((i) => i.issue_type === 'CONFLICTING_DATA');
      expect(issue).toBeDefined();
      expect(issue?.field).toBe('address');
    });

    it('address không nhắc tỉnh cũ nào → KHÔNG issue CONFLICTING_DATA', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(
        baseRow({ address: 'Gành Dầu, Đặc khu Phú Quốc', province: 'An Giang' }),
      );
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'CONFLICTING_DATA')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // GENERIC_CATEGORY / POSSIBLE_CLOSED_PLACE — claim curator đã ghi trong brief (Phase 6)
  // -------------------------------------------------------------------------
  describe('curator claims (showcase-15 re-evaluation)', () => {
    it('cho-dem-phu-quoc → issue POSSIBLE_CLOSED_PLACE, priority P0, confidence LOW (claim chưa xác minh)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'cho-dem-phu-quoc', id: 'cdpq' }));
      const report = await service.audit(['cho-dem-phu-quoc']);

      const issue = report.issues.find((i) => i.issue_type === 'POSSIBLE_CLOSED_PLACE');
      expect(issue?.priority).toBe('P0');
      expect(issue?.confidence).toBe('LOW');
    });

    it('tour-3-dao-an-thoi → issue GENERIC_CATEGORY, priority P1, confidence LOW', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'tour-3-dao-an-thoi', id: 't3d' }));
      const report = await service.audit(['tour-3-dao-an-thoi']);

      const issue = report.issues.find((i) => i.issue_type === 'GENERIC_CATEGORY');
      expect(issue?.priority).toBe('P1');
      expect(issue?.confidence).toBe('LOW');
    });

    it('place KHÔNG thuộc danh sách claim đã biết → KHÔNG có GENERIC_CATEGORY/POSSIBLE_CLOSED_PLACE nào được bịa ra', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'dinh-cau' }));
      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'GENERIC_CATEGORY')).toBeUndefined();
      expect(report.issues.find((i) => i.issue_type === 'POSSIBLE_CLOSED_PLACE')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // POSSIBLE_DUPLICATE — kiểm tra chéo giữa các place (chỉ có ở audit(), không phải per-place)
  // -------------------------------------------------------------------------
  describe('POSSIBLE_DUPLICATE', () => {
    it('hai place CÙNG category, toạ độ cách nhau <25m → cả hai đều nhận issue POSSIBLE_DUPLICATE', async () => {
      placesRepo.getDetailBySlug.mockImplementation((slug: string) =>
        Promise.resolve(
          baseRow({
            slug,
            id: slug,
            name: slug,
            category_slug: 'beach',
            lat: 10.0,
            lng: 104.0,
          }),
        ),
      );

      const report = await service.audit(['a', 'b']);

      const dup = report.issues.filter((i) => i.issue_type === 'POSSIBLE_DUPLICATE');
      expect(dup).toHaveLength(2);
      expect(dup.every((i) => i.priority === 'P2')).toBe(true);
    });

    it('hai place cùng toạ độ NHƯNG khác category → KHÔNG issue POSSIBLE_DUPLICATE', async () => {
      let call = 0;
      placesRepo.getDetailBySlug.mockImplementation((slug: string) => {
        call += 1;
        return Promise.resolve(
          baseRow({ slug, id: slug, category_slug: call === 1 ? 'beach' : 'hotel', lat: 10.0, lng: 104.0 }),
        );
      });

      const report = await service.audit(['a', 'b']);

      expect(report.issues.find((i) => i.issue_type === 'POSSIBLE_DUPLICATE')).toBeUndefined();
    });

    it('hai place cách xa nhau (>25m) → KHÔNG issue POSSIBLE_DUPLICATE', async () => {
      let call = 0;
      placesRepo.getDetailBySlug.mockImplementation((slug: string) => {
        call += 1;
        return Promise.resolve(
          baseRow({ slug, id: slug, category_slug: 'beach', lat: call === 1 ? 10.0 : 10.01, lng: 104.0 }),
        );
      });

      const report = await service.audit(['a', 'b']);

      expect(report.issues.find((i) => i.issue_type === 'POSSIBLE_DUPLICATE')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // SEO_GAP / LOW_USER_UTILITY
  // -------------------------------------------------------------------------
  describe('SEO_GAP / LOW_USER_UTILITY', () => {
    it('place_seo không tồn tại → issue SEO_GAP', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      placeSeoRepo.findOne.mockResolvedValue(null);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'SEO_GAP')).toBeDefined();
    });

    it('place_seo có metaTitle/metaDescription đầy đủ → KHÔNG issue SEO_GAP', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      placeSeoRepo.findOne.mockResolvedValue({ metaTitle: 'x', metaDescription: 'y' } as never);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'SEO_GAP')).toBeUndefined();
    });

    it('không FAQ nào → issue LOW_USER_UTILITY', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      placesRepo.listFaqs.mockResolvedValue([]);

      const report = await service.audit(['dinh-cau']);

      expect(report.issues.find((i) => i.issue_type === 'LOW_USER_UTILITY')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Field coverage matrix — Phase 3 của brief
  // -------------------------------------------------------------------------
  describe('field_coverage', () => {
    it('coverage_pct tính đúng theo tỉ lệ filled/total', async () => {
      placesRepo.getDetailBySlug.mockImplementation((slug: string) =>
        Promise.resolve(baseRow({ slug, id: slug, address: slug === 'a' ? '123 Main St' : null })),
      );

      const report = await service.audit(['a', 'b']);

      const addressRow = report.field_coverage.find((r) => r.field === 'address');
      expect(addressRow).toEqual({ field: 'address', filled: 1, empty: 1, coverage_pct: 50 });
    });

    it('khu_pho KHÔNG xuất hiện trong field_coverage (cột chưa tồn tại ở schema)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      expect(report.field_coverage.find((r) => r.field === 'khu_pho')).toBeUndefined();
      expect(report.places[0].khu_pho).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Scoring — ba trục tách biệt (Phase 4 của brief)
  // -------------------------------------------------------------------------
  describe('scoring — completeness/trust/freshness tách biệt', () => {
    it('phone điền nhưng CHƯA xác minh → cộng điểm completeness nhưng KHÔNG cộng điểm trust', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      contactsRepo.listByOwner.mockResolvedValue([
        { contactType: 'phone', value: '0123456789', verificationStatus: VerificationStatus.PENDING } as never,
      ]);

      const withUnverifiedPhone = await service.audit(['dinh-cau']);

      contactsRepo.listByOwner.mockResolvedValue([]);
      const withoutPhone = await service.audit(['dinh-cau']);

      expect(withUnverifiedPhone.places[0].scores.completeness).toBeGreaterThan(
        withoutPhone.places[0].scores.completeness,
      );
      expect(withUnverifiedPhone.places[0].scores.trust).toBe(withoutPhone.places[0].scores.trust);
    });

    // CÙNG nguyên tắc áp cho price_history (Phase 8 của brief) — một giá điền nhưng chưa xác minh
    // không được tính bằng NULL, và một dòng price_history có verification_status=verified vẫn
    // cộng đúng MỘT hạng mục trust "có chi tiết được xác minh" (không cộng dồn hai lần với contact).
    it('price_history hiện hành có verification_status=verified → cộng điểm trust; unverified thì không', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      pricesRepo.current.mockResolvedValue([
        { serviceName: 'Vé vào cổng', amount: '50000', currency: 'VND', verificationStatus: VerificationStatus.VERIFIED } as never,
      ]);
      const verifiedPrice = await service.audit(['dinh-cau']);

      pricesRepo.current.mockResolvedValue([
        { serviceName: 'Vé vào cổng', amount: '50000', currency: 'VND', verificationStatus: VerificationStatus.PENDING } as never,
      ]);
      const unverifiedPrice = await service.audit(['dinh-cau']);

      expect(verifiedPrice.places[0].scores.trust).toBeGreaterThan(unverifiedPrice.places[0].scores.trust);
      const issue = unverifiedPrice.issues.find(
        (i) => i.issue_type === 'UNVERIFIED_VALUE' && i.field === 'price:Vé vào cổng',
      );
      expect(issue).toBeDefined();
      expect(issue?.current_value).toBe('50000 VND');
    });

    it('verification_status=official → freshness=100, expired → freshness=30, pending → freshness=0', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'official' }));
      const official = await service.audit(['dinh-cau']);
      expect(official.places[0].scores.freshness).toBe(100);

      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ slug: 'other-expired', verification_status: 'expired' }));
      const expired = await service.audit(['other-expired']);
      expect(expired.places[0].scores.freshness).toBe(30);

      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'pending' }));
      const pending = await service.audit(['dinh-cau']);
      expect(pending.places[0].scores.freshness).toBe(0);
    });

    it('overall = trung bình cộng của completeness/trust/freshness', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow({ verification_status: 'verified' }));
      const report = await service.audit(['dinh-cau']);
      const { completeness, trust, freshness, overall } = report.places[0].scores;

      expect(overall).toBe(Math.round((completeness + trust + freshness) / 3));
    });
  });

  // -------------------------------------------------------------------------
  // trust_sources — publisher thật, không nguồn giả
  // -------------------------------------------------------------------------
  describe('trust_sources', () => {
    it('có attribution với source hợp lệ → trust_sources chứa publisher thật', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      sourceAttributionsRepo.listByEntity.mockResolvedValue([
        { sourceId: 's1', field: 'province' } as never,
      ]);
      sourcesRepo.findById.mockResolvedValue({ id: 's1', publisher: 'Ủy ban Thường vụ Quốc hội' } as never);

      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].trust_sources).toEqual([{ field: 'province', publisher: 'Ủy ban Thường vụ Quốc hội' }]);
    });

    it('attribution trỏ tới source đã bị xoá mềm (findById trả null) → KHÔNG hiện publisher giả', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      sourceAttributionsRepo.listByEntity.mockResolvedValue([
        { sourceId: 's-deleted', field: 'address' } as never,
      ]);
      sourcesRepo.findById.mockResolvedValue(null);

      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].trust_sources).toEqual([]);
    });

    it('không attribution nào → trust_sources rỗng, KHÔNG gọi sourcesRepo.findById', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      sourceAttributionsRepo.listByEntity.mockResolvedValue([]);

      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].trust_sources).toEqual([]);
      expect(sourcesRepo.findById).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // business_claim — dùng đúng claim MỚI NHẤT, không phải claim CŨ NHẤT
  // -------------------------------------------------------------------------
  describe('business_claim', () => {
    it('nhiều claim → latest_status lấy claim có createdAt LỚN NHẤT (không phải phần tử đầu mảng)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      businessClaimsRepo.list.mockResolvedValue({
        items: [
          { status: ClaimStatus.REJECTED, createdAt: new Date('2026-01-01T00:00:00Z') },
          { status: ClaimStatus.APPROVED, createdAt: new Date('2026-03-01T00:00:00Z') },
        ] as never,
        total: 2,
      });

      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].business_claim).toEqual({ has_any: true, latest_status: ClaimStatus.APPROVED });
    });

    it('không claim nào → has_any=false, latest_status=null', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      businessClaimsRepo.list.mockResolvedValue({ items: [], total: 0 });

      const report = await service.audit(['dinh-cau']);

      expect(report.places[0].business_claim).toEqual({ has_any: false, latest_status: null });
    });
  });

  // -------------------------------------------------------------------------
  // administrative_notes — khu phố (Phase 9 của brief)
  // -------------------------------------------------------------------------
  describe('administrative_notes — khu phố reconciliation', () => {
    it('LUÔN chứa ghi chú NEEDS_SOURCE_RECONCILIATION cho khu phố, bất kể slug nào được audit', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(baseRow());
      const report = await service.audit(['dinh-cau']);

      expect(report.administrative_notes.some((n) => n.includes('NEEDS_SOURCE_RECONCILIATION'))).toBe(true);
      expect(report.administrative_notes.some((n) => n.includes('47'))).toBe(true);
    });
  });
});
