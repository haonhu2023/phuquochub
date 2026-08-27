import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { ApiError } from '@/lib/http';
import { buildHotelJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';

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
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#6b7280' }}>
          Trang chủ
        </Link>
        {' / '}
        <Link href="/hotels" style={{ color: '#6b7280' }}>
          Khách sạn
        </Link>
        {' / '}
        <span aria-current="page">{h.name}</span>
      </nav>
      <h1>{h.name}</h1>
      {h.address && <p style={{ color: '#4b5563' }}>{h.address}</p>}
      {h.description && <p>{h.description}</p>}

      {h.amenities.length > 0 && (
        <section>
          <h2>Tiện nghi</h2>
          <p>{h.amenities.join(' · ')}</p>
        </section>
      )}

      {/* Public Beta price trust gate (2026-08-28): `hotel_room_types.price_ref` KHÔNG có cột
          verification/trust nào ở DB (migration InitHotel) — không có bằng chứng nào để gate theo
          TỪNG loại phòng, và place.verification_status của Place cha KHÔNG được dùng làm proxy
          (một khách sạn đã xác minh không có nghĩa TỪNG mức giá phòng đã được đối chiếu).
          Fail-closed: ẩn raw price ở mọi loại phòng, MỘT dòng đang xác minh dùng chung cho cả mục
          (không lặp lại cho từng phòng) khi có ít nhất một loại phòng đã nhập giá. */}
      {h.rooms.length > 0 && (
        <section>
          <h2>Loại phòng</h2>
          <ul>
            {h.rooms.map((r) => (
              <li key={r.id}>
                {r.name}
                {r.capacity ? ` · ${r.capacity} khách` : ''}
              </li>
            ))}
          </ul>
          {h.rooms.some((r) => r.price_ref !== null) && <p>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}
    </article>
  );
}
