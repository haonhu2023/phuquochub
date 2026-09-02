import { HttpStatus } from '@nestjs/common';
import { PATH_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { PlacesController } from './places.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import type { AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof PlacesController>;

// Controller mỏng (chỉ uỷ quyền) → giá trị kiểm thử nằm ở METADATA của decorator, nơi ranh
// giới bảo mật thực sự được khai báo. Khoá metadata lấy từ chính constant mà decorator export
// (IS_PUBLIC_KEY / PERMISSIONS_KEY), KHÔNG chép lại chuỗi: đổi tên khoá sẽ làm spec fail,
// chứ không lặng lẽ pass rỗng.
type Handler = keyof PlacesController;

function handlerOf(name: Handler): object {
  return PlacesController.prototype[name] as unknown as object;
}

function isPublic(name: Handler): boolean {
  return Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf(name)) === true;
}

function permissionsOf(name: Handler): string[] | undefined {
  return Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(name)) as string[] | undefined;
}

const READ_ROUTES: Handler[] = ['list', 'listRevisions', 'getBySlug'];
const WRITE_ROUTES: Handler[] = ['create', 'update', 'archive', 'approve'];
// PLACE-041: `mine` là route THỨ BA — không @Public (đòi hỏi đăng nhập, JwtAuthGuard chặn), nhưng
// cũng không mang @RequirePermissions tĩnh (nội dung tự lọc theo userId gọi, xem controller +
// permissions.guard.ts). Tách riêng khỏi READ_ROUTES/WRITE_ROUTES để không âm thầm nới lỏng ý
// nghĩa "route đọc là công khai" của READ_ROUTES.
const AUTHENTICATED_NO_STATIC_PERMISSION_ROUTES: Handler[] = ['listMine'];

