'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { listGuideDrafts, type GuideArticleSummary } from './api/guide-editor.api';
import { ApiError } from '@/lib/http';
import styles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' | 'signed-out' | 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; articles: GuideArticleSummary[] };

export function GuideArticlesIndexView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => { if (!cancelled) setState({ kind: 'signed-out' }); });
      return () => { cancelled = true; };
    }
    void fetchCapabilities(session.accessToken)
      .then((caps) => {
        if (!caps.canEditGuides) { if (!cancelled) setState({ kind: 'forbidden' }); return null; }
        return listGuideDrafts(session.accessToken);
      })
      .then((articles) => { if (!cancelled && articles) setState({ kind: 'ready', articles }); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(error instanceof ApiError && error.status === 403
          ? { kind: 'forbidden' }
          : { kind: 'error', message: 'Không tải được cẩm nang. Vui lòng thử lại.' });
      });
    return () => { cancelled = true; };
  }, [reload]);

  return (
    <main>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/dashboard">Bảng điều khiển</Link><span className={styles.sep}>/</span><span aria-current="page">Biên tập cẩm nang</span></nav>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Biên tập cẩm nang</h1>
        <p className={styles.pageLede}>Tạo, chỉnh sửa và xuất bản bài hướng dẫn du lịch.</p>
      </header>
      {state.kind === 'loading' && <p role="status">Đang tải cẩm nang…</p>}
      {state.kind === 'signed-out' && <p role="alert">Vui lòng <Link href="/login?next=%2Fdashboard%2Feditorial%2Fguides">đăng nhập</Link> để biên tập.</p>}
      {state.kind === 'forbidden' && <p role="alert">Bạn không có quyền biên tập cẩm nang.</p>}
      {state.kind === 'error' && <div role="alert"><p>{state.message}</p><button type="button" onClick={() => setReload((v) => v + 1)}>Thử lại</button></div>}
      {state.kind === 'ready' && <>
        <p><Link className={styles.btn} href="/dashboard/editorial/guides/new">+ Tạo cẩm nang</Link></p>
        {state.articles.length >= 200 && <p role="status">Danh sách chỉ hiển thị tối đa 200 bài gần nhất. Các bài cũ hơn chưa được hiển thị ở đây.</p>}
        {state.articles.length === 0 ? <p>Chưa có bài viết nào. Hãy tạo cẩm nang đầu tiên.</p> :
          <ul className={styles.grid} style={{ listStyle: 'none', padding: 0 }}>
            {state.articles.map((article) => <li key={article.id}>
              <Link className={styles.card} href={`/dashboard/editorial/guides/${encodeURIComponent(article.id)}`}>
                <span className={styles.cardBody}>
                  <strong className={styles.cardTitle}>{article.title || article.slug}</strong>
                  <span>{article.locale.toUpperCase()} · {article.status === 'published' ? 'Đã công khai' : 'Bản nháp'}</span>
                </span>
              </Link>
            </li>)}
          </ul>}
      </>}
    </main>
  );
}
