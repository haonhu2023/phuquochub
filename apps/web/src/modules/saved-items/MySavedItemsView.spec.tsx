/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MySavedItemsView } from './MySavedItemsView';
import { readSession } from '@/modules/auth/session';
import { listMySavedItems, unsaveItem } from './api/saved-items.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/saved-items.api', () => ({ listMySavedItems: jest.fn(), unsaveItem: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = listMySavedItems as jest.Mock;
const mockUnsave = unsaveItem as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

const JOB_LISTING = {
  id: 'job-1',
  place_id: null,
  employer_name: 'Nhà hàng Test',
  employer_role: null,
  title: 'Phục vụ bàn',
  job_category: 'F&B',
  ward: 'An Thới',
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
  contact_value: '0909',
  expires_at: null,
  published_at: null,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
};

describe('MySavedItemsView', () => {
  it('rỗng → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<MySavedItemsView />);
    expect(await screen.findByText('Chưa có tin nào đã lưu')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tin listing=null hiện "Tin không còn khả dụng", KHÔNG làm hỏng cả trang', async () => {
    mockList.mockResolvedValue([
      { id: 'si-1', target_type: 'job_listing', target_id: 'job-gone', saved_at: '2026-10-08T00:00:00.000Z', listing: null },
    ]);
    render(<MySavedItemsView />);
    expect(await screen.findByText('Tin không còn khả dụng')).toBeInTheDocument();
  });

  it('tin job_listing còn khả dụng → hiện tiêu đề qua JobListingCard', async () => {
    mockList.mockResolvedValue([
      { id: 'si-1', target_type: 'job_listing', target_id: 'job-1', saved_at: '2026-10-08T00:00:00.000Z', listing: JOB_LISTING },
    ]);
    render(<MySavedItemsView />);
    expect(await screen.findByText('Phục vụ bàn')).toBeInTheDocument();
  });

  it('bấm "Bỏ lưu" gọi unsaveItem đúng target', async () => {
    mockList.mockResolvedValue([
      { id: 'si-1', target_type: 'job_listing', target_id: 'job-1', saved_at: '2026-10-08T00:00:00.000Z', listing: JOB_LISTING },
    ]);
    mockUnsave.mockResolvedValue(undefined);
    render(<MySavedItemsView />);
    const btn = await screen.findByRole('button', { name: 'Bỏ lưu Phục vụ bàn' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockUnsave).toHaveBeenCalledWith('job_listing', 'job-1', 'tok'));
  });
});
