/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogView } from './AuditLogView';
import { readSession } from '@/modules/auth/session';
import { listAuditLog } from './api/ops.api';
import type { AuditLogRow } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/ops.api', () => ({ listAuditLog: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = listAuditLog as jest.Mock;

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'a1',
    created_at: '2026-10-22T03:00:00.000Z',
    event: 'job_listing.closed',
    actor_id: 'u1',
    actor_role: 'content_owner',
    entity_type: 'job_listing',
    entity_id: 'job-1',
    result: 'success',
    correlation_id: 'corr-1',
    before_status: 'published',
    after_status: 'closed',
    ...overrides,
  };
}

function page(data: AuditLogRow[], total: number) {
  return { data, meta: { page: 1, pageSize: 50, total, totalPages: Math.ceil(total / 50), timestamp: '' } };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

// 2026-10-22 (vá gap "audit log chỉ xem được 20 dòng gần nhất, không lọc/tìm/phân trang" — rà soát
// vận hành toàn site, mục 3). Cùng khuôn AdminJobListingsView.spec.tsx.
describe('AuditLogView — tra cứu nhật ký quản trị', () => {
  it('không có session → trạng thái "không có quyền"', async () => {
    mockReadSession.mockReturnValue(null);
    render(<AuditLogView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('403 từ API → trạng thái "không có quyền" (chặn ở server, không chỉ web)', async () => {
    const { ApiError } = jest.requireActual('@/lib/http');
    mockList.mockRejectedValue(new ApiError('forbidden', 403));
    render(<AuditLogView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('tải trang đầu: gọi API với page=1, không filter nào (mặc định trống)', async () => {
    mockList.mockResolvedValue(page([row()], 1));
    render(<AuditLogView />);

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    const [filter] = mockList.mock.calls[0];
    expect(filter).toMatchObject({ page: 1, limit: 50 });
    expect(filter.entity_type).toBeUndefined();
    expect(filter.actor_id).toBeUndefined();
  });

  it('hiện đúng sự kiện, kết quả, thời gian, người thao tác, đối tượng, chuyển trạng thái, correlation ID', async () => {
    mockList.mockResolvedValue(page([row()], 1));
    render(<AuditLogView />);

    expect(await screen.findByText(/job_listing.closed/)).toBeInTheDocument();
    expect(screen.getByText(/content_owner/)).toBeInTheDocument();
    expect(screen.getByText(/job_listing \/ job-1/)).toBeInTheDocument();
    expect(screen.getByText(/published → closed/)).toBeInTheDocument();
    expect(screen.getByText(/corr-1/)).toBeInTheDocument();
  });

  it('nhập bộ lọc "Loại đối tượng" rồi bấm Lọc → gọi lại API với đúng filter, reset về trang 1', async () => {
    mockList.mockResolvedValue(page([], 0));
    render(<AuditLogView />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Loại đối tượng'), { target: { value: 'real_estate_listing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    const [filter] = mockList.mock.calls[1];
    expect(filter).toMatchObject({ entity_type: 'real_estate_listing', page: 1 });
  });

  it('lọc theo ID người thao tác → gửi đúng actor_id', async () => {
    mockList.mockResolvedValue(page([], 0));
    render(<AuditLogView />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('ID người thao tác'), { target: { value: 'u-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList.mock.calls[1][0]).toMatchObject({ actor_id: 'u-42' });
  });

  it('không có kết quả nào khớp bộ lọc → thông báo rõ ràng, không phải danh sách rỗng im lặng', async () => {
    mockList.mockResolvedValue(page([], 0));
    render(<AuditLogView />);
    expect(await screen.findByText('Không có sự kiện nào khớp bộ lọc')).toBeInTheDocument();
  });

  it('phân trang: bấm "Trang sau" → gọi API với page=2, "Trang trước" bị disable ở trang 1', async () => {
    mockList.mockResolvedValue(page(Array.from({ length: 50 }, (_, i) => row({ id: `a${i}` })), 120));
    render(<AuditLogView />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList.mock.calls[1][0]).toMatchObject({ page: 2 });
  });

  it('lỗi 500 → trạng thái lỗi kèm nút thử lại, gọi lại API khi bấm', async () => {
    mockList.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page([row()], 1));
    render(<AuditLogView />);

    expect(await screen.findByText('Không tải được nhật ký')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/job_listing.closed/)).toBeInTheDocument();
  });
});
