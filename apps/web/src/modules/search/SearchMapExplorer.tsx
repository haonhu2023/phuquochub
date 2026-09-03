'use client';

// Sprint 3 · task "ô tìm kiếm + kết quả list/map đồng bộ": danh sách kết quả FTS và bản đồ
// dùng chung state. Chọn một kết quả → lấy toạ độ (getPlace) → bản đồ fly tới (đồng bộ list→map).

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MapView } from '@/modules/map/MapView';
import { searchPlaces, type SearchResult } from '@/modules/search/api/search.api';
import { getPlace } from '@/modules/places/api/places.api';
import type { GeoPoint } from '@/modules/places/types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';

export function SearchMapExplorer() {
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<GeoPoint | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      setResults((await searchPlaces({ q: query })).data);
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Chọn kết quả → lấy toạ độ chi tiết → bản đồ fly tới.
  async function onSelect(r: SearchResult) {
    setSelectedId(r.id);
    try {
      const detail = await getPlace(r.slug);
      setFocusPoint(detail.location);
    } catch {
      // Không có toạ độ → chỉ highlight trong list, không fly.
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 340px', minWidth: 300 }}>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="vd: bai sao, dinh cau…"
            aria-label="Từ khoá tìm kiếm"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
          <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
            {loading ? 'Đang tìm…' : 'Tìm'}
          </button>
        </form>

        {error && (
          <p role="alert" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}
        {searched && !loading && results.length === 0 && <p>Không có kết quả cho “{q}”.</p>}

        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, maxHeight: '62vh', overflowY: 'auto' }}>
          {results.map((r) => (
            <li
              key={r.id}
              style={{
                border: '1px solid',
                borderColor: r.id === selectedId ? '#2563eb' : '#e5e7eb',
                background: r.id === selectedId ? '#eff6ff' : 'transparent',
                borderRadius: 6,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              {r.snippet && (
                <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 14 }}>{r.snippet}</p>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    color: '#2563eb',
                    textDecoration: 'underline',
                  }}
                >
                  Xem trên bản đồ
                </button>
                <Link href={localizedHref(locale, `/places/${r.slug}`)} style={{ color: '#2563eb' }}>
                  Chi tiết →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: '2 1 420px', minWidth: 300, position: 'sticky', top: 16 }}>
        <MapView focusPoint={focusPoint} />
      </div>
    </div>
  );
}
