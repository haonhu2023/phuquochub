'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { closeRealEstateListing, listRealEstateListingsForAdmin, reopenRealEstateListing } from './api/real-estate-listings.api';
import {
  REAL_ESTATE_DEAL_STATUS_LABELS,
  REAL_ESTATE_LISTING_STATUS_LABELS,
  realEstatePropertyTypeLabel,
  realEstateTransactionTypeLabel,
  type RealEstateListingAdminView,
} from './types';
import { formatRealEstatePrice } from './price';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  LISTING_EFFECTIVE_STATUS_LABELS,
  listingEffectiveStatus,
  matchesListingFilter,
  useTodayInVietnam,
  type ListingFilterValue,
} from '@/lib/listingExpiry';
import type { RealEstateListingStatus } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: RealEstateListingAdminView[]; total: number };

const PAGE_SIZE = 50;

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

const FILTER_OPTIONS: Array<{ value: ListingFilterValue; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'published', label: 'Đang đăng' },
  { value: 'expiring_soon', label: 'Sắp hết hạn' },
  { value: 'expired', label: 'Đã hết hạn' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'rejected', label: 'Bị từ chối' },
];

const REAL_STATUS_VALUES = new Set<string>(['draft', 'pending', 'published', 'closed', 'rejected']);
function toRealStatus(filter: ListingFilterValue): RealEstateListingStatus | undefined {
  return REAL_STATUS_VALUES.has(filter) ? (filter as RealEstateListingStatus) : undefined;
}

