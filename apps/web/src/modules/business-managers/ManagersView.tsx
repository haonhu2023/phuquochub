'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';
import {
  assignBusinessManager,
  listBusinessManagers,
  lookupBusinessUserByEmail,
  revokeBusinessManager,
} from './api/business-managers.api';
import type { BusinessManager, LookupBusinessUserResult } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; managers: BusinessManager[] };

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'found'; result: LookupBusinessUserResult };

interface Props {
  placeId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
}

// "Quản lý người quản lý" của một cơ sở (GET/POST/DELETE /business/{id}/managers[/lookup|/:userId],
// Business.Manager.Assign/Revoke.Managed — chỉ owner hiệu lực CỦA ĐÚNG cơ sở này gọi được, PDP
// chặn TRƯỚC ở backend). Route KHÔNG phân biệt "cơ sở không tồn tại" với "bạn không phải owner" —
// cả hai đều 403 (AuthorizationContext dùng IDENTITY_PLACE_RESOLVER, không tra tồn tại place trước
// khi kiểm permission) — CÙNG khuôn EditPlaceView (không tiết lộ thêm gì ở hai trường hợp đó).
export function ManagersView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>({ kind: 'idle' });
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'signed-out' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listBusinessManagers(placeId, session.accessToken);
      })
      .then((managers) => {
        if (!cancelled) setState({ kind: 'ready', managers });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setState({ kind: 'forbidden' });
          return;
        }
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải danh sách quản lý viên. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId, reloadKey]);

  async function handleLookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lookupState.kind === 'loading') return;
    const session = readSession();
    if (!session) return;

    const trimmed = email.trim();
    if (!trimmed) return;

    setAssignSuccess(null);
    setAssignError(null);
    setLookupState({ kind: 'loading' });
    try {
      const result = await lookupBusinessUserByEmail(placeId, trimmed, session.accessToken);
      setLookupState({ kind: 'found', result });
    } catch (err) {
      setLookupState({ kind: 'error', message: lookupErrorMessage(err) });
    }
  }

  function resetLookup() {
    setLookupState({ kind: 'idle' });
    setEmail('');
  }

  async function handleAssign() {
    if (lookupState.kind !== 'found' || assigning) return;
    const session = readSession();
    if (!session) {
      setAssignError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setAssigning(true);
    setAssignError(null);
    try {
      await assignBusinessManager(placeId, lookupState.result.user_id, session.accessToken);
      setAssignSuccess(`Đã gán ${lookupState.result.display_name} làm quản lý viên.`);
      resetLookup();
      reload();
    } catch (err) {
      setAssignError(assignErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  async function handleRevoke(manager: BusinessManager) {
    if (revokingUserId) return;
    const confirmed = window.confirm(`Thu hồi quyền quản lý của "${manager.display_name}"?`);
    if (!confirmed) return;

    const session = readSession();
    if (!session) {
      setRevokeError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setRevokeError(null);
    setRevokingUserId(manager.user_id);
    try {
      await revokeBusinessManager(placeId, manager.user_id, session.accessToken);
      reload();
    } catch (err) {
      setRevokeError(revokeErrorMessage(err));
    } finally {
      setRevokingUserId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Quản lý người quản lý</h1>
        <p className={placeStyles.pageLede}>
          Gán hoặc thu hồi quyền quản lý (Manager) cho cơ sở này. Manager có thể sửa thông tin
          nhưng không thể gán/thu hồi manager khác.
        </p>
      </header>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để quản lý người quản lý cơ sở này.</p>
          <Link href={`/login?next=/dashboard/places/${placeId}/managers`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'forbidden' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy địa điểm</p>
          <p>Địa điểm này không tồn tại, hoặc bạn không có quyền quản lý nó.</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className={placeMgmtStyles.list} aria-busy="true" aria-label="Đang tải danh sách quản lý viên">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={placeMgmtStyles.skelRow} />
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

      {(state.kind === 'ready') && (
        <>
          <section aria-labelledby="assign-manager-heading" style={{ marginBottom: '1.5rem' }}>
            <h2 id="assign-manager-heading" className={placeMgmtStyles.sectionTitle}>
              Gán quản lý viên mới
            </h2>

            {assignSuccess && (
              <p className={placeMgmtStyles.success} role="status">
                {assignSuccess}
              </p>
            )}
            {assignError && (
              <p className={placeMgmtStyles.alert} role="alert">
                {assignError}
              </p>
            )}

            <form onSubmit={handleLookup} className={placeMgmtStyles.fieldGrid} style={{ alignItems: 'end' }}>
              <div className={uiStyles.field}>
                <label className={uiStyles.fieldLabel} htmlFor="manager-lookup-email">
                  Email người dùng
                </label>
                <input
                  id="manager-lookup-email"
                  type="email"
                  className={placeMgmtStyles.input}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (lookupState.kind === 'found' || lookupState.kind === 'error') {
                      setLookupState({ kind: 'idle' });
                    }
                  }}
                  placeholder="ten@vidu.com"
                  required
                  disabled={lookupState.kind === 'loading'}
                />
              </div>
              <div className={placeMgmtStyles.actions}>
                <button
                  type="submit"
                  className={placeMgmtStyles.submitBtn}
                  disabled={lookupState.kind === 'loading' || !email.trim()}
                >
                  {lookupState.kind === 'loading' ? 'Đang tìm…' : 'Tìm người dùng'}
                </button>
              </div>
            </form>

            {lookupState.kind === 'error' && (
              <p className={placeMgmtStyles.fieldError} role="alert">
                {lookupState.message}
              </p>
            )}

            {lookupState.kind === 'found' && (
              <div className={placeMgmtStyles.row} style={{ marginTop: '0.75rem' }}>
                <div className={placeMgmtStyles.rowMain}>
                  <span className={placeMgmtStyles.rowTitle}>{lookupState.result.display_name}</span>
                  <div className={placeMgmtStyles.rowMeta}>
                    <span>{email.trim()}</span>
                  </div>
                </div>
                <div className={placeMgmtStyles.rowActions}>
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    onClick={handleAssign}
                    disabled={assigning}
                  >
                    {assigning ? 'Đang gán…' : 'Gán làm quản lý'}
                  </button>
                  <button type="button" className={placeStyles.btn} onClick={resetLookup} disabled={assigning}>
                    Huỷ
                  </button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="manager-list-heading">
            <h2 id="manager-list-heading" className={placeMgmtStyles.sectionTitle}>
              Quản lý viên hiện tại
            </h2>

            {revokeError && (
              <p className={placeMgmtStyles.alert} role="alert" style={{ marginTop: '0.75rem' }}>
                {revokeError}
              </p>
            )}

            {state.managers.length === 0 && (
              <div className={placeStyles.state} style={{ marginTop: '0.75rem' }}>
                <p className={placeStyles.stateTitle}>Chưa có quản lý viên nào</p>
                <p>Tìm người dùng theo email ở trên để gán quản lý viên đầu tiên.</p>
              </div>
            )}

            {state.managers.length > 0 && (
              <div className={placeMgmtStyles.list} style={{ marginTop: '0.75rem' }}>
                {state.managers.map((manager) => (
                  <div key={manager.user_id} className={placeMgmtStyles.row}>
                    <div className={placeMgmtStyles.rowMain}>
                      <span className={placeMgmtStyles.rowTitle}>{manager.display_name}</span>
                      <div className={placeMgmtStyles.rowMeta}>
                        <span>{manager.email}</span>
                        <span>Gán từ {formatDate(manager.granted_at)}</span>
                      </div>
                    </div>
                    <div className={placeMgmtStyles.rowActions}>
                      <button
                        type="button"
                        className={placeMgmtStyles.archiveBtn}
                        onClick={() => handleRevoke(manager)}
                        disabled={revokingUserId === manager.user_id}
                      >
                        {revokingUserId === manager.user_id ? 'Đang thu hồi…' : 'Thu hồi'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function lookupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Không tìm thấy người dùng với email này.';
    if (err.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (err.status < 500) return err.message;
  }
  return 'Không tìm được người dùng. Vui lòng thử lại.';
}

function assignErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Người này đã có vai trò (chủ hoặc quản lý) tại cơ sở này.';
    if (err.status === 403) return 'Bạn không có quyền gán quản lý viên cho cơ sở này.';
    if (err.status === 404) return 'Không tìm thấy người dùng cần gán.';
    if (err.status < 500) return err.message;
  }
  return 'Không gán được quản lý viên. Vui lòng thử lại.';
}

function revokeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Không tìm thấy quản lý viên này (có thể đã bị thu hồi trước đó).';
    if (err.status === 403) return 'Bạn không có quyền thu hồi quản lý viên này.';
    if (err.status < 500) return err.message;
  }
  return 'Không thu hồi được. Vui lòng thử lại.';
}
