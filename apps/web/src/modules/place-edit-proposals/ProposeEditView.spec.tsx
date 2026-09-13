/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { ProposeEditView } from './ProposeEditView';
import { ProposeEditForm } from './ProposeEditForm';
import { getPlace } from '@/modules/places/api/places.api';

jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));
jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
jest.mock('./ProposeEditForm', () => ({
  ProposeEditForm: jest.fn(({ placeId, placeName, currentPlace, onSubmitted }) => (
    <div
      data-testid="propose-edit-form"
      data-place-id={placeId}
      data-place-name={placeName}
      data-has-current={currentPlace ? 'yes' : 'no'}
    >
      <button type="button" onClick={() => onSubmitted()}>
        fake-submit
      </button>
    </div>
  )),
}));

const mockUseSearchParams = useSearchParams as jest.Mock;
const mockGetPlace = getPlace as jest.Mock;
const mockForm = ProposeEditForm as unknown as jest.Mock;

function paramsOf(entries: Record<string, string>) {
  return { get: (key: string) => entries[key] ?? null };
}

beforeEach(() => {
  mockForm.mockClear();
  mockGetPlace.mockReset();
});

describe('ProposeEditView — không có place_id', () => {
  it('hiển thị hướng dẫn quay lại duyệt địa điểm, không render form', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({}));
    render(<ProposeEditView />);

    expect(screen.getByText('Chưa chọn địa điểm')).toBeInTheDocument();
    expect(screen.queryByTestId('propose-edit-form')).not.toBeInTheDocument();
    expect(mockGetPlace).not.toHaveBeenCalled();
  });
});

describe('ProposeEditView — có place_id', () => {
  it('render form với đúng placeId/placeName, KHÔNG có place_slug → không gọi getPlace, currentPlace=null', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1', place_name: 'Bãi Sao' }));
    render(<ProposeEditView />);

    const form = screen.getByTestId('propose-edit-form');
    expect(form).toHaveAttribute('data-place-id', 'p1');
    expect(form).toHaveAttribute('data-place-name', 'Bãi Sao');
    expect(form).toHaveAttribute('data-has-current', 'no');
    expect(mockGetPlace).not.toHaveBeenCalled();
  });

  it('có place_slug → gọi getPlace(slug), truyền currentPlace xuống form khi thành công', async () => {
    mockGetPlace.mockResolvedValue({ id: 'p1', slug: 'bai-sao', address: '123' });
    mockUseSearchParams.mockReturnValue(
      paramsOf({ place_id: 'p1', place_name: 'Bãi Sao', place_slug: 'bai-sao' }),
    );
    render(<ProposeEditView />);

    expect(mockGetPlace).toHaveBeenCalledWith('bai-sao');
    await waitFor(() =>
      expect(screen.getByTestId('propose-edit-form')).toHaveAttribute('data-has-current', 'yes'),
    );
  });

  it('getPlace thất bại → form vẫn render bình thường, currentPlace=null (không crash)', async () => {
    mockGetPlace.mockRejectedValue(new Error('network'));
    mockUseSearchParams.mockReturnValue(
      paramsOf({ place_id: 'p1', place_name: 'Bãi Sao', place_slug: 'bai-sao' }),
    );
    render(<ProposeEditView />);

    await waitFor(() => expect(mockGetPlace).toHaveBeenCalled());
    expect(screen.getByTestId('propose-edit-form')).toHaveAttribute('data-has-current', 'no');
  });

  it('thiếu place_name → dùng nhãn mặc định', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1' }));
    render(<ProposeEditView />);
    expect(screen.getByTestId('propose-edit-form')).toHaveAttribute('data-place-name', 'Địa điểm đã chọn');
  });

  it('sau khi form báo submitted → hiển thị đúng câu xác nhận, ẩn form (phân biệt với "Đã gửi báo cáo" của Báo thông tin sai)', () => {
    mockUseSearchParams.mockReturnValue(paramsOf({ place_id: 'p1', place_name: 'Bãi Sao' }));
    render(<ProposeEditView />);

    fireEvent.click(screen.getByRole('button', { name: 'fake-submit' }));

    expect(screen.getByText('Đề xuất đã được gửi và đang chờ xem xét')).toBeInTheDocument();
    expect(screen.queryByText('Đã gửi báo cáo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('propose-edit-form')).not.toBeInTheDocument();
  });
});
