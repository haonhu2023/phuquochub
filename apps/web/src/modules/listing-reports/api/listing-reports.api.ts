import { apiGetAuth, apiPost } from '@/lib/http';
import type { CreateListingReportInput, ListingReportDecision, ListingReportView } from '../types';

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
