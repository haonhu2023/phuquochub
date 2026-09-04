/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranslationReviewQueueView } from './TranslationReviewQueueView';
import { listReviewQueue } from './api/translation-review.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { TranslationReviewQueueItem } from './types';

jest.mock('./api/translation-review.api', () => ({ listReviewQueue: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

let searchParamsString = '';
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

const mockList = listReviewQueue as jest.Mock;
const mockSession = readSession as jest.Mock;

const anItem: TranslationReviewQueueItem = {
  id: 'translation-1',
  place_id: 'place-1',
  place_name: 'VinWonders Phú Quốc',
  place_slug: 'vinwonders-phu-quoc',
  field_key: 'short_description',
  locale_code: 'en',
  source_locale_code: 'vi',
  translated_text: 'The most beautiful beach in Phu Quoc',
  current_public_text: null,
  translation_method: 'human',
  translation_status: 'PENDING',
  human_review_status: 'PENDING',
  quality_gate: 'PASS',
  revision_id: 'rev-1',
  created_at: '2026-09-04T00:00:00.000Z',
  source_id: 'src-1',
  source_url: 'https://vinwonders.com/en/vinwonders-phu-quoc/',
  source_title: 'VinWonders — official EN',
  source_type: 'official_website',
  source_reliability: 5,
};

beforeEach(() => {
  searchParamsString = '';
  push.mockClear();
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockList.mockReset();
});

it('render danh sách bản dịch đang chờ duyệt khi tải thành công', async () => {
  mockList.mockResolvedValue({ rows: [anItem], nextCursor: null });
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('VinWonders Phú Quốc')).toBeInTheDocument();
});

it('hiển thị empty state khi hàng chờ trống', async () => {
  mockList.mockResolvedValue({ rows: [], nextCursor: null });
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
});

describe('phân trang keyset — nút "Tải thêm"', () => {
  const item2: TranslationReviewQueueItem = { ...anItem, id: 'translation-2', place_name: 'Sun World Hòn Thơm' };

  it('nextCursor=null → không hiện nút "Tải thêm"', async () => {
    mockList.mockResolvedValue({ rows: [anItem], nextCursor: null });
    render(<TranslationReviewQueueView />);
    await screen.findByText('VinWonders Phú Quốc');
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('nextCursor có giá trị → hiện nút "Tải thêm"; bấm nối thêm trang 2 vào danh sách (không thay thế)', async () => {
    mockList.mockResolvedValueOnce({ rows: [anItem], nextCursor: 'cursor-page-2' });
    render(<TranslationReviewQueueView />);
    await screen.findByText('VinWonders Phú Quốc');

    mockList.mockResolvedValueOnce({ rows: [item2], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    await waitFor(() => expect(screen.getByText('Sun World Hòn Thơm')).toBeInTheDocument());
    expect(screen.getByText('VinWonders Phú Quốc')).toBeInTheDocument(); // trang 1 vẫn còn, không bị thay thế
    expect(mockList.mock.calls[1][0]).toMatchObject({ cursor: 'cursor-page-2' });
    // Trang 2 là trang cuối (nextCursor=null) → nút biến mất.
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('lỗi khi tải thêm: giữ nguyên danh sách đã có, hiện thông báo lỗi riêng (không xoá trang 1)', async () => {
    mockList.mockResolvedValueOnce({ rows: [anItem], nextCursor: 'cursor-page-2' });
    render(<TranslationReviewQueueView />);
    await screen.findByText('VinWonders Phú Quốc');

    mockList.mockRejectedValueOnce(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    await screen.findByRole('alert');
    expect(screen.getByText('VinWonders Phú Quốc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeInTheDocument(); // vẫn còn để thử lại
  });
});

it('403 → forbidden state, không lộ chi tiết kỹ thuật', async () => {
  mockList.mockRejectedValue(new ApiError('forbidden', 403));
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(screen.getByText(/PlaceTranslation.Review.Any/)).toBeInTheDocument();
});

it('chưa đăng nhập (không có session) → forbidden state, không gọi API', async () => {
  mockSession.mockReturnValue(null);
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(mockList).not.toHaveBeenCalled();
});

it('lỗi khác (5xx/mạng) → error state kèm nút thử lại', async () => {
  mockList.mockRejectedValue(new Error('network down'));
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('Không tải được hàng chờ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
});
