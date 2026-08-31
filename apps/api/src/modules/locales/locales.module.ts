import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportedLocale } from './entities/supported-locale.entity';
import { LocalesRepository } from './repositories/locales.repository';
import { LocalesService } from './locales.service';

// Module locale (ADR-020). Không có controller riêng ở giai đoạn nền tảng này — chưa có yêu cầu
// API surface; place-translations module import LocalesService trực tiếp.
@Module({
  imports: [TypeOrmModule.forFeature([SupportedLocale])],
  providers: [LocalesRepository, LocalesService],
  exports: [LocalesService],
})
export class LocalesModule {}
