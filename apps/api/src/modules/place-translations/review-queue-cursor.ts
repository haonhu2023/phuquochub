// Keyset/cursor pagination for the review queue (human-translation-review scale-up, 2026-09-04).
// Deliberately keyset (created_at, id), never OFFSET: the queue can only grow (nothing is ever
// deleted, imports keep adding PENDING rows), so OFFSET pagination would skip/duplicate rows
// whenever a page boundary shifts between requests — keyset is stable under concurrent inserts.
// (created_at, id) matches listReviewQueue()'s own ORDER BY exactly, and id (a uuid, globally
// unique) breaks ties deterministically when two rows share a created_at timestamp.
//
// Framework-free on purpose (no NestJS import here) — this file is pure encode/decode logic,
// testable in isolation; the caller (TranslationReviewService) is responsible for turning a
// DecodeCursorError into an HTTP 400.

export interface ReviewQueueCursor {
  createdAt: Date;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidReviewQueueCursorError extends Error {}

export function encodeReviewQueueCursor(row: { created_at: Date; id: string }): string {
  const raw = `${row.created_at.toISOString()}|${row.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeReviewQueueCursor(cursor: string): ReviewQueueCursor {
  let raw: string;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new InvalidReviewQueueCursorError('cursor is not valid base64url');
  }
  const parts = raw.split('|');
  if (parts.length !== 2) {
    throw new InvalidReviewQueueCursorError('cursor does not decode to exactly two fields');
  }
  const [isoDate, id] = parts;
  const createdAt = new Date(isoDate);
  if (Number.isNaN(createdAt.getTime())) {
    throw new InvalidReviewQueueCursorError('cursor date component is not a valid timestamp');
  }
  if (!UUID_RE.test(id)) {
    throw new InvalidReviewQueueCursorError('cursor id component is not a valid uuid');
  }
  return { createdAt, id };
}
