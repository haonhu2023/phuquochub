import { allowedDecisions } from './decisions';
import type { ModerationTargetPreview } from './types';

const media = (status: string): ModerationTargetPreview => ({
  found: true,
  target_type: 'media',
  target_id: 'm1',
  media_type: 'image',
  status,
  uploaded_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  place_id: null,
  place_name: null,
  preview_url: null,
});

const review = (status: string): ModerationTargetPreview => ({
  found: true,
  target_type: 'review',
  target_id: 'r1',
  status,
  rating: 4,
  content: 'nội dung',
  place_id: 'p1',
  user_id: 'u1',
  created_at: '2026-01-01T00:00:00Z',
});

const decisions = (p: ModerationTargetPreview, s: string) => allowedDecisions(p, s).map((o) => o.decision);

describe('allowedDecisions — media', () => {
  it('pending → approve + reject; reject cần lý do, approve thì không', () => {
    const opts = allowedDecisions(media('pending'), 'open');
    expect(opts.map((o) => o.decision)).toEqual(['approve', 'reject']);
    expect(opts.find((o) => o.decision === 'reject')?.requiresReason).toBe(true);
    expect(opts.find((o) => o.decision === 'approve')?.requiresReason).toBe(false);
  });

  // Controlled Media Rejection Reason (2026-08-12) — CHỈ reject trên media đòi reason_code.
  it('pending → reject đòi reason_code; approve thì KHÔNG', () => {
    const opts = allowedDecisions(media('pending'), 'open');
    expect(opts.find((o) => o.decision === 'reject')?.requiresReasonCode).toBe(true);
    expect(opts.find((o) => o.decision === 'approve')?.requiresReasonCode).toBe(false);
  });

  it('published → hide (cần lý do, KHÔNG cần reason_code)', () => {
    const opts = allowedDecisions(media('published'), 'claimed');
    expect(opts.map((o) => o.decision)).toEqual(['hide']);
    expect(opts[0].requiresReason).toBe(true);
    expect(opts[0].requiresReasonCode).toBe(false);
  });

  it('hidden → restore, cần chọn target_status media, KHÔNG cần reason_code', () => {
    const opts = allowedDecisions(media('hidden'), 'open');
    expect(opts.map((o) => o.decision)).toEqual(['restore']);
    expect(opts[0].requiresMediaTargetStatus).toBe(true);
    expect(opts[0].requiresReason).toBe(false);
    expect(opts[0].requiresReasonCode).toBe(false);
  });

  it('rejected → restore', () => {
    expect(decisions(media('rejected'), 'open')).toEqual(['restore']);
  });
});

describe('allowedDecisions — review', () => {
  it('pending → approve', () => {
    expect(decisions(review('pending'), 'open')).toEqual(['approve']);
  });

  it('published → hide (KHÔNG bao giờ cần reason_code — chỉ media/reject mới có khái niệm đó)', () => {
    const opts = allowedDecisions(review('published'), 'open');
    expect(opts.map((o) => o.decision)).toEqual(['hide']);
    expect(opts[0].requiresReason).toBe(true);
    expect(opts[0].requiresReasonCode).toBe(false);
  });

  it('hidden → restore, KHÔNG cần target_status media', () => {
    const opts = allowedDecisions(review('hidden'), 'open');
    expect(opts.map((o) => o.decision)).toEqual(['restore']);
    expect(opts[0].requiresMediaTargetStatus).toBe(false);
  });
});

describe('allowedDecisions — không có hành động', () => {
  it('case đã resolved → rỗng', () => {
    expect(allowedDecisions(media('pending'), 'resolved')).toEqual([]);
  });

  it('case đã dismissed → rỗng', () => {
    expect(allowedDecisions(review('published'), 'dismissed')).toEqual([]);
  });

  it('target không còn tồn tại → rỗng', () => {
    expect(allowedDecisions({ found: false, target_type: 'media', target_id: 'm1' }, 'open')).toEqual([]);
  });

  it('target_type=place (found=false) → rỗng', () => {
    expect(allowedDecisions({ found: false, target_type: 'place', target_id: 'x1' }, 'open')).toEqual([]);
  });
});
