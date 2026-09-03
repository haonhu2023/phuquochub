import { SearchMapExplorer } from '@/modules/search/SearchMapExplorer';

export const metadata = { title: 'Khám phá · PhuQuocHub' };

// Trang Explore — tìm kiếm + bản đồ đồng bộ (Sprint 3). Chọn kết quả → bản đồ fly tới.
export default function ExplorePage() {
  return (
    <section>
      <h1>Khám phá Phú Quốc</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Tìm theo từ khoá (không dấu ≡ có dấu) rồi chọn kết quả để xem trên bản đồ.
      </p>
      <SearchMapExplorer />
    </section>
  );
}
