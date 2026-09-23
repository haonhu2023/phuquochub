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

  it('vẫn có nút "gần bạn" thật', () => {
    render(<SmartDiscovery locale="vi" />);
    expect(screen.getByRole('button', { name: getHomeCopy('vi').nearbyCta })).toBeInTheDocument();
  });

  // 2026-09 rà UI mobile: hàng lối tắt cố định (Phase 6, "Khám phá theo nhu cầu" V2) bị bỏ vì
  // trùng route với CategoryLinks + chip "Gợi ý nhanh" trong hero. Regression guard — không để ai
  // vô tình thêm lại đúng những link đó dưới tên khác mà không nhận ra đây là trùng lặp đã bàn.
  it('KHÔNG còn hàng lối tắt cố định trỏ /restaurants, /beaches, /attractions, /tours, /map (đã trùng CategoryLinks + hero) — chỉ còn đúng 1 link (widget gần bạn không dùng <a>, nên section này không có <a> nào nữa)', () => {
    render(<SmartDiscovery locale="vi" />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
