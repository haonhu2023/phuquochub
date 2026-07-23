import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WikiRevision } from '../entities/wiki-revision.entity';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from '../revision.enums';

// Row phẳng cho response GET /places/:id/revisions (khớp openapi WikiRevision).
export interface RevisionListRow {
  id: string;
  revision_number: number;
  origin: RevisionOrigin;
  status: RevisionStatus;
  editor_id: string | null;
  change_note: string | null;
  created_at: Date;
}

export interface RecordRevisionInput {
  entityType: RevisionEntityType;
  entityId: string;
  // Serialize sang jsonb (JSON.stringify) → mọi object JSON hợp lệ, không chỉ index-map.
  snapshot: object;
  diff?: Record<string, unknown> | null;
  origin: RevisionOrigin;
  changeNote?: string | null;
  editorId?: string | null;
  status: RevisionStatus;
}

// Repository Pattern cho `wiki_revisions`. Append-only: chỉ INSERT + đọc.
// `revision_number` cấp phát trong CÙNG một statement (MAX+1 theo entity) — UNIQUE
// (entity_type, entity_id, revision_number) bảo toàn dù có tranh chấp; `parent_revision_id`
// trỏ tới bản ghi mới nhất của entity để dựng cây/diff.
@Injectable()
export class RevisionsRepository {
  constructor(
    @InjectRepository(WikiRevision)
    private readonly repo: Repository<WikiRevision>,
  ) {}

  async record(input: RecordRevisionInput): Promise<{ id: string; revisionNumber: number }> {
    const rows: Array<{ id: string; revision_number: number }> = await this.repo.query(
      `INSERT INTO wiki_revisions
         (entity_type, entity_id, revision_number, parent_revision_id,
          snapshot, diff, origin, change_note, editor_id, status)
       SELECT
         $1::revision_entity_type, $2,
         COALESCE(
           (SELECT MAX(revision_number) FROM wiki_revisions
            WHERE entity_type = $1::revision_entity_type AND entity_id = $2), 0) + 1,
         (SELECT id FROM wiki_revisions
          WHERE entity_type = $1::revision_entity_type AND entity_id = $2
          ORDER BY revision_number DESC LIMIT 1),
         $3::jsonb, $4::jsonb, $5::revision_origin, $6, $7, $8::revision_status
       RETURNING id, revision_number`,
      [
        input.entityType,
        input.entityId,
        JSON.stringify(input.snapshot),
        input.diff != null ? JSON.stringify(input.diff) : null,
        input.origin,
        input.changeNote ?? null,
        input.editorId ?? null,
        input.status,
      ],
    );
    return { id: rows[0].id, revisionNumber: rows[0].revision_number };
  }

  /** Lịch sử phiên bản của một entity — revision_number giảm dần (api.md §11). */
  async listByEntity(entityType: RevisionEntityType, entityId: string): Promise<RevisionListRow[]> {
    return this.repo.query(
      `SELECT id, revision_number, origin, status, editor_id, change_note, created_at
       FROM wiki_revisions
       WHERE entity_type = $1::revision_entity_type AND entity_id = $2
       ORDER BY revision_number DESC`,
      [entityType, entityId],
    );
  }
}
