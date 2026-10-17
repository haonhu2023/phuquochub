import { apiGet, apiGetAuth, apiGetPaginated, apiGetPaginatedAuth, apiPatchAuth, apiPost, apiPutAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  AdminListJobListingsFilter,
  DecideJobListingInput,
  DecideJobListingTranslationInput,
  JobListingAdminView,
  JobListingModeratorView,
  JobListingPublicDetailView,
  JobListingPublicView,
  JobListingSenderDetailView,
  JobListingSenderView,
  JobListingTranslationModeratorView,
  JobListingTranslationView,
  ListJobListingsFilter,
  UpsertJobListingInput,
  UpsertJobListingTranslationInput,
} from '../types';

function filterQuery(filter: ListJobListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.job_category) qs.set('job_category', filter.job_category);
  if (filter.ward) qs.set('ward', filter.ward);
  if (filter.employment_type) qs.set('employment_type', filter.employment_type);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  if (filter.locale) qs.set('locale', filter.locale);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /job-listings (@Public) — chỉ published và chưa hết hạn, lọc tại thời điểm đọc ở server.
 *  `locale` (Gói C) overlay tiêu đề đã dịch cho mỗi thẻ tin — KHÔNG mặc định 'en' (khác getPlace()'s
 *  mặc định 'vi' cho places): bỏ trống ở đây nghĩa là "không yêu cầu overlay", để nguyên hành vi cũ
 *  cho mọi call site chưa truyền locale, trang public tự truyền đúng locale từ route của nó. */
export async function listJobListings(
  filter: ListJobListingsFilter = {},
): Promise<{ data: JobListingPublicView[]; meta: PaginationMeta }> {
  return apiGetPaginated<JobListingPublicView>(`/job-listings${filterQuery(filter)}`, { cache: 'no-store' });
}

/** GET /job-listings/{id} (@Public) — 404 đồng nhất cho không tồn tại / chưa-hoặc-không-còn công khai.
 * Có `place` (xem JobListingLinkedPlace's ghi chú) — CHỈ lời gọi MỘT bản ghi này mới có. `locale`
 * (Gói C) — response LUÔN có field `locale` phản ánh NỘI DUNG THỰC SỰ đã trả, có thể khác locale
 * yêu cầu (chưa có bản dịch đã duyệt → vẫn tiếng Việt) — trang gọi hàm này phải ĐỌC lại field đó,
 * không giả định locale trả về khớp locale gửi lên. */
export async function getJobListing(id: string, locale?: 'vi' | 'en'): Promise<JobListingPublicDetailView> {
  const qs = locale ? `?${new URLSearchParams({ locale }).toString()}` : '';
  return apiGet<JobListingPublicDetailView>(`/job-listings/${encodeURIComponent(id)}${qs}`, { cache: 'no-store' });
}

/** GET /job-listings/mine — tất cả tin của chính người gọi, mọi trạng thái (đã đăng nhập). */
export async function listMyJobListings(accessToken: string): Promise<JobListingSenderView[]> {
  return apiGetAuth<JobListingSenderView[]>('/job-listings/mine', accessToken, { cache: 'no-store' });
}

/** Có `place` — CHỈ lời gọi MỘT bản ghi này mới có (xem JobListingLinkedPlace's ghi chú). */
export async function getMyJobListing(id: string, accessToken: string): Promise<JobListingSenderDetailView> {
  return apiGetAuth<JobListingSenderDetailView>(`/job-listings/mine/${encodeURIComponent(id)}`, accessToken, {
    cache: 'no-store',
  });
}

export async function createJobListing(
  input: UpsertJobListingInput,
  accessToken: string,
): Promise<JobListingSenderView> {
  return apiPost<JobListingSenderView>('/job-listings', accessToken, input);
}

// PATCH, không PUT: sửa khi đang published tự đẩy về pending phía service — web không tự diễn giải
// lại chuyển trạng thái đó, chỉ đọc `status` trong response để hiện đúng trạng thái mới.
export async function updateJobListing(
  id: string,
  input: UpsertJobListingInput,
  accessToken: string,
): Promise<JobListingSenderView> {
  return apiPatchAuth<JobListingSenderView>(`/job-listings/${encodeURIComponent(id)}`, accessToken, input);
}

