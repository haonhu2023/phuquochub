'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingOpeningHoursEvidence } from './api/opening-hours-evidence.api';
import { OpeningHoursEvidenceDecisionForm } from './OpeningHoursEvidenceDecisionForm';
import type { OpeningHoursEvidencePendingView } from './types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: OpeningHoursEvidencePendingView[] };

// Hàng chờ duyệt bằng chứng giờ mở cửa (Source.Verify) — cùng khuôn JobListingModerationQueueView,
// nhưng mỗi hàng hiện THÊM giá trị opening_hours HIỆN TẠI của place cạnh observed_text, để moderator
// tự so khớp bằng mắt (không có cách nào máy tự xác nhận "nội dung nguồn có khớp Ý NGHĨA với giá
// trị hiện tại không" — hash chỉ xác nhận "giá trị chưa đổi kể từ lúc đọc", không xác nhận nội dung).
export function OpeningHoursEvidenceQueueView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'forbidden' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listPendingOpeningHoursEvidence(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          setState({ kind: 'forbidden' });
        } else {
          setState({ kind: 'error', message: safeMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Duyệt bằng chứng giờ mở cửa</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>Source.Verify</code> để xem trang này.
          </p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Duyệt bằng chứng giờ mở cửa</h1>
        <p className={placeStyles.pageLede}>
          Duyệt đủ điều kiện sẽ cho giờ mở cửa của địa điểm hiện công khai ngay. So khớp nội dung nộp với giờ hiện tại của địa điểm trước khi
          duyệt — hệ thống chỉ tự xác nhận &quot;giá trị chưa đổi&quot;, không tự xác nhận nội dung có đúng ý nghĩa.
        </p>
        {state.kind === 'ready' && (
          <button type="button" className={placeStyles.btn} onClick={reload} style={{ marginTop: '0.5rem' }}>
            Tải lại hàng chờ
          </button>
        )}
      </header>

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải hàng chờ">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '6rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
            />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được hàng chờ</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Hàng chờ trống</p>
          <p>Không có bằng chứng giờ mở cửa nào đang chờ duyệt.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.items.map((item) => (
            <li key={item.evidence_artifact_id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>
                {item.place_name ?? '(không rõ địa điểm)'}
                {item.place_slug && (
                  <>
                    {' — '}
                    <Link href={`/places/${item.place_slug}`} target="_blank">
                      xem trang công khai
                    </Link>
                  </>
                )}
              </p>
              <p>
                Nguồn: <a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_url}</a>
              </p>
              <p>
                <strong>Nội dung nộp (đã chép từ nguồn):</strong> {item.observed_text}
              </p>
              <p>
                <strong>Giờ mở cửa HIỆN TẠI của địa điểm:</strong>{' '}
                {item.place_current_opening_hours ? JSON.stringify(item.place_current_opening_hours) : '(không có)'}
              </p>
              <p>Khai báo lúc nộp: {item.schedule_stability_claimed === 'TEMPORARY' ? 'Thông báo tạm thời' : 'Lịch ổn định'}</p>
              {/* KHÔNG reload() ngay khi quyết định xong (khác JobListingModerationQueueView) — item
                  này CÓ hiện kết quả duyệt inline (eligible/linked hay không, kèm reason_codes),
                  reload ngay sẽ xoá nó khỏi danh sách trước khi moderator đọc được. Moderator tự
                  bấm "Tải lại hàng chờ" ở header khi muốn qua lô tiếp theo. */}
              <OpeningHoursEvidenceDecisionForm item={item} onDecided={() => {}} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải hàng chờ bằng chứng giờ mở cửa. Vui lòng thử lại.';
}
