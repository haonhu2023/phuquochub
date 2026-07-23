import Link from 'next/link';
import { listEvents, type EventSummary } from '@/modules/events/api/events.api';

export const metadata = { title: 'Sự kiện · PhuQuocHub' };

const STATUS_LABEL: Record<EventSummary['time_status'], string> = {
  upcoming: 'Sắp diễn ra',
  ongoing: 'Đang diễn ra',
  ended: 'Đã kết thúc',
};

// Server Component: danh sách sự kiện (peer entity). Lỗi API → danh sách rỗng.
export default async function EventsPage() {
  let events: EventSummary[] = [];
  try {
    events = await listEvents();
  } catch {
    events = [];
  }

  return (
    <section>
      <h1>Sự kiện</h1>
      {events.length === 0 && <p style={{ color: '#6b7280' }}>Chưa có sự kiện.</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {events.map((e) => (
          <li key={e.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
            <Link href={`/events/${e.slug}`} style={{ fontWeight: 600 }}>
              {e.title}
            </Link>
            <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 14 }}>
              {new Date(e.start_at).toLocaleString('vi-VN')} · {STATUS_LABEL[e.time_status]}
              {e.event_category ? ` · ${e.event_category}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
