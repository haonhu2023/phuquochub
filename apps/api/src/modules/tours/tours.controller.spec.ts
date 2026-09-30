import { ToursController } from './tours.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('ToursController', () => {
  type Ctor = ConstructorParameters<typeof ToursController>;
  let toursService: LooseMock<Ctor[0]>;
  let controller: ToursController;

  beforeEach(() => {
    toursService = createMock<Ctor[0]>({
      list: jest.fn(),
      create: jest.fn(),
      getItinerary: jest.fn(),
      getSchedule: jest.fn(),
      getBySlug: jest.fn(),
      updateDetails: jest.fn(),
      updateItinerary: jest.fn(),
    });
    controller = new ToursController(toursService);
  });

  it('PATCH :id/details KHÔNG công khai, yêu cầu Place.Edit.Managed', () => {
    const handler = ToursController.prototype.updateDetails;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).not.toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['Place.Edit.Managed']);
  });

  it('PATCH :id/details → updateDetails(id, dto, user.sub)', () => {
    const dto = { pickup_point: 'Cổng khách sạn' };
    controller.updateDetails('t1', dto, { sub: 'u1' } as Parameters<typeof controller.updateDetails>[2]);
    expect(toursService.updateDetails).toHaveBeenCalledWith('t1', dto, 'u1');
  });

  it('PUT :id/itinerary KHÔNG công khai, yêu cầu Place.Edit.Managed', () => {
    const handler = ToursController.prototype.updateItinerary;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).not.toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['Place.Edit.Managed']);
  });

  it('PUT :id/itinerary → updateItinerary(id, dto, user.sub)', () => {
    const dto = { stops: [{ name: 'Điểm 1' }] };
    controller.updateItinerary('t1', dto, { sub: 'u1' } as Parameters<typeof controller.updateItinerary>[2]);
    expect(toursService.updateItinerary).toHaveBeenCalledWith('t1', dto, 'u1');
  });
});
