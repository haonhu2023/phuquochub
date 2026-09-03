import styles from '@/modules/places/places.module.css';

// Skeleton bám sát bố cục thật (header + lưới card) để hạn chế layout shift.
export default function PlacesLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải danh sách địa điểm">
      <header className={styles.pageHeader}>
        <div className={`${styles.skeleton} ${styles.skelLine}`} style={{ width: '40%', height: '2rem', margin: 0 }} />
        <div className={`${styles.skeleton} ${styles.skelLine}`} style={{ width: '70%', marginTop: '0.75rem' }} />
      </header>

      <div className={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={styles.card}>
            <div className={`${styles.skeleton} ${styles.skelThumb}`} />
            <div className={styles.cardBody}>
              <div className={`${styles.skeleton} ${styles.skelLine}`} style={{ margin: 0, height: '1.1rem' }} />
              <div className={`${styles.skeleton} ${styles.skelLine} ${styles.skelLineShort}`} style={{ marginLeft: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
