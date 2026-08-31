import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlaceTranslationSeo } from '../entities/place-translation-seo.entity';

@Injectable()
export class PlaceTranslationSeoRepository {
  constructor(
    @InjectRepository(PlaceTranslationSeo)
    private readonly repo: Repository<PlaceTranslationSeo>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceTranslationSeo> {
    return manager ? manager.getRepository(PlaceTranslationSeo) : this.repo;
  }

  findCurrent(placeId: string, localeCode: string, manager?: EntityManager): Promise<PlaceTranslationSeo | null> {
    return this.target(manager).findOne({ where: { placeId, localeCode, isCurrent: true } });
  }

  // Hreflang: mọi hàng CÙNG hreflang_group_id — dùng để dựng tập alternate (vi/en/…) của một trang
  // logic, chỉ đọc các hàng đang current.
  listCurrentByHreflangGroup(hreflangGroupId: string, manager?: EntityManager): Promise<PlaceTranslationSeo[]> {
    return this.target(manager).find({ where: { hreflangGroupId, isCurrent: true } });
  }

  insert(row: PlaceTranslationSeo, manager?: EntityManager): Promise<PlaceTranslationSeo> {
    return this.target(manager).save(row);
  }

  async markNotCurrent(id: string, manager?: EntityManager): Promise<void> {
    await this.target(manager).update({ id }, { isCurrent: false });
  }
}
