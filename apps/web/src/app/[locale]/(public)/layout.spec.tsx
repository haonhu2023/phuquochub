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
    expect(screen.getByText(BETA_DISCLOSURE_TEXT)).toBeInTheDocument();
  });

  it('vẫn render children bình thường cùng với banner', async () => {
    await renderPublicLayout(<p>nội dung trang</p>);
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
  });

  it('nav dùng đúng locale hiện tại, không double-prefix', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'en');
    expect(screen.getByText('Địa điểm').closest('a')).toHaveAttribute('href', '/en/places');
    expect(screen.getByText('PhuQuocHub').closest('a')).toHaveAttribute('href', '/en');
  });

  it('nav mặc định vi khi locale=vi', async () => {
    await renderPublicLayout(<p>nội dung trang</p>, 'vi');
    expect(screen.getByText('Địa điểm').closest('a')).toHaveAttribute('href', '/vi/places');
  });
});
