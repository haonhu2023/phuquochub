import { deriveTimeStatus, toEvent } from './events.mapper';

describe('deriveTimeStatus', () => {
  const start = '2026-07-10T00:00:00Z';
  const end = '2026-07-12T00:00:00Z';

  it('upcoming khi now < start', () => {
    expect(deriveTimeStatus(start, end, new Date('2026-07-01T00:00:00Z'))).toBe('upcoming');
  });
  it('ongoing khi start ≤ now ≤ end', () => {
    expect(deriveTimeStatus(start, end, new Date('2026-07-11T00:00:00Z'))).toBe('ongoing');
  });
  it('ended khi now > end', () => {
    expect(deriveTimeStatus(start, end, new Date('2026-07-20T00:00:00Z'))).toBe('ended');
  });
});

describe('toEvent', () => {
  it('map snake_case + gắn time_status suy diễn', () => {
    const row = {
      id: 'e1',
      title: 'Lễ hội',
      slug: 'le-hoi',
      description: null,
      cover_media_id: null,
      start_at: '2026-07-10T00:00:00Z',
      end_at: '2026-07-12T00:00:00Z',
      timezone: 'Asia/Ho_Chi_Minh',
      place_id: null,
      organizer_id: null,
      event_category: 'festival',
      status: 'published',
      status_override: null,
      recurrence_rule: null,
      created_at: '2026-07-01T00:00:00Z',
    };
    const e = toEvent(row);
    expect(e.slug).toBe('le-hoi');
    expect(['upcoming', 'ongoing', 'ended']).toContain(e.time_status);
    expect(e.event_category).toBe('festival');
  });
});
