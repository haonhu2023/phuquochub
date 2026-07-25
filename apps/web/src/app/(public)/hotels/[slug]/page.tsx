import { notFound } from 'next/navigation';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { ApiError } from '@/lib/http';
import { buildHotelJsonLd, serializeJsonLd } from '@/lib/structured-data';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  try {
    const h = await getHotel(slug);
    return { title: `${h.name} · Khách sạn · PhuQuocHub`, description: h.short_description ?? undefined };
  } catch {
    return { title: 'Khách sạn · PhuQuocHub' };
  }
}

// Chi tiết khách sạn = Place base + phòng + tiện nghi (satellite ADR-002).
export default async function HotelDetailPage({ params }: Params) {
  const { slug } = await params;
  let h: HotelDetail;
  try {
    h = await getHotel(slug);
  } catch (err) {
    // PLACE-041: phân biệt 404 (không tồn tại) với lỗi khác (mạng/5xx) — trước đây mọi lỗi đều
    // bị coi là 404, khiến sự cố server/mạng hiển thị sai thành "không tồn tại" (khớp
    // places/[slug]/page.tsx, pattern đã đúng từ trước).
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHotelJsonLd(h)) }}
      />
      <h1>{h.name}</h1>
      {h.address && <p style={{ color: '#4b5563' }}>{h.address}</p>}
      {h.description && <p>{h.description}</p>}

      {h.amenities.length > 0 && (
        <section>
          <h2>Tiện nghi</h2>
          <p>{h.amenities.join(' · ')}</p>
        </section>
      )}

      {h.rooms.length > 0 && (
        <section>
          <h2>Loại phòng</h2>
          <ul>
            {h.rooms.map((r) => (
              <li key={r.id}>
                {r.name}
                {r.capacity ? ` · ${r.capacity} khách` : ''}
                {r.price_ref !== null ? ` · từ ${r.price_ref.toLocaleString('vi-VN')} ${r.currency}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
