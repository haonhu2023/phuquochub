/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { TranslationReviewCard } from './TranslationReviewCard';
import { readSession } from '@/modules/auth/session';
import type { TranslationReviewQueueItem } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
(readSession as jest.Mock).mockReturnValue({ accessToken: 'tok' });

function item(overrides: Partial<TranslationReviewQueueItem> = {}): TranslationReviewQueueItem {
  return {
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
    ...overrides,
  };
}

it('thu gọn ban đầu: không hiện nội dung đề xuất/nguồn cho tới khi bấm mở', () => {
  render(<TranslationReviewCard item={item()} onDecided={jest.fn()} />);
  expect(screen.queryByText('The most beautiful beach in Phu Quoc')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  expect(screen.getByText('The most beautiful beach in Phu Quoc')).toBeInTheDocument();
});

it('nguồn https hợp lệ: render thành link mở tab mới, an toàn (noopener noreferrer)', () => {
  render(<TranslationReviewCard item={item()} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  const link = screen.getByRole('link', { name: 'https://vinwonders.com/en/vinwonders-phu-quoc/' });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('nguồn URL không an toàn (javascript:) KHÔNG bao giờ render thành link bấm được', () => {
  render(<TranslationReviewCard item={item({ source_url: 'javascript:alert(1)' })} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText(/URL nguồn không hợp lệ/)).toBeInTheDocument();
});

it('chưa từng công khai (current_public_text=null) hiện thông báo rõ ràng, không nhầm với chuỗi rỗng', () => {
  render(<TranslationReviewCard item={item({ current_public_text: null })} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  expect(screen.getByText('Chưa có nội dung nào được công khai cho vị trí này.')).toBeInTheDocument();
});
