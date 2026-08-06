import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Source } from '../entities/source.entity';
import { SourceType } from '../sources.enums';

@Injectable()
export class SourcesRepository {
  constructor(
    @InjectRepository(Source)
    private readonly repo: Repository<Source>,
  ) {}

  /**
   * `manager` TUỲ CHỌN (ADR-008 Verification Foundation) — đọc TRONG transaction của caller khi
   * `VerificationsService` cần xác nhận `source_id` tồn tại + đúng nhóm chính thức trước khi ghi
   * `official`; bỏ trống dùng `this.repo` như trước.
   */
  findById(id: string, manager?: EntityManager): Promise<Source | null> {
    const repo = manager ? manager.getRepository(Source) : this.repo;
    return repo.findOne({ where: { id, deletedAt: IsNull() } });
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
