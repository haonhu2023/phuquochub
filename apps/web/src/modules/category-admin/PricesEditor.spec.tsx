/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricesEditor } from './PricesEditor';
import { readSession } from '@/modules/auth/session';
import { createPlacePrice, listPlacePrices } from '@/modules/prices/api/prices.api';
import { submitPriceVerification, verifyPriceVerification } from '@/modules/verifications/api/verifications.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/prices/api/prices.api', () => ({
  listPlacePrices: jest.fn(),
  createPlacePrice: jest.fn(),
}));
jest.mock('@/modules/verifications/api/verifications.api', () => ({
  submitPriceVerification: jest.fn(),
  verifyPriceVerification: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockListPrices = listPlacePrices as jest.Mock;
const mockCreatePrice = createPlacePrice as jest.Mock;
const mockSubmitVerification = submitPriceVerification as jest.Mock;
const mockVerify = verifyPriceVerification as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

// price_history là SSOT giá dùng chung (ADR-006/ADR-019) — test này khoá lại đúng hành vi
// append-only + phân biệt hiển thị theo verification_status, KHÔNG phải test hình dạng SQL.
describe('PricesEditor — tải danh sách, phân biệt đã xác minh / đang chờ', () => {
  it('giá đã verified -> hiện số tiền thật; giá pending -> hiện "đang xác minh", không lộ amount', async () => {
    mockListPrices.mockResolvedValue([
      { id: 'p1', service_name: 'Giá phòng/đêm', amount: 800000, currency: 'VND', unit: 'đêm', is_free: false, valid_from: null, valid_to: null, verification_status: 'verified' },
      { id: 'p2', service_name: 'Phụ thu cuối tuần', amount: null, currency: 'VND', unit: null, is_free: false, valid_from: null, valid_to: null, verification_status: 'pending' },
    ]);

    render(<PricesEditor placeId="place-1" />);

    expect(await screen.findByText('Giá phòng/đêm')).toBeInTheDocument();
    expect(screen.getByText(/800.000 VND \/ đêm/)).toBeInTheDocument();
    expect(screen.getByText('Phụ thu cuối tuần')).toBeInTheDocument();
    expect(screen.getByText('Giá đang được xác minh')).toBeInTheDocument();
  });
});

describe('PricesEditor — thêm giá mới (append-only, không sửa/xoá bản cũ)', () => {
  it('nhập tên+số tiền -> gọi createPlacePrice đúng payload, danh sách hiện thêm bản mới NGAY (không cần reload)', async () => {
    mockListPrices.mockResolvedValue([]);
    mockCreatePrice.mockResolvedValue({
      id: 'p-new', service_name: 'Giá/người', amount: 150000, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'pending',
    });

    render(<PricesEditor placeId="place-1" />);
    await waitFor(() => expect(mockListPrices).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Giá phòng\/đêm/), { target: { value: 'Giá/người' } });
    fireEvent.change(screen.getByPlaceholderText(/đêm, người, vé/), { target: { value: 'người' } });
    const amountInput = screen.getByLabelText('Số tiền (VND)');
    fireEvent.change(amountInput, { target: { value: '150000' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm giá/ }));

    await waitFor(() =>
      expect(mockCreatePrice).toHaveBeenCalledWith(
        'place-1',
        { service_name: 'Giá/người', amount: 150000, unit: 'người', is_free: false, description: undefined },
        'tok',
      ),
    );
    expect(await screen.findByText('Giá/người')).toBeInTheDocument();
    expect(screen.getByText(/chờ xác minh/)).toBeInTheDocument();
  });

  it('không nhập tên -> báo lỗi rõ ràng, KHÔNG gọi API', async () => {
    mockListPrices.mockResolvedValue([]);
    render(<PricesEditor placeId="place-1" />);
    await waitFor(() => expect(mockListPrices).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thêm giá/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tên khoản giá/);
    expect(mockCreatePrice).not.toHaveBeenCalled();
  });

  it('đánh dấu Miễn phí -> không bắt buộc nhập số tiền, gửi amount=0/is_free=true', async () => {
    mockListPrices.mockResolvedValue([]);
    mockCreatePrice.mockResolvedValue({
      id: 'p-free', service_name: 'Vé vào cổng', amount: 0, currency: 'VND', unit: null, is_free: true, valid_from: null, valid_to: null, verification_status: 'pending',
    });
    render(<PricesEditor placeId="place-1" />);
    await waitFor(() => expect(mockListPrices).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Giá phòng\/đêm/), { target: { value: 'Vé vào cổng' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Miễn phí/ }));
    fireEvent.click(screen.getByRole('button', { name: /Thêm giá/ }));

    await waitFor(() =>
      expect(mockCreatePrice).toHaveBeenCalledWith(
        'place-1',
        { service_name: 'Vé vào cổng', amount: 0, unit: undefined, is_free: true, description: undefined },
        'tok',
      ),
    );
  });
});

// Verification Foundation (ADR-008) đã có sẵn ở backend — nút này chỉ GỌI ĐÚNG hai bước có sẵn
// (submit rồi verify), KHÔNG tự đặt logic xác minh nào mới ở frontend. Cả hai bước gác
// Verification.Verify (moderator-only, Owner Decision 2026-08-06) — test 403 khoá lại đúng việc
// component không tự "thăng cấp" quyền, chỉ hiện lại đúng lỗi từ API.
describe('PricesEditor — nút "Xác minh" (submit + verify qua cơ chế Verification hiện có)', () => {
  it('giá pending -> bấm Xác minh -> gọi submit rồi verify đúng thứ tự -> tải lại danh sách, hiện giá thật', async () => {
    mockListPrices
      .mockResolvedValueOnce([
        { id: 'p1', service_name: 'Giá/người', amount: null, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'pending' },
      ])
      .mockResolvedValueOnce([
        { id: 'p1', service_name: 'Giá/người', amount: 180000, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'verified' },
      ]);
    mockSubmitVerification.mockResolvedValue({ id: 'verif-1', status: 'pending' });
    mockVerify.mockResolvedValue({ status: 'verified' });

    render(<PricesEditor placeId="place-1" />);
    await screen.findByText('Giá/người');

    fireEvent.click(screen.getByRole('button', { name: /Xác minh/ }));

    await waitFor(() => expect(mockSubmitVerification).toHaveBeenCalledWith('p1', 'tok'));
    expect(mockVerify).toHaveBeenCalledWith('verif-1', 'tok');
    expect(await screen.findByText(/180.000 VND \/ người/)).toBeInTheDocument();
    expect(screen.queryByText('Giá đang được xác minh')).not.toBeInTheDocument();
  });

  it('không có quyền Verification.Verify -> API trả 403 -> hiện đúng lỗi, KHÔNG đổi trạng thái giá', async () => {
    mockListPrices.mockResolvedValue([
      { id: 'p1', service_name: 'Giá/người', amount: null, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'pending' },
    ]);
    mockSubmitVerification.mockRejectedValue(new ApiError('Bạn không có quyền thực hiện hành động này.', 403, 'FORBIDDEN'));

    render(<PricesEditor placeId="place-1" />);
    await screen.findByText('Giá/người');

    fireEvent.click(screen.getByRole('button', { name: /Xác minh/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện hành động này.');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(screen.getByText('Giá đang được xác minh')).toBeInTheDocument();
  });
});
