/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { ClaimCta } from './ClaimCta';

describe('ClaimCta — banner trên trang chi tiết Place công khai (PLACE-042)', () => {
  it('hiển thị lời mời và liên kết trỏ đúng route với place_id/place_name đã encode', () => {
    render(<ClaimCta placeId="p 1" placeName="Bãi Sao & Bạn" />);

    expect(screen.getByText(/Bạn là chủ địa điểm này/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Xác nhận quyền quản lý' });
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new?place_id=p%201&place_name=B%C3%A3i%20Sao%20%26%20B%E1%BA%A1n',
    );
  });
});
