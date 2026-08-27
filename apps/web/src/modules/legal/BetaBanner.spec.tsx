/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { BetaBanner, BETA_DISCLOSURE_TEXT } from './BetaBanner';

describe('BetaBanner', () => {
  it('hiển thị đúng nguyên văn thông báo Public Beta', () => {
    render(<BetaBanner />);
    expect(screen.getByText(BETA_DISCLOSURE_TEXT)).toBeInTheDocument();
  });
});
