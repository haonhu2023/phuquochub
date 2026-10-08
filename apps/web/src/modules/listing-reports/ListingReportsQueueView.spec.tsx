/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListingReportsQueueView } from './ListingReportsQueueView';
import { readSession } from '@/modules/auth/session';
import { listPendingListingReports, resolveListingReport } from './api/listing-reports.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/listing-reports.api', () => ({ listPendingListingReports: jest.fn(), resolveListingReport: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = listPendingListingReports as jest.Mock;
const mockResolve = resolveListingReport as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('ListingReportsQueueView', () => {
  it('rỗng → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<ListingReportsQueueView />);
    expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('báo cáo có listing=null → hiện "(tin không còn khả dụng)", không hỏng cả trang', async () => {
    mockList.mockResolvedValue([
      { id: 'lr-1', target_type: 'job_listing', target_id: 'job-gone', reason: 'spam', description: null, status: 'open', resolved_at: null, created_at: '2026-10-08T00:00:00.000Z', listing: null },
    ]);
    render(<ListingReportsQueueView />);
    expect(await screen.findByText(/tin không còn khả dụng/)).toBeInTheDocument();
  });

  it('báo cáo có listing → hiện đúng tiêu đề tin', async () => {
    mockList.mockResolvedValue([
      {
        id: 'lr-1',
        target_type: 'job_listing',
        target_id: 'job-1',
        reason: 'duplicate',
        description: 'Trùng với tin khác',
        status: 'open',
        resolved_at: null,
        created_at: '2026-10-08T00:00:00.000Z',
        listing: { id: 'job-1', title: 'Phục vụ bàn' },
      },
    ]);
    render(<ListingReportsQueueView />);
    expect(await screen.findByText(/Phục vụ bàn/)).toBeInTheDocument();
    expect(screen.getByText('Trùng với tin khác')).toBeInTheDocument();
  });

  it('bấm "Xác nhận hợp lệ" gọi resolveListingReport với decision=resolved', async () => {
    mockList.mockResolvedValue([
      { id: 'lr-1', target_type: 'job_listing', target_id: 'job-1', reason: 'spam', description: null, status: 'open', resolved_at: null, created_at: '2026-10-08T00:00:00.000Z', listing: { id: 'job-1', title: 'T' } },
    ]);
    mockResolve.mockResolvedValue({});
    render(<ListingReportsQueueView />);
    const btn = await screen.findByRole('button', { name: /Xác nhận hợp lệ/ });
    fireEvent.click(btn);
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('lr-1', 'resolved', 'tok'));
  });
});
