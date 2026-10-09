/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MyProposalsView } from './MyProposalsView';
import { readSession } from '@/modules/auth/session';
import { listMyPlaceEditProposals } from './api/place-edit-proposals.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-edit-proposals.api', () => ({ listMyPlaceEditProposals: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = listMyPlaceEditProposals as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

const ROW = {
  id: 'p1',
  place_id: 'pl1',
  field_key: 'description',
  locale_code: 'vi',
  proposed_value: 'Mô tả synthetic',
  reason: 'Lý do synthetic',
  source_url: null,
  status: 'needs_changes',
  sender_message: null,
  photos: [],
  reviewed_at: '2026-10-07T03:00:00.000Z',
  created_at: '2026-10-06T03:00:00.000Z',
  updated_at: '2026-10-07T03:00:00.000Z',
};

describe('MyProposalsView — Góp ý của tôi', () => {
  it('hiện trạng thái xử lý và ngày; không hiện người duyệt hay ghi chú nội bộ', async () => {
    mockList.mockResolvedValue([{ ...ROW, reviewer_id: 'admin-7', review_note: 'Ghi chú nội bộ' }]);
    render(<MyProposalsView />);
    expect(await screen.findByText(/Cần bổ sung/)).toBeInTheDocument();
    expect(screen.getByText(/xử lý ngày/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('admin-7');
    expect(document.body.textContent).not.toContain('Ghi chú nội bộ');
  });

  it('CÓ sender_message → hiện "Phản hồi: ..." (khác hẳn ghi chú nội bộ, đây là trường public)', async () => {
    mockList.mockResolvedValue([{ ...ROW, sender_message: 'Cảm ơn góp ý, mình đã cập nhật.' }]);
    render(<MyProposalsView />);
    expect(await screen.findByText(/Phản hồi: Cảm ơn góp ý, mình đã cập nhật\./)).toBeInTheDocument();
  });

  it('sender_message null → KHÔNG hiện dòng "Phản hồi" nào (không bịa chuỗi cho field tuỳ chọn trống)', async () => {
    mockList.mockResolvedValue([{ ...ROW, sender_message: null }]);
    render(<MyProposalsView />);
    await screen.findByText(/Cần bổ sung/);
    expect(screen.queryByText(/^Phản hồi:/)).toBeNull();
  });

  it('chưa gửi góp ý nào → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<MyProposalsView />);
    expect(await screen.findByText('Bạn chưa gửi góp ý nào.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lỗi tải → báo lỗi rõ, không hiện như danh sách rỗng', async () => {
    mockList.mockRejectedValue(new Error('down'));
    render(<MyProposalsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách góp ý');
    expect(screen.queryByText('Bạn chưa gửi góp ý nào.')).toBeNull();
  });
});
