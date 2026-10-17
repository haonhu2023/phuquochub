import { apiGet, apiGetAuth, apiGetPaginated, apiGetPaginatedAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  AdminListJobListingsFilter,
  DecideJobListingInput,
  JobListingAdminView,
  JobListingModeratorView,
  JobListingPublicDetailView,
  JobListingPublicView,
  JobListingSenderDetailView,
  JobListingSenderView,
  ListJobListingsFilter,
  UpsertJobListingInput,
} from '../types';

function filterQuery(filter: ListJobListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.job_category) qs.set('job_category', filter.job_category);
  if (filter.ward) qs.set('ward', filter.ward);
  if (filter.employment_type) qs.set('employment_type', filter.employment_type);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /job-listings (@Public) — chỉ published và chưa hết hạn, lọc tại thời điểm đọc ở server. */
export async function listJobListings(
  filter: ListJobListingsFilter = {},
): Promise<{ data: JobListingPublicView[]; meta: PaginationMeta }> {
  return apiGetPaginated<JobListingPublicView>(`/job-listings${filterQuery(filter)}`, { cache: 'no-store' });
}

/** GET /job-listings/{id} (@Public) — 404 đồng nhất cho không tồn tại / chưa-hoặc-không-còn công khai.
 * Có `place` (xem JobListingLinkedPlace's ghi chú) — CHỈ lời gọi MỘT bản ghi này mới có. */
export async function getJobListing(id: string): Promise<JobListingPublicDetailView> {
  return apiGet<JobListingPublicDetailView>(`/job-listings/${encodeURIComponent(id)}`, { cache: 'no-store' });
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