describe('PlacesController — ranh giới công khai / đặc quyền', () => {
  describe('@Public()', () => {
    it.each(READ_ROUTES)('route đọc `%s` là công khai', (name) => {
      expect(isPublic(name)).toBe(true);
    });

    it.each(WRITE_ROUTES)('route ghi `%s` KHÔNG công khai', (name) => {
      expect(isPublic(name)).toBe(false);
    });

    it.each(AUTHENTICATED_NO_STATIC_PERMISSION_ROUTES)(
      '`%s` KHÔNG công khai (đòi hỏi đăng nhập qua JwtAuthGuard)',
      (name) => {
        expect(isPublic(name)).toBe(false);
      },
    );
  });

  describe('@RequirePermissions()', () => {
    // Giá trị kỳ vọng viết tường minh (không đọc lại từ chính controller) để lỗi gõ sai
    // permission ở production bị bắt, thay vì hai bên cùng sai mà vẫn khớp nhau.
    const EXPECTED: Array<[Handler, string]> = [
      ['create', 'Place.Create'],
      ['update', 'Place.Edit.Managed'],
      ['archive', 'Place.Archive'],
      ['approve', 'Place.Approve'],
    ];

    it.each(EXPECTED)('`%s` yêu cầu đúng permission %s', (name, permission) => {
      expect(permissionsOf(name)).toEqual([permission]);
    });

    it.each(READ_ROUTES)('route đọc `%s` không khai báo permission nào', (name) => {
      expect(permissionsOf(name)).toBeUndefined();
    });

    it.each(AUTHENTICATED_NO_STATIC_PERMISSION_ROUTES)(
      '`%s` không khai báo permission tĩnh nào (tự lọc theo userId gọi)',
      (name) => {
        expect(permissionsOf(name)).toBeUndefined();
      },
    );
  });

  describe('mã trạng thái & pipe', () => {
    it('POST / trả 201 CREATED', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('create'))).toBe(
        HttpStatus.CREATED,
      );
    });
  });

  describe('thứ tự route', () => {
    it("':id/revisions' được khai báo TRƯỚC ':slug'", () => {
      // Nest đăng ký route theo thứ tự khai báo method trên prototype, nên route 2 đoạn phải
      // đứng trước param 1 đoạn, nếu không ':slug' sẽ nuốt mất (comment tại controller:36-37).
      const methods = Object.getOwnPropertyNames(PlacesController.prototype);
      expect(methods.indexOf('listRevisions')).toBeLessThan(methods.indexOf('getBySlug'));

      // …và đúng là hai route đó tranh chấp cùng một tiền tố.
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('listRevisions'))).toBe(':id/revisions');
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('getBySlug'))).toBe(':slug');
    });

    it("'mine' được khai báo TRƯỚC ':slug' (PLACE-041 — nếu không, ':slug' sẽ nuốt '/places/mine')", () => {
      const methods = Object.getOwnPropertyNames(PlacesController.prototype);
      expect(methods.indexOf('listMine')).toBeLessThan(methods.indexOf('getBySlug'));
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('listMine'))).toBe('mine');
    });
  });

  describe('uỷ quyền xuống service', () => {
    let placesService: LooseMock<Ctor[0]>;
    let revisionsService: LooseMock<Ctor[1]>;
    let controller: PlacesController;
    const user: AuthPrincipal = { sub: 'u1', email: 'u1@example.com' };

    beforeEach(() => {
      placesService = createMock<Ctor[0]>({
        list: jest.fn(),
        listMine: jest.fn(),
        getBySlug: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        archive: jest.fn(),
        approve: jest.fn(),
      });
      revisionsService = createMock<Ctor[1]>({ listByPlace: jest.fn() });
      controller = new PlacesController(placesService, revisionsService);
    });

    afterEach(() => jest.clearAllMocks());

    it('list → placesService.list(query)', () => {
      const query = { page: 2 } as never;
      controller.list(query);
      expect(placesService.list).toHaveBeenCalledWith(query);
    });

    it('mine → placesService.listMine(user.sub)', () => {
      controller.listMine(user);
      expect(placesService.listMine).toHaveBeenCalledWith('u1');
    });

    it('listRevisions → revisionsService.listByPlace(id)', () => {
      controller.listRevisions('p1');
      expect(revisionsService.listByPlace).toHaveBeenCalledWith('p1');
    });

    it('getBySlug → placesService.getBySlug(slug, undefined) khi không truyền ?locale=', () => {
      controller.getBySlug('bai-sao', {});
      expect(placesService.getBySlug).toHaveBeenCalledWith('bai-sao', undefined);
    });

    // Public Place i18n Read Path (2026-09-02): controller chỉ chuyển tiếp `query.locale` —
    // mọi chuẩn hoá/validate/fallback thuộc về LocalesService, không lặp lại ở đây.
    it('getBySlug → placesService.getBySlug(slug, locale) khi có ?locale=', () => {
      controller.getBySlug('vinwonders-phu-quoc', { locale: 'en' });
      expect(placesService.getBySlug).toHaveBeenCalledWith('vinwonders-phu-quoc', 'en');
    });

    // Các route ghi phải truyền user.sub (id), KHÔNG phải cả principal — actor id đi thẳng vào
    // audit ADR-016 và created_by/updated_by.
    it('create → placesService.create(dto, user.sub)', () => {
      const dto = { name: 'Bãi Sao' } as never;
      controller.create(dto, user);
      expect(placesService.create).toHaveBeenCalledWith(dto, 'u1');
    });

    it('update → placesService.update(id, dto, user.sub)', () => {
      const dto = { name: 'Tên mới' } as never;
      controller.update('p1', dto, user);
      expect(placesService.update).toHaveBeenCalledWith('p1', dto, 'u1');
    });

    it('archive → placesService.archive(id, user.sub)', () => {
      controller.archive('p1', user);
      expect(placesService.archive).toHaveBeenCalledWith('p1', 'u1');
    });

    it('approve → placesService.approve(id, user.sub)', () => {
      controller.approve('p1', user);
      expect(placesService.approve).toHaveBeenCalledWith('p1', 'u1');
    });
  });
});
