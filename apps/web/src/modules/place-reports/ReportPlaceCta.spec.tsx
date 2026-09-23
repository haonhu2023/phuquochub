/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { ReportPlaceCta } from './ReportPlaceCta';

describe('ReportPlaceCta — banner "Báo thông tin sai" trên trang chi tiết Place công khai', () => {
  it('hiển thị lời mời và liên kết trỏ đúng route với place_id/place_name đã encode', () => {
    render(<ReportPlaceCta placeId="p 1" placeName="Bãi Sao & Bạn" />);

    expect(screen.getByText('Thấy thông tin không đúng?')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Báo thông tin sai' });
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/places/report?place_id=p%201&place_name=B%C3%A3i%20Sao%20%26%20B%E1%BA%A1n',
    );
  });
});
