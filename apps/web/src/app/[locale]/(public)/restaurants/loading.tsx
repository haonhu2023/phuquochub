import placesStyles from '@/modules/places/places.module.css';

// Skeleton bám sát bố cục thật (header + lưới card) để hạn chế layout shift.
export default function RestaurantsLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải danh sách nhà hàng">
      <header className={placesStyles.pageHeader}>
        <div
          className={`${placesStyles.skeleton} ${placesStyles.skelLine}`}
          style={{ width: '40%', height: '2rem', margin: 0 }}
        />
        <div
          className={`${placesStyles.skeleton} ${placesStyles.skelLine}`}
          style={{ width: '70%', marginTop: '0.75rem' }}
        />
      </header>

      <div className={placesStyles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={placesStyles.card}>
            <div className={`${placesStyles.skeleton} ${placesStyles.skelThumb}`} />
            <div className={placesStyles.cardBody}>
              <div
                className={`${placesStyles.skeleton} ${placesStyles.skelLine}`}
                style={{ margin: 0, height: '1.1rem' }}
              />
              <div
                className={`${placesStyles.skeleton} ${placesStyles.skelLine} ${placesStyles.skelLineShort}`}
                style={{ marginLeft: 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
