import { securityHeadersMiddleware } from './security-headers.middleware';

function makeRes(): { setHeader: jest.Mock } {
  return { setHeader: jest.fn() };
}

describe('securityHeadersMiddleware', () => {
  it('sets X-Content-Type-Options, X-Frame-Options, and Referrer-Policy', () => {
    const res = makeRes();
    const next = jest.fn();

    securityHeadersMiddleware({} as never, res as never, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not set Strict-Transport-Security (belongs at the reverse-proxy layer, not here)', () => {
    const res = makeRes();
    securityHeadersMiddleware({} as never, res as never, jest.fn());

    const calledHeaders = res.setHeader.mock.calls.map((call) => call[0]);
    expect(calledHeaders).not.toContain('Strict-Transport-Security');
  });
});
