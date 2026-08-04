'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getModerationCase } from './api/moderation.api';
import { ModerationCaseDetail } from './ModerationCaseDetail';
import { ModerationDecisionForm } from './ModerationDecisionForm';
import type { ModerationCaseDetail as CaseDetail } from './types';
import modStyles from './moderation.module.css';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: CaseDetail };

// Chi tiết một case (client — cần Bearer từ localStorage). Phân biệt 403 (forbidden), 404
// (notFound), lỗi khác (retry). Sau khi quyết định thành công → nạp lại (reload) để phản ánh
// trạng thái đã commit (không optimistic).
export function ModerationCaseView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    // setState đặt trong callback bất đồng bộ (microtask/promise) — tránh set-state đồng bộ
    // trong effect (react-hooks/set-state-in-effect). Loading hiển thị mỗi lần (re)fetch.
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
        return getModerationCase(id, session.accessToken);
      })
      .then((detail) => {
        if (!cancelled) setState({ kind: 'ready', detail });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          setState({ kind: 'forbidden' });
        } else if (err instanceof ApiError && err.status === 404) {
          setState({ kind: 'notFound' });
        } else {
          setState({ kind: 'error', message: safeMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  if (state.kind === 'loading') {
    return (
      <main aria-busy="true">
        <div className={modStyles.skelRow} style={{ marginBottom: '1rem' }} />
        <div className={modStyles.skelRow} />
      </main>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <main>
        <ForbiddenState />
      </main>
    );
  }

  if (state.kind === 'notFound') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy case</p>
          <p>Case kiểm duyệt này không tồn tại hoặc đã bị gỡ.</p>
          <Link href="/dashboard/moderation" className={placeStyles.btn}>
            ← Về hàng chờ
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được case</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <ModerationCaseDetail
        detail={state.detail}
        decisionSlot={<ModerationDecisionForm detail={state.detail} onDecided={reload} />}
      />
    </main>
  );
}

export function ForbiddenState() {
  return (
    <div className={placeStyles.state} role="alert">
      <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
      <p>
        Bạn không có quyền <code>Moderation.Queue.View</code> để xem hàng chờ kiểm duyệt. Nếu cho
        rằng đây là nhầm lẫn, liên hệ quản trị viên.
      </p>
      <Link href="/dashboard" className={placeStyles.btn}>
        ← Về bảng điều khiển
      </Link>
    </div>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải case. Vui lòng thử lại.';
}
