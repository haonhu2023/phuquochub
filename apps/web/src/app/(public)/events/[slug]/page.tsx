import { notFound } from 'next/navigation';
import { getEvent, type EventDetail } from '@/modules/events/api/events.api';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  try {
    const ev = await getEvent(slug);
    return { title: `${ev.title} · Sự kiện · PhuQuocHub`, description: ev.description ?? undefined };
  } catch {
    return { title: 'Sự kiện · PhuQuocHub' };
  }
}

const STATUS_LABEL: Record<EventDetail['time_status'], string> = {
  upcoming: 'Sắp diễn ra',
  ongoing: 'Đang diễn ra',
  ended: 'Đã kết thúc',
};

// Server Component: chi tiết sự kiện (peer entity, ADR-002).
export default async function EventDetailPage({ params }: Params) {
  const { slug } = await params;
  let ev: EventDetail;
  try {
    ev = await getEvent(slug);
  } catch {
    notFound();
  }

  return (
    <article>
      <h1>{ev.title}</h1>
      <p style={{ color: '#4b5563' }}>
        {new Date(ev.start_at).toLocaleString('vi-VN')} → {new Date(ev.end_at).toLocaleString('vi-VN')}{' '}
        ({ev.timezone}) · <strong>{STATUS_LABEL[ev.time_status]}</strong>
      </p>
      {ev.event_category && <p style={{ color: '#6b7280', fontSize: 14 }}>Loại: {ev.event_category}</p>}
      {ev.description && <p>{ev.description}</p>}
    </article>
  );
}
