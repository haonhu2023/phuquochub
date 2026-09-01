import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlaceTranslationRoute } from '../entities/place-translation-route.entity';

@Injectable()
export class PlaceTranslationRoutesRepository {
  constructor(
    @InjectRepository(PlaceTranslationRoute)
    private readonly repo: Repository<PlaceTranslationRoute>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceTranslationRoute> {
    return manager ? manager.getRepository(PlaceTranslationRoute) : this.repo;
  }

  findCurrentByPlace(
    placeId: string,
    localeCode: string,
    manager?: EntityManager,
  ): Promise<PlaceTranslationRoute | null> {
    return this.target(manager).findOne({ where: { placeId, localeCode, isCurrent: true } });
  }

  // MAP-031: slug duy nhất THEO LOCALE — tra theo (locale_code, localized_slug), không theo place.
  findCurrentBySlug(localeCode: string, localizedSlug: string, manager?: EntityManager): Promise<PlaceTranslationRoute | null> {
    return this.target(manager).findOne({ where: { localeCode, localizedSlug, isCurrent: true } });
  }

  insert(row: PlaceTranslationRoute, manager?: EntityManager): Promise<PlaceTranslationRoute> {
    return this.target(manager).save(row);
  }

  async markNotCurrent(id: string, manager?: EntityManager): Promise<void> {
    await this.target(manager).update({ id }, { isCurrent: false });
  }
}
