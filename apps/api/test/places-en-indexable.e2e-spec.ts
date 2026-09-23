import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PlaceTranslationsService } from '../src/modules/place-translations/place-translations.service';
import { TranslationReviewService } from '../src/modules/place-translations/translation-review.service';
import { TranslationMethod } from '../src/modules/place-translations/place-translations.enums';
import { HumanReviewStatus } from '../src/modules/multilingual-import/multilingual-import.enums';
import { RevisionOrigin } from '../src/modules/revisions/revision.enums';

// SEO1 (2026-09-22) — E2E trên Postgres THẬT cho `POST /places/en-indexable-ids`. Trước bản sửa
// này, sitemap.ts gọi `isEnDetailIndexable(undefined)` cho MỌI place/hotel/restaurant/tour — luôn
// `false`, không bao giờ đưa `/en/{slug}` nào vào sitemap dù entity đó đã đủ điều kiện thật. Test
// này xác nhận endpoint MỚI trả đúng — qua HTTP thật, DB thật — không chỉ qua unit test đã mock
// repository.
//
// Seeding path: publishTranslationBundle() ALONE only creates a PENDING/non-public/non-production
// row regardless of what flags the caller passes (GOVERNANCE HARDENING, human-translation-review
// 2026-09-04 — see place-translations.service.ts's own comment on publishOneTranslation) — content
// creation is deliberately never also an approval. Reaching the actual "current+public+production"
// state findCurrentPublic()/the new batched query require requires going through
// TranslationReviewService.reviewTranslation() with a REAL reviewer (active, non-service-account,
// holding PlaceTranslation.Review.Any) — same as production. Hand-rolling the row via raw SQL
// would bypass exactly the governance path this endpoint's correctness depends on.
describe('POST /places/en-indexable-ids (SEO1, e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let translationsService: PlaceTranslationsService;
  let reviewService: TranslationReviewService;
  let categoryId: string;
  let reviewerId: string;

  const placeIds: string[] = [];
  const userIds: string[] = [];

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [
        `E2E EnIndexable ${label}`,
        `e2e-en-indexable-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  function enItem(fieldKey: string, text: string) {
    return {
      fieldKey,
      localeCode: 'en',
      sourceLocaleCode: 'vi',
      translatedText: text,
      sourceText: 'Nội dung tiếng Việt gốc',
      translationMethod: TranslationMethod.HUMAN,
      translationStatus: 'TRANSLATED',
      humanReviewStatus: 'PENDING',
      qualityGate: 'NEEDS_REVIEW',
      isPublic: false,
      isProductionData: false,
      productionEligible: false,
    };
  }

  // Publishes then APPROVES each field — the only real path to current+public+production.
  async function publishAndApprove(placeId: string, fieldKeys: string[]): Promise<void> {
    const rows = await translationsService.publishTranslationBundle({
      placeId,
      origin: RevisionOrigin.IMPORT,
      items: fieldKeys.map((fk) => enItem(fk, `English ${fk}`)),
    });
    for (const row of rows) {
      await reviewService.reviewTranslation(row.id, reviewerId, HumanReviewStatus.APPROVED, null);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    translationsService = app.get(PlaceTranslationsService);
    reviewService = app.get(TranslationReviewService);

    const [cat] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = cat.id;

    const email = `e2e_en_indexable_reviewer_${Date.now()}@phuquochub.test`;
    const [reviewer]: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, 'E2E EnIndexable Reviewer'],
    );
    reviewerId = reviewer.id;
    userIds.push(reviewerId);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'moderator'`);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`,
      [reviewerId, roleId],
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          const translationRows: Array<{ id: string }> = await ds.query(
            `SELECT id FROM place_translations WHERE place_id = ANY($1)`,
            [placeIds],
          );
          const translationIds = translationRows.map((r) => r.id);
          // place_translations.revision_id REFERENCES wiki_revisions — delete the REFERRER first.
          await ds.query(`DELETE FROM place_translations WHERE place_id = ANY($1)`, [placeIds]);
          if (translationIds.length) {
            await ds.query(`DELETE FROM wiki_revisions WHERE entity_type = 'place_translation' AND entity_id = ANY($1)`, [translationIds]);
          }
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) {
          await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1) OR actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  it('anonymous request works — @Public, no auth required', async () => {
    const placeId = await mkPlace('anon');
    const res = await request(app.getHttpServer())
      .post('/api/places/en-indexable-ids')
      .send({ ids: [placeId] });
    expect(res.status).toBe(200);
  });

  it('a place with NEITHER field translated → NOT in the result (matches sitemap.ts\'s previous always-false, still safe)', async () => {
    const placeId = await mkPlace('none');
    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: [placeId] });
    expect(res.body.data).toEqual([]);
  });

  it('a place with BOTH display_name AND short_description approved for en → IS in the result', async () => {
    const placeId = await mkPlace('both');
    await publishAndApprove(placeId, ['display_name', 'short_description']);

    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: [placeId] });
    expect(res.body.data).toEqual([placeId]);
  });

  it('a place with only ONE of the two fields approved → NOT in the result (AND semantics, not OR)', async () => {
    const placeId = await mkPlace('partial');
    await publishAndApprove(placeId, ['display_name']);

    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: [placeId] });
    expect(res.body.data).toEqual([]);
  });

  it('a place with both fields published but NOT YET reviewed → NOT in the result (pending ≠ approved)', async () => {
    const placeId = await mkPlace('pending');
    await translationsService.publishTranslationBundle({
      placeId,
      origin: RevisionOrigin.IMPORT,
      items: [enItem('display_name', 'Unreviewed name'), enItem('short_description', 'Unreviewed description')],
    });

    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: [placeId] });
    expect(res.body.data).toEqual([]);
  });

  it('mixed batch of eligible and ineligible ids → returns ONLY the eligible subset, correct set', async () => {
    const eligible = await mkPlace('batch_eligible');
    const ineligible = await mkPlace('batch_ineligible');
    await publishAndApprove(eligible, ['display_name', 'short_description']);

    const res = await request(app.getHttpServer())
      .post('/api/places/en-indexable-ids')
      .send({ ids: [ineligible, eligible] });
    expect(res.body.data).toEqual([eligible]);
  });

  it('empty ids array → 200 with empty result', async () => {
    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a non-UUID id → 400 (validated before hitting the DB)', async () => {
    const res = await request(app.getHttpServer()).post('/api/places/en-indexable-ids').send({ ids: ['not-a-uuid'] });
    expect(res.status).toBe(400);
  });
});
