import { MapView } from '@/modules/map/MapView';

export const metadata = { title: 'Bản đồ · PhuQuocHub' };

// Trang bản đồ — MapView là client component (MapLibre).
export default function MapPage() {
  return (
    <section>
      <h1>Bản đồ Phú Quốc</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Di chuyển/zoom để tải địa điểm theo khung nhìn (điểm gom cụm ở mức zoom thấp).
      </p>
      <MapView />
    </section>
  );
}
