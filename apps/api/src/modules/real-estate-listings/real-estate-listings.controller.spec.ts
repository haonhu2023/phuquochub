import { RealEstateListingsController } from './real-estate-listings.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('RealEstateListingsController', () => {
  type Ctor = ConstructorParameters<typeof RealEstateListingsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: RealEstateListingsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      listPublic: jest.fn(),
      getPublicById: jest.fn(),
      listMine: jest.fn(),
      getMine: jest.fn(),
      listPending: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      submit: jest.fn(),
      close: jest.fn(),
      reopen: jest.fn(),
      markRented: jest.fn(),
      markSold: jest.fn(),
      markAvailable: jest.fn(),
      decide: jest.fn(),
    });
    controller = new RealEstateListingsController(service);
  });

  it('list/getById: công khai, không đụng user', () => {
    controller.list({});
    expect(service.listPublic).toHaveBeenCalledWith({});
    controller.getById('rel-1');
    expect(service.getPublicById).toHaveBeenCalledWith('rel-1');
  });

  it('listMine/getMine: dùng user.sub', () => {
    controller.listMine(user);
    expect(service.listMine).toHaveBeenCalledWith('u1');
    controller.getMine('rel-1', user);
    expect(service.getMine).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('create/update/submit: gắn user.sub làm actor', () => {
    const dto = { title: 'T' } as never;
    controller.create(dto, user);
    expect(service.create).toHaveBeenCalledWith(dto, 'u1');
    controller.update('rel-1', dto, user);
    expect(service.update).toHaveBeenCalledWith('rel-1', dto, 'u1');
    controller.submit('rel-1', user);
    expect(service.submit).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('close/reopen/mark-*: chỉ id + user.sub (quyết định sở hữu-hoặc-moderator nằm trong service)', () => {
    controller.close('rel-1', user);
    expect(service.close).toHaveBeenCalledWith('rel-1', 'u1');
    controller.reopen('rel-1', user);
    expect(service.reopen).toHaveBeenCalledWith('rel-1', 'u1');
    controller.markRented('rel-1', user);
    expect(service.markRented).toHaveBeenCalledWith('rel-1', 'u1');
    controller.markSold('rel-1', user);
    expect(service.markSold).toHaveBeenCalledWith('rel-1', 'u1');
    controller.markAvailable('rel-1', user);
    expect(service.markAvailable).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('decide: id + dto + user.sub làm reviewer', () => {
    const dto = { decision: 'approve' as const };
    controller.decide('rel-1', dto, user);
    expect(service.decide).toHaveBeenCalledWith('rel-1', dto, 'u1');
  });

  it('listPending: không tham số', () => {
    controller.listPending();
    expect(service.listPending).toHaveBeenCalledWith();
  });
});
