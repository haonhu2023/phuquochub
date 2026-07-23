import { notFound } from 'next/navigation';
import {
  getItinerary,
  getSchedule,
  getTour,
  type TourDetail,
  type TourSchedule,
  type TourStop,
} from '@/modules/tours/api/tours.api';

interface Params {
  params: { slug: string };
}

export async function generateMetadata({ params }: Params) {
  try {
    const t = await getTour(params.slug);
    return { title: `${t.name} · Tour · PhuQuocHub`, description: t.short_description ?? undefined };
  } catch {
    return { title: 'Tour · PhuQuocHub' };
  }
}

// Chi tiết tour = Place base + hành trình (itinerary) + lịch (schedule), satellite ADR-002.
export default async function TourDetailPage({ params }: Params) {
  let t: TourDetail;
  try {
    t = await getTour(params.slug);
  } catch {
    notFound();
  }
  let itinerary: TourStop[] = [];
  let schedule: TourSchedule[] = [];
  try {
    [itinerary, schedule] = await Promise.all([getItinerary(t.id), getSchedule(t.id)]);
  } catch {
    // sub-resource lỗi → bỏ qua, vẫn hiển thị base.
  }

  return (
    <article>
      <h1>{t.name}</h1>
      {t.description && <p>{t.description}</p>}

      {itinerary.length > 0 && (
        <section>
          <h2>Hành trình</h2>
          <ol>
            {itinerary.map((s) => (
              <li key={s.id}>
                {s.time ? `${s.time} · ` : ''}
                {s.name}
                {s.note ? ` — ${s.note}` : ''}
              </li>
            ))}
          </ol>
        </section>
      )}

      {schedule.length > 0 && (
        <section>
          <h2>Lịch khởi hành</h2>
          <ul>
            {schedule.map((s) => (
              <li key={s.id}>
                {new Date(s.date).toLocaleDateString('vi-VN')}
                {s.price !== null ? ` · ${s.price.toLocaleString('vi-VN')} ${s.currency}` : ''}
                {s.capacity ? ` · ${s.capacity} chỗ` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
