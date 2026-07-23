'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { searchPlaces, type SearchResult } from '@/modules/search/api/search.api';

// Client Component: ô tìm kiếm + kết quả. Không dấu ≡ có dấu (BE unaccent).
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchPlaces(query));
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>Tìm kiếm</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="vd: bai sao, dinh cau…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Đang tìm…' : 'Tìm'}
        </button>
      </form>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {searched && !loading && results.length === 0 && <p>Không có kết quả cho “{q}”.</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {results.map((r) => (
          <li key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
            <Link href={`/places/${r.slug}`} style={{ fontWeight: 600 }}>
              {r.title}
            </Link>
            {r.snippet && <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 14 }}>{r.snippet}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
