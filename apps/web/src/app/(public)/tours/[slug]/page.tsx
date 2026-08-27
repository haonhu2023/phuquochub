import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getItinerary,
  getSchedule,
  getTour,
  type TourDetail,
  type TourSchedule,
  type TourStop,
} from '@/modules/tours/api/tours.api';
import { ApiError } from '@/lib/http';
import { buildTourJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  try {
    const t = await getTour(slug);
    return { title: `${t.name} · Tour · PhuQuocHub`, description: t.short_description ?? undefined };
  } catch {
    return { title: 'Tour · PhuQuocHub' };
  }
}

// Chi tiết tour = Place base + hành trình (itinerary) + lịch (schedule), satellite ADR-002.
export default async function TourDetailPage({ params }: Params) {
  const { slug } = await params;
  let t: TourDetail;
  try {
    t = await getTour(slug);
  } catch (err) {
    // PLACE-041: phân biệt 404 với lỗi khác — xem hotels/[slug]/page.tsx cho ghi chú đầy đủ.
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildTourJsonLd(t)) }}
      />
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#6b7280' }}>
          Trang chủ
        </Link>
        {' / '}
        <Link href="/tours" style={{ color: '#6b7280' }}>
          Tour
        </Link>
        {' / '}
        <span aria-current="page">{t.name}</span>
      </nav>
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

      {/* Public Beta price trust gate (2026-08-28): `tour_schedules.price` KHÔNG có cột
          verification/trust nào ở DB (migration InitTour) — không có bằng chứng nào để gate theo
          TỪNG chuyến, và place.verification_status của Place cha KHÔNG được dùng làm proxy (một
          tour đã xác minh không có nghĩa TỪNG mức giá theo lịch khởi hành đã được đối chiếu).
          Fail-closed: ẩn raw price ở mọi chuyến, MỘT dòng đang xác minh dùng chung cho cả mục
          (không lặp lại cho từng chuyến) khi có ít nhất một chuyến đã nhập giá. */}
      {schedule.length > 0 && (
        <section>
          <h2>Lịch khởi hành</h2>
          <ul>
            {schedule.map((s) => (
              <li key={s.id}>
                {new Date(s.date).toLocaleDateString('vi-VN')}
                {s.capacity ? ` · ${s.capacity} chỗ` : ''}
              </li>
            ))}
          </ul>
          {schedule.some((s) => s.price !== null) && <p>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}
    </article>
  );
}
