import { MapExplorer } from '@/modules/map/MapExplorer';
import { listCategories } from '@/modules/categories/api/categories.api';

export const metadata = { title: 'Bản đồ · PhuQuocHub' };

// Trang bản đồ — Server Component fetch categories (cho bộ lọc + nhãn popup), MapExplorer là
// client component (bộ lọc cục bộ + MapView/MapLibre).
export default async function MapPage() {
  const categories = await listCategories();
  return (
    <section>
      <h1>Bản đồ Phú Quốc</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Di chuyển/zoom để tải địa điểm theo khung nhìn (điểm gom cụm ở mức zoom thấp). Bấm vào một
        địa điểm để xem thông tin nhanh.
      </p>
      <MapExplorer categories={categories} />
    </section>
  );
}
