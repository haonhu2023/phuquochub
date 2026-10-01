'use client';

import { useEffect, useRef, useState } from 'react';
import { suggest, type Suggestion } from '@/modules/search/api/search.api';
import { getPlace } from '@/modules/places/api/places.api';
import styles from './guide-editor.module.css';

interface SelectedPlace {
  slug: string;
  title: string;
}

interface Props {
  slugs: string[];
  onChange: (slugs: string[]) => void;
}

// Place picker cho khối `place_collection` (2026-09-29) — thay ô nhập slug thủ công bằng tìm theo
// tên thật. Tái dùng NGUYÊN VẸN hai API công khai đã có, không có endpoint mới nào:
//   - GET /search/suggest (SearchService.suggest -> PlacesRepository.searchFullText, đã lọc
//     `status = 'published'` ở tầng SQL) — gợi ý khi gõ.
//   - GET /places/:slug (getPlace) — chỉ để đọc LẠI title hiển thị cho những slug bài viết đã có
//     sẵn (place_collection chỉ lưu slug, không lưu title — không có nơi nào khác để đọc tên).
// Sắp xếp bằng nút lên/xuống, không kéo-thả — không cần thư viện DnD cho một danh sách thường chỉ
// vài mục, cùng tinh thần "không thư viện nặng nếu không cần" đã áp cho rich text.
export function PlacePicker({ slugs, onChange }: Props) {
  const [selected, setSelected] = useState<SelectedPlace[]>(() => slugs.map((slug) => ({ slug, title: slug })));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Đọc lại title cho các slug bài viết ĐÃ CÓ SẴN lúc mount (vd. mở lại một bản nháp cũ) — chỉ
  // chạy MỘT LẦN: block key ổn định qua các lần sửa bình thường trong cùng phiên (xem
  // GuideArticleEditorView's `nextKey()`), chỉ đổi khi TẢI LẠI bài viết (khi đó component này bị
  // remount với key mới, effect này chạy lại đúng lúc cần).
  useEffect(() => {
    let cancelled = false;
    if (slugs.length === 0) return;
    (async () => {
      const resolved = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const place = await getPlace(slug);
            return { slug, title: place.name };
          } catch {
            return { slug, title: slug };
          }
        }),
      );
      if (!cancelled) setSelected(resolved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mount, xem doc ở trên.
  }, []);

  // Cờ "query đủ dài để tìm" được DẪN XUẤT ở render, không lưu riêng bằng setState — nếu không,
  // nhánh "quá ngắn" của effect dưới đây phải gọi setState đồng bộ chỉ để xoá `suggestions`/
  // `searchError` (react-hooks/set-state-in-effect không cho phép). `suggestions`/`searchError` có
  // thể cũ khi query ngắn lại, nhưng vô hại: `showSuggestions` che chúng khỏi render, và lần tìm
  // hợp lệ tiếp theo sẽ thay thế đúng giá trị.
  const showSuggestions = query.trim().length >= 2;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) return;
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      suggest(q)
        .then((results) => {
          setSuggestions(results);
          setSearchError(null);
        })
        .catch(() => {
          setSuggestions([]);
          setSearchError('Không tìm được địa điểm. Thử lại.');
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function commit(next: SelectedPlace[]) {
    setSelected(next);
    onChange(next.map((p) => p.slug));
  }

  function addPlace(s: Suggestion) {
    if (selected.some((p) => p.slug === s.slug)) return;
    commit([...selected, { slug: s.slug, title: s.title }]);
    setQuery('');
    setSuggestions([]);
  }

  function removePlace(slug: string) {
    commit(selected.filter((p) => p.slug !== slug));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= selected.length) return;
    const next = selected.slice();
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    commit(next);
  }

  return (
    <div>
      <input
        type="text"
        className={styles.input}
        placeholder="Tìm địa điểm theo tên..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Tìm địa điểm theo tên"
      />
      {showSuggestions && searching && <p className={styles.fieldHint}>Đang tìm...</p>}
      {showSuggestions && searchError && (
        <p role="alert" className={styles.fieldHint} style={{ color: 'var(--err, red)' }}>
          {searchError}
        </p>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <ul className={styles.pickerSuggestList}>
          {suggestions.map((s) => {
            const already = selected.some((p) => p.slug === s.slug);
            return (
              <li key={s.id}>
                <button type="button" className={styles.pickerSuggestBtn} onClick={() => addPlace(s)} disabled={already}>
                  {s.title} <span className={styles.fieldHint}>({s.slug}){already ? ' — đã chọn' : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.subLabel}>Đã chọn ({selected.length}) — dùng mũi tên để sắp xếp thứ tự hiển thị</p>
      {selected.length === 0 ? (
        <p className={styles.fieldHint}>Chưa chọn địa điểm nào.</p>
      ) : (
        <ul className={styles.pickerSelectedList}>
          {selected.map((p, i) => (
            <li key={p.slug} className={styles.pickerSelectedRow}>
              <span>{p.title}</span>
              <div className={styles.blockTools}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Đưa ${p.title} lên trên`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label={`Đưa ${p.title} xuống dưới`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => removePlace(p.slug)}
                  aria-label={`Bỏ ${p.title} khỏi danh sách`}
                >
                  Gỡ
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
