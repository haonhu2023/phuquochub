import { BadRequestException, ConflictException, ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PlacesService } from '../src/modules/places/places.service';

// Description / short_description drafts and publish — live Postgres, real PlacesService. These
// tests exist because mocks cannot prove the three properties below:
//  1. draft save is a compare-and-set on the CURRENT translation id the owner read (lock + id check
//     in one transaction; a concurrent second writer gets 409, never a silent overwrite);
//  2. publish approves exactly the translation id the owner reviewed (a superseded id → 409), and
//     only the requested locale: an EN draft that is PENDING stays PENDING when VI is published;
//  3. a request without the review permission cannot make anything public.
describe('Place description drafts: CAS + revision-bound publish — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let places: PlacesService;
  let ownerId: string;
  let plainId: string;
  let categoryId: string;

  const placeIds: string[] = [];

  async function mkPlace(label: string): Promise<{ id: string; slug: string }> {
    const slug = `e2e-desc-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, short_description, description)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published', 'short gốc', 'desc gốc')
       RETURNING id`,
      [`E2E ${label}`, slug, categoryId],
    );
    placeIds.push(rows[0].id);
    return { id: rows[0].id, slug };
  }

  async function translationRow(id: string) {
    const rows: Array<{ human_review_status: string; is_public: boolean; is_current: boolean; translated_text: string }> =
      await ds.query(
        `SELECT human_review_status, is_public, is_current, translated_text FROM place_translations WHERE id = $1`,
        [id],
      );
    return rows[0];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    places = app.get(PlacesService);

    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'beach' LIMIT 1`);
    categoryId = cat.id;

    const [owner] = await ds.query(`INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`, [
      `e2e-desc-owner-${Date.now()}@example.test`,
      'E2E content owner',
    ]);
    ownerId = owner.id;
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'content_owner'`,
      [ownerId],
    );

    const [plain] = await ds.query(`INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`, [
      `e2e-desc-plain-${Date.now()}@example.test`,
      'E2E plain member',
    ]);
    plainId = plain.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('EN PENDING giữ nguyên khi publish VI (publish chỉ duyệt đúng id được gửi)', async () => {
    const p = await mkPlace('en-untouched');
    const [en] = await places.saveDescriptionDraft(p.id, { en: 'EN draft', expected_en_id: null }, ownerId);
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'VI mới', expected_vi_id: null }, ownerId);

    const results = await places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, ownerId);

    expect(results).toEqual([{ locale_code: 'vi', translation_id: vi.id, ok: true }]);
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'APPROVED', is_public: true });
    expect(await translationRow(en.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false, is_current: true });
  });

  it('lưu nháp bằng expected_vi_id cũ (đã có bản current khác) → 409, không ghi hàng mới', async () => {
    const p = await mkPlace('stale-save');
    const [first] = await places.saveDescriptionDraft(p.id, { vi: 'V1', expected_vi_id: null }, ownerId);
    await expect(places.saveDescriptionDraft(p.id, { vi: 'V2', expected_vi_id: null }, ownerId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM place_translations WHERE place_id = $1 AND field_key = 'description' AND locale_code = 'vi'`,
      [p.id],
    );
    expect(n).toBe(1);
    expect(await translationRow(first.id)).toMatchObject({ is_current: true, translated_text: 'V1' });
  });

  it('bản nháp đổi sau khi owner đọc → publish revision cũ bị 409; publish revision mới thì được', async () => {
    const p = await mkPlace('revision-bound');
    const [a] = await places.saveDescriptionDraft(p.id, { vi: 'A', expected_vi_id: null }, ownerId);
    // Owner read A; someone else saves B (expected = A) → A is superseded.
    const [b] = await places.saveDescriptionDraft(p.id, { vi: 'B', expected_vi_id: a.id }, ownerId);

    // Per-locale outcome: the stale id is refused with 409 for that locale only; nothing is approved.
    await expect(places.publishDescriptionDraft(p.id, { vi_translation_id: a.id }, ownerId)).resolves.toEqual([
      { locale_code: 'vi', translation_id: a.id, ok: false, status: 409, error: expect.any(String) },
    ]);
    expect(await translationRow(a.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });

    await places.publishDescriptionDraft(p.id, { vi_translation_id: b.id }, ownerId);
    expect(await translationRow(b.id)).toMatchObject({ human_review_status: 'APPROVED', is_public: true });
  });

  it('hai ghi đồng thời cùng expected_vi_id = null → đúng một thành công, một 409 (không 500, không ghi đè im lặng)', async () => {
    const p = await mkPlace('race-create');
    const outcomes = await Promise.allSettled([
      places.saveDescriptionDraft(p.id, { vi: 'race X', expected_vi_id: null }, ownerId),
      places.saveDescriptionDraft(p.id, { vi: 'race Y', expected_vi_id: null }, ownerId),
    ]);
    const ok = outcomes.filter((o) => o.status === 'fulfilled');
    const failed = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM place_translations WHERE place_id = $1 AND field_key = 'description' AND locale_code = 'vi' AND is_current`,
      [p.id],
    );
    expect(n).toBe(1);
  });

  it('hai ghi đồng thời cùng expected_vi_id = A → đúng một thành công', async () => {
    const p = await mkPlace('race-update');
    const [a] = await places.saveDescriptionDraft(p.id, { vi: 'base', expected_vi_id: null }, ownerId);
    const outcomes = await Promise.allSettled([
      places.saveDescriptionDraft(p.id, { vi: 'U1', expected_vi_id: a.id }, ownerId),
      places.saveDescriptionDraft(p.id, { vi: 'U2', expected_vi_id: a.id }, ownerId),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(failed?.reason).toBeInstanceOf(ConflictException);
  });

  it('actor không có PlaceTranslation.Review.Any không công khai được gì', async () => {
    const p = await mkPlace('no-permission');
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'chờ duyệt', expected_vi_id: null }, ownerId);
    await expect(places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, plainId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });
  });

  it('public chỉ đọc bản đã publish đúng locale; EN chưa duyệt không lộ ra', async () => {
    const p = await mkPlace('public-read');
    const [en] = await places.saveDescriptionDraft(p.id, { en: 'EN chưa duyệt', expected_en_id: null }, ownerId);
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'VI đã duyệt', expected_vi_id: null }, ownerId);
    await places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, ownerId);

    const viView = await places.getBySlug(p.slug, 'vi');
    const enView = await places.getBySlug(p.slug, 'en');
    expect(viView.description).toBe('VI đã duyệt');
    expect(enView.description).toBe('desc gốc');
    expect(await translationRow(en.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });
  });

  it('name và short_description không bị đổi khi chỉ publish description', async () => {
    const p = await mkPlace('scope');
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'chỉ mô tả', expected_vi_id: null }, ownerId);
    await places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, ownerId);

    const [base] = await ds.query(`SELECT name, short_description FROM places WHERE id = $1`, [p.id]);
    expect(base).toEqual({ name: 'E2E scope', short_description: 'short gốc' });
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM place_translations WHERE place_id = $1 AND field_key IN ('display_name','short_description')`,
      [p.id],
    );
    expect(n).toBe(0);
  });

  it('publish NAME theo id không duyệt EN đang PENDING của name', async () => {
    const p = await mkPlace('name-en-untouched');
    const [en] = await places.saveNameDraft(p.id, { en: 'EN name', expected_en_id: null }, ownerId);
    const [vi] = await places.saveNameDraft(p.id, { vi: 'Tên VI', expected_vi_id: null }, ownerId);
    await places.publishNameDraft(p.id, { vi_translation_id: vi.id }, ownerId);
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'APPROVED', is_public: true });
    expect(await translationRow(en.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false, is_current: true });
  });

  it('lưu name bằng expected cũ → 409 và không ghi hàng mới', async () => {
    const p = await mkPlace('name-stale');
    const [first] = await places.saveNameDraft(p.id, { vi: 'N1', expected_vi_id: null }, ownerId);
    await expect(places.saveNameDraft(p.id, { vi: 'N2', expected_vi_id: null }, ownerId)).rejects.toBeInstanceOf(ConflictException);
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM place_translations WHERE place_id = $1 AND field_key = 'display_name' AND locale_code = 'vi'`,
      [p.id],
    );
    expect(n).toBe(1);
    expect(await translationRow(first.id)).toMatchObject({ is_current: true, translated_text: 'N1' });
  });

  it('publish id thuộc place/field/locale khác → 404 và không duyệt gì', async () => {
    const p = await mkPlace('wrong-scope');
    const other = await mkPlace('wrong-scope-other');
    const [descVi] = await places.saveDescriptionDraft(p.id, { vi: 'mô tả', expected_vi_id: null }, ownerId);
    const [nameVi] = await places.saveNameDraft(p.id, { vi: 'tên', expected_vi_id: null }, ownerId);
    await expect(places.publishDescriptionDraft(other.id, { vi_translation_id: descVi.id }, ownerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(places.publishNameDraft(p.id, { vi_translation_id: descVi.id }, ownerId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(places.publishDescriptionDraft(p.id, { en_translation_id: descVi.id }, ownerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await translationRow(descVi.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });
    expect(await translationRow(nameVi.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });
  });

  it('body publish rỗng bị từ chối (400), không duyệt gì', async () => {
    const p = await mkPlace('empty-body');
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'x', expected_vi_id: null }, ownerId);
    await expect(places.publishDescriptionDraft(p.id, {}, ownerId)).rejects.toBeInstanceOf(BadRequestException);
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false });
  });

  it('publish VI và EN cùng lúc, EN đã bị thay → VI ok, EN ok:false 409 riêng; EN current không đổi', async () => {
    const p = await mkPlace('per-locale');
    const [enA] = await places.saveDescriptionDraft(p.id, { en: 'EN A', expected_en_id: null }, ownerId);
    const [enB] = await places.saveDescriptionDraft(p.id, { en: 'EN B', expected_en_id: enA.id }, ownerId);
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'VI ok', expected_vi_id: null }, ownerId);

    const results = await places.publishDescriptionDraft(
      p.id,
      { vi_translation_id: vi.id, en_translation_id: enA.id },
      ownerId,
    );

    expect(results).toEqual([
      { locale_code: 'vi', translation_id: vi.id, ok: true },
      { locale_code: 'en', translation_id: enA.id, ok: false, status: 409, error: expect.any(String) },
    ]);
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'APPROVED', is_public: true });
    expect(await translationRow(enB.id)).toMatchObject({ human_review_status: 'PENDING', is_public: false, is_current: true });
  });

  // ---------------------------------------------------------------------------
  // Concurrency. Each case uses a fresh place and states the serial order it can produce.
  // ---------------------------------------------------------------------------

  it('CẠNH TRANH publish–publish cùng một id: đúng một thành công, lần còn lại ok:false 409; hàng chỉ duyệt một lần', async () => {
    const p = await mkPlace('race-pub-pub');
    const [vi] = await places.saveDescriptionDraft(p.id, { vi: 'chỉ một lần', expected_vi_id: null }, ownerId);
    const outcomes = await Promise.all([
      places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, ownerId),
      places.publishDescriptionDraft(p.id, { vi_translation_id: vi.id }, ownerId),
    ]);
    const oks = outcomes.map((r) => r[0].ok);
    expect(oks.filter(Boolean)).toHaveLength(1);
    const failed = outcomes.find((r) => !r[0].ok);
    expect(failed?.[0]).toMatchObject({ locale_code: 'vi', ok: false, status: 409 });
    expect(await translationRow(vi.id)).toMatchObject({ human_review_status: 'APPROVED', is_current: true });
  });

  it('CẠNH TRANH save revision mới (expected A) với publish A, lặp 8 lần: publish A chỉ ok khi A còn current lúc duyệt; không bao giờ duyệt hàng đã bị thay', async () => {
    const orders: Record<string, number> = { publishFirst: 0, saveFirst: 0 };
    for (let i = 0; i < 8; i += 1) {
      const p = await mkPlace(`race-save-pub-${i}`);
      const [a] = await places.saveDescriptionDraft(p.id, { vi: `A${i}`, expected_vi_id: null }, ownerId);
      const [pub, save] = await Promise.allSettled([
        places.publishDescriptionDraft(p.id, { vi_translation_id: a.id }, ownerId),
        places.saveDescriptionDraft(p.id, { vi: `B${i}`, expected_vi_id: a.id }, ownerId),
      ]);
      // Save against the id it read is always valid: publishing does not change which row is current.
      expect(save.status).toBe('fulfilled');
      const newId = (save as PromiseFulfilledResult<Array<{ id: string }>>).value[0].id;
      const aRow = await translationRow(a.id);
      const bRow = await translationRow(newId);
      if (pub.status === 'fulfilled' && pub.value[0].ok) {
        // Serial order: publish first (A was current), then save superseded the approved A.
        orders.publishFirst += 1;
        expect(aRow).toMatchObject({ human_review_status: 'APPROVED', is_current: false });
      } else {
        // Serial order: save first (A no longer current when publish checked); publish refused with 409.
        orders.saveFirst += 1;
        expect(pub.status === 'fulfilled' ? pub.value[0] : null).toMatchObject({ ok: false, status: 409 });
        expect(aRow).toMatchObject({ human_review_status: 'PENDING', is_current: false });
      }
      // The new revision is current and has not been approved by this race.
      expect(bRow).toMatchObject({ human_review_status: 'PENDING', is_current: true });
    }
    // Both serial orders must be observed in a healthy run; print for the evidence log.
    console.log('RACE save-vs-publish orders:', JSON.stringify(orders));
    expect(orders.publishFirst + orders.saveFirst).toBe(8);
  }, 120_000);
});
