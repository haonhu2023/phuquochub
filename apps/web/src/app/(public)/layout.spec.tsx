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

describe('PublicLayout', () => {
  it('hiển thị banner Public Beta sitewide trên mọi trang công khai', () => {
    render(
      <PublicLayout>
        <p>nội dung trang</p>
      </PublicLayout>,
    );
    expect(screen.getByText(BETA_DISCLOSURE_TEXT)).toBeInTheDocument();
  });

  it('vẫn render children bình thường cùng với banner', () => {
    render(
      <PublicLayout>
        <p>nội dung trang</p>
      </PublicLayout>,
    );
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
  });
});
