import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HotelsService } from '../src/modules/hotels/hotels.service';
import type { UpdateHotelDetailsDto } from '../src/modules/hotels/dto/hotels.dto';

// PATCH /hotels/:id/details — live Postgres, real HotelsService.updateDetails() (not a mocked
// repository). Proves the three things a mocked SQL-shape unit test cannot:
//
//   1. PATCH thật sự phân biệt "không gửi field" (giữ nguyên) / "gửi field = value" (ghi) / "gửi
//      field = null" (xoá) — trên DB THẬT, không phải giả định về hành vi COALESCE.
//   2. Đổi giá trị star_rating mà KHÔNG kèm nguồn mới cho đúng giá trị đó -> xoá
//      star_rating_source_id/star_rating_verified_at cũ (không giữ nhãn "có nguồn" cho một giá trị
//      chưa từng được nguồn đó xác minh).
//   3. Giữ nguyên giá trị + cập nhật lại nguồn -> verified_at làm mới.
describe('Hotel details PATCH semantics (giữ/đổi/xoá, nhất quán giá trị-nguồn) — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let hotelsService: HotelsService;
  let categoryId: string;
  let actorId: string;

  const placeIds: string[] = [];
  const sourceIds: string[] = [];
  const userIds: string[] = [];

  async function mkHotelPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'draft')
       RETURNING id`,
      [`E2E Hotel ${label}`, `e2e-hotel-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkSource(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO sources (type, kind, reliability, title) VALUES ('official_website', 'url', 90, $1) RETURNING id`,
      ['E2E test source'],
    );
    sourceIds.push(rows[0].id);
    return rows[0].id;
  }

  async function readDetails(placeId: string) {
    const rows = await ds.query(
      `SELECT hotel_type, star_rating, check_in, check_out, star_rating_source_id, star_rating_verified_at
       FROM place_hotel_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    hotelsService = app.get(HotelsService);

    const [{ id }] = await ds.query(`SELECT id FROM categories WHERE slug = 'hotel' LIMIT 1`);
    categoryId = id;

    const [{ id: uid }] = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e-hotel-details-${Date.now()}@example.test`, 'E2E Hotel Details Actor'],
    );
    actorId = uid;
    userIds.push(uid);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM place_hotel_details WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it('REQUIRED SEQUENCE: tạo đủ trường -> PATCH một trường không xoá các trường khác -> PATCH null xoá đúng trường đó', async () => {
    const placeId = await mkHotelPlace('keep-change-clear');
    const sourceId = await mkSource();

    // hotel_type BẮT BUỘC trong DTO (dropdown luôn có giá trị ở form thật) nên MỌI lời gọi dưới
    // đây đều gửi nó — kịch bản thực tế là "resend cùng giá trị", không phải "bỏ qua trường bắt
    // buộc" (điều đó không thể xảy ra qua kiểu DTO, đã được compiler xác nhận khi viết test này).
    const HOTEL_TYPE = 'resort' as UpdateHotelDetailsDto['hotel_type'];

    // CAS thật (2026-09-30): mỗi lần gọi PHẢI resend content_version của bản đọc gần nhất — nơi
    // trả về nguyên vẹn từ chính response của lần gọi trước (đúng luồng client thật: đọc, sửa, gửi
    // lại version vừa đọc). `places` mới tạo mặc định content_version=1 (AddPlaceContentVersion).
    let version = 1;

    // 1) Tạo lần đầu: đủ 4 trường + nguồn cho hạng sao.
    let result = await hotelsService.updateDetails(
      placeId,
      { expected_content_version: version, hotel_type: HOTEL_TYPE, star_rating: 4, star_rating_source_id: sourceId, check_in: '14:00', check_out: '12:00' },
      actorId,
    );
    version = result.content_version!;
    let row = await readDetails(placeId);
    expect(row).toMatchObject({ hotel_type: HOTEL_TYPE, star_rating: 4, check_in: '14:00:00', check_out: '12:00:00', star_rating_source_id: sourceId });
    expect(row.star_rating_verified_at).not.toBeNull();
    const firstVerifiedAt = row.star_rating_verified_at;

    // 2) PATCH resend hotel_type (không đổi) nhưng KHÔNG gửi star_rating/check_in/check_out/nguồn
    // — các trường đó phải GIỮ NGUYÊN (bug đã sửa: trước đây COALESCE-trên-NULL-param xoá mất
    // mọi trường không được gửi trong lần PATCH này).
    result = await hotelsService.updateDetails(placeId, { expected_content_version: version, hotel_type: HOTEL_TYPE }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row).toMatchObject({
      hotel_type: HOTEL_TYPE,
      star_rating: 4,
      check_in: '14:00:00',
      check_out: '12:00:00',
      star_rating_source_id: sourceId,
    });
    expect(new Date(row.star_rating_verified_at).getTime()).toBe(new Date(firstVerifiedAt).getTime());

    // 3) PATCH check_out = null (XOÁ tường minh) — check_in/star_rating/nguồn vẫn giữ nguyên,
    // CHỈ check_out về NULL. Đây là phép thử "trường được phép xoá phải xoá được".
    result = await hotelsService.updateDetails(placeId, { expected_content_version: version, hotel_type: HOTEL_TYPE, check_out: null }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row.check_out).toBeNull();
    expect(row).toMatchObject({ hotel_type: HOTEL_TYPE, star_rating: 4, check_in: '14:00:00', star_rating_source_id: sourceId });

    // 4) Đổi star_rating (giá trị) mà KHÔNG kèm nguồn mới -> nguồn/verified_at CŨ phải bị XOÁ
    // (không giữ nhãn "có nguồn" cho hạng sao 5 sao — nguồn cũ chỉ xác minh hạng sao 4 cũ).
    result = await hotelsService.updateDetails(placeId, { expected_content_version: version, hotel_type: HOTEL_TYPE, star_rating: 5 }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row.star_rating).toBe(5);
    expect(row.star_rating_source_id).toBeNull();
    expect(row.star_rating_verified_at).toBeNull();

    // 5) Cấp nguồn mới cho hạng sao 5 hiện tại -> verified_at làm mới.
    const secondSourceId = await mkSource();
    result = await hotelsService.updateDetails(placeId, { expected_content_version: version, hotel_type: HOTEL_TYPE, star_rating_source_id: secondSourceId }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row.star_rating).toBe(5);
    expect(row.star_rating_source_id).toBe(secondSourceId);
    expect(row.star_rating_verified_at).not.toBeNull();
  }, 30_000);

  // CAS thật (2026-09-30, sửa sau góp ý) — "SELECT ... FOR UPDATE" trước đây KHÔNG chặn được một
  // request MUỘN (đọc dữ liệu cũ, ghi sau request khác). Test này mô phỏng ĐÚNG kịch bản đó: hai
  // "tab" cùng đọc content_version=1, một tab ghi trước (thắng, version->2), tab kia gửi PATCH với
  // version=1 đã cũ (thua, phải 409) — chứng minh bằng DB thật, không phải mock.
  it('CAS thật: hai request cùng expected_content_version -> một thành công, một 409, DB giữ đúng kết quả request thắng', async () => {
    const placeId = await mkHotelPlace('cas-conflict');
    const HOTEL_TYPE = 'hotel' as UpdateHotelDetailsDto['hotel_type'];

    // "Tab A" và "Tab B" cùng đọc content_version=1 (place vừa tạo, mặc định).
    const winner = await hotelsService.updateDetails(
      placeId,
      { expected_content_version: 1, hotel_type: HOTEL_TYPE, star_rating: 4 },
      actorId,
    );
    expect(winner.content_version).toBe(2);
    expect(winner.star_rating).toBe(4);

    // "Tab B" gửi PATCH SAU, nhưng vẫn mang theo version=1 đã cũ (nó đọc TRƯỚC khi Tab A ghi) —
    // phải bị từ chối 409, KHÔNG được phép ghi đè star_rating=4 vừa lưu của Tab A.
    await expect(
      hotelsService.updateDetails(placeId, { expected_content_version: 1, hotel_type: HOTEL_TYPE, star_rating: 2 }, actorId),
    ).rejects.toMatchObject({ status: 409 });

    // DB phải giữ NGUYÊN kết quả của request thắng (Tab A) — không có gì bị ghi đè bởi request thua.
    const row = await readDetails(placeId);
    expect(row.star_rating).toBe(4);
  }, 30_000);
});
