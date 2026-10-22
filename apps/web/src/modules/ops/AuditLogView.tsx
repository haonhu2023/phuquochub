'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listAuditLog } from './api/ops.api';
import type { AuditLogFilter, AuditLogRow } from './types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: AuditLogRow[]; total: number };

const PAGE_SIZE = 50;

const RESULT_OPTIONS: Array<{ value: AuditLogRow['result'] | ''; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'success', label: 'Thành công' },
  { value: 'failure', label: 'Thất bại' },
  { value: 'allow', label: 'Cho phép' },
  { value: 'deny', label: 'Từ chối' },
];

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

function formatVn(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Trang tra cứu nhật ký quản trị riêng (2026-10-22, vá gap rà soát vận hành toàn site mục 3) —
 * TRƯỚC trang này, `audit_logs` chỉ xem được qua 20 dòng gần nhất nhúng trong
 * `OwnerCommandCenter` (xem dòng "Xem toàn bộ, lọc theo đối tượng/người thao tác" ở đó dẫn sang
 * đây), không lọc/tìm/phân trang được — tra "ai đã đóng tin X tuần trước" chỉ làm được bằng SQL
 * tay. Lọc hoàn toàn phía SERVER (khác AdminJobListingsView's lọc người đăng phía client) vì
 * `audit_logs` có thể lớn hơn nhiều mức "tải hết rồi lọc" còn hợp lý — tận dụng index có sẵn từ
 * migration gốc (entity_type+entity_id, actor_id, event, đều kèm created_at).
 *
 * CÙNG ranh giới lộ dữ liệu đã chốt ở owner-dashboard's OWNER_AUDIT_SQL — không có ip/user_agent/
 * before/after/context thô, chỉ scalar status + `correlation_id` (để tra chéo với Sentry, xem
 * AllExceptionsFilter's Sentry.captureException tags).
 */
export function AuditLogView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  // Input nháp (gõ KHÔNG tự tải lại — chỉ khi bấm "Lọc", xem applyFilters()). `appliedFilter` là
  // filter THẬT SỰ đang tải, giữ nguyên identity giữa các lần gõ để không trigger effect dưới đây.
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorId, setActorId] = useState('');
  const [event, setEvent] = useState('');
  const [result, setResult] = useState<AuditLogRow['result'] | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<AuditLogFilter>({});

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
        return listAuditLog({ ...appliedFilter, page, limit: PAGE_SIZE }, session.accessToken);
      })
      .then(({ data, meta }) => {
        if (!cancelled) setState({ kind: 'ready', items: data, total: meta.total });
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
  }, [reloadKey, page, appliedFilter]);

  const applyFilters = useCallback(() => {
    setPage(1);
    setAppliedFilter({
      entity_type: entityType.trim() || undefined,
      entity_id: entityId.trim() || undefined,
      actor_id: actorId.trim() || undefined,
      event: event.trim() || undefined,
      result: result || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }, [entityType, entityId, actorId, event, result, from, to]);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Nhật ký quản trị</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>Ops.Dashboard.View</code> để xem trang này.
          </p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }

  const items = state.kind === 'ready' ? state.items : [];
  const total = state.kind === 'ready' ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Nhật ký quản trị</h1>
        <p className={placeStyles.pageLede}>
          Tra cứu đầy đủ, lọc theo đối tượng/người thao tác/sự kiện/khoảng ngày. Chỉ hiển thị định danh người thao
          tác và thay đổi trạng thái — không hiển thị mật khẩu, IP hoặc nội dung riêng tư.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}
      >
        <div>
          <label htmlFor="al-entity-type" style={{ display: 'block' }}>
            Loại đối tượng
          </label>
          <input id="al-entity-type" type="text" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="vd: job_listing" />
        </div>
        <div>
          <label htmlFor="al-entity-id" style={{ display: 'block' }}>
            ID đối tượng
          </label>
          <input id="al-entity-id" type="text" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="UUID" />
        </div>
        <div>
          <label htmlFor="al-actor-id" style={{ display: 'block' }}>
            ID người thao tác
          </label>
          <input id="al-actor-id" type="text" value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="UUID" />
        </div>
        <div>
          <label htmlFor="al-event" style={{ display: 'block' }}>
            Sự kiện (khớp một phần)
          </label>
          <input id="al-event" type="text" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="vd: job_listing.closed" />
        </div>
        <div>
          <label htmlFor="al-result" style={{ display: 'block' }}>
            Kết quả
          </label>
          <select id="al-result" value={result} onChange={(e) => setResult(e.target.value as AuditLogRow['result'] | '')}>
            {RESULT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="al-from" style={{ display: 'block' }}>
            Từ ngày
          </label>
          <input id="al-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="al-to" style={{ display: 'block' }}>
            Đến ngày
          </label>
          <input id="al-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="submit" className={placeStyles.btn}>
          Lọc
        </button>
      </form>

      {state.kind === 'loading' && <p role="status">Đang tải...</p>}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được nhật ký</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có sự kiện nào khớp bộ lọc</p>
        </div>
      )}

      {state.kind === 'ready' && items.length > 0 && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{total} sự kiện khớp bộ lọc.</p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
            {items.map((a) => (
              <li key={a.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>
                  {a.event} · {a.result}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {formatVn(a.created_at)} · {a.actor_role ?? 'Không rõ vai trò'} · {a.actor_id ?? 'Không ghi nhận người thao tác'}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Đối tượng: {a.entity_type} / {a.entity_id ?? 'Không có định danh'}
                </p>
                {(a.before_status || a.after_status) && (
                  <p>
                    {a.before_status ?? 'Chưa ghi nhận'} → {a.after_status ?? 'Chưa ghi nhận'}
                  </p>
                )}
                {a.correlation_id && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Correlation ID: {a.correlation_id}</p>
                )}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
            <button type="button" className={placeStyles.btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trang trước
            </button>
            <span>
              Trang {page} / {totalPages}
            </span>
            <button type="button" className={placeStyles.btn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Trang sau
            </button>
          </div>
        </>
      )}
    </main>
  );
}
