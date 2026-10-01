import { BeachesController } from './beaches.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('BeachesController', () => {
  type Ctor = ConstructorParameters<typeof BeachesController>;
  let beachesService: LooseMock<Ctor[0]>;
  let controller: BeachesController;

  beforeEach(() => {
    beachesService = createMock<Ctor[0]>({ list: jest.fn(), getBySlug: jest.fn(), updateDetails: jest.fn() });
    controller = new BeachesController(beachesService);
  });

  it('GET / (@Public()) → list(query)', () => {
    controller.list({});
    expect(beachesService.list).toHaveBeenCalledWith({});
  });

  it('GET :slug (@Public()) → getBySlug(slug, locale)', () => {
    controller.get('bai-sao', { locale: 'en' });
    expect(beachesService.getBySlug).toHaveBeenCalledWith('bai-sao', 'en');
  });

  it('PATCH :id/details KHÔNG công khai, yêu cầu Place.Edit.Managed', () => {
    const handler = BeachesController.prototype.updateDetails;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).not.toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['Place.Edit.Managed']);
  });

  it('PATCH :id/details → updateDetails(id, dto, user.sub)', () => {
    const dto = { access_route: 'Theo đường ven biển' };
    controller.updateDetails('b1', dto, { sub: 'u1' } as Parameters<typeof controller.updateDetails>[2]);
    expect(beachesService.updateDetails).toHaveBeenCalledWith('b1', dto, 'u1');
  });
});
