/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { LocaleProvider, useLocale } from './LocaleContext';

function Probe() {
  return <span>locale:{useLocale()}</span>;
}

describe('useLocale / LocaleProvider', () => {
  it('không có Provider bao ngoài → trả về DEFAULT_LOCALE (vi), không throw', () => {
    render(<Probe />);
    expect(screen.getByText('locale:vi')).toBeInTheDocument();
  });

  it('có LocaleProvider locale="en" → useLocale() trả về "en"', () => {
    render(
      <LocaleProvider locale="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText('locale:en')).toBeInTheDocument();
  });
});
