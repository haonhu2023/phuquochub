/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnerTodoView } from './OwnerTodoView';
import { listPendingOwnerDecisions, resolveOwnerDecision, resolvePlaceNames, withdrawOwnerDecision } from './api/owner-todo.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { OwnerDecisionItem } from './types';

jest.mock('./api/owner-todo.api', () => ({
  listPendingOwnerDecisions: jest.fn(),
  resolvePlaceNames: jest.fn(),
  resolveOwnerDecision: jest.fn(),
  withdrawOwnerDecision: jest.fn(),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockList = listPendingOwnerDecisions as jest.Mock;
const mockNames = resolvePlaceNames as jest.Mock;
const mockSession = readSession as jest.Mock;
const mockResolve = resolveOwnerDecision as jest.Mock;
const mockWithdraw = withdrawOwnerDecision as jest.Mock;

const anItem = (over: Partial<OwnerDecisionItem> = {}): OwnerDecisionItem => ({
  id: 'i1',
  placeId: 'p1',
  candidateKey: null,
  field: 'address',
  questionType: 'address_conflict',
  sourceAUrl: 'https://a.example',
  sourceAType: 'official_website',
  sourceBUrl: 'https://b.example',
  sourceBType: 'osm',
  conflictSummary: 'Hai nguồn cho địa chỉ khác nhau.',
  recommendation: 'Ưu tiên nguồn official_website.',
  status: 'pending',
  expiresAt: null,
  createdAt: '2026-09-24T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockList.mockReset();
  mockNames.mockReset().mockResolvedValue(new Map());
  mockResolve.mockReset();
  mockWithdraw.mockReset();
});

it('render danh sách việc cần làm khi tải thành công, gồm tên địa điểm đã ghép', async () => {
  mockList.mockResolvedValue([anItem()]);
  mockNames.mockResolvedValue(new Map([['p1', { name: 'Bãi Sao', slug: 'bai-sao' }]]));
  render(<OwnerTodoView />);
  expect(await screen.findByText('Địa chỉ — nguồn không khớp')).toBeInTheDocument();
  expect(screen.getByText('Bãi Sao')).toBeInTheDocument();
  expect(screen.getByText('Hai nguồn cho địa chỉ khác nhau.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sửa địa điểm →' })).toHaveAttribute(
    'href',
    '/dashboard/places/p1/edit',
  );
});

it('placeId null (candidate chưa thành place) -> không có link sửa, có ghi chú rõ ràng', async () => {
  mockList.mockResolvedValue([anItem({ placeId: null, id: 'i2' })]);
  render(<OwnerTodoView />);
  expect(await screen.findByText(/Chưa gắn với địa điểm đã tạo \(candidate\)/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sửa địa điểm →' })).not.toBeInTheDocument();
});

it('placeId null NHƯNG có candidateKey -> hiện candidateKey để nhận diện được item', async () => {
  mockList.mockResolvedValue([anItem({ placeId: null, candidateKey: 'cand-abc-123', id: 'i3' })]);
  render(<OwnerTodoView />);
  expect(await screen.findByText('cand-abc-123')).toBeInTheDocument();
});

it('gọi listPendingOwnerDecisions với trần API (200) và offset=0, hiện nút "Tải thêm" khi trang đầu đầy', async () => {
  const items = Array.from({ length: 200 }, (_, i) => anItem({ id: `i${i}`, placeId: null }));
  mockList.mockResolvedValue(items);
  render(<OwnerTodoView />);
  expect(await screen.findByRole('button', { name: 'Tải thêm' })).toBeInTheDocument();
  expect(mockList).toHaveBeenCalledWith('tok', { limit: 200, offset: 0 });
});

it('trang đầu KHÔNG đầy (< 200) -> không hiện "Tải thêm" (không còn gì để tải)', async () => {
  mockList.mockResolvedValue([anItem()]);
  render(<OwnerTodoView />);
  await screen.findByText('Địa chỉ — nguồn không khớp');
  expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
});

it('bấm "Tải thêm" -> gọi lại API với offset = số dòng đã có, NỐI THÊM dòng mới, không tải lại dòng cũ', async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => anItem({ id: `p1-${i}`, placeId: null }));
  const page2 = [anItem({ id: 'p2-0', placeId: null, conflictSummary: 'Trang thứ hai' })];
  mockList.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
  render(<OwnerTodoView />);
  const loadMoreBtn = await screen.findByRole('button', { name: 'Tải thêm' });

  fireEvent.click(loadMoreBtn);

  expect(await screen.findByText('Trang thứ hai')).toBeInTheDocument();
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(mockList).toHaveBeenLastCalledWith('tok', { limit: 200, offset: 200 });
  // Trang 2 chỉ có 1 dòng (< 200) -> hết, nút biến mất.
  expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
});

it('"Tải thêm" lỗi -> báo lỗi riêng, GIỮ NGUYÊN danh sách đã tải, nút quay lại trạng thái bấm được', async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => anItem({ id: `p1-${i}`, placeId: null }));
  mockList.mockResolvedValueOnce(page1).mockRejectedValueOnce(new Error('mạng lỗi'));
  render(<OwnerTodoView />);
  const loadMoreBtn = await screen.findByRole('button', { name: 'Tải thêm' });

  fireEvent.click(loadMoreBtn);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  // 200 dòng trang 1 vẫn còn nguyên — không bị thay bằng trạng thái lỗi toàn trang.
  expect(screen.getAllByText('Địa chỉ — nguồn không khớp')).toHaveLength(200);
  expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeEnabled();
});

