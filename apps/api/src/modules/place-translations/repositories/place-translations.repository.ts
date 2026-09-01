import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlaceTranslation } from '../entities/place-translation.entity';

// Mọi phương thức nhận `manager?: EntityManager` tuỳ chọn — khi được truyền (từ
// `dataSource.transaction(...)` ở service), thao tác chạy TRONG giao dịch đó thay vì repository
// mặc định của module; cùng quy ước với admin-data (verified-facts-ingestion.service.ts).
@Injectable()
export class PlaceTranslationsRepository {
  constructor(
    @InjectRepository(PlaceTranslation)
    private readonly repo: Repository<PlaceTranslation>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceTranslation> {
    return manager ? manager.getRepository(PlaceTranslation) : this.repo;
  }

  findCurrent(
    placeId: string,
    fieldKey: string,
    localeCode: string,
    manager?: EntityManager,
  ): Promise<PlaceTranslation | null> {
    return this.target(manager).findOne({ where: { placeId, fieldKey, localeCode, isCurrent: true } });
  }

  findById(id: string, manager?: EntityManager): Promise<PlaceTranslation | null> {
    return this.target(manager).findOne({ where: { id } });
  }

  async insert(row: PlaceTranslation, manager?: EntityManager): Promise<PlaceTranslation> {
    return this.target(manager).save(row);
  }

  async markNotCurrent(id: string, manager?: EntityManager): Promise<void> {
    await this.target(manager).update({ id }, { isCurrent: false });
  }

  listCurrentByPlace(placeId: string, manager?: EntityManager): Promise<PlaceTranslation[]> {
    return this.target(manager).find({ where: { placeId, isCurrent: true } });
  }
}
