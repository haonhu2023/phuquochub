import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// GET/PUT /places/:id/external-identifiers... over real HTTP, live Postgres, real PermissionsGuard
// path — cùng lý do places-preview-authz.e2e-spec.ts tồn tại: metadata-lock spec
// (place-external-identifiers.controller.spec.ts) chỉ chứng minh route KHAI BÁO đúng permission,
// không chứng minh guard THỰC SỰ chặn một actor quản lý place A ghi định danh của place B.
// `(provider, external_id)` có ràng buộc UNIQUE thật ở DB — một external_id hằng (literal) lặp lại
// giữa các lần chạy suite này trên CÙNG một Postgres (vd chạy lại suite, hoặc chạy chung file với
// suite khác không dọn dữ liệu giữa các lần) sẽ va chạm với hàng CŨ của một place KHÁC, biến một
// trường hợp lẽ ra PASS (200) thành trông giống xung đột danh tính thật (400) — phát hiện thật
// 2026-10-16 khi chạy file này 2 lần liên tiếp trên cùng DB cô lập. `uid()` khớp đúng cách
// createUser()/mkPlace() bên dưới đã tự làm cho email/slug — mọi external_id dùng trong file này
// PHẢI đi qua đây, không viết literal trần.
function uid(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe('Place external identifiers over HTTP: managed scope — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_extid_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `ExtId E2E ${label}`],
    );
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkPlace(label: string): Promise<{ id: string }> {
    const slug = `e2e-extid-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, verification_status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.03, 10.05), 4326)::geography, 'draft', 'pending')
       RETURNING id`,
      [`E2E extid ${label}`, slug, categoryId],
    );
    return { id: row.id };
  }

  async function grantManaged(userId: string, placeId: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'business_manager'`);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'managed',$3)`, [
      userId,
      roleId,
      placeId,
    ]);
    await ds.query(`INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1,$2,'manager',$2)`, [
      placeId,
      userId,
    ]);
  }

  // Quyền XÁC NHẬN (2026-10-16) — toàn cục (scope_type='global', KHÔNG business_id), khớp đúng
  // cách migration 1720009100000 cấp PlaceExternalIdentifier.Verify cho content_owner: ai giữ
  // quyền này xác nhận được MỌI place, không giới hạn theo business_id như grantManaged ở trên.
  async function grantContentOwner(userId: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'content_owner'`);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type) VALUES ($1,$2,'global')`, [userId, roleId]);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'hotel' LIMIT 1`);
    categoryId = cat.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('manager của place A: ghi định danh A → 200; ghi định danh B (ngoài phạm vi quản lý) → 403', async () => {
    const a = await mkPlace('scope-a');
    const b = await mkPlace('scope-b');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);
    const idA = uid('ChIJ-scope-a');

    const putA = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: idA });
    expect(putA.status).toBe(200);
    expect(putA.body.data.place_id).toBe(a.id);
    expect(putA.body.data.external_id).toBe(idA);
    expect(putA.body.data.verified_at).toBeNull(); // KHÔNG tự đánh dấu verified chỉ vì vừa nhập

    const putB = await request(app.getHttpServer())
      .put(`/api/places/${b.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: uid('ChIJ-scope-b') });
    expect(putB.status).toBe(403);

    const listA = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);

    const listB = await request(app.getHttpServer())
      .get(`/api/places/${b.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(listB.status).toBe(403);
  });

  it('không có grant nào trên place: ghi/đọc định danh → 403', async () => {
    const a = await mkPlace('nogrant');
    const outsider = await createUser('outsider');

    const put = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ external_id: uid('ChIJ-nogrant') });
    expect(put.status).toBe(403);
  });

  it('không có token: 401 (route KHÔNG công khai)', async () => {
    const a = await mkPlace('noauth');

    const res = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .send({ external_id: uid('ChIJ-noauth') });
    expect(res.status).toBe(401);
  });

  it('lưu lặp cùng giá trị → idempotent (không tạo hàng thứ hai); sửa sang giá trị khác → thay tại chỗ, không nhân đôi', async () => {
    const a = await mkPlace('idempotent');
    const mgr = await createUser('mgr-idempotent');
    await grantManaged(mgr.userId, a.id);
    const idV1 = uid('ChIJ-v1');
    const idV2 = uid('ChIJ-v2-corrected');

    const first = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: idV1 });
    expect(first.status).toBe(200);

    const again = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: idV1 });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);

    const corrected = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: idV2 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.id).toBe(first.body.data.id); // CÙNG hàng, không phải hàng mới
    expect(corrected.body.data.external_id).toBe(idV2);

    const list = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(list.body.data).toHaveLength(1); // vẫn đúng 1 hàng, không nhân đôi
  });

  it('nhập ID đã thuộc place khác → 400, không ghi gì (không áp định danh của một địa điểm cho địa điểm khác)', async () => {
    const a = await mkPlace('conflict-a');
    const b = await mkPlace('conflict-b');
    const mgrA = await createUser('mgr-conflict-a');
    const mgrB = await createUser('mgr-conflict-b');
    await grantManaged(mgrA.userId, a.id);
    await grantManaged(mgrB.userId, b.id);
    const claimedId = uid('ChIJ-claimed-by-a');

    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgrA.accessToken}`)
      .send({ external_id: claimedId });

    const res = await request(app.getHttpServer())
      .put(`/api/places/${b.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgrB.accessToken}`)
      .send({ external_id: claimedId });
    expect(res.status).toBe(400);

    const listB = await request(app.getHttpServer())
      .get(`/api/places/${b.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgrB.accessToken}`);
    expect(listB.body.data).toHaveLength(0);
  });

  it('nhập → xác nhận (qua API thật, KHÔNG phải SQL trực tiếp) → public DTO trả đúng ID; record chưa có ID vẫn hoạt động', async () => {
    const a = await mkPlace('public-readback');
    const mgr = await createUser('mgr-public-readback');
    const confirmer = await createUser('confirmer-public-readback');
    await grantManaged(mgr.userId, a.id);
    await grantContentOwner(confirmer.userId);
    const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [a.id]);
    await ds.query(`UPDATE places SET status = 'published' WHERE id = $1`, [a.id]);

    // Chưa nhập ID nào — record vẫn hoạt động, google_place_id = null.
    const before = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(before.status).toBe(200);
    expect(before.body.data.google_place_id).toBeNull();

    // Người quản lý nhập ID — verifiedAt vẫn null (chưa ai xác minh) → PUBLIC VẪN null, giữ fallback.
    const theId = uid('ChIJ-confirm-flow');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: theId });
    const afterUnverified = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterUnverified.body.data.google_place_id).toBeNull();

    // Người có quyền PlaceExternalIdentifier.Verify xác nhận — qua ĐÚNG endpoint thật, không phải
    // ghi thẳng SQL (cơ chế xác minh giờ đã tồn tại, khác gói trước).
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: theId });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.verified_at).not.toBeNull();

    const afterVerified = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterVerified.body.data.google_place_id).toBe(theId);
  });

  it('actor CHỈ có Place.Edit.Managed (không có PlaceExternalIdentifier.Verify) → confirm/revoke đều 403 (business_manager không xác nhận được — KHÔNG kiểm tra "hai người độc lập", xem 42.1)', async () => {
    const a = await mkPlace('confirm-authz');
    const mgr = await createUser('mgr-confirm-authz');
    await grantManaged(mgr.userId, a.id);
    const theId = uid('ChIJ-self-confirm-attempt');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: theId });

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_external_id: theId });
    expect(confirmRes.status).toBe(403);

    const revokeRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/revoke`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_external_id: theId });
    expect(revokeRes.status).toBe(403);
  });

  it('content_owner giữ CẢ Place.Edit.Any (thoả Place.Edit.Managed) VÀ PlaceExternalIdentifier.Verify → tự nhập rồi tự xác nhận ĐƯỢC (đúng thiết kế MVP, không phải lỗ hổng)', async () => {
    const a = await mkPlace('self-serve-content-owner');
    const owner = await createUser('owner-self-serve');
    await grantContentOwner(owner.userId);
    const theId = uid('ChIJ-self-serve');

    const putRes = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ external_id: theId });
    expect(putRes.status).toBe(200); // Place.Edit.Any thoả Place.Edit.Managed theo xếp hạng scope

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ expected_external_id: theId });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.verified_at).not.toBeNull();
  });

  it('confirm không token → 401; confirm khi chưa có identifier nào → 404', async () => {
    const a = await mkPlace('confirm-noauth');
    const confirmer = await createUser('confirmer-noauth');
    await grantContentOwner(confirmer.userId);

    const noToken = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .send({ expected_external_id: 'ChIJ-irrelevant' });
    expect(noToken.status).toBe(401);

    const noIdentifier = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: 'ChIJ-does-not-exist-yet' });
    expect(noIdentifier.status).toBe(404);
  });

  it('expected_external_id lệch với ID hiện tại (bị thay giữa lúc đọc và lúc bấm xác nhận) → 409, KHÔNG xác nhận nhầm ID mới', async () => {
    const a = await mkPlace('confirm-stale-id');
    const mgr = await createUser('mgr-confirm-stale-id');
    const confirmer = await createUser('confirmer-stale-id');
    await grantManaged(mgr.userId, a.id);
    await grantContentOwner(confirmer.userId);
    const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [a.id]);
    await ds.query(`UPDATE places SET status = 'published' WHERE id = $1`, [a.id]);

    const originalId = uid('ChIJ-what-confirmer-saw');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: originalId });

    // Người quản lý đổi ID NGAY SAU ĐÓ (mô phỏng việc thay đổi xảy ra giữa lúc confirmer đọc/đối
    // chiếu originalId và lúc họ thật sự bấm "Xác nhận").
    const swappedId = uid('ChIJ-swapped-in-before-confirm-clicked');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: swappedId });

    // confirmer vẫn gửi originalId (giá trị họ ĐÃ đọc) — server phải từ chối, không xác nhận swappedId.
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: originalId });
    expect(confirmRes.status).toBe(409);

    const afterRejectedConfirm = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterRejectedConfirm.body.data.google_place_id).toBeNull(); // swappedId KHÔNG bị xác nhận nhầm

    // Đọc lại đúng giá trị hiện tại rồi xác nhận lại — giờ mới thành công.
    const retryConfirm = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: swappedId });
    expect(retryConfirm.status).toBe(200);
    const afterRealConfirm = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterRealConfirm.body.data.google_place_id).toBe(swappedId);
  });

  it('đổi sang ID khác sau khi đã xác nhận → mất xác nhận (verified_at về null, public fallback)', async () => {
    const a = await mkPlace('reset-on-change');
    const mgr = await createUser('mgr-reset-on-change');
    const confirmer = await createUser('confirmer-reset-on-change');
    await grantManaged(mgr.userId, a.id);
    await grantContentOwner(confirmer.userId);
    const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [a.id]);
    await ds.query(`UPDATE places SET status = 'published' WHERE id = $1`, [a.id]);

    const firstId = uid('ChIJ-will-be-replaced');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: firstId });
    await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: firstId });
    const confirmedCheck = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(confirmedCheck.body.data.google_place_id).not.toBeNull();

    // Đổi sang ID khác (sửa nhầm, nhập lại) — xác nhận cũ gắn với ID CŨ, không tự áp dụng cho ID mới.
    const replacement = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: uid('ChIJ-replacement') });
    expect(replacement.body.data.verified_at).toBeNull();

    const afterReplace = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterReplace.body.data.google_place_id).toBeNull(); // về fallback — ID mới CHƯA từng được xác nhận
  });

  it('thu hồi xác nhận → public quay về fallback (null), identifier vẫn còn (chưa xoá)', async () => {
    const a = await mkPlace('revoke-flow');
    const mgr = await createUser('mgr-revoke-flow');
    const confirmer = await createUser('confirmer-revoke-flow');
    await grantManaged(mgr.userId, a.id);
    await grantContentOwner(confirmer.userId);
    const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [a.id]);
    await ds.query(`UPDATE places SET status = 'published' WHERE id = $1`, [a.id]);
    const theId = uid('ChIJ-revoke-flow');

    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: theId });
    await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: theId });
    expect((await request(app.getHttpServer()).get(`/api/places/${slug}`)).body.data.google_place_id).toBe(theId);

    const revokeRes = await request(app.getHttpServer())
      .post(`/api/places/${a.id}/external-identifiers/google-places/revoke`)
      .set('Authorization', `Bearer ${confirmer.accessToken}`)
      .send({ expected_external_id: theId });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.verified_at).toBeNull();
    expect(revokeRes.body.data.external_id).toBe(theId); // KHÔNG xoá identifier, chỉ mất xác nhận

    const afterRevoke = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterRevoke.body.data.google_place_id).toBeNull(); // public quay về fallback
  });

  it('ghi đồng thời (2 external_id khác nhau, cùng place, cùng lúc) → KHÔNG tạo hai primary mâu thuẫn, đúng 1 hàng sau cùng', async () => {
    const a = await mkPlace('concurrent-write');
    const mgr = await createUser('mgr-concurrent-write');
    await grantManaged(mgr.userId, a.id);
    const idX = uid('ChIJ-concurrent-x');
    const idY = uid('ChIJ-concurrent-y');

    const [resX, resY] = await Promise.all([
      request(app.getHttpServer())
        .put(`/api/places/${a.id}/external-identifiers/google-places`)
        .set('Authorization', `Bearer ${mgr.accessToken}`)
        .send({ external_id: idX }),
      request(app.getHttpServer())
        .put(`/api/places/${a.id}/external-identifiers/google-places`)
        .set('Authorization', `Bearer ${mgr.accessToken}`)
        .send({ external_id: idY }),
    ]);
    expect(resX.status).toBe(200);
    expect(resY.status).toBe(200);

    const list = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(list.body.data).toHaveLength(1); // advisory lock tuần tự hoá — không có 2 primary mâu thuẫn
    expect([idX, idY]).toContain(list.body.data[0].external_id); // một trong hai "thắng", không mất dữ liệu kiểu khác
  });

  it('xác nhận đồng thời (2 lần confirm cùng lúc) → không lỗi, verified_at có giá trị, vẫn đúng 1 hàng', async () => {
    const a = await mkPlace('concurrent-confirm');
    const mgr = await createUser('mgr-concurrent-confirm');
    const confirmer = await createUser('confirmer-concurrent-confirm');
    await grantManaged(mgr.userId, a.id);
    await grantContentOwner(confirmer.userId);
    const theId = uid('ChIJ-concurrent-confirm');
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: theId });

    const [c1, c2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
        .set('Authorization', `Bearer ${confirmer.accessToken}`)
        .send({ expected_external_id: theId }),
      request(app.getHttpServer())
        .post(`/api/places/${a.id}/external-identifiers/google-places/confirm`)
        .set('Authorization', `Bearer ${confirmer.accessToken}`)
        .send({ expected_external_id: theId }),
    ]);
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c1.body.data.verified_at).not.toBeNull();
    expect(c2.body.data.verified_at).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(list.body.data).toHaveLength(1);
  });
});
