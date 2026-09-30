import { AmenitiesController } from './amenities.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('AmenitiesController', () => {
  type Ctor = ConstructorParameters<typeof AmenitiesController>;
  let amenitiesService: LooseMock<Ctor[0]>;
  let controller: AmenitiesController;

  beforeEach(() => {
    amenitiesService = createMock<Ctor[0]>({ listAll: jest.fn(), listForPlace: jest.fn(), updateForPlace: jest.fn() });
    controller = new AmenitiesController(amenitiesService);
  });

  it('GET /amenities (@Public()) → listAll(group)', () => {
    controller.listAll('facility');
    expect(amenitiesService.listAll).toHaveBeenCalledWith('facility');
  });

  it('GET /places/:id/amenities (@Public()) → listForPlace(id)', () => {
    controller.listForPlace('p1');
    expect(amenitiesService.listForPlace).toHaveBeenCalledWith('p1');
  });

  it('PUT /places/:id/amenities (đặc quyền) → updateForPlace(id, amenity_codes, expected_content_version, user.sub)', () => {
    controller.updateForPlace(
      'p1',
      { amenity_codes: ['wifi', 'pool'], expected_content_version: 3 },
      { sub: 'u1' } as Parameters<typeof controller.updateForPlace>[2],
    );
    expect(amenitiesService.updateForPlace).toHaveBeenCalledWith('p1', ['wifi', 'pool'], 3, 'u1');
  });
});
