/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewsSection } from './ReviewsSection';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { createReview } from './api/reviews.api';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';

jest.mock('@/modules/auth/AuthProvider');
jest.mock('@/modules/auth/session');
jest.mock('./api/reviews.api');
jest.mock('@/modules/media/useSingleImageUpload');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockReadSession = readSession as jest.MockedFunction<typeof readSession>;
const mockCreateReview = createReview as jest.MockedFunction<typeof createReview>;
const mockUseSingleImageUpload = useSingleImageUpload as jest.MockedFunction<typeof useSingleImageUpload>;

const SESSION = {
  accessToken: 'token-abc',
  refreshToken: 'refresh-abc',
  expiresAt: Date.now() + 900_000,
  user: { id: 'u1', email: 'a@b.com', displayName: 'A', avatarUrl: null },
};

function baseImageUpload(overrides: Partial<ReturnType<typeof useSingleImageUpload>> = {}) {
  return {
    preview: null,
    mediaId: null,
    uploading: false,
    error: null,
    onFileSelected: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
}

describe('ReviewsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@b.com', displayName: 'A', avatarUrl: null },
      initializing: false,
      isAuthenticated: true,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    });
    mockReadSession.mockReturnValue(SESSION);
    mockCreateReview.mockResolvedValue(null);
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload());
  });

  it('submits a review with no media_ids when no image was selected', async () => {
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockCreateReview).toHaveBeenCalled());
    expect(mockCreateReview).toHaveBeenCalledWith(
      'p1',
      { rating: 5, content: undefined, media_ids: undefined },
      'token-abc',
    );
  });

  it('submits a review with media_ids when an image finished uploading', async () => {
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload({ mediaId: 'media-1', preview: 'blob:x' }));
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockCreateReview).toHaveBeenCalled());
    expect(mockCreateReview).toHaveBeenCalledWith(
      'p1',
      { rating: 5, content: undefined, media_ids: ['media-1'] },
      'token-abc',
    );
  });

  it('resets the image upload state after a successful submit', async () => {
    const reset = jest.fn();
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload({ mediaId: 'media-1', reset }));
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(reset).toHaveBeenCalled());
  });

  it('renders the image preview when one is available', () => {
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload({ preview: 'blob:preview-url' }));
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    expect(screen.getByRole('img', { name: 'Ảnh xem trước' })).toHaveAttribute('src', 'blob:preview-url');
  });

  it('shows the uploading hint and disables submit while an image is uploading', () => {
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload({ uploading: true }));
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    expect(screen.getByText('Đang tải ảnh lên…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đánh giá' })).toBeDisabled();
    expect(screen.getByLabelText('Thêm ảnh (không bắt buộc)')).toBeDisabled();
  });

  it('shows an image upload error without blocking review submission', () => {
    mockUseSingleImageUpload.mockReturnValue(baseImageUpload({ error: 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.' }));
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    expect(screen.getByText('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đánh giá' })).not.toBeDisabled();
  });

  it('does not render the review form for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      initializing: false,
      isAuthenticated: false,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    });
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    expect(screen.queryByLabelText('Thêm ảnh (không bắt buộc)')).not.toBeInTheDocument();
  });
});
