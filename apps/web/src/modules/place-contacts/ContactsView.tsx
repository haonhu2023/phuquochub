'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listMyPlaces } from '@/modules/place-management/api/place-management.api';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { ContactEditor } from './ContactEditor';
import {
  createPlaceContact,
  deletePlaceContact,
  listPlaceContacts,
  updatePlaceContact,
} from './api/place-contacts.api';
import { contactTypeLabel } from './contactTypeLabels';
import type { ContactFormInput, PlaceContact } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; placeName: string; contacts: PlaceContact[] };

interface Props {
  placeId: string;
}

// "Quản lý liên hệ" của một cơ sở (GET công khai /places/{id}/contacts + POST/PATCH/DELETE
// Contact.Edit.Managed — CÙNG một permission cho cả ba, giống hệt Business Manager Assignment).
// Xác nhận quyền quản lý BẰNG CHÍNH cơ chế EditPlaceView đã dùng (đối chiếu placeId với
// GET /places/mine — KHÔNG có route GET /places/:id đặc quyền riêng) — CÙNG thông điệp "không tìm
// thấy" khi không quản lý được, không phân biệt "không tồn tại" với "không phải của bạn".
export function ContactsView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        // GET /places/{id}/contacts là @Public() — không cần token; GET /places/mine xác nhận
        // đúng người gọi quản lý được cơ sở này (cùng cơ chế EditPlaceView).
        return Promise.all([listMyPlaces(session.accessToken), listPlaceContacts(placeId)]);
      })
      .then(([places, contacts]) => {
        if (cancelled) return;
        const place = places.find((p) => p.id === placeId);
        if (!place) {
          setState({ kind: 'not-found' });
          return;
        }
        setState({ kind: 'ready', placeName: place.name, contacts });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải liên hệ. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId, reloadKey]);

  async function handleCreate(input: ContactFormInput) {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    await createPlaceContact(placeId, input, session.accessToken);
    setAddSuccess(true);
    reload();
  }

  async function handleUpdate(contactId: string, input: ContactFormInput) {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    await updatePlaceContact(contactId, input, session.accessToken);
    setEditingId(null);
    reload();
  }

  async function handleDelete(contact: PlaceContact) {
    if (deletingId) return;
    const label = contact.label || contactTypeLabel(contact.contact_type);
    const confirmed = window.confirm(`Xoá liên hệ "${label}: ${contact.value}"?`);
    if (!confirmed) return;

    const session = readSession();
    if (!session) {
      setDeleteError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setDeleteError(null);
    setDeletingId(contact.id);
    try {
      await deletePlaceContact(contact.id, session.accessToken);
      reload();
    } catch (err) {
      setDeleteError(deleteErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Quản lý liên hệ</h1>
        <p className={placeStyles.pageLede}>
          Số điện thoại, email, website, mạng xã hội… hiển thị công khai trên trang địa điểm.
        </p>
      </header>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để quản lý liên hệ của cơ sở này.</p>
          <Link href={`/login?next=/dashboard/places/${placeId}/contacts`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'not-found' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy địa điểm</p>
          <p>Địa điểm này không tồn tại, hoặc bạn không có quyền quản lý nó.</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className={placeMgmtStyles.list} aria-busy="true" aria-label="Đang tải liên hệ">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={placeMgmtStyles.skelRow} />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được liên hệ</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <section aria-labelledby="add-contact-heading" style={{ marginBottom: '1.5rem' }}>
            <h2 id="add-contact-heading" className={placeMgmtStyles.sectionTitle}>
              Thêm liên hệ mới
            </h2>
            {addSuccess && (
              <p className={placeMgmtStyles.success} role="status" style={{ marginBottom: '0.75rem' }}>
                Đã thêm liên hệ.
              </p>
            )}
            <ContactEditor
              key={reloadKey}
              submitLabel="Thêm liên hệ"
              submittingLabel="Đang thêm…"
              onSubmit={handleCreate}
            />
          </section>

          <section aria-labelledby="contact-list-heading">
            <h2 id="contact-list-heading" className={placeMgmtStyles.sectionTitle}>
              Liên hệ hiện tại
            </h2>

            {deleteError && (
              <p className={placeMgmtStyles.alert} role="alert" style={{ marginTop: '0.75rem' }}>
                {deleteError}
              </p>
            )}

            {state.contacts.length === 0 && (
              <div className={placeStyles.state} style={{ marginTop: '0.75rem' }}>
                <p className={placeStyles.stateTitle}>Chưa có liên hệ nào</p>
                <p>Thêm số điện thoại, email hoặc website ở trên để khách hàng liên hệ được với bạn.</p>
              </div>
            )}

            {state.contacts.length > 0 && (
              <div className={placeMgmtStyles.list} style={{ marginTop: '0.75rem' }}>
                {state.contacts.map((contact) =>
                  editingId === contact.id ? (
                    <div key={contact.id} className={placeMgmtStyles.row}>
                      <div style={{ width: '100%' }}>
                        <ContactEditor
                          initial={contact}
                          submitLabel="Lưu"
                          submittingLabel="Đang lưu…"
                          onSubmit={(input) => handleUpdate(contact.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div key={contact.id} className={placeMgmtStyles.row}>
                      <div className={placeMgmtStyles.rowMain}>
                        <span className={placeMgmtStyles.rowTitle}>
                          {contact.label || contactTypeLabel(contact.contact_type)}
                        </span>
                        <div className={placeMgmtStyles.rowMeta}>
                          <span>{contactTypeLabel(contact.contact_type)}</span>
                          <span>{contact.value}</span>
                          {contact.is_primary && (
                            <span className={`${placeMgmtStyles.statusBadge} ${placeMgmtStyles.statusPublished}`}>
                              Liên hệ chính
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={placeMgmtStyles.rowActions}>
                        <button
                          type="button"
                          className={placeStyles.btn}
                          onClick={() => setEditingId(contact.id)}
                          disabled={deletingId === contact.id}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className={placeMgmtStyles.archiveBtn}
                          onClick={() => handleDelete(contact)}
                          disabled={deletingId === contact.id}
                        >
                          {deletingId === contact.id ? 'Đang xoá…' : 'Xoá'}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền xoá liên hệ này.';
    if (err.status === 404) return 'Không tìm thấy liên hệ này (có thể đã bị xoá trước đó).';
    if (err.status < 500) return err.message;
  }
  return 'Không xoá được liên hệ. Vui lòng thử lại.';
}
