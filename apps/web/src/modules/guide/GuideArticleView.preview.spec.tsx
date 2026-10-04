/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { GuideArticleView } from './GuideArticleView';
import type { GuideArticleDetail } from './types';
import { getPlace } from '@/modules/places/api/places.api';

jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
const mockGetPlace = getPlace as jest.MockedFunction<typeof getPlace>;

const ARTICLE = {
  id: 'draft-1',
  slug: 'draft',
  locale: 'vi',
  title: 'Bản nháp',
  intro: null,
  heroMediaId: null,
  heroImageUrl: null,
  category: null,
  tags: [],
  metaTitle: null,
  metaDescription: null,
  status: 'draft',
  contentVersion: 1,
  updatedAt: '2026-10-04T00:00:00Z',
  publishedAt: null,
  blocks: [
    {
      id: 'b1',
      position: 0,
      blockType: 'place_collection',
      content: { heading: '', placeSlugs: [], emptyStateText: 'Chưa có địa điểm phù hợp.' },
      needsDecision: false,
      decisionNote: null,
    },
  ],
} as unknown as GuideArticleDetail;

// Regression: the editor's preview overlay is a client tree. The public place_collection block is
// an async server component, which crashed that tree ("Objects are not valid as a React child
// (found: [object Promise])"). With clientPlaceCollections the draft must render.
describe('GuideArticleView with clientPlaceCollections (editor preview)', () => {
  afterEach(() => jest.resetAllMocks());

  it('renders a draft that contains a place_collection block without throwing', async () => {
    render(<GuideArticleView article={ARTICLE} locale="vi" clientPlaceCollections />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bản nháp' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có địa điểm phù hợp.')).toBeInTheDocument();
    expect(mockGetPlace).not.toHaveBeenCalled();
  });
});
