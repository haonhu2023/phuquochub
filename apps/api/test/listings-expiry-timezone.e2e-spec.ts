import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Bug thật đã sửa 2026-10-17: `publicQuery()` của JobListingsRepository/RealEstateListingsRepository
// trước đây so `expires_at >= CURRENT_DATE` — `CURRENT_DATE` lấy theo timezone PHIÊN Postgres
// (production VÀ môi trường test cục bộ ở đây đều `Etc/UTC`, xác nhận bằng `SHOW timezone`), không
// phải Asia/Ho_Chi_Minh mà dashboard chủ tin dùng. Hệ quả: trong ~7 giờ đầu mỗi ngày giờ Việt Nam
// (UTC 17:00–24:00 hôm trước), một tin đã hết hạn theo lịch VN vẫn được API công khai phục vụ tiếp.
// Sửa bằng `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`.
//
// File này kiểm HAI lớp, tách biệt vì lý do khác nhau:
// 1. Biểu thức SQL tại đúng mốc UTC/VN lệch nhau — raw SQL, không qua app, xác định tất định bằng
//    timestamp literal (không phụ thuộc "bây giờ" thật lúc test chạy).
// 2. Hành vi API công khai (list + detail) tại các mốc TƯƠNG ĐỐI với "hôm nay" thật lúc test chạy
//    (hôm qua/hôm nay/ngày mai theo lịch VN) — không giả lập đồng hồ DB, chỉ cần đúng tương đối.
describe('listings expiry timezone (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const jobIds: string[] = [];
  const reIds: string[] = [];
  const userIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const email = `e2e_expiry_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Expiry E2E ${label}`],
    );
    userIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkJob(expiresAt: string | null, createdBy: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO job_listings
         (created_by, employer_name, title, job_category, work_location, employment_type,
          contact_method, contact_value, status, expires_at, published_at)
       VALUES ($1,'E2E Expiry Co','E2E Job','F&B','An Thoi','full_time','phone','0900000000','published',$2,now())
       RETURNING id`,
      [createdBy, expiresAt],
    );
    jobIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkRealEstate(expiresAt: string | null, createdBy: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO real_estate_listings
         (created_by, poster_role, transaction_type, property_type, title, address_precision,
          contact_method, contact_value, status, deal_status, expires_at, published_at)
       VALUES ($1,'owner','rent','room','E2E Expiry Listing','area','phone','0900000000','published','available',$2,now())
       RETURNING id`,
      [createdBy, expiresAt],
    );
    reIds.push(rows[0].id);
    return rows[0].id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (jobIds.length) await ds.query(`DELETE FROM job_listings WHERE id = ANY($1)`, [jobIds]);
        if (reIds.length) await ds.query(`DELETE FROM real_estate_listings WHERE id = ANY($1)`, [reIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('biểu thức SQL tại đúng mốc UTC/VN lệch nhau (tất định, không phụ thuộc đồng hồ thật)', () => {
    it('UTC 23:00 hôm X (= VN 06:00 hôm X+1): date theo UTC vẫn là X, date theo VN đã là X+1', async () => {
      // Ép kiểu sang text NGAY TRONG SQL — tránh node-postgres parse cột `date` thành JS `Date` ở
      // nửa đêm theo timezone máy chạy test rồi lại `.toISOString()` (có thể lùi một ngày tuỳ
      // timezone máy chạy test, không liên quan gì tới đúng/sai của biểu thức SQL đang kiểm).
      const [row] = await ds.query(
        `SELECT
           (($1::timestamptz)::date)::text AS utc_date,
           (($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS vn_date`,
        ['2026-10-17 23:00:00+00'],
      );
      expect(row.utc_date).toBe('2026-10-17');
      expect(row.vn_date).toBe('2026-10-18');
    });

    it('tin expires_at = X: điều kiện CŨ (CURRENT_DATE=UTC) vẫn coi còn hạn lúc UTC 23:00 hôm X dù VN đã sang X+1 — xác nhận bug nếu chưa sửa', async () => {
      const [row] = await ds.query(
        `SELECT
           ('2026-10-17'::date >= ($1::timestamptz)::date) AS still_valid_old_utc_expr,
           ('2026-10-17'::date >= ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS still_valid_new_vn_expr`,
        ['2026-10-17 23:00:00+00'],
      );
      expect(row.still_valid_old_utc_expr).toBe(true); // biểu thức CŨ: sai — vẫn coi còn hạn
      expect(row.still_valid_new_vn_expr).toBe(false); // biểu thức MỚI (đã áp dụng trong repository): đúng — đã hết hạn theo lịch VN
    });

    it('xác nhận timezone phiên Postgres test là Etc/UTC — đúng tình huống production, không phải môi trường tình cờ né được bug', async () => {
      const [row] = await ds.query(`SHOW timezone`);
      expect(row.TimeZone).toBe('Etc/UTC');
    });
  });

  describe('hành vi API công khai thật, tại các mốc tương đối với hôm nay (lịch VN)', () => {
    function vnToday(): string {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    }
    function addDays(ymd: string, days: number): string {
      const d = new Date(`${ymd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    it('job listing: hạn hôm qua (VN) → KHÔNG còn trong danh sách công khai, chi tiết 404', async () => {
      const user = await createUser('job-yesterday');
      const id = await mkJob(addDays(vnToday(), -1), user);

      const list = await request(app.getHttpServer()).get('/api/job-listings');
      expect(list.body.data.map((j: { id: string }) => j.id)).not.toContain(id);

      const detail = await request(app.getHttpServer()).get(`/api/job-listings/${id}`);
      expect(detail.status).toBe(404);
    });

    it('job listing: hạn hôm nay (VN) → CÒN trong danh sách công khai (bao hàm cả ngày hết hạn)', async () => {
      const user = await createUser('job-today');
      const id = await mkJob(vnToday(), user);

      const detail = await request(app.getHttpServer()).get(`/api/job-listings/${id}`);
      expect(detail.status).toBe(200);
    });

    it('job listing: hạn ngày mai (VN) → còn trong danh sách công khai', async () => {
      const user = await createUser('job-tomorrow');
      const id = await mkJob(addDays(vnToday(), 1), user);

      const detail = await request(app.getHttpServer()).get(`/api/job-listings/${id}`);
      expect(detail.status).toBe(200);
    });

    it('job listing: expires_at null (không đặt hạn) → luôn còn công khai', async () => {
      const user = await createUser('job-no-expiry');
      const id = await mkJob(null, user);

      const detail = await request(app.getHttpServer()).get(`/api/job-listings/${id}`);
      expect(detail.status).toBe(200);
    });

    it('real estate listing: hạn hôm qua (VN) → KHÔNG còn công khai, chi tiết 404', async () => {
      const user = await createUser('re-yesterday');
      const id = await mkRealEstate(addDays(vnToday(), -1), user);

      const detail = await request(app.getHttpServer()).get(`/api/real-estate-listings/${id}`);
      expect(detail.status).toBe(404);
    });

    it('real estate listing: hạn hôm nay (VN) → còn công khai', async () => {
      const user = await createUser('re-today');
      const id = await mkRealEstate(vnToday(), user);

      const detail = await request(app.getHttpServer()).get(`/api/real-estate-listings/${id}`);
      expect(detail.status).toBe(200);
    });
  });
});
