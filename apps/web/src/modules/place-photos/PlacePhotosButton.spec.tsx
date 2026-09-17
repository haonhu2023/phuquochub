/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlacePhotosButton } from './PlacePhotosButton';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';

jest.mock('@/modules/auth/AuthProvider');
jest.mock('@/modules/auth/session');
jest.mock('@/modules/auth/api/me.api');
// PlacePhotosManager có luồng tải/duyệt/sắp xếp/đặt bìa riêng, đã kiểm thử đầy đủ ở
// PhotosView.spec.tsx (dùng chung component) — ở đây chỉ kiểm tra nút/drawer TỰ GATE đúng theo
// đăng nhập/năng lực, không lặp lại toàn bộ hành vi bên trong.
jest.mock('./PlacePhotosManager', () => ({
  PlacePhotosManager: ({ placeId }: { placeId: string }) => <div data-testid="manager">manager:{placeId}</div>,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockReadSession = readSession as jest.MockedFunction<typeof readSession>;
const mockFetchCapabilities = fetchCapabilities as jest.MockedFunction<typeof fetchCapabilities>;

const SESSION = {
  accessToken: 'token-abc',
  refreshToken: 'refresh-abc',
  expiresAt: Date.now() + 900_000,
  user: { id: 'u1', email: 'owner@phuquochub.com', displayName: 'Owner', avatarUrl: null },
};

const EDITORIAL_CAPS: UserCapabilities = {
  canEditorial: true,
  canModerate: false,
  canReviewTranslations: true,
  canSelfApproveOwnMedia: true,
};

function authed() {
  mockUseAuth.mockReturnValue({
    user: SESSION.user,
    initializing: false,
    isAuthenticated: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  });
  mockReadSession.mockReturnValue(SESSION);
}

describe('PlacePhotosButton — nút 📷 Quản lý ảnh + drawer (content_owner)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chưa đăng nhập -> KHÔNG render gì (không nút, không drawer)', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      initializing: false,
      isAuthenticated: false,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    });

    const { container } = render(<PlacePhotosButton placeId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('đang khởi tạo phiên (initializing) -> KHÔNG render gì', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      initializing: true,
      isAuthenticated: false,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    });

    const { container } = render(<PlacePhotosButton placeId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('đã đăng nhập nhưng KHÔNG có canEditorial (vd member thường) -> KHÔNG render nút', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(NO_CAPABILITIES);

    const { container } = render(<PlacePhotosButton placeId="p1" />);

    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('content_owner (canEditorial=true) -> HIỆN nút "📷 Quản lý ảnh", ngay cả trước khi biết gallery rỗng hay không', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);

    render(<PlacePhotosButton placeId="p1" />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '📷 Quản lý ảnh' })).toBeInTheDocument(),
    );
    // Drawer chưa mở -> PlacePhotosManager (và mọi lệnh gọi API bên trong nó) chưa được render.
    expect(screen.queryByTestId('manager')).not.toBeInTheDocument();
  });

  it('bấm nút -> mở drawer, render PlacePhotosManager đúng placeId', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);

    render(<PlacePhotosButton placeId="p42" />);
    fireEvent.click(await screen.findByRole('button', { name: '📷 Quản lý ảnh' }));

    expect(screen.getByRole('dialog', { name: 'Quản lý ảnh' })).toBeInTheDocument();
    expect(screen.getByTestId('manager')).toHaveTextContent('manager:p42');
  });

  it('bấm ✕ -> đóng drawer', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);

    render(<PlacePhotosButton placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '📷 Quản lý ảnh' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
