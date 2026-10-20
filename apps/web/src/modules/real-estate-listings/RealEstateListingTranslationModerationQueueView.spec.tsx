/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RealEstateListingTranslationModerationQueueView } from './RealEstateListingTranslationModerationQueueView';
import { readSession } from '@/modules/auth/session';
import { decideRealEstateListingTranslation, listPendingRealEstateListingTranslations } from './api/real-estate-listings.api';
import { ApiError } from '@/lib/http';
import type { RealEstateListingTranslationModeratorView } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/real-estate-listings.api', () => ({
  listPendingRealEstateListingTranslations: jest.fn(),
  decideRealEstateListingTranslation: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listPendingRealEstateListingTranslations as jest.Mock;
const mockDecide = decideRealEstateListingTranslation as jest.Mock;

function translation(overrides: Partial<RealEstateListingTranslationModeratorView> = {}): RealEstateListingTranslationModeratorView {
  return {
    id: 'tr-1',
    real_estate_listing_id: 'rel-1',
    locale: 'en',
    title: 'Room for rent',
    description: 'English description',
    description_rich: null,
    utilities_note: null,
    legal_status_note: null,
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
    source_title: 'Phòng trọ gần biển',
    source_description: 'Mô tả tiếng Việt',
    source_description_rich: null,
    source_utilities_note: null,
    source_utilities_note_rich: null,
    source_legal_status_note: null,
    source_legal_status_note_rich: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});
afterEach(() => jest.clearAllMocks());

describe('RealEstateListingTranslationModerationQueueView', () => {
  it('không có session → trạng thái "không có quyền"', async () => {
    mockReadSession.mockReturnValue(null);
    render(<RealEstateListingTranslationModerationQueueView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('hàng chờ trống → thông báo rõ', async () => {
    mockList.mockResolvedValue([]);
    render(<RealEstateListingTranslationModerationQueueView />);
    expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
  });

  it('hiện ngữ cảnh tin gốc VÀ nội dung VI/EN đối chiếu cạnh nhau', async () => {
    mockList.mockResolvedValue([translation()]);
    render(<RealEstateListingTranslationModerationQueueView />);
    expect(await screen.findAllByText('Phòng trọ gần biển')).toHaveLength(2);
    expect(screen.getByText('Mô tả tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('English description')).toBeInTheDocument();
  });

  it('duyệt (approve) → gọi API với đúng real_estate_listing_id + expected_content_version', async () => {
    mockList.mockResolvedValue([translation({ content_version: 7 })]);
    mockDecide.mockResolvedValue(translation({ status: 'published' }));
    render(<RealEstateListingTranslationModerationQueueView />);
    await screen.findAllByText('Phòng trọ gần biển');
    fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — đăng công khai' }));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));
    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith('rel-1', { decision: 'approve', expected_content_version: 7 }, 'tok'),
    );
  });

  it('409 khi duyệt → báo lỗi rõ', async () => {
    mockList.mockResolvedValue([translation()]);
    mockDecide.mockRejectedValue(new ApiError('conflict', 409));
    render(<RealEstateListingTranslationModerationQueueView />);
    await screen.findAllByText('Phòng trọ gần biển');
    fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — đăng công khai' }));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));
    expect(await screen.findByText(/vừa được người đăng sửa/)).toBeInTheDocument();
  });
});
