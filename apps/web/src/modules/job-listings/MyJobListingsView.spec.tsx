/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyJobListingsView } from './MyJobListingsView';
import { readSession } from '@/modules/auth/session';
import { closeJobListing, listMyJobListings, submitJobListing } from './api/job-listings.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/job-listings.api', () => ({
  listMyJobListings: jest.fn(),
  submitJobListing: jest.fn(),
  closeJobListing: jest.fn(),
  reopenJobListing: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listMyJobListings as jest.Mock;
const mockSubmit = submitJobListing as jest.Mock;
const mockClose = closeJobListing as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    place_id: null,
    employer_name: 'Nhà hàng Biển Xanh',
    employer_role: null,
    title: 'Phục vụ bàn',
    job_category: 'F&B',
    ward: 'An Thới',
    work_location: 'An Thới, Phú Quốc',
    employment_type: 'full_time',
    salary_min: null,
    salary_max: null,
    salary_negotiable: true,
    salary_currency: null,
    salary_period: null,
    shift_info: null,
    requirements: null,
    benefits: null,
    description: null,
    contact_method: 'phone',
    contact_value: '0909xxxxxx',
    expires_at: null,
    published_at: null,
    created_at: '2026-10-07T00:00:00.000Z',
    updated_at: '2026-10-07T00:00:00.000Z',
    status: 'draft',
    review_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

describe('MyJobListingsView — Tin tuyển dụng của tôi', () => {
  it('rỗng → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<MyJobListingsView />);
    expect(await screen.findByText('Chưa có tin nào')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lỗi tải → báo lỗi rõ, không hiện như danh sách rỗng', async () => {
    mockList.mockRejectedValue(new Error('down'));
    render(<MyJobListingsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách');
    expect(screen.queryByText('Chưa có tin nào')).toBeNull();
  });

  it('tin rejected hiện lý do từ chối và nút Gửi duyệt, KHÔNG nút Đóng/Mở lại', async () => {
    mockList.mockResolvedValue([row({ status: 'rejected', review_note: 'Thiếu số điện thoại rõ ràng' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByText(/Thiếu số điện thoại rõ ràng/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đóng tin' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mở lại/ })).toBeNull();
  });

  it('tin published hiện nút Đóng tin, bấm gọi closeJobListing đúng id', async () => {
    mockList.mockResolvedValue([row({ status: 'published' })]);
    mockClose.mockResolvedValue(row({ status: 'closed' }));
    render(<MyJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Đóng tin' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('job-1', 'tok'));
  });

  it('tin draft hiện nút Gửi duyệt, bấm gọi submitJobListing đúng id', async () => {
    mockList.mockResolvedValue([row({ status: 'draft' })]);
    mockSubmit.mockResolvedValue(row({ status: 'pending' }));
    render(<MyJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Gửi duyệt' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('job-1', 'tok'));
  });
});
