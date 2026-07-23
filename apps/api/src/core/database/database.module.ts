import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// Kết nối Postgres/PostGIS qua TypeORM. Entity nạp tự động (autoLoadEntities)
// khi từng module đăng ký TypeOrmModule.forFeature (từ Sprint 1+).
// synchronize=false: mọi thay đổi schema đi qua migration (an toàn cho prod).
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        ssl: config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: false }
          : false,
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize'),
        migrationsRun: false,
        logging: config.get<boolean>('database.logging'),
        // snake_case cho cột/bảng suy từ property camelCase (khớp Data Dictionary).
        namingStrategy: new SnakeNamingStrategy(),
      }),
    }),
  ],
})
export class DatabaseModule {}
