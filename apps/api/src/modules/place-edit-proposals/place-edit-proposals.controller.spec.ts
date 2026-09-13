import { HttpStatus } from '@nestjs/common';
import { PATH_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PlaceEditProposalsController } from './place-edit-proposals.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import type { AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof PlaceEditProposalsController>;
type Handler = keyof PlaceEditProposalsController;

function handlerOf(name: Handler): object {
  return PlaceEditProposalsController.prototype[name] as unknown as object;
}

function permissionsOf(name: Handler): string[] | undefined {
  return Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(name)) as string[] | undefined;
}

// Cùng khuôn places.controller.spec.ts — controller mỏng, giá trị kiểm thử nằm ở METADATA (nơi
// ranh giới bảo mật thực sự khai báo), cộng uỷ quyền xuống service.
describe('PlaceEditProposalsController — ranh giới quyền', () => {
  describe('@RequirePermissions()', () => {
    const EXPECTED: Array<[Handler, string]> = [
      ['submit', 'PlaceEditProposal.Create'],
      ['list', 'PlaceEditProposal.Moderate'],
      ['getById', 'PlaceEditProposal.Moderate'],
      ['decide', 'PlaceEditProposal.Moderate'],
    ];

    it.each(EXPECTED)(
      '`%s` yêu cầu đúng permission %s — người dùng thường (chỉ có PlaceEditProposal.Create) không tự duyệt được',
      (name, permission) => {
        expect(permissionsOf(name)).toEqual([permission]);
      },
    );

    it('submit và các route staff KHÔNG dùng chung một permission (member không thể gọi list/getById/decide)', () => {
      expect(permissionsOf('submit')).not.toEqual(permissionsOf('decide'));
    });
  });

  describe('mã trạng thái', () => {
    it("POST 'places/:id/edit-proposals' trả 201 CREATED", () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('submit'))).toBe(HttpStatus.CREATED);
    });
  });

  describe('đường dẫn route', () => {
    it("submit khai đúng 'places/:id/edit-proposals' (không phải PATCH /places/:id — không nới quyền PATCH hiện có)", () => {
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('submit'))).toBe('places/:id/edit-proposals');
    });

    it("list/getById/decide khai dưới 'place-edit-proposals' — tách biệt hoàn toàn khỏi PlacesController", () => {
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('list'))).toBe('place-edit-proposals');
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('getById'))).toBe('place-edit-proposals/:id');
      expect(Reflect.getMetadata(PATH_METADATA, handlerOf('decide'))).toBe('place-edit-proposals/:id/decide');
    });
  });

  describe('uỷ quyền xuống service', () => {
    let proposalsService: LooseMock<Ctor[0]>;
    let controller: PlaceEditProposalsController;
    const user: AuthPrincipal = { sub: 'u1', email: 'u1@example.com' };

    beforeEach(() => {
      proposalsService = createMock<Ctor[0]>({
        submit: jest.fn(),
        list: jest.fn(),
        getById: jest.fn(),
        decide: jest.fn(),
      });
      controller = new PlaceEditProposalsController(proposalsService);
    });

    afterEach(() => jest.clearAllMocks());

    it('submit → proposalsService.submit(id, dto, user.sub)', () => {
      const dto = { field_key: 'address', proposed_value: 'X', reason: 'lý do' } as never;
      controller.submit('p1', dto, user);
      expect(proposalsService.submit).toHaveBeenCalledWith('p1', dto, 'u1');
    });

    it('list → proposalsService.list({ status, placeId }) — snake_case query chuyển sang camelCase', () => {
      controller.list({ status: 'pending', place_id: 'p1' } as never);
      expect(proposalsService.list).toHaveBeenCalledWith({ status: 'pending', placeId: 'p1' });
    });

    it('getById → proposalsService.getById(id)', () => {
      controller.getById('proposal-1');
      expect(proposalsService.getById).toHaveBeenCalledWith('proposal-1');
    });

    it('decide → proposalsService.decide(id, dto, user.sub)', () => {
      const dto = { decision: 'approve' } as never;
      controller.decide('proposal-1', dto, user);
      expect(proposalsService.decide).toHaveBeenCalledWith('proposal-1', dto, 'u1');
    });
  });
});
