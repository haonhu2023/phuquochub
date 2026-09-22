/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import PublicLayout from './layout';
import { BETA_DISCLOSURE_TEXT } from '@/modules/legal/BetaBanner';
import { getHomeContent } from '@/modules/site-content/api/site-content.api';

jest.mock('@/modules/site-content/api/site-content.api', () => ({ getHomeContent: jest.fn() }));
const mockGetHomeContent = getHomeContent as jest.Mock;

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// `LanguageSwitch` (đảo client trong Header) đọc `usePathname`/`useSearchParams` — mock cố định,
// cùng quy ước `RouteGuard.spec.tsx` đã dùng cho next/navigation trong test.
jest.mock('next/navigation', () => ({
  usePathname: () => '/vi/places',
  useSearchParams: () => new URLSearchParams(),
}));

// `PublicLayout` là Server Component `async` (nhận `params.locale` từ PR A) — gọi trực tiếp như
// một async function thuần rồi render JSX đã resolve, thay vì render component chưa await (React
// Testing Library không tự `await` một component trả về Promise).
async function renderPublicLayout(children: React.ReactNode, locale: 'vi' | 'en' = 'vi') {
  const jsx = await PublicLayout({ children, params: Promise.resolve({ locale }) });
  return render(jsx);
}

const NO_OVERRIDE = { hero: null, about: null, featuredPlaceSlugs: [], social: { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null } };

beforeEach(() => {
  mockGetHomeContent.mockReset().mockResolvedValue(NO_OVERRIDE);
});

describe('PublicLayout', () => {
  it('hiển thị banner Public Beta sitewide trên mọi trang công khai', async () => {
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByText(BETA_DISCLOSURE_TEXT.vi)).toBeInTheDocument();
  });

  it('vẫn render children bình thường cùng với banner', async () => {
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
  });

  it('header V2: 6 mục điều hướng dùng đúng locale hiện tại, không double-prefix', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'en');
    expect(screen.getAllByText('Food')[0].closest('a')).toHaveAttribute('href', '/en/restaurants');
    expect(screen.getAllByText('Map')[0].closest('a')).toHaveAttribute('href', '/en/map');
    expect(screen.getByRole('link', { name: 'PhuQuocHub' })).toHaveAttribute('href', '/en');
  });

  it('header V2: nav mặc định vi khi locale=vi', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'vi');
    expect(screen.getAllByText('Ăn uống')[0].closest('a')).toHaveAttribute('href', '/vi/restaurants');
  });

  it('footer vẫn liên kết tới /places (mục điều hướng "Địa điểm" nay ở footer, không phải header)', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'vi');
    expect(screen.getByRole('link', { name: 'Địa điểm' })).toHaveAttribute('href', '/vi/places');
  });

  it('có skip link nhảy tới #main-content, và <main> mang đúng id đó', async () => {
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByRole('link', { name: /bỏ qua/i })).toHaveAttribute('href', '#main-content');
    expect(document.querySelector('main#main-content')).not.toBeNull();
  });

  it('có công tắc ngôn ngữ VI/EN nhìn thấy được trong header', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'vi');
    expect(screen.getAllByRole('link', { name: 'EN' }).length).toBeGreaterThan(0);
  });

  // S1 (2026-09-22) — social_links CMS truyền xuống footer qua PublicLayout.
  it('S1: social_links từ getHomeContent() truyền xuống footer', async () => {
    mockGetHomeContent.mockResolvedValue({ ...NO_OVERRIDE, social: { facebook: 'https://facebook.com/x', zalo: null, instagram: null, whatsapp: null, phone: null } });
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('href', 'https://facebook.com/x');
  });

  it('S1: getHomeContent lỗi → layout vẫn render bình thường, không có nhóm "Kết nối"', async () => {
    mockGetHomeContent.mockRejectedValue(new Error('API down'));
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
    expect(screen.queryByText('Kết nối')).not.toBeInTheDocument();
  });
});
