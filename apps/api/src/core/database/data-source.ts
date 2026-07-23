import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { join } from 'path';

// DataSource riêng cho TypeORM CLI (migration:run/revert/generate).
// KHÁC với TypeOrmModule (runtime Nest) nhưng cùng thông số kết nối.
loadEnv({ path: join(__dirname, '../../../../../.env') });
loadEnv(); // fallback: .env cạnh nơi chạy

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'phuquoc',
  password: process.env.DB_PASSWORD ?? 'phuquoc',
  database: process.env.DB_NAME ?? 'phuquochub',
  ssl: (process.env.DB_SSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : false,
  // Entity nghiệp vụ bổ sung từ Sprint 1+.
  entities: [join(__dirname, '../../**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: (process.env.DB_LOGGING ?? 'false') === 'true',
});
