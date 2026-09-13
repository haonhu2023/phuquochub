/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { ProposeEditCta } from './ProposeEditCta';

describe('ProposeEditCta — banner "Đề xuất chỉnh sửa" trên trang chi tiết Place công khai', () => {
  it('vi: hiển thị lời mời và liên kết trỏ đúng route với place_id/place_name/place_slug đã encode', () => {
    render(<ProposeEditCta placeId="p 1" placeName="Bãi Sao & Bạn" placeSlug="bai-sao" locale="vi" />);

    expect(screen.getByText('Thấy thông tin cần cập nhật?')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Đề xuất chỉnh sửa' });
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/places/edit-proposals?place_id=p%201&place_name=B%C3%A3i%20Sao%20%26%20B%E1%BA%A1n&place_slug=bai-sao',
    );
  });

  it('en: hiển thị bản tiếng Anh, cùng route (dashboard không có locale prefix)', () => {
    render(<ProposeEditCta placeId="p1" placeName="Bai Sao" placeSlug="bai-sao" locale="en" />);

    expect(screen.getByText('Noticed something that needs an update?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suggest an edit' })).toHaveAttribute(
      'href',
      '/dashboard/places/edit-proposals?place_id=p1&place_name=Bai%20Sao&place_slug=bai-sao',
    );
  });

  it('khác chữ với ReportPlaceCta (Báo thông tin sai) — không lẫn hai CTA', () => {
    render(<ProposeEditCta placeId="p1" placeName="X" placeSlug="x" locale="vi" />);
    expect(screen.queryByText('Báo thông tin sai')).not.toBeInTheDocument();
  });
});
