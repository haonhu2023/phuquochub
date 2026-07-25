import { notFound } from 'next/navigation';
import {
  getMenu,
  getRestaurant,
  type MenuSection,
  type RestaurantDetail,
} from '@/modules/restaurants/api/restaurants.api';
import { ApiError } from '@/lib/http';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  try {
    const r = await getRestaurant(slug);
    return { title: `${r.name} · Nhà hàng · PhuQuocHub`, description: r.short_description ?? undefined };
  } catch {
    return { title: 'Nhà hàng · PhuQuocHub' };
  }
}

// Chi tiết nhà hàng = Place base + ẩm thực + thực đơn (satellite ADR-002).
export default async function RestaurantDetailPage({ params }: Params) {
  const { slug } = await params;
  let r: RestaurantDetail;
  try {
    r = await getRestaurant(slug);
  } catch (err) {
    // PLACE-041: phân biệt 404 với lỗi khác — xem hotels/[slug]/page.tsx cho ghi chú đầy đủ.
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }
  // Thực đơn qua endpoint riêng (:id/menu); lỗi → rỗng.
  let menu: MenuSection[] = [];
  try {
    menu = await getMenu(r.id);
  } catch {
    menu = [];
  }

  return (
    <article>
      <h1>{r.name}</h1>
      {r.address && <p style={{ color: '#4b5563' }}>{r.address}</p>}
      {r.description && <p>{r.description}</p>}
      {r.cuisines.length > 0 && <p style={{ color: '#6b7280' }}>Ẩm thực: {r.cuisines.join(' · ')}</p>}

      {menu.map((s) => (
        <section key={s.id}>
          <h2>{s.name}</h2>
          <ul>
            {s.items.map((i) => (
              <li key={i.id}>
                {i.name}
                {i.price !== null ? ` · ${i.price.toLocaleString('vi-VN')} ${i.currency}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
