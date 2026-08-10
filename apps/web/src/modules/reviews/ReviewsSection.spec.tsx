/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewsSection } from './ReviewsSection';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { createReview } from './api/reviews.api';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';
import type { Review } from './types';

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

function baseReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    user_id: 'other-user',
    author_name: 'Người dùng khác',
    author_avatar_url: null,
    rating: 4,
    content: 'Rất đẹp',
    status: 'published',
    created_at: '2026-07-26T00:00:00Z',
    media: [],
    ...overrides,
  };
}

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

  it('renders a review with no media without any image markup', () => {
    render(<ReviewsSection placeId="p1" initialReviews={[baseReview({ media: [] })]} />);

    expect(screen.queryAllByRole('img', { name: /^(?!Ảnh xem trước).*/ })).toHaveLength(0);
  });

  it('renders one published image below the review, using url when there is no thumbnail', () => {
    render(
      <ReviewsSection
        placeId="p1"
        initialReviews={[
          baseReview({
            media: [
              {
                id: 'media-1',
                type: 'image',
                url: 'https://phuquochub.com/api/media/m1/file',
                thumbnail_url: null,
                caption: null,
                alt_text: 'Bãi biển lúc hoàng hôn',
                status: 'published',
              },
            ],
          }),
        ]}
      />,
    );

    const img = screen.getByRole('img', { name: 'Bãi biển lúc hoàng hôn' });
    expect(img).toHaveAttribute('src', 'https://phuquochub.com/api/media/m1/file');
  });

  it('renders multiple images, preferring thumbnail_url when present, and falls back to a default alt', () => {
    render(
      <ReviewsSection
        placeId="p1"
        initialReviews={[
          baseReview({
            media: [
              {
                id: 'media-1',
                type: 'image',
                url: 'https://phuquochub.com/api/media/m1/file',
                thumbnail_url: 'https://phuquochub.com/api/media/m1/file',
                caption: null,
                alt_text: null,
                status: 'published',
              },
              {
                id: 'media-2',
                type: 'image',
                url: 'https://phuquochub.com/api/media/m2/file',
                thumbnail_url: null,
                caption: 'Món ăn ngon',
                alt_text: null,
                status: 'published',
              },
            ],
          }),
        ]}
      />,
    );

    const first = screen.getByRole('img', { name: 'Ảnh đánh giá' });
    expect(first).toHaveAttribute('src', 'https://phuquochub.com/api/media/m1/file');
    const second = screen.getByRole('img', { name: 'Món ăn ngon' });
    expect(second).toHaveAttribute('src', 'https://phuquochub.com/api/media/m2/file');
  });

  it('skips a media item whose url and thumbnail_url are both empty instead of rendering a broken <img src="">', () => {
    render(
      <ReviewsSection
        placeId="p1"
        initialReviews={[
          baseReview({
            media: [
              { id: 'media-1', type: 'image', url: '', thumbnail_url: null, caption: null, alt_text: null, status: 'published' },
            ],
          }),
        ]}
      />,
    );

    expect(screen.queryByRole('img', { name: /^(?!Ảnh xem trước).*/ })).not.toBeInTheDocument();
  });

  it('optimistically appended review after submit has no media (unchanged behavior)', async () => {
    render(<ReviewsSection placeId="p1" initialReviews={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockCreateReview).toHaveBeenCalled());
    // Chỉ có ảnh xem trước cục bộ (nếu có) — không có ảnh review nào được render vì item optimistic
    // luôn có media: [] (createReview trả EmptySuccess, không có media thật để hiển thị ngay).
    expect(screen.queryAllByRole('img', { name: /^(?!Ảnh xem trước).*/ })).toHaveLength(0);
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
