/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import AuthLayout from './layout';
import { BETA_DISCLOSURE_TEXT } from '@/modules/legal/BetaBanner';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('AuthLayout', () => {
  // Banner Public Beta chỉ thuộc layout công khai (app/(public)/layout.tsx) — khu vực đăng
  // nhập/đăng ký là một route group HOÀN TOÀN riêng, không lồng layout công khai vào, nên banner
  // không thể rò vào đây được. Test này khẳng định thật, không suy diễn từ kiến trúc.
  it('KHÔNG hiển thị banner Public Beta công khai', () => {
    render(
      <AuthLayout>
        <p>form đăng nhập</p>
      </AuthLayout>,
    );
    expect(screen.queryByText(BETA_DISCLOSURE_TEXT.vi)).not.toBeInTheDocument();
  });
});
