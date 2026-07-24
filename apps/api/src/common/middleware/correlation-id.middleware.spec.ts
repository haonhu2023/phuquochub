import {
  CORRELATION_ID_HEADER,
  correlationIdMiddleware,
  getCorrelationId,
  RequestWithCorrelationId,
} from './correlation-id.middleware';

function makeReq(headerValue?: string): { header: jest.Mock } {
  return { header: jest.fn().mockReturnValue(headerValue) };
}

function makeRes(): { setHeader: jest.Mock } {
  return { setHeader: jest.fn() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('correlationIdMiddleware', () => {
  it('sinh một ID mới (UUID) khi request không có header đến', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();

    correlationIdMiddleware(req as never, res as never, next);

    const id = (req as unknown as RequestWithCorrelationId).correlationId;
    expect(id).toMatch(UUID_RE);
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('giữ nguyên ID hợp lệ đến từ client', () => {
    const req = makeReq('client-supplied-id-123');
    const res = makeRes();
    const next = jest.fn();

    correlationIdMiddleware(req as never, res as never, next);

    expect((req as unknown as RequestWithCorrelationId).correlationId).toBe(
      'client-supplied-id-123',
    );
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'client-supplied-id-123');
  });

  it('bỏ qua và sinh ID mới khi giá trị đến từ client không hợp lệ (ký tự nguy hiểm)', () => {
    const req = makeReq('bad\r\nvalue with spaces and injection\nattempt');
    const res = makeRes();
    const next = jest.fn();

    correlationIdMiddleware(req as never, res as never, next);

    const id = (req as unknown as RequestWithCorrelationId).correlationId;
    expect(id).toMatch(UUID_RE);
    expect(id).not.toContain('\r');
    expect(id).not.toContain('\n');
  });

  it('bỏ qua và sinh ID mới khi giá trị đến từ client quá dài', () => {
    const req = makeReq('a'.repeat(200));
    const res = makeRes();
    const next = jest.fn();

    correlationIdMiddleware(req as never, res as never, next);

    const id = (req as unknown as RequestWithCorrelationId).correlationId;
    expect(id).toMatch(UUID_RE);
  });

  it('mỗi lần gọi sinh một ID khác nhau (không phải state toàn cục cố định)', () => {
    const req1 = makeReq(undefined);
    const req2 = makeReq(undefined);
    correlationIdMiddleware(req1 as never, makeRes() as never, jest.fn());
    correlationIdMiddleware(req2 as never, makeRes() as never, jest.fn());

    const id1 = (req1 as unknown as RequestWithCorrelationId).correlationId;
    const id2 = (req2 as unknown as RequestWithCorrelationId).correlationId;
    expect(id1).not.toBe(id2);
  });
});

describe('getCorrelationId', () => {
  it('đọc lại đúng ID đã gắn bởi middleware', () => {
    const req = { correlationId: 'abc-123' } as unknown as RequestWithCorrelationId;
    expect(getCorrelationId(req)).toBe('abc-123');
  });

  it('trả về "unknown" khi middleware chưa chạy (không throw)', () => {
    const req = {} as never;
    expect(getCorrelationId(req)).toBe('unknown');
  });
});
