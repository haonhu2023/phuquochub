import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// S1 closing pass (2026-09-22) — E2E trên Postgres/Redis THẬT, closes the permission/CAS gaps the
// unit suite cannot exercise (RBAC is enforced by real guards wired into the real HTTP pipeline,
// not by calling SiteContentService directly).
//
// Covers, per the closing-pass checklist:
//  - anonymous/member: public GET only returns display data, no admin surface, no PUT.
//  - content_owner: PUT works, admin GET (listAll) works.
//  - two sessions racing the SAME block: the stale session's PUT is rejected (409), and the
//    winner's content is NOT overwritten — verified by reading the DB directly, not just the HTTP
//    response.
//  - write-time validation added in this pass: heroMediaId must reference a real published media
//    row, home_featured.placeSlugs must reference real published places, social URLs must be
//    http(s) (not javascript:/data:).
describe('Site Content CMS (S1) — permissions, CAS, validation (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;
  let publishedPlaceSlug: string;
  let publishedMediaId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const mediaIds: string[] = [];
  const siteContentKeys: Array<{ key: string; locale: string }> = [];

  async function createUser(label: string) {
    const email = `e2e_sitecontent_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `SiteContent E2E ${label}`],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    return { accessToken, userId, email };
  }

  async function assignRole(userId: string, roleCode: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`,
      [userId, roleId],
    );
  }

  function trackKey(key: string, locale: string) {
    if (!siteContentKeys.some((k) => k.key === key && k.locale === locale)) siteContentKeys.push({ key, locale });
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
    jwt = app.get(JwtService);
    config = app.get(ConfigService);

    const [cat] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = cat.id;

    publishedPlaceSlug = `e2e-sitecontent-place-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [place]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E SiteContent Place', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [publishedPlaceSlug, categoryId],
    );
    placeIds.push(place.id);

    const owner = await createUser('media_owner');
    const [media]: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
       VALUES ('image','upload','published',$1,$2,'e2e-sitecontent-bucket','image/jpeg',100,$3)
       RETURNING id`,
      [owner.userId, `media/e2e-sitecontent-${Date.now()}-${Math.random()}.jpg`, (Date.now() % 1e9).toString().padStart(64, '0')],
    );
    mediaIds.push(media.id);
    publishedMediaId = media.id;
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        for (const { key, locale } of siteContentKeys) {
          await ds.query(`DELETE FROM site_content WHERE key = $1 AND locale = $2`, [key, locale]);
        }
        if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1) OR actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  // ---- A. Public read surface ----------------------------------------------------------------

  describe('A. Public GET — no admin data leaks, no auth required', () => {
    it('anonymous GET /site-content/home → 200, only display fields (no updatedBy/contentVersion anywhere)', async () => {
      const res = await request(app.getHttpServer()).get('/api/site-content/home?locale=vi');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['about', 'featuredPlaceSlugs', 'hero', 'social'].sort());
      expect(JSON.stringify(res.body)).not.toMatch(/updatedBy|updated_by|contentVersion|content_version/);
    });
  });

  // ---- B. Write path is permission-gated -----------------------------------------------------

  describe('B. Admin write/read surface is gated by SiteContent.Edit', () => {
    it('anonymous PUT /admin/site-content → 401', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .send({ key: 'home_hero', locale: 'vi', value: { eyebrow: 'e', title: 't', lede: 'l' }, expectedContentVersion: 0 });
      expect(res.status).toBe(401);
    });

    it('a plain member (no content_owner role) PUT /admin/site-content → 403', async () => {
      const member = await createUser('member');
      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ key: 'home_hero', locale: 'vi', value: { eyebrow: 'e', title: 't', lede: 'l' }, expectedContentVersion: 0 });
      expect(res.status).toBe(403);
    });

    it('a plain member GET /admin/site-content (listAll) → 403 — the admin surface itself is not readable either', async () => {
      const member = await createUser('member_read');
      const res = await request(app.getHttpServer())
        .get('/api/admin/site-content')
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('content_owner PUT /admin/site-content → 200/201, writes and returns the row', async () => {
      const owner = await createUser('owner_write');
      await assignRole(owner.userId, 'content_owner');
      trackKey('home_about', 'vi');

      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_about', locale: 'vi', value: { title: 'Về chúng tôi', body: 'Nội dung thật.' }, expectedContentVersion: 0 });

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.contentVersion).toBe(1);

      const listRes = await request(app.getHttpServer())
        .get('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((r: { key: string; locale: string }) => r.key === 'home_about' && r.locale === 'vi')).toBe(true);
    });

    it('public GET reflects a content_owner write immediately (no-store, matches the rest of the app)', async () => {
      const owner = await createUser('owner_reflect');
      await assignRole(owner.userId, 'content_owner');
      trackKey('home_hero', 'vi');

      await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_hero', locale: 'vi', value: { eyebrow: 'E2E eyebrow', title: 'E2E title', lede: 'E2E lede' }, expectedContentVersion: 0 })
        .expect(200);

      const publicRes = await request(app.getHttpServer()).get('/api/site-content/home?locale=vi');
      expect(publicRes.body.data.hero).toEqual({ eyebrow: 'E2E eyebrow', title: 'E2E title', lede: 'E2E lede', heroImageUrl: null });
    });
  });

  // ---- C. Two sessions racing the same block -------------------------------------------------

  describe('C. CAS — two sessions editing the same block', () => {
    it('stale session is rejected (409), and the DB keeps the WINNING session\'s content, not the loser\'s', async () => {
      const owner = await createUser('owner_race');
      await assignRole(owner.userId, 'content_owner');
      trackKey('home_about', 'en');

      // Session A "loads" the row at v0 (nothing saved yet) by reading listAll — in practice this
      // is just "the editor opened the page before anyone had saved this block".
      const before = await request(app.getHttpServer())
        .get('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(before.status).toBe(200);

      // Session B saves first — wins, becomes v1.
      const winner = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_about', locale: 'en', value: { title: 'Winner', body: 'B saved first' }, expectedContentVersion: 0 });
      expect(winner.status).toBe(200);
      expect(winner.body.data.contentVersion).toBe(1);

      // Session A still believes the row does not exist (expectedContentVersion=0) — stale.
      const loser = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_about', locale: 'en', value: { title: 'Loser', body: 'A was stale' }, expectedContentVersion: 0 });
      expect(loser.status).toBe(409);

      // The DB holds B's content, untouched by A's rejected write — read directly, not just via
      // the HTTP response, so this actually proves no partial/silent write happened.
      const [row] = await ds.query(`SELECT value, content_version FROM site_content WHERE key = 'home_about' AND locale = 'en'`);
      expect(row.value).toEqual({ title: 'Winner', body: 'B saved first' });
      expect(row.content_version).toBe(1);
    });
  });

  // ---- D. Write-time validation added in the S1 closing pass ---------------------------------

  describe('D. heroMediaId must reference a real, published media row', () => {
    it('a well-formed but nonexistent media id → 400', async () => {
      const owner = await createUser('owner_media_bad');
      await assignRole(owner.userId, 'content_owner');
      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_hero', locale: 'en', value: { eyebrow: 'e', title: 't', lede: 'l', heroMediaId: '00000000-0000-0000-0000-000000000000' }, expectedContentVersion: 0 });
      expect(res.status).toBe(400);
    });

    it('a real published media id → 200, resolved to a full URL on the public read', async () => {
      const owner = await createUser('owner_media_good');
      await assignRole(owner.userId, 'content_owner');
      trackKey('home_hero', 'en');

      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_hero', locale: 'en', value: { eyebrow: 'e', title: 't', lede: 'l', heroMediaId: publishedMediaId }, expectedContentVersion: 0 });
      expect(res.status).toBe(200);

      const publicRes = await request(app.getHttpServer()).get('/api/site-content/home?locale=en');
      expect(publicRes.body.data.hero.heroImageUrl).toContain(publishedMediaId);
    });
  });

  describe('E. home_featured.placeSlugs must reference real, published places', () => {
    it('a slug that is not a published place → 400, naming it', async () => {
      const owner = await createUser('owner_featured_bad');
      await assignRole(owner.userId, 'content_owner');
      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_featured', locale: '*', value: { placeSlugs: ['this-slug-does-not-exist'] }, expectedContentVersion: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/this-slug-does-not-exist/);
    });

    it('a real published place slug → 200, and the public homepage read resolves it', async () => {
      const owner = await createUser('owner_featured_good');
      await assignRole(owner.userId, 'content_owner');
      trackKey('home_featured', '*');

      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ key: 'home_featured', locale: '*', value: { placeSlugs: [publishedPlaceSlug] }, expectedContentVersion: 0 });
      expect(res.status).toBe(200);

      const publicRes = await request(app.getHttpServer()).get('/api/site-content/home?locale=vi');
      expect(publicRes.body.data.featuredPlaceSlugs).toEqual([publishedPlaceSlug]);
    });
  });

  describe('F. social_links rejects non-http(s) URLs — XSS defense at the write boundary', () => {
    it('a javascript: URL → 400', async () => {
      const owner = await createUser('owner_social_xss');
      await assignRole(owner.userId, 'content_owner');
      const res = await request(app.getHttpServer())
        .put('/api/admin/site-content')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          key: 'social_links',
          locale: '*',
          value: { facebook: 'javascript:alert(1)', zalo: null, instagram: null, whatsapp: null, phone: null },
          expectedContentVersion: 0,
        });
      expect(res.status).toBe(400);
    });
  });
});
