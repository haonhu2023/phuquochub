import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';

// Không có controller — chưa có yêu cầu API surface (cùng giai đoạn với PlaceTranslationsModule):
// service này được các job remediation/import inject trực tiếp.
@Module({
  imports: [TypeOrmModule.forFeature([PlaceExternalIdentifier])],
  providers: [PlaceExternalIdentifiersRepository, PlaceExternalIdentifiersService],
  exports: [PlaceExternalIdentifiersService],
})
export class PlaceExternalIdentifiersModule {}
