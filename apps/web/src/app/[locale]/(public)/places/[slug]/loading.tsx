import styles from '@/modules/places/places.module.css';

// Skeleton chi tiết — bám bố cục (breadcrumb, tiêu đề, gallery, đoạn mô tả).
export default function PlaceDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Đang tải chi tiết địa điểm">
      <div className={`${styles.skeleton}`} style={{ width: '40%', height: '0.9rem', marginBottom: '1rem' }} />
      <div className={`${styles.skeleton}`} style={{ width: '60%', height: '2.25rem', marginBottom: '1.25rem' }} />

      <div className={styles.gallery}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${styles.skeleton} ${styles.galleryImg}`} />
        ))}
      </div>

      <div className={styles.section}>
        <div className={`${styles.skeleton}`} style={{ width: '30%', height: '1.2rem', marginBottom: '0.75rem' }} />
        <div className={`${styles.skeleton}`} style={{ width: '100%', height: '0.9rem', marginBottom: '0.5rem' }} />
        <div className={`${styles.skeleton}`} style={{ width: '85%', height: '0.9rem' }} />
      </div>
    </article>
  );
}
