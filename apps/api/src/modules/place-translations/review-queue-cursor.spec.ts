import { decodeReviewQueueCursor, encodeReviewQueueCursor, InvalidReviewQueueCursorError } from './review-queue-cursor';

describe('review-queue-cursor', () => {
  it('round-trips created_at + id exactly', () => {
    const row = { created_at: new Date('2026-09-04T03:15:00.000Z'), id: '11111111-1111-4111-8111-111111111111' };
    const cursor = encodeReviewQueueCursor(row);
    const decoded = decodeReviewQueueCursor(cursor);
    expect(decoded.createdAt.toISOString()).toBe(row.created_at.toISOString());
    expect(decoded.id).toBe(row.id);
  });

  it('produces a URL-safe opaque token (no raw timestamp/id visible)', () => {
    const cursor = encodeReviewQueueCursor({ created_at: new Date('2026-09-04T03:15:00.000Z'), id: '11111111-1111-4111-8111-111111111111' });
    expect(cursor).not.toContain('2026-09-04');
    expect(cursor).not.toContain('11111111');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only
  });

  it.each([
    ['not base64 at all', '!!!not-base64!!!'],
    ['decodes but has no separator', Buffer.from('nothingvalidhere', 'utf8').toString('base64url')],
    ['decodes to 3 fields', Buffer.from('a|b|c', 'utf8').toString('base64url')],
    ['bad date', Buffer.from('not-a-date|11111111-1111-4111-8111-111111111111', 'utf8').toString('base64url')],
    ['bad uuid', Buffer.from('2026-09-04T03:15:00.000Z|not-a-uuid', 'utf8').toString('base64url')],
  ])('rejects a malformed cursor: %s', (_label, cursor) => {
    expect(() => decodeReviewQueueCursor(cursor)).toThrow(InvalidReviewQueueCursorError);
  });
});