// Màn hình quản lý TOÀN BỘ tin (Gói B, 17/10/2026) — cùng lý do/mẫu AdminJobListingsView (xem ghi
// chú đầy đủ ở đó), kể cả phần lọc "Hết hạn"/"Sắp hết hạn" theo trạng thái HIỆU LỰC và phân trang.
export function AdminRealEstateListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<ListingFilterValue>('all');
  const [posterQuery, setPosterQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const today = useTodayInVietnam();

  const reload = useCallback(() => {
    setPage(1);
    setReloadKey((k) => k + 1);
  }, []);

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
        return listRealEstateListingsForAdmin(
          { status: toRealStatus(filter), page: 1, limit: PAGE_SIZE },
          session.accessToken,
        );
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
  }, [reloadKey, filter]);

  async function loadMore() {
    const session = readSession();
    if (!session || state.kind !== 'ready') return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await listRealEstateListingsForAdmin(
        { status: toRealStatus(filter), page: nextPage, limit: PAGE_SIZE },
        session.accessToken,
      );
      setPage(nextPage);
      setState((prev) => (prev.kind === 'ready' ? { ...prev, items: [...prev.items, ...data] } : prev));
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function act(id: string, action: 'close' | 'reopen') {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(id);
    setActionError(null);
    try {
      await (action === 'close' ? closeRealEstateListing : reopenRealEstateListing)(id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setActingId(null);
    }
  }

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Quản lý tất cả tin bất động sản</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>RealEstateListing.Moderate</code> để xem trang này.
          </p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }

  const posterNeedle = posterQuery.trim().toLowerCase();
  const loaded = state.kind === 'ready' ? state.items : [];
  const total = state.kind === 'ready' ? state.total : 0;
  const statusFiltered = loaded.filter((r) => matchesListingFilter(r, filter, today));
  const filtered = posterNeedle
    ? statusFiltered.filter(
        (r) =>
          (r.creator_display_name ?? '').toLowerCase().includes(posterNeedle) ||
          (r.creator_email ?? '').toLowerCase().includes(posterNeedle),
      )
    : statusFiltered;
  const hasMore = loaded.length < total;

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Quản lý tất cả tin bất động sản</h1>
        <p className={placeStyles.pageLede}>
          Khác hàng chờ duyệt: xem tin của MỌI người đăng, ở MỌI trạng thái (đang công khai, hết hạn, đã đóng, bị từ
          chối, nháp). Tin đang chờ duyệt vẫn xử lý ở{' '}
          <Link href="/dashboard/real-estate/moderation">trang Duyệt tin bất động sản</Link>.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div>
          <label htmlFor="re-admin-status" style={{ marginRight: '0.5rem' }}>
            Trạng thái
          </label>
          <select
            id="re-admin-status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as ListingFilterValue);
              reload();
            }}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="re-admin-poster" style={{ marginRight: '0.5rem' }}>
            Người đăng (tên/email)
          </label>
          <input
            id="re-admin-poster"
            type="text"
            value={posterQuery}
            onChange={(e) => setPosterQuery(e.target.value)}
            placeholder="Gõ để lọc trong số tin đã tải"
          />
        </div>
      </div>

      {state.kind === 'ready' && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Đã tải {loaded.length}/{total} tin khớp trạng thái đã chọn.
          {posterNeedle && hasMore && (
            <strong style={{ color: 'var(--warning, #b45309)' }}>
              {' '}
              Bộ lọc người đăng chỉ áp dụng trong {loaded.length} tin ĐÃ TẢI — còn {total - loaded.length} tin chưa
              tải, có thể còn khớp. Bấm &quot;Tải thêm&quot; trước khi coi đây là toàn bộ kết quả.
            </strong>
          )}
        </p>
      )}

      {actionError && (
        <p className={placeMgmtStyles.alert} role="alert">
          {actionError}
        </p>
      )}

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải danh sách">
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
          <p className={placeStyles.stateTitle}>Không tải được danh sách</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && loaded.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào</p>
        </div>
      )}

      {state.kind === 'ready' && loaded.length > 0 && filtered.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào khớp bộ lọc trong số đã tải</p>
        </div>
      )}

      {state.kind === 'ready' && filtered.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {filtered.map((listing) => {
            const effectiveStatus = listingEffectiveStatus(listing.status, listing.expires_at, today);
            return (
              <li key={listing.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>
                  {listing.title} — {REAL_ESTATE_LISTING_STATUS_LABELS[listing.status]}
                  {listing.status === 'published' || listing.status === 'closed'
                    ? ` · ${REAL_ESTATE_DEAL_STATUS_LABELS[listing.deal_status]}`
                    : ''}
                  {effectiveStatus && (
                    <span style={{ color: effectiveStatus === 'expired' ? 'var(--danger, #b91c1c)' : 'var(--warning, #b45309)' }}>
                      {' '}· {LISTING_EFFECTIVE_STATUS_LABELS[effectiveStatus]}
                    </span>
                  )}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {realEstateTransactionTypeLabel(listing.transaction_type, 'vi')} ·{' '}
                  {realEstatePropertyTypeLabel(listing.property_type, 'vi')} · {formatRealEstatePrice(listing)}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Người đăng: {listing.creator_display_name ?? '(đã xoá tài khoản)'}
                  {listing.creator_email ? ` — ${listing.creator_email}` : ''}
                </p>
                {listing.expires_at && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Hạn đăng {formatYmd(listing.expires_at)}</p>
                )}
                {listing.status === 'rejected' && listing.review_note && (
                  <p style={{ color: 'var(--danger, #b91c1c)' }}>Lý do từ chối: {listing.review_note}</p>
                )}

                <div className={placeMgmtStyles.actions}>
                  {listing.status === 'published' && (
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === listing.id}
                      onClick={() => act(listing.id, 'close')}
                    >
                      Đóng tin
                    </button>
                  )}
                  {listing.status === 'closed' && (
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === listing.id}
                      onClick={() => act(listing.id, 'reopen')}
                    >
                      Mở lại (về chờ duyệt — người đăng tự sửa nội dung/hạn sau đó)
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.kind === 'ready' && hasMore && (
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className={placeStyles.btn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : `Tải thêm (còn ${total - loaded.length})`}
          </button>
        </div>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
