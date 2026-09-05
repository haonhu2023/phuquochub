/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { SmartDiscovery } from './SmartDiscovery';
import { getHomeCopy } from './home.copy';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('SmartDiscovery', () => {
  it('là section có tiêu đề h2 gắn nhãn, khớp locale', () => {
    render(<SmartDiscovery locale="en" />);
    const title = getHomeCopy('en').smartTitle;
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('không tự xưng "AI" — chỉ có lối tắt cố định + nút "gần bạn" thật, không có chatbot giả', () => {
    render(<SmartDiscovery locale="vi" />);
    expect(screen.queryByText(/\bAI\b/i)).not.toBeInTheDocument();
  });

  // Phase 6 (Smart Discovery V2) — hàng lối tắt cố định phải trỏ tới route CÓ THẬT, khớp locale.
  it('mọi lối tắt cố định trỏ tới route CÓ THẬT, khớp locale', () => {
    render(<SmartDiscovery locale="en" />);
    const copy = getHomeCopy('en');
    for (const link of copy.smartQuickLinks) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute('href', `/en${link.href}`);
    }
  });

  it('vẫn có nút "gần bạn" thật (không bị thay thế bởi lối tắt cố định)', () => {
    render(<SmartDiscovery locale="vi" />);
    expect(screen.getByRole('button', { name: getHomeCopy('vi').nearbyCta })).toBeInTheDocument();
  });
});