it('hiển thị empty state khi không có việc nào đang chờ', async () => {
  mockList.mockResolvedValue([]);
  render(<OwnerTodoView />);
  expect(await screen.findByText('Không có việc nào đang chờ')).toBeInTheDocument();
});

it('403 → forbidden state, nêu đúng permission Place.Approve', async () => {
  mockList.mockRejectedValue(new ApiError('forbidden', 403));
  render(<OwnerTodoView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(screen.getByText('Place.Approve')).toBeInTheDocument();
});

it('401 (token hết hạn/không hợp lệ) → cũng forbidden state, KHÔNG rơi vào error state chung', async () => {
  mockList.mockRejectedValue(new ApiError('unauthorized', 401));
  render(<OwnerTodoView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(screen.queryByText('Không tải được danh sách')).not.toBeInTheDocument();
});

it('lỗi server → error state + retry gọi lại API', async () => {
  mockList
    .mockRejectedValueOnce(new ApiError('boom', 500))
    .mockResolvedValueOnce([anItem()]);
  render(<OwnerTodoView />);
  const retry = await screen.findByRole('button', { name: 'Thử lại' });
  fireEvent.click(retry);
  expect(await screen.findByText('Địa chỉ — nguồn không khớp')).toBeInTheDocument();
  expect(mockList).toHaveBeenCalledTimes(2);
});

it('chưa đăng nhập (không có session) -> forbidden state, KHÔNG gọi API', async () => {
  mockSession.mockReturnValue(null);
  render(<OwnerTodoView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(mockList).not.toHaveBeenCalled();
});

// 2026-10-22 (vá gap: trang trước đó chỉ ĐỌC hàng chờ — POST /owner-decisions/:id/resolve|withdraw
// tồn tại từ 2026-09-18 nhưng chưa từng được gọi ở web, không có cách nào đóng một mục).
describe('Đánh dấu đã xử lý / Rút lại', () => {
  it('bấm "Đánh dấu đã xử lý" rồi xác nhận -> gọi API đúng id/action/note, bỏ dòng khỏi danh sách', async () => {
    mockList.mockResolvedValue([anItem()]);
    mockResolve.mockResolvedValue(anItem({ status: 'resolved' }));
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));
    fireEvent.change(screen.getByLabelText('Đã xử lý bằng cách nào?'), { target: { value: 'use_source_b' } });
    fireEvent.change(screen.getByLabelText('Ghi chú (tuỳ chọn)'), { target: { value: 'Đã xác nhận qua điện thoại' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã xử lý' }));

    await waitFor(() =>
      expect(mockResolve).toHaveBeenCalledWith('i1', { action: 'use_source_b', note: 'Đã xác nhận qua điện thoại' }, 'tok'),
    );
    await waitFor(() => expect(screen.queryByText('Địa chỉ — nguồn không khớp')).not.toBeInTheDocument());
  });

  it('xác nhận đã xử lý không nhập ghi chú -> note gửi undefined, không phải chuỗi rỗng', async () => {
    mockList.mockResolvedValue([anItem()]);
    mockResolve.mockResolvedValue(anItem({ status: 'resolved' }));
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã xử lý' }));

    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('i1', { action: 'use_source_a', note: undefined }, 'tok'));
  });

  it('bấm "Rút lại / Bỏ qua" mà không nhập lý do -> báo lỗi tại chỗ, KHÔNG gọi API', async () => {
    mockList.mockResolvedValue([anItem()]);
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Rút lại / Bỏ qua' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận rút lại' }));

    expect(await screen.findByText('Cần nhập lý do trước khi rút lại.')).toBeInTheDocument();
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('rút lại kèm lý do -> gọi API đúng id/reason, bỏ dòng khỏi danh sách', async () => {
    mockList.mockResolvedValue([anItem()]);
    mockWithdraw.mockResolvedValue(anItem({ status: 'withdrawn' }));
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Rút lại / Bỏ qua' }));
    fireEvent.change(screen.getByLabelText('Lý do rút lại / bỏ qua'), { target: { value: 'Đã xoá địa điểm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận rút lại' }));

    await waitFor(() => expect(mockWithdraw).toHaveBeenCalledWith('i1', 'Đã xoá địa điểm', 'tok'));
    await waitFor(() => expect(screen.queryByText('Địa chỉ — nguồn không khớp')).not.toBeInTheDocument());
  });

  it('lỗi khi xử lý -> báo lỗi tại chỗ, GIỮ NGUYÊN dòng trong danh sách', async () => {
    mockList.mockResolvedValue([anItem()]);
    mockResolve.mockRejectedValue(new ApiError('conflict', 409));
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã xử lý' }));

    expect(await screen.findByText('conflict')).toBeInTheDocument();
    expect(screen.getByText('Địa chỉ — nguồn không khớp')).toBeInTheDocument();
  });

  it('bấm "Huỷ" trong form đang xử lý -> quay lại hai nút ban đầu, không gọi API', async () => {
    mockList.mockResolvedValue([anItem()]);
    render(<OwnerTodoView />);
    await screen.findByText('Địa chỉ — nguồn không khớp');

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rút lại / Bỏ qua' })).toBeInTheDocument();
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
