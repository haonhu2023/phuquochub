/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RouteGuard } from './RouteGuard';
import { useAuth } from './AuthProvider';

jest.mock('./AuthProvider');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/dashboard',
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function authValue(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    user: null,
    initializing: false,
    isAuthenticated: false,
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
});
