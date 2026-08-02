import placesStyles from '@/modules/places/places.module.css';

// Skeleton cho /explore — phản ánh bố cục thật của SearchMapExplorer (ô tìm kiếm + danh sách kết
// quả bên trái, bản đồ bên phải, height:70vh khớp MapView thật để hạn chế layout shift). Route
// này hiện không await dữ liệu ở Server Component nên trong thực tế boundary này hiếm khi kích
// hoạt (SearchMapExplorer tự quản lý trạng thái loading phía client) — vẫn thêm để bao phủ đồng
// nhất và phòng khi trang này có fetch phía server trong tương lai.
export default function ExploreLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải trang khám phá">
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '40%', height: '2rem', margin: 0 }} />
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '70%', marginTop: '0.75rem' }} />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '1rem' }}>
        <div style={{ flex: '1 1 340px', minWidth: 300 }}>
          <div className={placesStyles.skeleton} style={{ height: '2.5rem', marginBottom: 12 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={placesStyles.skeleton} style={{ height: '4.5rem', marginBottom: 8, borderRadius: 6 }} />
          ))}
        </div>
        <div style={{ flex: '2 1 420px', minWidth: 300 }}>
          <div className={placesStyles.skeleton} style={{ width: '100%', height: '70vh', borderRadius: 8 }} />
        </div>
      </div>
    </section>
  );
}
