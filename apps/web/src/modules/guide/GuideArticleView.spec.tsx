/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { GuideArticleView } from './GuideArticleView';
import type { GuideArticleDetail } from './types';

// place_collection is deliberately NOT included in this fixture: it is an async server component
// (fetches places), and plain react-dom (as used by @testing-library/react's render()) cannot
// render a nested async component the way the real Next.js RSC pipeline does — attempting to
// forces a "Cannot destructure property of undefined" crash from React's own error-frame
// machinery, not a bug in the component. Its fetch/empty-state behavior has full, dedicated
// coverage in PlaceCollectionBlock.spec.tsx, which awaits it directly. This file's job is proving
// every OTHER block type dispatches and renders safely, and that no block type ever uses
// dangerouslySetInnerHTML — neither needs place_collection to be true.

// A script tag hidden inside stored TEXT (never markup) — if the render path ever regressed to
// dangerouslySetInnerHTML, this would become a live DOM element. Rendered as text, it stays a
// literal, inert string. This is the structural proof "không dùng HTML tự do" actually holds at
// the render layer, not just by convention.
const INJECTION_PROBE = '<script>window.__pwned = true</script>';

const ARTICLE: GuideArticleDetail = {
  id: 'a1',
  slug: 'phu-quoc',
  locale: 'vi',
  title: 'Cẩm nang Phú Quốc',
  intro: 'Bạn muốn ở đâu, đi đâu?',
  heroMediaId: null,
  heroImageUrl: null,
  status: 'published',
  contentVersion: 3,
  updatedAt: '2026-09-18T00:00:00Z',
  publishedAt: '2026-09-18T00:00:00Z',
  blocks: [
    { id: 'b1', position: 0, blockType: 'section_heading', content: { text: 'Ở đâu' }, needsDecision: false, decisionNote: null },
    {
      id: 'b2',
      position: 1,
      blockType: 'rich_text',
      content: { paragraphs: [{ type: 'p', text: INJECTION_PROBE }] },
      needsDecision: false,
      decisionNote: null,
    },
    { id: 'b4', position: 2, blockType: 'callout', content: { variant: 'tip', text: 'Mang kem chống nắng' }, needsDecision: false, decisionNote: null },
    { id: 'b5', position: 3, blockType: 'faq', content: { items: [{ question: 'Mùa nào đẹp nhất?', answer: 'Tháng 11–3' }] }, needsDecision: false, decisionNote: null },
    {
      id: 'b6',
      position: 4,
      blockType: 'image_with_rights',
      content: { mediaId: 'm1', imageUrl: 'https://api.test/media/m1/file', attribution: 'Ảnh: Nguyễn Văn A' },
      needsDecision: false,
      decisionNote: null,
    },
  ],
};

describe('GuideArticleView', () => {
  it('renders every (synchronously renderable) block type from a fixture article', async () => {
    const element = await GuideArticleView({ article: ARTICLE, locale: 'vi' });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: 'Cẩm nang Phú Quốc' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ở đâu' })).toBeInTheDocument();
    expect(screen.getByText('Mang kem chống nắng')).toBeInTheDocument();
    expect(screen.getByText('Mùa nào đẹp nhất?')).toBeInTheDocument();
    expect(screen.getByText('Ảnh: Nguyễn Văn A')).toBeInTheDocument();
  });

  it('never injects stored text as HTML — no dangerouslySetInnerHTML anywhere in the tree', async () => {
    const element = await GuideArticleView({ article: ARTICLE, locale: 'vi' });
    const { container } = render(element);

    // The probe string must appear as literal TEXT content...
    expect(screen.getByText(INJECTION_PROBE)).toBeInTheDocument();
    // ...and must NEVER have been parsed into a real <script> element.
    expect(container.querySelector('script')).toBeNull();
  });
});
