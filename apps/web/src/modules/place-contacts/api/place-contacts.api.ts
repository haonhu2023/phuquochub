import { apiDeleteAuth, apiGet, apiPatchAuth, apiPost } from '@/lib/http';
import type { ContactFormInput, PlaceContact } from '../types';

// Client API Place Contact Management. Bốn endpoint ĐÃ CÓ SẴN từ trước (Contacts module,
// api.md §11.1) — task này chỉ thêm client FE, KHÔNG có endpoint mới nào. Cùng envelope/ApiError
// xử lý tập trung ở lib/http như place-management.api.ts/business-managers.api.ts.

/** GET /places/{id}/contacts — @Public(), không cần token (khớp trang chi tiết Place công khai). */
export async function listPlaceContacts(placeId: string): Promise<PlaceContact[]> {
  return apiGet<PlaceContact[]>(`/places/${encodeURIComponent(placeId)}/contacts`, { cache: 'no-store' });
}

/** POST /places/{id}/contacts — Contact.Edit.Managed, owner/manager của ĐÚNG cơ sở này. */
export async function createPlaceContact(
  placeId: string,
  input: ContactFormInput,
  accessToken: string,
): Promise<void> {
  await apiPost(`/places/${encodeURIComponent(placeId)}/contacts`, accessToken, input);
}

/**
 * PATCH /contacts/{id} — Contact.Edit.Managed, cơ sở suy từ CHÍNH contact (contact-authz.resolver).
 *
 * `expectedVersion` (2026-09-16, sửa lại dùng xmin 2026-09-17) — CAS token thật: `PlaceContact.
 * version` đọc được ngay từ danh sách hiện có (ContactsService.toResponse()), gửi lại NGUYÊN VĂN
 * qua `expected_version`. KHÔNG PHẢI timestamp — xem ContactsRepository.updateScalarsIfUnchanged()
 * (apps/api) để biết lý do đổi từ `updated_at`. TUỲ CHỌN để không phá client cũ nào còn gọi hàm
 * này mà chưa truyền — thiếu thì backend ghi trực tiếp qua `save()` (hành vi cũ, không bảo vệ
 * concurrency).
 */
export async function updatePlaceContact(
  contactId: string,
  input: ContactFormInput,
  accessToken: string,
  expectedVersion?: string,
): Promise<void> {
  await apiPatchAuth(`/contacts/${encodeURIComponent(contactId)}`, accessToken, {
    ...input,
    ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
  });
}

/** DELETE /contacts/{id} — Contact.Edit.Managed, cùng cơ chế phân quyền với update. */
export async function deletePlaceContact(contactId: string, accessToken: string): Promise<null> {
  return apiDeleteAuth<null>(`/contacts/${encodeURIComponent(contactId)}`, accessToken);
}
