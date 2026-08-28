import { RestaurantsController } from './restaurants.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Public Beta price trust gate (2026-08-28): controller mỏng (chỉ uỷ quyền, cùng quy ước
// PlacesController) — giá trị kiểm thử ở đây là ĐÚNG tham số `{ publicResponse: true }` được
// truyền xuống service từ route công khai, khớp đúng ranh giới bảo mật thật sự nằm ở
// RestaurantsService.getMenu()/mapItem().
describe('RestaurantsController — ranh giới price trust gate', () => {
  type Ctor = ConstructorParameters<typeof RestaurantsController>;
  let restaurantsService: LooseMock<Ctor[0]>;
  let controller: RestaurantsController;

  beforeEach(() => {
    restaurantsService = createMock<Ctor[0]>({
      list: jest.fn(),
      getMenu: jest.fn(),
      updateMenu: jest.fn(),
      getBySlug: jest.fn(),
    });
    controller = new RestaurantsController(restaurantsService);
  });

  it('GET :id/menu (@Public()) → getMenu(id, { publicResponse: true })', () => {
    controller.getMenu('r1');
    expect(restaurantsService.getMenu).toHaveBeenCalledWith('r1', { publicResponse: true });
  });

  it('PATCH :id/menu (đặc quyền) → updateMenu(id, dto) KHÔNG truyền publicResponse (actor xem giá thật vừa lưu)', () => {
    const dto = { sections: [] } as Parameters<typeof controller.updateMenu>[1];
    controller.updateMenu('r1', dto);
    expect(restaurantsService.updateMenu).toHaveBeenCalledWith('r1', dto);
  });
});