export async function submitJobListing(id: string, accessToken: string): Promise<JobListingSenderView> {
  return apiPost<JobListingSenderView>(`/job-listings/${encodeURIComponent(id)}/submit`, accessToken);
}

export async function closeJobListing(id: string, accessToken: string): Promise<JobListingSenderView> {
  return apiPost<JobListingSenderView>(`/job-listings/${encodeURIComponent(id)}/close`, accessToken);
}

export async function reopenJobListing(id: string, accessToken: string): Promise<JobListingSenderView> {
  return apiPost<JobListingSenderView>(`/job-listings/${encodeURIComponent(id)}/reopen`, accessToken);
}

/** GET /job-listings/pending (JobListing.Moderate) — hàng chờ duyệt. */
export async function listPendingJobListings(accessToken: string): Promise<JobListingModeratorView[]> {
  return apiGetAuth<JobListingModeratorView[]>('/job-listings/pending', accessToken, { cache: 'no-store' });
}

export async function decideJobListing(
  id: string,
  input: DecideJobListingInput,
  accessToken: string,
): Promise<JobListingModeratorView> {
  return apiPost<JobListingModeratorView>(`/job-listings/${encodeURIComponent(id)}/decide`, accessToken, input);
}

function adminFilterQuery(filter: AdminListJobListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.status) qs.set('status', filter.status);
  if (filter.created_by) qs.set('created_by', filter.created_by);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /job-listings/admin (JobListing.Moderate) — mọi status, lọc tuỳ chọn theo status/người
 *  đăng. Khác listPendingJobListings (chỉ pending) — màn hình quản lý TẤT CẢ tin, không chỉ hàng
 *  chờ duyệt (Gói B, 17/10/2026). */
export async function listJobListingsForAdmin(
  filter: AdminListJobListingsFilter,
  accessToken: string,
): Promise<{ data: JobListingAdminView[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<JobListingAdminView>(`/job-listings/admin${adminFilterQuery(filter)}`, accessToken, {
    cache: 'no-store',
  });
}

// --- Gói C (17/10/2026) — bản dịch tiếng Anh ---

/** GET /job-listings/{id}/translations/en — owner-only. `null` nếu chưa từng lưu bản dịch nào. */
export async function getMyJobListingTranslation(id: string, accessToken: string): Promise<JobListingTranslationView | null> {
  return apiGetAuth<JobListingTranslationView | null>(`/job-listings/${encodeURIComponent(id)}/translations/en`, accessToken, {
    cache: 'no-store',
  });
}

/** PUT — lưu nháp. `expected_content_version` BẮT BUỘC khi đã có bản dịch (409 nếu lệch — xem
 *  JobListingTranslationEditor's xử lý conflict). */
export async function saveJobListingTranslation(
  id: string,
  input: UpsertJobListingTranslationInput,
  accessToken: string,
): Promise<JobListingTranslationView> {
  return apiPutAuth<JobListingTranslationView>(`/job-listings/${encodeURIComponent(id)}/translations/en`, accessToken, input);
}

export async function submitJobListingTranslation(id: string, accessToken: string): Promise<JobListingTranslationView> {
  return apiPost<JobListingTranslationView>(`/job-listings/${encodeURIComponent(id)}/translations/en/submit`, accessToken);
}

/** GET /job-listings/translations/en/pending (JobListing.Moderate). */
export async function listPendingJobListingTranslations(accessToken: string): Promise<JobListingTranslationModeratorView[]> {
  return apiGetAuth<JobListingTranslationModeratorView[]>('/job-listings/translations/en/pending', accessToken, {
    cache: 'no-store',
  });
}

export async function decideJobListingTranslation(
  id: string,
  input: DecideJobListingTranslationInput,
  accessToken: string,
): Promise<JobListingTranslationView> {
  return apiPost<JobListingTranslationView>(`/job-listings/${encodeURIComponent(id)}/translations/en/decide`, accessToken, input);
}
