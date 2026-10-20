/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RealEstateListingTranslationEditor } from './RealEstateListingTranslationEditor';
import { readSession } from '@/modules/auth/session';
import { getMyRealEstateListingTranslation, saveRealEstateListingTranslation, submitRealEstateListingTranslation } from './api/real-estate-listings.api';
import { ApiError } from '@/lib/http';
import type { RealEstateListingSenderView, RealEstateListingTranslationView } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/real-estate-listings.api', () => ({
  getMyRealEstateListingTranslation: jest.fn(),
  saveRealEstateListingTranslation: jest.fn(),
  submitRealEstateListingTranslation: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockGet = getMyRealEstateListingTranslation as jest.Mock;
const mockSave = saveRealEstateListingTranslation as jest.Mock;
const mockSubmit = submitRealEstateListingTranslation as jest.Mock;

function listing(overrides: Partial<RealEstateListingSenderView> = {}): RealEstateListingSenderView {
  return {
    id: 'rel-1',
    poster_role: 'owner',
    transaction_type: 'rent',
    property_type: 'room',
    title: 'Phòng trọ gần biển',
    ward: null,
    address_precision: 'area',
    address_text: null,
    lat: null,
    lng: null,
    area_sqm: null,
    price: null,
    price_currency: null,
    rent_period: null,
    sale_price_basis: null,
    deposit_amount: null,
    utilities_note: 'Điện nước tự trả',
    utilities_note_rich: null,
    furniture_status: null,
    move_in_date: null,
    lease_term_months: null,
    legal_status_note: null,
    legal_status_note_rich: null,
    description: 'Mô tả tiếng Việt',
    description_rich: null,
    contact_method: 'phone',
    contact_value: '0909000000',
    deal_status: 'available',
    expires_at: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    status: 'published',
    review_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

function translation(overrides: Partial<RealEstateListingTranslationView> = {}): RealEstateListingTranslationView {
  return {
    id: 'tr-1',
    real_estate_listing_id: 'rel-1',
    locale: 'en',
    title: 'Room for rent',
    description: 'English description',
    description_rich: null,
    utilities_note: null,
    legal_status_note: null,
    status: 'draft',
    review_note: null,
    reviewed_at: null,
    has_published: false,
    published_at: null,
    content_version: 1,
    created_at: '2026-10-17T00:00:00.000Z',
    updated_at: '2026-10-17T00:00:00.000Z',
    is_stale: false,
    is_published_stale: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});
afterEach(() => jest.clearAllMocks());

// Gói C phần 2/2 — cùng mẫu JobListingTranslationEditor.spec.tsx (xem ghi chú đầy đủ ở đó).
describe('RealEstateListingTranslationEditor', () => {
  it('đã có bản dịch → prefill đúng 4 trường + trạng thái', async () => {
    mockGet.mockResolvedValue(translation({ utilities_note: 'Tenant pays', legal_status_note: 'Pink book' }));
    render(<RealEstateListingTranslationEditor listing={listing()} />);
    expect(await screen.findByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('Room for rent');
    expect(screen.getByLabelText('Điện/nước/phí (tiếng Anh)')).toHaveValue('Tenant pays');
    expect(screen.getByLabelText('Tình trạng pháp lý (tiếng Anh)')).toHaveValue('Pink book');
    expect(screen.getByText(/Nháp/)).toBeInTheDocument();
  });

  it('lưu nháp lần đầu → gọi API KHÔNG kèm expected_content_version, mô tả soạn qua editor rich-text gửi đúng description_rich', async () => {
    mockGet.mockResolvedValue(null);
    mockSave.mockResolvedValue(translation());
    render(<RealEstateListingTranslationEditor listing={listing()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.change(screen.getByLabelText('Tiêu đề (tiếng Anh)'), { target: { value: 'Room for rent' } });
    const editable = await waitFor(() => {
      const el = document.querySelector('.ProseMirror');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(editable);
    fireEvent.input(editable, { target: { textContent: 'English description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [, payload] = mockSave.mock.calls[0] as [string, { title: string; description_rich: unknown; expected_content_version: undefined }];
    expect(payload.title).toBe('Room for rent');
    expect(payload.expected_content_version).toBeUndefined();
    expect(payload.description_rich).not.toBeNull();
  });

  // Điểm owner yêu cầu trực tiếp: 409 KHÔNG xoá nội dung người dùng đang nhập.
  it('409 Conflict → GIỮ NGUYÊN nội dung đang nhập, hiện nút lấy phiên bản mới', async () => {
    mockGet.mockResolvedValue(translation({ content_version: 1 }));
    mockSave.mockRejectedValue(new ApiError('conflict', 409));
    render(<RealEstateListingTranslationEditor listing={listing()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.change(screen.getByLabelText('Tiêu đề (tiếng Anh)'), { target: { value: 'Đang gõ tiếp, chưa lưu được' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    await waitFor(() => expect(screen.getByText(/vừa bị sửa hoặc duyệt bởi người khác/)).toBeInTheDocument());
    expect(screen.getByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('Đang gõ tiếp, chưa lưu được');
    expect(screen.getByRole('button', { name: /Lấy phiên bản mới nhất/ })).toBeInTheDocument();
  });

  it('gửi duyệt → gọi submitRealEstateListingTranslation', async () => {
    mockGet.mockResolvedValue(translation({ title: 'Room for rent', description: 'English description', status: 'draft' }));
    mockSubmit.mockResolvedValue(translation({ status: 'pending' }));
    render(<RealEstateListingTranslationEditor listing={listing()} />);
    const btn = await screen.findByRole('button', { name: 'Gửi duyệt bản dịch' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('rel-1', 'tok'));
    expect(await screen.findByText(/Đang chờ duyệt/)).toBeInTheDocument();
  });

  it('bấm "Xem trước VI/EN" → hiện đối chiếu tiếng Việt (bản gốc) và tiếng Anh (bản đang nhập)', async () => {
    mockGet.mockResolvedValue(translation({ title: 'Room for rent', description: 'English description' }));
    render(<RealEstateListingTranslationEditor listing={listing({ title: 'Phòng trọ gần biển', description: 'Mô tả tiếng Việt' })} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước VI/EN' }));
    expect(screen.getByText('Phòng trọ gần biển')).toBeInTheDocument();
    expect(screen.getByText('Mô tả tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('Room for rent')).toBeInTheDocument();
    // "English description" xuất hiện HAI LẦN có chủ đích: một lần trong vùng soạn (editor tự mồi
    // hiển thị từ plain text), một lần trong khối đối chiếu xem trước — cùng mẫu đã dùng ở
    // JobListingTranslationEditor.spec.tsx.
    expect(screen.getAllByText('English description')).toHaveLength(2);
  });
});
