import type { Metadata } from 'next';
import { listPlaces } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import { localizedHref, type Locale } from '@/lib/locale';
import styles from '@/modules/places/places.module.css';

const TITLE = 'Địa điểm Phú Quốc';
const DESCRIPTION =
  'Khám phá bãi biển, điểm tham quan, chợ, nhà hàng và khách sạn nổi bật ở Phú Quốc — thông tin địa chỉ, giá và bản đồ.';

interface Props {
  params: Promise<{ locale: string }>;
}

// PR A: canonical phải khớp route thật (/vi/places hoặc /en/places) — chuyển sang
// `generateMetadata` vì cần `params.locale`, `export const metadata` tĩnh không truy cập được.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  return {
    title: `${TITLE} · PhuQuocHub`,
    description: DESCRIPTION,
    alternates: { canonical: localizedHref(locale, '/places') },
    openGraph: {
      title: `${TITLE} · PhuQuocHub`,
      description: DESCRIPTION,
      type: 'website',
    },
  };
}

// Server Component: fetch danh sách Place (published) phía server.
// Lỗi API/mạng được ném lên error.tsx (có nút thử lại); ở đây chỉ xử lý danh sách rỗng.
export default async function PlacesPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
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
            <PlaceCard key={p.id} place={p} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}
