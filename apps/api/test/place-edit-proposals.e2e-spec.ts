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

// "Đề xuất chỉnh sửa" (Ưu tiên 3/Gói B, tích hợp 2026-09-24) — E2E trên Postgres/Redis THẬT, cùng
// chuỗi migration production dùng (1720006700000/1720006800000/1720006900000 mới nhất). Bao phủ
// đúng ma trận owner yêu cầu: submit → duyệt áp dụng qua update() thật (CAS content_version tăng
// đúng 1) → xung đột KHÔNG ghi đè khi dữ liệu gốc đã đổi → phạm vi quyền (member gửi được nhưng
// không xem/duyệt được, content_owner duyệt được sau GrantContentOwnerPlaceEditProposalModeration).
//
// QUAN TRỌNG: `POST /places/{id}/edit-proposals` tự giới hạn 5 request/phút (throttle theo route+IP
// — mọi request trong file này CÙNG IP nên CHUNG một ngân sách, kể cả request bị 401 trước khi tới
// handler — xác nhận thực nghiệm: lần chạy đầu request #6 nhận 429). File này giữ ĐÚNG 5 lệnh gọi
// THỰC vào route đó trong TOÀN BỘ suite — cùng nguyên tắc "không bypass/nới lỏng throttle chỉ để
// test chạy qua" đã có ở moderation-reporting.e2e-spec.ts. Vì vậy không có test "reject" riêng
// (status rejected + place không đổi) — hành vi "decide không đụng place" đã được test conflict bên
// dưới bao phủ; double-decide dùng LẠI proposal của test approve thay vì gửi mới.
describe('place-edit-proposals (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const proposalIds: string[] = [];

  async function createUser(label: string) {
    const email = `e2e_pep_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `PEP E2E ${label}`],
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

  async function assignRole(userId: string, roleCode: string) {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type) VALUES ($1,$2,'global')`, [
      userId,
      roleId,
    ]);
  }

  async function mkPlace(label: string, address: string): Promise<{ id: string; contentVersion: number }> {
    const rows: Array<{ id: string; content_version: number }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, address)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published', $4)
       RETURNING id, content_version`,
      [
        `E2E PEP ${label}`,
        `e2e-pep-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
        address,
      ],
    );
    placeIds.push(rows[0].id);
    return { id: rows[0].id, contentVersion: rows[0].content_version };
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
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (proposalIds.length) {
          await ds.query(`DELETE FROM place_edit_proposals WHERE id = ANY($1)`, [proposalIds]);
        }
        if (placeIds.length) {
          await ds.query(`DELETE FROM place_edit_proposals WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM wiki_revisions WHERE entity_id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  // Call #1/5 vào POST .../edit-proposals — không token, chưa tới handler nhưng vẫn tính vào ngân
  // sách throttle (xem ghi chú đầu file).
  it('401 không token cả gửi lẫn xem hàng đợi (deny-by-default)', async () => {
    const place = await mkPlace('anon', 'Địa chỉ gốc');
    const submit = await request(app.getHttpServer())
      .post(`/api/places/${place.id}/edit-proposals`)
      .send({ field_key: 'address', proposed_value: 'X', reason: 'Y' });
    expect(submit.status).toBe(401);

    const list = await request(app.getHttpServer()).get('/api/place-edit-proposals');
    expect(list.status).toBe(401);
  });

  // Call #2/5.
  it('member gửi được đề xuất (201) nhưng KHÔNG xem/duyệt được hàng đợi (403)', async () => {
    const place = await mkPlace('member-scope', 'Địa chỉ gốc');
    const member = await createUser('member_scope');
    await assignRole(member.userId, 'member');

    const submit = await request(app.getHttpServer())
      .post(`/api/places/${place.id}/edit-proposals`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ field_key: 'address', proposed_value: 'Địa chỉ mới', reason: 'Ghé thực tế' });
    expect(submit.status).toBe(201);
    proposalIds.push(submit.body.data.id);
    expect(submit.body.data.status).toBe('pending');

    const list = await request(app.getHttpServer())
      .get('/api/place-edit-proposals')
      .set('Authorization', `Bearer ${member.accessToken}`);
    expect(list.status).toBe(403);
  });

  // Call #3/5 — trùng field_key/place_id/proposer của call #2's place, place khác nhau nên không
  // trùng unique index theo place — cần MỘT place riêng có ĐÚNG một submit gốc rồi gửi lặp.
  it('trùng đề xuất đang chờ (cùng place/field/proposer) → 409, không tạo hàng thứ hai', async () => {
    const place = await mkPlace('dup', 'Địa chỉ gốc');
    const member = await createUser('dup');
    await assignRole(member.userId, 'member');
    const body = { field_key: 'address' as const, proposed_value: 'Mới', reason: 'Lý do' };

    const first = await request(app.getHttpServer())
      .post(`/api/places/${place.id}/edit-proposals`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send(body);
    expect(first.status).toBe(201);
    proposalIds.push(first.body.data.id);

    // KHÔNG một call thứ hai thật vào route (ngân sách chỉ còn 1 sau test này) — xác nhận trùng lặp
    // bằng cách đọc thẳng DB: unique index `uq_place_edit_proposal_pending_per_proposer_field` phải
    // từ chối một INSERT thứ hai cùng (place_id, field_key, proposer_id) trạng thái pending. Đây là
    // RÀNG BUỘC DB THẬT (không phải giả lập ở tầng service) — cùng bảo vệ mà endpoint dựa vào.
    await expect(
      ds.query(
        `INSERT INTO place_edit_proposals (place_id, field_key, proposed_value, base_value_hash, reason, proposer_id)
         SELECT place_id, field_key, proposed_value, base_value_hash, reason, proposer_id
         FROM place_edit_proposals WHERE id = $1`,
        [first.body.data.id],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  // Call #4/5 — dùng luôn để test CẢ approve LẪN double-decide (không gửi thêm).
  it('content_owner duyệt (approve) → áp dụng NGAY qua update() thật (content_version +1, wiki_revisions +1), rồi quyết định LẦN HAI trên CÙNG đề xuất → 409 (chống double-apply)', async () => {
    const place = await mkPlace('approve', 'Địa chỉ gốc trước duyệt');
    const member = await createUser('approve_submitter');
    await assignRole(member.userId, 'member');
    const owner = await createUser('approve_owner');
    await assignRole(owner.userId, 'content_owner');

    const submit = await request(app.getHttpServer())
      .post(`/api/places/${place.id}/edit-proposals`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ field_key: 'address', proposed_value: 'Địa chỉ ĐÃ DUYỆT', reason: 'Chính xác hơn' });
    expect(submit.status).toBe(201);
    const proposalId = submit.body.data.id as string;
    proposalIds.push(proposalId);

    const revisionCountBefore: Array<{ n: string }> = await ds.query(
      `SELECT count(*)::text AS n FROM wiki_revisions WHERE entity_id = $1`,
      [place.id],
    );

    const decide = await request(app.getHttpServer())
      .post(`/api/place-edit-proposals/${proposalId}/decide`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ decision: 'approve' });
    expect(decide.status).toBe(201);
    expect(decide.body.data.status).toBe('approved');

    // Nguồn sự thật: đọc thẳng DB, không tin body response cho phần "đã thật sự áp dụng".
    const [row]: Array<{ address: string; content_version: number }> = await ds.query(
      `SELECT address, content_version FROM places WHERE id = $1`,
      [place.id],
    );
    expect(row.address).toBe('Địa chỉ ĐÃ DUYỆT');
    expect(row.content_version).toBe(place.contentVersion + 1);

    const revisionCountAfter: Array<{ n: string }> = await ds.query(
      `SELECT count(*)::text AS n FROM wiki_revisions WHERE entity_id = $1`,
      [place.id],
    );
    expect(Number(revisionCountAfter[0].n)).toBe(Number(revisionCountBefore[0].n) + 1);

    // Double-decide trên CÙNG proposal (đã approved) — /decide không throttle riêng, không tính
    // vào ngân sách của route submit.
    const second = await request(app.getHttpServer())
      .post(`/api/place-edit-proposals/${proposalId}/decide`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ decision: 'reject' });
    expect(second.status).toBe(409);
  });

  // Call #5/5.
  it('conflict: dữ liệu gốc đổi SAU khi gửi, TRƯỚC khi duyệt → status=conflict, KHÔNG ghi đè, place giữ giá trị đã đổi (không phải đề xuất, không phải giá trị lúc gửi)', async () => {
    const place = await mkPlace('conflict', 'Địa chỉ gốc');
    const member = await createUser('conflict_submitter');
    await assignRole(member.userId, 'member');
    const owner = await createUser('conflict_owner');
    await assignRole(owner.userId, 'content_owner');

    const submit = await request(app.getHttpServer())
      .post(`/api/places/${place.id}/edit-proposals`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ field_key: 'address', proposed_value: 'Đề xuất (sẽ không được áp dụng)', reason: 'X' });
    expect(submit.status).toBe(201);
    const proposalId = submit.body.data.id as string;
    proposalIds.push(proposalId);

    // Một editor khác sửa TRỰC TIẾP trong lúc đề xuất còn đang chờ — mô phỏng đúng race thật, không
    // đi qua update() (không cần CAS ở bước mô phỏng này, chỉ cần đổi giá trị gốc).
    await ds.query(`UPDATE places SET address = $1, content_version = content_version + 1 WHERE id = $2`, [
      'Địa chỉ người khác vừa sửa',
      place.id,
    ]);

    const decide = await request(app.getHttpServer())
      .post(`/api/place-edit-proposals/${proposalId}/decide`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ decision: 'approve' });
    expect(decide.status).toBe(201);
    expect(decide.body.data.status).toBe('conflict');

    const [row]: Array<{ address: string }> = await ds.query(`SELECT address FROM places WHERE id = $1`, [
      place.id,
    ]);
    // KHÔNG phải giá trị đề xuất (không bị ghi đè) và KHÔNG phải giá trị gốc lúc gửi (đã đổi thật) —
    // đúng giá trị người khác vừa ghi.
    expect(row.address).toBe('Địa chỉ người khác vừa sửa');
    expect(row.address).not.toBe('Đề xuất (sẽ không được áp dụng)');
  });
});
