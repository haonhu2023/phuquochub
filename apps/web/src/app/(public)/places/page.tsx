import type { Metadata } from 'next';
import { listPlaces } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import styles from '@/modules/places/places.module.css';

const TITLE = 'Địa điểm Phú Quốc';
const DESCRIPTION =
  'Khám phá bãi biển, điểm tham quan, chợ, nhà hàng và khách sạn nổi bật ở Phú Quốc — thông tin địa chỉ, giá và bản đồ.';

export const metadata: Metadata = {
  title: `${TITLE} · PhuQuocHub`,
  description: DESCRIPTION,
  alternates: { canonical: '/places' },
  openGraph: {
    title: `${TITLE} · PhuQuocHub`,
    description: DESCRIPTION,
    type: 'website',
  },
};

// Server Component: fetch danh sách Place (published) phía server.
// Lỗi API/mạng được ném lên error.tsx (có nút thử lại); ở đây chỉ xử lý danh sách rỗng.
export default async function PlacesPage() {
  const places = await listPlaces({ limit: 50 });

  return (
    <section>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{TITLE}</h1>
        <p className={styles.pageLede}>{DESCRIPTION}</p>
      </header>

      {places.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Chưa có địa điểm nào</p>
          <p>Dữ liệu địa điểm đang được cập nhật. Vui lòng quay lại sau.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      )}
    </section>
  );
}
