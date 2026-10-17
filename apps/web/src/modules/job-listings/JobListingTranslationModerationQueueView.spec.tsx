/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JobListingTranslationModerationQueueView } from './JobListingTranslationModerationQueueView';
import { readSession } from '@/modules/auth/session';
import { decideJobListingTranslation, listPendingJobListingTranslations } from './api/job-listings.api';
import { ApiError } from '@/lib/http';
import type { JobListingTranslationModeratorView } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/job-listings.api', () => ({
  listPendingJobListingTranslations: jest.fn(),
  decideJobListingTranslation: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listPendingJobListingTranslations as jest.Mock;
const mockDecide = decideJobListingTranslation as jest.Mock;

function translation(overrides: Partial<JobListingTranslationModeratorView> = {}): JobListingTranslationModeratorView {
  return {
    id: 'tr-1',
    job_listing_id: 'job-1',
    locale: 'en',
    title: 'Waiter',
    description: 'English description',
    requirements: null,
    benefits: null,
    status: 'pending',
    review_note: null,
    reviewed_at: null,
    has_published: false,
    published_at: null,
    content_version: 2,
    created_at: '2026-10-17T00:00:00.000Z',
    updated_at: '2026-10-17T00:00:00.000Z',
    is_stale: false,
    is_published_stale: null,
    source_title: 'Phục vụ bàn',
    source_employer_name: 'Nhà hàng A',
    source_description: 'Mô tả tiếng Việt',
    source_description_rich: null,
    source_requirements: null,
    source_benefits: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});
afterEach(() => jest.clearAllMocks());

describe('JobListingTranslationModerationQueueView', () => {
  it('không có session → trạng thái "không có quyền"', async () => {
    mockReadSession.mockReturnValue(null);
    render(<JobListingTranslationModerationQueueView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('403 → trạng thái "không có quyền" (chặn ở server)', async () => {
    mockList.mockRejectedValue(new ApiError('forbidden', 403));
    render(<JobListingTranslationModerationQueueView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('hàng chờ trống → thông báo rõ', async () => {
    mockList.mockResolvedValue([]);
    render(<JobListingTranslationModerationQueueView />);
    expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
  });

  it('hiện ngữ cảnh tin gốc VÀ nội dung VI/EN đối chiếu cạnh nhau', async () => {
    mockList.mockResolvedValue([translation()]);
    render(<JobListingTranslationModerationQueueView />);
    // "Phục vụ bàn" xuất hiện HAI lần có chủ đích: tiêu đề mục hàng chờ + lại trong khối đối chiếu
    // VI/EN bên dưới (JobListingTranslationCompare) — không phải trùng lặp lỗi.
    expect(await screen.findAllByText('Phục vụ bàn')).toHaveLength(2);
    expect(screen.getByText('Nhà hàng A')).toBeInTheDocument();
    expect(screen.getByText('Mô tả tiếng Việt')).toBeInTheDocument(); // bản nguồn.
    expect(screen.getByText('English description')).toBeInTheDocument(); // bản dịch.
  });

  it('is_stale=true → hiện cảnh báo rà soát trước khi duyệt', async () => {
    mockList.mockResolvedValue([translation({ is_stale: true })]);
    render(<JobListingTranslationModerationQueueView />);
    expect(await screen.findByText(/kiểm lại trước khi/)).toBeInTheDocument();
  });

  it('duyệt (approve) → gọi API với đúng job_listing_id + expected_content_version từ chính bản đang xem', async () => {
    mockList.mockResolvedValue([translation({ content_version: 7 })]);
    mockDecide.mockResolvedValue(translation({ status: 'published' }));
    render(<JobListingTranslationModerationQueueView />);
    await screen.findAllByText('Phục vụ bàn');
    fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — đăng công khai' }));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));
    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith('job-1', { decision: 'approve', expected_content_version: 7 }, 'tok'),
    );
  });

  it('từ chối thiếu lý do → nút xác nhận bị khoá, không gọi được API', async () => {
    mockList.mockResolvedValue([translation()]);
    render(<JobListingTranslationModerationQueueView />);
    await screen.findAllByText('Phục vụ bàn');
    fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
    const confirmBtn = screen.getByRole('button', { name: /Xác nhận/ });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('409 khi duyệt (owner vừa sửa trong lúc xem) → báo lỗi rõ, không coi như đã duyệt', async () => {
    mockList.mockResolvedValue([translation()]);
    mockDecide.mockRejectedValue(new ApiError('conflict', 409));
    render(<JobListingTranslationModerationQueueView />);
    await screen.findAllByText('Phục vụ bàn');
    fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — đăng công khai' }));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));
    expect(await screen.findByText(/vừa được người đăng sửa/)).toBeInTheDocument();
  });
});
