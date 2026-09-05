/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { BetaBanner, BETA_DISCLOSURE_TEXT } from './BetaBanner';

describe('BetaBanner', () => {
  it('hiển thị đúng nguyên văn thông báo Public Beta (mặc định vi)', () => {
    render(<BetaBanner />);
    expect(screen.getByText(BETA_DISCLOSURE_TEXT.vi)).toBeInTheDocument();
  });

  it('locale="en" → hiển thị bản tiếng Anh, không lộ tiếng Việt', () => {
    render(<BetaBanner locale="en" />);
    expect(screen.getByText(BETA_DISCLOSURE_TEXT.en)).toBeInTheDocument();
    expect(screen.queryByText(BETA_DISCLOSURE_TEXT.vi)).not.toBeInTheDocument();
  });
});
