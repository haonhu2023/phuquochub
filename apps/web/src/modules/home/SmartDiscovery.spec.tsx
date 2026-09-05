/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { SmartDiscovery } from './SmartDiscovery';
import { getHomeCopy } from './home.copy';

describe('SmartDiscovery', () => {
  it('là section có tiêu đề h2 gắn nhãn, khớp locale', () => {
    render(<SmartDiscovery locale="en" />);
    const title = getHomeCopy('en').smartTitle;
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('không tự xưng "AI" — chỉ có nút "gần bạn" thật, không có chatbot giả', () => {
    render(<SmartDiscovery locale="vi" />);
    expect(screen.queryByText(/\bAI\b/i)).not.toBeInTheDocument();
  });
});
