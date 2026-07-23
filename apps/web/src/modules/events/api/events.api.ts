import { apiGet } from '@/lib/http';

// Event = peer entity (ADR-002). time_status suy diễn ở BE (không lưu DB).
export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  start_at: string;
  end_at: string;
  timezone: string;
  event_category: string | null;
  status: string;
  time_status: 'upcoming' | 'ongoing' | 'ended';
}

export type EventDetail = EventSummary & {
  description: string | null;
  cover_media_id: string | null;
  place_id: string | null;
  organizer_id: string | null;
  recurrence_rule: string | null;
  created_at: string;
};

export async function listEvents(page = 1, limit = 20): Promise<EventSummary[]> {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiGet<EventSummary[]>(`/events?${qs.toString()}`, { cache: 'no-store' });
}

export async function getEvent(slug: string): Promise<EventDetail> {
  return apiGet<EventDetail>(`/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}
