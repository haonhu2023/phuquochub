import { apiGetAuth, apiPost } from '@/lib/http';
import type { CreateListingReportInput, ListingReportDecision, ListingReportTargetType, ListingReportView } from '../types';

export async function createListingReport(input: CreateListingReportInput, accessToken: string): Promise<ListingReportView> {
  return apiPost<ListingReportView>('/listing-reports', accessToken, input);
}

export async function listPendingListingReports(accessToken: string): Promise<ListingReportView[]> {
  return apiGetAuth<ListingReportView[]>('/listing-reports/pending', accessToken, { cache: 'no-store' });
}

export async function resolveListingReport(
  id: string,
  decision: ListingReportDecision,
  accessToken: string,
): Promise<ListingReportView> {
  return apiPost<ListingReportView>(`/listing-reports/${encodeURIComponent(id)}/resolve`, accessToken, { decision });
}

// Giai đoạn 2 (21/10/2026) — vòng lặp "còn đúng không?".
export async function listMyOpenListingReports(
  targetType: ListingReportTargetType,
  accessToken: string,
): Promise<ListingReportView[]> {
  return apiGetAuth<ListingReportView[]>(
    `/listing-reports/mine?target_type=${encodeURIComponent(targetType)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

export async function confirmListingStillValid(id: string, accessToken: string): Promise<ListingReportView> {
  return apiPost<ListingReportView>(`/listing-reports/${encodeURIComponent(id)}/confirm-still-valid`, accessToken);
}
