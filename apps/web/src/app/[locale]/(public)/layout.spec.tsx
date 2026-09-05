/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import PublicLayout from './layout';
import { BETA_DISCLOSURE_TEXT } from '@/modules/legal/BetaBanner';

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
});
