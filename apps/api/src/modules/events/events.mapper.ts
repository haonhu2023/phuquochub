// time_status suy diễn từ start_at/end_at/now (openapi Event.time_status — KHÔNG lưu DB).
export function deriveTimeStatus(
  startAt: string | Date,
  endAt: string | Date,
  now: Date = new Date(),
): 'upcoming' | 'ongoing' | 'ended' {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  const n = now.getTime();
  if (n < s) return 'upcoming';
  if (n > e) return 'ended';
  return 'ongoing';
}

export function toEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    cover_media_id: row.cover_media_id ?? null,
    start_at: row.start_at,
    end_at: row.end_at,
    timezone: row.timezone,
    place_id: row.place_id ?? null,
    organizer_id: row.organizer_id ?? null,
    event_category: row.event_category ?? null,
    status: row.status,
    status_override: row.status_override ?? null,
    recurrence_rule: row.recurrence_rule ?? null,
    time_status: deriveTimeStatus(row.start_at as string, row.end_at as string),
    created_at: row.created_at,
  };
}
