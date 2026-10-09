'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { listMyPlaceEditProposals } from './api/place-edit-proposals.api';
import { ProposalPhotoThumbnail } from './ProposalPhotoUploader';
import { PLACE_EDIT_PROPOSAL_STATUS_LABELS, type PlaceEditProposalSenderView } from './types';
import styles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: PlaceEditProposalSenderView[]; accessToken: string };

function formatDate(iso: string | null): string {
  if (!iso) return 'chưa có';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'chưa có' : d.toLocaleDateString('vi-VN');
}

/**
 * "Góp ý của tôi": danh sách đề xuất của chính người dùng và trạng thái xử lý. KHÔNG hiện người duyệt hay
 * ghi chú nội bộ (API không trả các trường đó). `sender_message` LÀ "phản hồi public" admin viết riêng
 * cho người gửi (khác hẳn ghi chú nội bộ) — hiện khi có, null thì không hiện gì thêm (không bịa chuỗi
 * "chưa có phản hồi" cho một field tuỳ chọn). Trạng thái rỗng và lỗi được hiển thị rõ, không coi là "không có góp ý".
 */
export function MyProposalsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      listMyPlaceEditProposals(session.accessToken)
        .then((items) => {
          if (!cancelled) setState({ kind: 'ready', items, accessToken: session.accessToken });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được danh sách góp ý. Vui lòng thử lại.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải góp ý…</p>;
  if (state.kind === 'error') return <p className={styles.alert} role="alert">{state.message}</p>;
  if (state.items.length === 0) {
    return (
      <section aria-label="Góp ý của tôi">
        <h1>Góp ý của tôi</h1>
        <p>Bạn chưa gửi góp ý nào.</p>
      </section>
    );
  }

  return (
    <section aria-label="Góp ý của tôi">
      <h1>Góp ý của tôi</h1>
      <ul>
        {state.items.map((p) => (
          <li key={p.id} style={{ marginBottom: '0.75rem' }}>
            <strong>{p.field_key}</strong>
            {p.locale_code ? ` (${p.locale_code})` : ''} — {PLACE_EDIT_PROPOSAL_STATUS_LABELS[p.status]}
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Gửi ngày {formatDate(p.created_at)}
              {p.reviewed_at ? `; xử lý ngày ${formatDate(p.reviewed_at)}` : '; chưa được xử lý'}
            </div>
            {p.sender_message && (
              <blockquote style={{ margin: '0.4rem 0 0', paddingLeft: '0.75rem', borderLeft: '3px solid var(--border)', fontSize: '0.9rem' }}>
                Phản hồi: {p.sender_message}
              </blockquote>
            )}
            {p.photos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                {p.photos.map((photo) => (
                  <ProposalPhotoThumbnail key={photo.id} photo={photo} accessToken={state.accessToken} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
