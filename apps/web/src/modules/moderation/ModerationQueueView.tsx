'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { Pagination } from '@/components/ui/Pagination';
import type { PaginationMeta } from '@phuquochub/shared-types';
import { listModerationCases } from './api/moderation.api';
import { ModerationFilters } from './ModerationFilters';
import { ModerationQueueRow } from './ModerationQueueRow';
import { ForbiddenState } from './ModerationCaseView';
import {
  MODERATION_CASE_STATUSES,
  MODERATION_SEVERITIES,
  MODERATION_SOURCES,
  MODERATION_TARGET_TYPES,
  type ListModerationCasesParams,
  type ModerationCaseSummary,
} from './types';
import modStyles from './moderation.module.css';
import placeStyles from '@/modules/places/places.module.css';

const PAGE_SIZE = 20;
const BASE = '/dashboard/moderation';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; cases: ModerationCaseSummary[]; meta: PaginationMeta };

function pick<T extends readonly string[]>(arr: T, v: string | null): T[number] | undefined {
  return v && (arr as readonly string[]).includes(v) ? (v as T[number]) : undefined;
}

function parseParams(sp: URLSearchParams): ListModerationCasesParams {
  const params: ListModerationCasesParams = { limit: PAGE_SIZE };
  const page = Number(sp.get('page'));
  if (Number.isInteger(page) && page >= 1) params.page = page;
  params.status = pick(MODERATION_CASE_STATUSES, sp.get('status'));
  params.target_type = pick(MODERATION_TARGET_TYPES, sp.get('target_type'));
  params.source = pick(MODERATION_SOURCES, sp.get('source'));
  params.severity = pick(MODERATION_SEVERITIES, sp.get('severity'));
  const assigned = sp.get('assigned_to');
  if (assigned) params.assigned_to = assigned;
  return params;
}

export function ModerationQueueView() {
  const searchParams = useSearchParams();
  const spString = searchParams.toString();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    // setState trong callback bất đồng bộ — tránh set-state đồng bộ trong effect.
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
        return listModerationCases(parseParams(new URLSearchParams(spString)), session.accessToken);
      })
      .then(({ data, meta }) => {
        if (!cancelled) setState({ kind: 'ready', cases: data, meta });
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
  }, [spString, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Hàng chờ kiểm duyệt</h1>
        <ForbiddenState />
      </main>
    );
  }

  // baseQuery cho Pagination = bộ lọc hiện tại TRỪ page (giữ filter khi đổi trang).
  const baseQuery = new URLSearchParams(spString);
  baseQuery.delete('page');

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Hàng chờ kiểm duyệt</h1>
        <p className={placeStyles.pageLede}>
          Danh sách case cần xử lý, sắp xếp cố định theo ưu tiên và số báo cáo.
        </p>
        {/* Điểm vào DUY NHẤT tới hàng đợi duyệt claim: bảng điều khiển chung KHÔNG hiện liên kết
            nào cần permission (session FE chưa lộ permission, xem dashboard/page.tsx), nhưng ai đã
            đứng được ở màn hình này thì cũng là đối tượng của `Business.Verify` — đặt liên kết ở
            đây giúp moderator tìm thấy tính năng mà không phơi liên kết 403 cho người dùng thường. */}
        <p>
          <Link href="/dashboard/business-claims/review" style={{ color: 'var(--accent)' }}>
            Duyệt yêu cầu xác nhận quyền quản lý →
          </Link>
        </p>
      </header>

      <ModerationFilters total={state.kind === 'ready' ? state.meta.total : 0} />

      {state.kind === 'loading' && (
        <div className={modStyles.queue} aria-busy="true" aria-label="Đang tải hàng chờ">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={modStyles.skelRow} />
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

      {state.kind === 'ready' && state.cases.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Hàng chờ trống</p>
          <p>Không có case nào khớp bộ lọc hiện tại.</p>
        </div>
      )}

      {state.kind === 'ready' && state.cases.length > 0 && (
        <>
          <div className={modStyles.queue}>
            {state.cases.map((c) => (
              <ModerationQueueRow key={c.id} c={c} />
            ))}
          </div>
          <Pagination
            page={state.meta.page}
            totalPages={state.meta.totalPages}
            basePath={BASE}
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải hàng chờ kiểm duyệt. Vui lòng thử lại.';
}
