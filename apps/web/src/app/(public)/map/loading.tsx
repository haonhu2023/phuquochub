import placesStyles from '@/modules/places/places.module.css';

// Skeleton cho /map — khối skeleton height:70vh khớp CHÍNH XÁC container thật của MapView, hạn
// chế layout shift tối đa trong số 4 route của milestone này.
export default function MapLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải bản đồ">
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '40%', height: '2rem', margin: 0 }} />
      <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ width: '70%', marginTop: '0.75rem' }} />
      <div
        className={placesStyles.skeleton}
        style={{ width: '100%', height: '70vh', borderRadius: 8, marginTop: '1rem' }}
      />
    </section>
  );
}
