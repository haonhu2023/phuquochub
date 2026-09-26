/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnerCommandCenter, recordIssues, type DashboardSnapshot, type QualityRecord } from './OwnerCommandCenter';
import { apiGetAuth, apiGet, ApiError } from '@/lib/http';
import { readSession } from '@/modules/auth/session';
jest.mock('@/lib/http', () => ({ ...jest.requireActual('@/lib/http'), apiGetAuth: jest.fn(), apiGet: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
const snapshot: DashboardSnapshot = { generated_at: '2026-09-26T00:00:00Z', page: 1, page_size: 25,
 total: 0, published: 0, verified: 0, completeness: null, critical: 0, guides: 0,
 pending_decisions: 0, pending_proposals: 0, workflow: {}, freshness: { fresh:0,due_soon:0,overdue:0,unknown:0 }, records: [], audit: [] };
beforeEach(() => { jest.clearAllMocks(); (readSession as jest.Mock).mockReturnValue({ accessToken:'test' });
 (apiGet as jest.Mock).mockResolvedValue({status:'ok'}); (apiGetAuth as jest.Mock).mockResolvedValue(snapshot); });
it('shows unknown completeness rather than a fake zero score for an empty dataset', async () => {
 render(<OwnerCommandCenter />);
 expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
 expect(screen.getByText(/Chưa có địa điểm/)).toBeInTheDocument();
 expect(screen.getByRole('button', {name:'Trang sau'})).toBeDisabled();
});
it('shows a permission error instead of operational success counters', async () => {
 (apiGetAuth as jest.Mock).mockRejectedValue(new ApiError('Forbidden',403)); render(<OwnerCommandCenter />);
 expect(await screen.findByRole('alert')).toHaveTextContent('chưa có quyền');
 expect(screen.queryByText('Địa điểm công khai')).not.toBeInTheDocument();
});
it('binds work items to the exact editor and paginates', async () => {
 const record: QualityRecord = {id:'place-id', name:'Bãi thử',category:'beach',status:'published',verification_status:'pending',has_location:true,has_description:false,has_cover:false,source_count:0,next_review_at:null,conflict:false,freshness:'unknown',completeness:33,priority:1};
 (apiGetAuth as jest.Mock).mockResolvedValue({...snapshot,total:26,records:[record]});
 render(<OwnerCommandCenter />); await screen.findByText('Bãi thử');
 expect(screen.getByText('Mở đúng địa điểm để xử lý →')).toHaveAttribute('href','/dashboard/places/place-id/edit');
 expect(recordIssues(record)).not.toContain('Thiếu giờ mở cửa');
 fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
 await waitFor(() => expect(apiGetAuth).toHaveBeenCalledWith('/admin/ops/dashboard?page=2','test',{cache:'no-store'}));
});
it('does not interpret a failed health request as healthy', async () => {
 (apiGet as jest.Mock).mockRejectedValue(new Error('offline')); render(<OwnerCommandCenter />);
 expect(await screen.findByText(/Chưa xác nhận được sức khỏe/)).toBeInTheDocument();
});
