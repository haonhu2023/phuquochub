/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { NewClaimView } from './NewClaimView';
import { ClaimForm } from './ClaimForm';

jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));
jest.mock('./ClaimForm', () => ({
  ClaimForm: jest.fn(({ placeId, placeName, onSubmitted }) => (
    <div data-testid="claim-form" data-place-id={placeId} data-place-name={placeName}>
      <button type="button" onClick={() => onSubmitted({ id: 'c1', status: 'pending' })}>
        fake-submit
      </button>
    </div>
  )),
}));

const mockUseSearchParams = useSearchParams as jest.Mock;
const mockClaimForm = ClaimForm as unknown as jest.Mock;

function paramsOf(entries: Record<string, string>) {
  return { get: (key: string) => entries[key] ?? null };
}

beforeEach(() => {
  mockClaimForm.mockClear();
});

describe('NewClaimView — không có place_id', () => {
  it('hiển thị hướng dẫn quay lại duyệt địa điểm, không render ClaimForm', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({}));
    render(<NewClaimView />);

    expect(screen.getByText('Chưa chọn địa điểm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Duyệt địa điểm/ })).toHaveAttribute('href', '/places');
    expect(screen.queryByTestId('claim-form')).not.toBeInTheDocument();
  });
});

describe('NewClaimView — có place_id', () => {
  it('render ClaimForm với đúng placeId/placeName từ query string', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1', place_name: 'Bãi Sao' }));
    render(<NewClaimView />);

    const form = screen.getByTestId('claim-form');
    expect(form).toHaveAttribute('data-place-id', 'p1');
    expect(form).toHaveAttribute('data-place-name', 'Bãi Sao');
  });

  it('thiếu place_name → dùng nhãn mặc định (không throw, không hiển thị "null")', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1' }));
    render(<NewClaimView />);

    expect(screen.getByTestId('claim-form')).toHaveAttribute('data-place-name', 'Địa điểm đã chọn');
  });

  it('sau khi ClaimForm báo submitted → hiển thị xác nhận, ẩn form', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1', place_name: 'Bãi Sao' }));
    render(<NewClaimView />);

    fireEvent.click(screen.getByRole('button', { name: 'fake-submit' }));

    expect(screen.getByText('Đã gửi yêu cầu')).toBeInTheDocument();
    expect(screen.getByText(/Bãi Sao/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về Địa điểm của tôi' })).toHaveAttribute(
      'href',
      '/dashboard/places',
    );
    expect(screen.queryByTestId('claim-form')).not.toBeInTheDocument();
  });
});
