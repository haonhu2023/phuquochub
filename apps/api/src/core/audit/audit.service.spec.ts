import { AuditService } from './audit.service';
import { AuditResult } from './audit.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('AuditService', () => {
  let repo: LooseMock<ConstructorParameters<typeof AuditService>[0]>;
  let service: AuditService;

  beforeEach(() => {
    repo = createMock<ConstructorParameters<typeof AuditService>[0]>({ insert: jest.fn() });
    service = new AuditService(repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('record: điền default (is_service_account=false, result=success) + map field nullable', async () => {
    await service.record({
      event: 'role.assigned',
      entityType: 'user',
      entityId: 'u1',
      actorId: 'admin',
      permission: 'Role.Assign',
      context: { role_id: 'r1' },
    });

    expect(repo.insert).toHaveBeenCalledTimes(1);
    const arg = repo.insert.mock.calls[0][0];
    expect(arg).toMatchObject({
      event: 'role.assigned',
      entityType: 'user',
      entityId: 'u1',
      actorId: 'admin',
      permission: 'Role.Assign',
      isServiceAccount: false,
      result: AuditResult.SUCCESS,
      scope: null,
      ip: null,
      userAgent: null,
      correlationId: null,
    });
    expect(arg.context).toEqual({ role_id: 'r1' });
  });

  it('redact: che khóa nhạy cảm trong snapshot (đệ quy) trước khi ghi', async () => {
    await service.record({
      event: 'user.updated',
      entityType: 'user',
      before: { email: 'a@b.c', password_hash: 'h', nested: { refresh_token: 't' } },
    });
    const arg = repo.insert.mock.calls[0][0];
    expect(arg.before).toEqual({
      email: 'a@b.c',
      password_hash: '[REDACTED]',
      nested: { refresh_token: '[REDACTED]' },
    });
  });

  it('redact: scalar/null giữ nguyên (undefined → null)', () => {
    expect(service.redact(undefined)).toBeNull();
    expect(service.redact('x')).toBe('x');
    expect(service.redact(5)).toBe(5);
  });
});
