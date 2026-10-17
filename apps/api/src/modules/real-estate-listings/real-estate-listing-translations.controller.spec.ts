import { RealEstateListingTranslationsController } from './real-estate-listing-translations.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('RealEstateListingTranslationsController', () => {
  type Ctor = ConstructorParameters<typeof RealEstateListingTranslationsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: RealEstateListingTranslationsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      listPending: jest.fn(),
      getMine: jest.fn(),
      save: jest.fn(),
      submit: jest.fn(),
      decide: jest.fn(),
    });
    controller = new RealEstateListingTranslationsController(service);
  });

  it('listPending: không tham số', () => {
    controller.listPending();
    expect(service.listPending).toHaveBeenCalledWith();
  });

  it('getMine: dùng user.sub', () => {
    controller.getMine('rel-1', user);
    expect(service.getMine).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('save/submit: gắn user.sub làm actor', () => {
    const dto = { title: 'EN title' };
    controller.save('rel-1', dto, user);
    expect(service.save).toHaveBeenCalledWith('rel-1', dto, 'u1');
    controller.submit('rel-1', user);
    expect(service.submit).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('decide: id + dto + user.sub làm reviewer', () => {
    const dto = { decision: 'approve' as const };
    controller.decide('rel-1', dto, user);
    expect(service.decide).toHaveBeenCalledWith('rel-1', dto, 'u1');
  });
});
