import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlaceExternalIdentifier } from '../entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from '../place-external-identifiers.enums';

@Injectable()
export class PlaceExternalIdentifiersRepository {
  constructor(
    @InjectRepository(PlaceExternalIdentifier)
    private readonly repo: Repository<PlaceExternalIdentifier>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceExternalIdentifier> {
    return manager ? manager.getRepository(PlaceExternalIdentifier) : this.repo;
  }

  // Dedupe theo (provider, external_id) — cùng nguyên tắc SourcesRepository.findByTypeAndExternalRef.
  findByProviderAndExternalId(
    provider: PlaceExternalIdentifierProvider,
    externalId: string,
    manager?: EntityManager,
  ): Promise<PlaceExternalIdentifier | null> {
    return this.target(manager).findOne({ where: { provider, externalId } });
  }

  findByPlaceAndProvider(
    placeId: string,
    provider: PlaceExternalIdentifierProvider,
    manager?: EntityManager,
  ): Promise<PlaceExternalIdentifier | null> {
    return this.target(manager).findOne({ where: { placeId, provider } });
  }

  listByPlace(placeId: string, manager?: EntityManager): Promise<PlaceExternalIdentifier[]> {
    return this.target(manager).find({ where: { placeId } });
  }

  create(data: Partial<PlaceExternalIdentifier>): PlaceExternalIdentifier {
    return this.repo.create(data);
  }

  save(row: PlaceExternalIdentifier, manager?: EntityManager): Promise<PlaceExternalIdentifier> {
    return this.target(manager).save(row);
  }
}
