/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProposalPhotoUploader } from './ProposalPhotoUploader';
import { listMyProposalPhotos, presignProposalPhoto, registerProposalPhoto } from './api/place-edit-proposal-photos.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';

jest.mock('./api/place-edit-proposal-photos.api', () => ({
  listMyProposalPhotos: jest.fn(),
  presignProposalPhoto: jest.fn(),
  registerProposalPhoto: jest.fn(),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/lib/sha256', () => ({ sha256Hex: jest.fn().mockResolvedValue('a'.repeat(64)) }));

const mockList = listMyProposalPhotos as jest.Mock;
const mockPresign = presignProposalPhoto as jest.Mock;
const mockRegister = registerProposalPhoto as jest.Mock;
const mockSession = readSession as jest.Mock;

const PROPOSAL_ID = 'prop-1';
const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function photo(overrides: Partial<{ id: string; status: string; created_at: string; url: string }> = {}) {
  return { id: 'media-1', status: 'pending', created_at: '2026-10-09T00:00:00.000Z', url: `/api/place-edit-proposals/${PROPOSAL_ID}/media/media-1/file`, ...overrides };
}

function selectFile(name = 'photo.jpg', type = 'image/jpeg', size = 1000) {
  const input = screen.getByLabelText('Chọn ảnh bằng chứng để tải lên');
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  mockSession.mockReset().mockReturnValue(SESSION);
  mockList.mockReset().mockResolvedValue([]);
  mockPresign.mockReset().mockResolvedValue({ key: 'media/x.jpg', upload_url: 'https://s/put', expires_in: 600 });
  mockRegister.mockReset().mockResolvedValue(photo());
  global.fetch = jest.fn((url: RequestInfo | URL) =>
    Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ __url: String(url) }) }),
  ) as unknown as typeof fetch;
  global.URL.createObjectURL = jest.fn((blob: unknown) => `blob:${(blob as { __url: string }).__url}`);
  global.URL.revokeObjectURL = jest.fn();
});

describe('ProposalPhotoUploader', () => {
  it('chưa đăng nhập → không render gì (không có gì để gắn ảnh)', async () => {
    mockSession.mockReturnValue(null);
    const { container } = render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('chưa có ảnh nào → hiện input tải lên, không có thumbnail nào', async () => {
    render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(PROPOSAL_ID, 'tok'));
    expect(screen.getByLabelText('Chọn ảnh bằng chứng để tải lên')).toBeInTheDocument();
  });

  it('tải ảnh hợp lệ → presign rồi register đúng proposalId, hiện thông báo chờ duyệt', async () => {
    render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    mockList.mockResolvedValueOnce([photo()]);
    selectFile();

    await waitFor(() => expect(mockPresign).toHaveBeenCalledWith(PROPOSAL_ID, expect.objectContaining({ content_type: 'image/jpeg' }), 'tok'));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith(PROPOSAL_ID, 'media/x.jpg', 'tok'));
    await waitFor(() => expect(screen.getByText(/Đã gửi ảnh/)).toBeInTheDocument());
  });

  it('đã đủ 3 ảnh → ẩn input tải lên (không cho chọn thêm)', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'p1' }), photo({ id: 'p2' }), photo({ id: 'p3' })]);
    render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByLabelText('Chọn ảnh bằng chứng để tải lên')).not.toBeInTheDocument();
  });

  it('lỗi 409 từ backend (vd đã đủ ảnh ngay lúc đó) → hiện đúng thông điệp backend trả về', async () => {
    render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    mockPresign.mockRejectedValueOnce(new ApiError('Tối đa 3 ảnh mỗi góp ý.', 409));

    selectFile();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tối đa 3 ảnh mỗi góp ý.');
  });

  it('tệp không phải ảnh hợp lệ → chặn phía client, KHÔNG gọi presign', async () => {
    render(<ProposalPhotoUploader proposalId={PROPOSAL_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    selectFile('doc.pdf', 'application/pdf');

    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
    expect(mockPresign).not.toHaveBeenCalled();
  });
});
