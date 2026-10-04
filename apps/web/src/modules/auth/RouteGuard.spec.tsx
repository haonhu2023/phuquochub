/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RouteGuard } from './RouteGuard';
import { useAuth } from './AuthProvider';

jest.mock('./AuthProvider');
const mockReplace = jest.fn();
let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function authValue(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    user: null,
    initializing: false,
    isAuthenticated: false,
    sessionExpired: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    ...overrides,
  };
}

describe('RouteGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the session-check state as busy for assistive tech while initializing', () => {
    mockUseAuth.mockReturnValue(authValue({ initializing: true }));
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    expect(screen.getByText('Đang kiểm tra phiên đăng nhập…').closest('main')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children once authenticated', () => {
    mockUseAuth.mockReturnValue(authValue({ isAuthenticated: true }));
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('keeps the query string in the login return path', () => {
    mockPathname = '/dashboard/places/edit-proposals';
    window.history.replaceState({}, '', '/dashboard/places/edit-proposals?place_id=abc&place_slug=x');
    mockUseAuth.mockReturnValue(authValue());
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    expect(mockReplace).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent('/dashboard/places/edit-proposals?place_id=abc&place_slug=x')}`,
    );
    window.history.replaceState({}, '', '/');
    mockPathname = '/dashboard';
  });

  it('encodes a pathname without query exactly once', () => {
    mockPathname = '/dashboard/places/edit-proposals';
    window.history.replaceState({}, '', '/dashboard/places/edit-proposals');
    mockUseAuth.mockReturnValue(authValue());
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    expect(mockReplace).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/dashboard/places/edit-proposals')}`);
    mockPathname = '/dashboard';
    window.history.replaceState({}, '', '/');
  });

  it('keeps Unicode query values intact with a single encoding round', () => {
    mockPathname = '/dashboard/places/edit-proposals';
    window.history.replaceState(
      {},
      '',
      '/dashboard/places/edit-proposals?place_id=abc&place_name=Novotel%20Ph%C3%BA%20Qu%E1%BB%91c%20Resort',
    );
    mockUseAuth.mockReturnValue(authValue());
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    const replaceArg = mockReplace.mock.calls[0][0] as string;
    const next = decodeURIComponent(replaceArg.replace('/login?next=', ''));
    // Một lần decode (đúng như login page làm với params.get) phải trả về đích dùng được:
    expect(next).toBe('/dashboard/places/edit-proposals?place_id=abc&place_name=Novotel+Ph%C3%BA+Qu%E1%BB%91c+Resort');
    // ...và parse lại phải cho đúng tên địa điểm có dấu, không còn chuỗi %XX thô:
    expect(new URL(next, 'http://x').searchParams.get('place_name')).toBe('Novotel Phú Quốc Resort');
    window.history.replaceState({}, '', '/');
    mockPathname = '/dashboard';
  });

  it('always produces an in-app return target', () => {
    mockPathname = '/dashboard/places/edit-proposals';
    window.history.replaceState({}, '', '/dashboard/places/edit-proposals?next=https://evil.example');
    mockUseAuth.mockReturnValue(authValue());
    render(
      <RouteGuard>
        <p>secret</p>
      </RouteGuard>,
    );
    const next = decodeURIComponent((mockReplace.mock.calls[0][0] as string).replace('/login?next=', ''));
    expect(next.startsWith('/dashboard/')).toBe(true);
    expect(next.startsWith('//')).toBe(false);
    window.history.replaceState({}, '', '/');
    mockPathname = '/dashboard';
  });
});
