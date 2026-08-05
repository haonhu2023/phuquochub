import 'reflect-metadata';
import { AuthorizationContext } from './authorization-context.decorator';
import { AUTHZ_CONTEXT_KEY } from '../authorization-context';

describe('@AuthorizationContext (ADR-019 D4)', () => {
  it('ghi metadata đúng hình dạng options lên method', () => {
    class Controller {
      @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
      handler(): void {
        /* noop */
      }
    }

    const meta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller.prototype.handler);
    expect(meta).toEqual({ resourceType: 'place', resource: { from: 'param', name: 'id' } });
  });

  it('hỗ trợ khai báo mức class', () => {
    const opts = { resourceType: 'place', resource: { from: 'param' as const, name: 'id' } };

    @AuthorizationContext(opts)
    class Controller {
      handler(): void {
        /* noop */
      }
    }

    const meta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller);
    expect(meta).toEqual(opts);
  });

  it('metadata mức handler OVERRIDE metadata mức class (đúng ngữ nghĩa getAllAndOverride)', () => {
    const classOpts = { resourceType: 'place', resource: { from: 'param' as const, name: 'id' } };
    const handlerOpts = { resourceType: 'contact', resource: { from: 'param' as const, name: 'contactId' } };

    @AuthorizationContext(classOpts)
    class Controller {
      @AuthorizationContext(handlerOpts)
      handler(): void {
        /* noop */
      }
    }

    const handlerMeta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller.prototype.handler);
    const classMeta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller);
    // Bản thân reflect-metadata không "gộp" — đây là hành vi getAllAndOverride của guard (test
    // riêng ở permissions.guard.spec.ts); ở đây chỉ xác nhận cả hai tầng ghi ĐÚNG giá trị của
    // riêng chúng, không bị ghi đè lẫn nhau tại thời điểm decorate.
    expect(handlerMeta).toEqual(handlerOpts);
    expect(classMeta).toEqual(classOpts);
  });

  it('resolver là optional — không truyền vẫn hợp lệ (identity ngầm định ở guard)', () => {
    class Controller {
      @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
      handler(): void {
        /* noop */
      }
    }

    const meta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller.prototype.handler);
    expect(meta.resolver).toBeUndefined();
  });

  it('resource nguồn "principal" (route scope Own) được ghi đúng hình dạng', () => {
    class Controller {
      @AuthorizationContext({ resourceType: 'user', resource: { from: 'principal' } })
      handler(): void {
        /* noop */
      }
    }

    const meta = Reflect.getMetadata(AUTHZ_CONTEXT_KEY, Controller.prototype.handler);
    expect(meta).toEqual({ resourceType: 'user', resource: { from: 'principal' } });
  });
});
