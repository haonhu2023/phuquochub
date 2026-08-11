import styles from '@/modules/place-management/place-management.module.css';

export default function MyPlacesLoading() {
  return (
    <main aria-busy="true" aria-label="Đang tải địa điểm của tôi">
      <div className={styles.list}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.skelRow} />
        ))}
      </div>
    </main>
  );
}
