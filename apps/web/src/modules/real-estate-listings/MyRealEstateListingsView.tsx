'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  closeRealEstateListing,
  listMyRealEstateListings,
  markRealEstateListingAvailable,
  markRealEstateListingRented,
  markRealEstateListingSold,
  reopenRealEstateListing,
  submitRealEstateListing,
} from './api/real-estate-listings.api';
import {
  REAL_ESTATE_DEAL_STATUS_LABELS,
  REAL_ESTATE_LISTING_STATUS_LABELS,
  realEstatePropertyTypeLabel,
  realEstateTransactionTypeLabel,
  type RealEstateListingSenderView,
} from './types';
import { formatRealEstatePrice } from './price';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  LISTING_EFFECTIVE_STATUS_LABELS,
  listingEffectiveStatus,
  matchesListingFilter,
  todayInVietnam,
  type ListingFilterValue,
} from '@/lib/listingExpiry';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: RealEstateListingSenderView[] };

function formatDate(iso: string | null): string {
  if (!iso) return 'chưa có';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'chưa có' : d.toLocaleDateString('vi-VN');
}

// Cùng lý do với MyJobListingsView.tsx: `expires_at` là YYYY-MM-DD không giờ — format trực tiếp từ
// chuỗi, không qua `new Date(iso)` (tránh lệch ngày theo múi giờ trình duyệt người xem).
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

type Action = 'submit' | 'close' | 'reopen' | 'mark-rented' | 'mark-sold' | 'mark-available';

const ACTION_FN = {
  submit: submitRealEstateListing,
  close: closeRealEstateListing,
  reopen: reopenRealEstateListing,
  'mark-rented': markRealEstateListingRented,
  'mark-sold': markRealEstateListingSold,
  'mark-available': markRealEstateListingAvailable,
} as const;

export function MyRealEstateListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListingFilterValue>('all');
  const today = todayInVietnam();

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listMyRealEstateListings(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: safeMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function act(id: string, action: Action) {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(id);
    setActionError(null);
    try {
      await ACTION_FN[action](id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setActingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Tin bất động sản của tôi</h1>
        <p className={placeStyles.pageLede}>Đăng tin cho thuê/mua bán — tin cần được duyệt trước khi hiện công khai.</p>
      </header>

      <div className={placeMgmtStyles.actions} style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard/real-estate/new" className={placeStyles.btn}>
          + Đăng tin mới
        </Link>
      </div>

      {state.kind === 'ready' && state.items.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="re-filter" style={{ marginRight: '0.5rem' }}>
            Lọc theo trạng thái
          </label>
          <select id="re-filter" value={filter} onChange={(e) => setFilter(e.target.value as ListingFilterValue)}>
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {actionError && (
        <p className={placeMgmtStyles.alert} role="alert">
          {actionError}
        </p>
      )}

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải danh sách">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '5rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
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

      {state.kind === 'ready' && state.items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có tin nào</p>
          <p>Bạn chưa đăng tin bất động sản nào.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (() => {
        const filtered = state.items.filter((listing) => matchesListingFilter(listing, filter, today));
        if (filtered.length === 0) {
          return (
            <div className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>Không có tin nào khớp bộ lọc</p>
              <p>Đổi bộ lọc ở trên để xem các tin khác.</p>
            </div>
          );
        }
        return (
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
              {listing.status === 'rejected' && listing.review_note && (
                <p style={{ color: 'var(--danger, #b91c1c)' }}>Lý do từ chối: {listing.review_note}</p>
              )}
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Tạo ngày {formatDate(listing.created_at)}
                {listing.reviewed_at ? `; xử lý ngày ${formatDate(listing.reviewed_at)}` : ''}
                {listing.expires_at ? `; hạn đăng ${formatYmd(listing.expires_at)}` : ''}
              </p>
              {effectiveStatus === 'expired' && (
                <p style={{ color: 'var(--danger, #b91c1c)', fontSize: '0.85rem' }}>
                  Tin đã quá hạn đăng ({formatYmd(listing.expires_at as string)}) nên không còn hiện công khai, dù trạng thái vẫn &quot;Đang đăng&quot;. Sửa tin và đặt hạn mới rồi gửi duyệt lại để đăng tiếp.
                </p>
              )}

              <div className={placeMgmtStyles.actions}>
                {(listing.status === 'draft' || listing.status === 'pending' || listing.status === 'rejected') && (
                  <Link href={`/dashboard/real-estate/${listing.id}/edit`} className={placeStyles.btn}>
                    Sửa
                  </Link>
                )}
                {(listing.status === 'draft' || listing.status === 'rejected') && (
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    disabled={actingId === listing.id}
                    onClick={() => act(listing.id, 'submit')}
                  >
                    Gửi duyệt
                  </button>
                )}
                {listing.status === 'published' && (
                  <>
                    <Link href={`/dashboard/real-estate/${listing.id}/edit`} className={placeStyles.btn}>
                      Sửa (ẩn tin, cần duyệt lại)
                    </Link>
                    {listing.deal_status === 'available' && (
                      <button
                        type="button"
                        className={placeMgmtStyles.submitBtn}
                        disabled={actingId === listing.id}
                        onClick={() => act(listing.id, listing.transaction_type === 'rent' ? 'mark-rented' : 'mark-sold')}
                      >
                        {listing.transaction_type === 'rent' ? 'Đánh dấu đã cho thuê' : 'Đánh dấu đã bán'}
                      </button>
                    )}
                    {listing.deal_status !== 'available' && (
                      <button
                        type="button"
                        className={placeMgmtStyles.submitBtn}
                        disabled={actingId === listing.id}
                        onClick={() => act(listing.id, 'mark-available')}
                      >
                        Đánh dấu còn giao dịch
                      </button>
                    )}
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === listing.id}
                      onClick={() => act(listing.id, 'close')}
                    >
                      Đóng tin
                    </button>
                  </>
                )}
                {listing.status === 'closed' && (
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    disabled={actingId === listing.id}
                    onClick={() => act(listing.id, 'reopen')}
                  >
                    Mở lại (cần duyệt lại)
                  </button>
                )}
              </div>
            </li>
            );
          })}
        </ul>
        );
      })()}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
