/** @jest-environment jsdom */
import { render } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import GlobalError from './global-error';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

// PLACE-041 + 2026-10-22 (error-tracking gap) — boundary gốc, chỉ kích hoạt khi lỗi xảy ra trong
// chính root layout (hiếm). Kiểm riêng vì không dùng chung useLogError() (xem ghi chú trong file).
describe('GlobalError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('báo lỗi cho Sentry.captureException() — an toàn no-op nếu SENTRY_DSN chưa cấu hình', () => {
    const error = Object.assign(new Error('root layout boom'), { digest: 'xyz789' });

    render(<GlobalError error={error} reset={() => {}} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
