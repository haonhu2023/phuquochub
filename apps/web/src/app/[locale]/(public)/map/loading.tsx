import placesStyles from '@/modules/places/places.module.css';

// Skeleton cho /map — khối skeleton height:70vh khớp CHÍNH XÁC container thật của MapView, hạn
// chế layout shift tối đa. Thêm dòng skeleton bộ lọc (category/ward) khớp chiều cao toolbar thật
// (ui.module.css .toolbar) kể từ khi /map có MapExplorer (Search Filters trên bản đồ).
export default function MapLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải bản đồ">
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '40%', height: '2rem', margin: 0 }} />
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '70%', marginTop: '0.75rem' }} />
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <div className={placesStyles.skeleton} style={{ width: 160, height: 58, borderRadius: 8 }} />
        <div className={placesStyles.skeleton} style={{ width: 160, height: 58, borderRadius: 8 }} />
      </div>
      <div
        className={placesStyles.skeleton}
        style={{ width: '100%', height: '70vh', borderRadius: 8, marginTop: '1rem' }}
      />
    </section>
  );
}
