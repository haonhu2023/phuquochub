import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Source } from '../entities/source.entity';
import { SourceType } from '../sources.enums';

@Injectable()
export class SourcesRepository {
  constructor(
    @InjectRepository(Source)
    private readonly repo: Repository<Source>,
  ) {}

  findById(id: string): Promise<Source | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  /** Dedupe theo (type, external_ref) — tránh nhân bản cùng một node OSM/place id (source.md §4). */
  findByTypeAndExternalRef(type: SourceType, externalRef: string): Promise<Source | null> {
    return this.repo.findOne({ where: { type, externalRef, deletedAt: IsNull() } });
  }

  create(data: Partial<Source>): Source {
    return this.repo.create(data);
  }

  save(source: Source): Promise<Source> {
    return this.repo.save(source);
  }
}
