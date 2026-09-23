import { HotelsController } from './hotels.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Public Beta price trust gate (2026-08-28): controller mỏng (chỉ uỷ quyền) — giá trị kiểm thử ở
// đây là ĐÚNG tham số `{ publicResponse: true }` được truyền xuống service từ route công khai,
// khớp đúng ranh giới bảo mật thật sự nằm ở HotelsService.listRooms()/mapRoom().
describe('HotelsController — ranh giới price trust gate', () => {
  type Ctor = ConstructorParameters<typeof HotelsController>;
  let hotelsService: LooseMock<Ctor[0]>;
  let controller: HotelsController;

  beforeEach(() => {
    hotelsService = createMock<Ctor[0]>({
      list: jest.fn(),
      listRooms: jest.fn(),
      updateRooms: jest.fn(),
      listAmenities: jest.fn(),
      getBySlug: jest.fn(),
    });
    controller = new HotelsController(hotelsService);
  });

  it('GET :id/rooms (@Public()) → listRooms(id, { publicResponse: true })', () => {
    controller.listRooms('h1');
    expect(hotelsService.listRooms).toHaveBeenCalledWith('h1', { publicResponse: true });
  });

  it('PATCH :id/rooms (đặc quyền) → updateRooms(id, dto) KHÔNG truyền publicResponse (actor xem giá thật vừa lưu)', () => {
    const dto = { rooms: [] } as Parameters<typeof controller.updateRooms>[1];
    controller.updateRooms('h1', dto);
    expect(hotelsService.updateRooms).toHaveBeenCalledWith('h1', dto);
  });
});

// 2026-09 locale forwarding fix: GET :slug trước đây không đọc @Query() nào cả, nên `?locale=`
// luôn bị bỏ qua ở chính tầng controller này — regression guard ở đúng ranh giới đó.
describe('HotelsController — GET :slug forward đúng ?locale=', () => {
  type Ctor = ConstructorParameters<typeof HotelsController>;
  let hotelsService: LooseMock<Ctor[0]>;
  let controller: HotelsController;

  beforeEach(() => {
    hotelsService = createMock<Ctor[0]>({ getBySlug: jest.fn() });
    controller = new HotelsController(hotelsService);
  });

  it('?locale=en → getBySlug(slug, "en")', () => {
    controller.get('la-veranda-resort', { locale: 'en' });
    expect(hotelsService.getBySlug).toHaveBeenCalledWith('la-veranda-resort', 'en');
  });

  it('?locale=vi → getBySlug(slug, "vi")', () => {
    controller.get('la-veranda-resort', { locale: 'vi' });
    expect(hotelsService.getBySlug).toHaveBeenCalledWith('la-veranda-resort', 'vi');
  });

  it('không truyền locale → getBySlug(slug, undefined) — hành vi mặc định giữ nguyên, PlacesService tự resolve', () => {
    controller.get('la-veranda-resort', {});
    expect(hotelsService.getBySlug).toHaveBeenCalledWith('la-veranda-resort', undefined);
  });
});
