/** @jest-environment jsdom */
import { render } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { renderHook } from '@testing-library/react';
import { useLogError } from './ErrorRetryState';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/LocaleContext', () => ({ useLocale: () => 'vi' }));

// 2026-10-22 (error-tracking gap, production review) — `useLogError` là điểm DUY NHẤT mọi
// error.tsx (public + dashboard, >20 file) gọi tới để ghi log lỗi render. Kiểm MỘT lần ở đây phủ
// toàn bộ, cùng lý do search/error.spec.tsx không lặp lại việc kiểm UI cho từng route.
describe('useLogError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('báo lỗi cho Sentry.captureException() — an toàn no-op nếu SENTRY_DSN chưa cấu hình', () => {
    const error = Object.assign(new Error('render boom'), { digest: 'abc123' });

    renderHook(() => useLogError(error));

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('không ném lỗi khi gọi dù error.digest vắng mặt', () => {
    const noDigest = new Error('lỗi không có digest');
    expect(() => render(<HookHarness error={noDigest} />)).not.toThrow();
  });
});

function HookHarness({ error }: { error: Error & { digest?: string } }) {
  useLogError(error);
  return null;
}
