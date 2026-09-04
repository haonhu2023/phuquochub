/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
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
  mockList.mockResolvedValue([anItem]);
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('VinWonders Phú Quốc')).toBeInTheDocument();
});

it('hiển thị empty state khi hàng chờ trống', async () => {
  mockList.mockResolvedValue([]);
  render(<TranslationReviewQueueView />);
  expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
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
