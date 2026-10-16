/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { ClaimCta } from './ClaimCta';

describe('ClaimCta — banner trên trang chi tiết Place công khai (PLACE-042)', () => {
  it('vi: hiển thị lời mời và liên kết trỏ đúng route với place_id/place_name đã encode', () => {
    render(<ClaimCta placeId="p 1" placeName="Bãi Sao & Bạn" locale="vi" />);

    expect(screen.getByText(/Bạn là chủ địa điểm này/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Xác nhận quyền quản lý' });
    expect(link).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new?place_id=p%201&place_name=B%C3%A3i%20Sao%20%26%20B%E1%BA%A1n',
    );
  });

  // Khoảng trống i18n thật phát hiện 16/10/2026 (nghiệm thu sau release `2889bf8`): component này
  // trước đây hardcode tiếng Việt kể cả ở `/en` — test này khoá đúng việc đã sửa, cùng khuôn
  // ProposeEditCta.spec.tsx (component song sinh).
  it('en: hiển thị bản tiếng Anh, cùng route (dashboard không có locale prefix)', () => {
    render(<ClaimCta placeId="p1" placeName="Bai Sao" locale="en" />);

    expect(screen.getByText(/Are you the owner of this place/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verify ownership' })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new?place_id=p1&place_name=Bai%20Sao',
    );
  });
});
