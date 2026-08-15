import type { ReactNode } from 'react';
import { LEGAL_LAST_UPDATED } from '@/lib/site-identity';
import styles from './legal.module.css';

// Khuôn dùng chung cho 4 trang tin cậy/pháp lý, để tiêu đề, ngày cập nhật và bề rộng đọc thống
// nhất giữa các trang thay vì lặp lại ở từng file.
export function LegalPage({
  title,
  showUpdated = true,
  children,
}: {
  title: string;
  showUpdated?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {showUpdated ? (
        <p className={styles.updated}>Cập nhật lần cuối: {LEGAL_LAST_UPDATED}</p>
      ) : null}
      {children}
    </article>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
