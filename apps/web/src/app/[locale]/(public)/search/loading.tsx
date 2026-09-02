import placesStyles from '@/modules/places/places.module.css';
import searchStyles from '@/modules/search/search.module.css';

// Skeleton cho /search — phản ánh bố cục thật: pageHeader (title/lede) + SearchBox (ô nhập + nút,
// khớp .searchBox/.searchInput/.searchButton) + danh sách kết quả dạng resultItem (border box +
// 2 dòng), KHÔNG phải lưới card như hotels/restaurants/tours — /search dùng .resultList/.resultItem
// riêng (search.module.css, vì SearchResult không có thumb/rating).
export default function SearchLoading() {
  return (
    <section aria-busy="true" aria-label="Đang tải kết quả tìm kiếm">
      <header className={placesStyles.pageHeader}>
        <div
          className={`${placesStyles.skeleton} ${placesStyles.skelLine}`}
          style={{ width: '30%', height: '2rem', margin: 0 }}
        />
        <div
          className={`${placesStyles.skeleton} ${placesStyles.skelLine}`}
          style={{ width: '65%', marginTop: '0.75rem' }}
        />
      </header>

      <div className={searchStyles.searchBox}>
        <div className={placesStyles.skeleton} style={{ flex: 1, height: '2.5rem' }} />
        <div className={placesStyles.skeleton} style={{ width: '4.5rem', height: '2.5rem' }} />
      </div>

      <ul className={searchStyles.resultList}>
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className={searchStyles.resultItem}>
            <div className={`${placesStyles.skeleton} ${placesStyles.skelLine}`} style={{ margin: 0, height: '1.05rem', width: '45%' }} />
            <div className={`${placesStyles.skeleton} ${placesStyles.skelLine} ${placesStyles.skelLineShort}`} style={{ marginLeft: 0 }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
