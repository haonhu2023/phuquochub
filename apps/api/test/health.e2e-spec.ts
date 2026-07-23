import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// LƯU Ý: e2e này CẦN Postgres + Redis đang chạy (docker compose up -d postgres redis).
// Nếu không có hạ tầng, test sẽ fail ở bước kết nối — đúng như thiết kế.
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/health trả trạng thái các thành phần', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    // 200 nếu tất cả 'up'; 503 nếu có 'down'. Cả hai đều có trường status.
    expect([200, 503]).toContain(res.status);
    expect(res.body.data).toHaveProperty('status');
  });
});
