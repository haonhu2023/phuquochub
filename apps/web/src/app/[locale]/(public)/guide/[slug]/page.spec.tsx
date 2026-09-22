/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { GuideArticleDetail } from '@/modules/guide/types';
import { getGuideArticle } from '@/modules/guide/api/guide.api';
import { ApiError } from '@/lib/http';
import GuidePage, { generateMetadata } from './page';

jest.mock('@/modules/guide/api/guide.api', () => ({ getGuideArticle: jest.fn() }));
// PlaceCollectionBlock is async and calls getPlace() — mocked so synchronous RTL rendering
// doesn't attempt a real fetch (same precedent as GuideArticleView.spec.tsx).
jest.mock('@/modules/guide/blocks/PlaceCollectionBlock', () => ({
  PlaceCollectionBlock: () => null,
}));

const mockGetGuideArticle = getGuideArticle as jest.Mock;

function article(overrides: Partial<GuideArticleDetail> = {}): GuideArticleDetail {
  return {
    id: 'g1',
    slug: 'phu-quoc',
    locale: 'vi',
    title: 'Cẩm nang Phú Quốc',
    intro: 'Mọi thứ cần biết trước khi đi.',
    heroMediaId: null,
    heroImageUrl: null,
    status: 'published',
    contentVersion: 1,
    updatedAt: '2026-09-01T00:00:00.000Z',
    publishedAt: '2026-09-01T00:00:00.000Z',
    blocks: [],
    ...overrides,
  };
}

// G-A (2026-09-22): trang công khai giờ đọc CMS thật (getGuideArticle), KHÔNG còn seed trong repo
// — bài test này thay thế GuidePageView.spec.tsx (Candidate A) đã bị xoá cùng lúc.
describe('GuidePage — đọc từ CMS thật (G-A)', () => {
  it('render bài viết từ getGuideArticle(slug, locale)', async () => {
    mockGetGuideArticle.mockResolvedValueOnce(article());

    render(await GuidePage({ params: Promise.resolve({ slug: 'phu-quoc', locale: 'vi' }) }));

    expect(mockGetGuideArticle).toHaveBeenCalledWith('phu-quoc', 'vi');
    expect(screen.getByText('Cẩm nang Phú Quốc')).toBeInTheDocument();
  });

  it('generateMetadata trả tiêu đề/mô tả từ bài viết thật', async () => {
    mockGetGuideArticle.mockResolvedValueOnce(article({ title: 'Cẩm nang Phú Quốc', intro: 'Mô tả.' }));

    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'phu-quoc', locale: 'vi' }) });

    expect(meta.title).toBe('Cẩm nang Phú Quốc · PhuQuocHub');
    expect(meta.description).toBe('Mô tả.');
  });

  it('bài viết không tồn tại/chưa published (404 từ API) → generateMetadata KHÔNG ném lỗi, trả tiêu đề mặc định', async () => {
    mockGetGuideArticle.mockRejectedValueOnce(new ApiError('not found', 404));

    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'khong-ton-tai', locale: 'vi' }) });

    expect(meta.title).toBe('Cẩm nang · PhuQuocHub');
  });

  it('lỗi KHÁC 404 (server/mạng) → ném lại, không bị nuốt thành "không tìm thấy"', async () => {
    mockGetGuideArticle.mockRejectedValueOnce(new ApiError('server error', 500));

    await expect(
      GuidePage({ params: Promise.resolve({ slug: 'phu-quoc', locale: 'vi' }) }),
    ).rejects.toThrow('server error');
  });
});
