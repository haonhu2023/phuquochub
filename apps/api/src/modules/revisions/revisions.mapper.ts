import { RevisionListRow } from './repositories/revisions.repository';

// Map row phẳng (snake_case DB) → response snake_case (khớp openapi WikiRevision).
export function toWikiRevision(row: RevisionListRow) {
  return {
    id: row.id,
    revision_number: row.revision_number,
    origin: row.origin,
    status: row.status,
    editor_id: row.editor_id,
    change_note: row.change_note,
    created_at: row.created_at,
  };
}
