import { SavedItemsController } from './saved-items.controller';
import { SavedItemTargetType } from './saved-items.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('SavedItemsController', () => {
  type Ctor = ConstructorParameters<typeof SavedItemsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: SavedItemsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({ listMine: jest.fn(), save: jest.fn(), unsave: jest.fn() });
    controller = new SavedItemsController(service);
  });

  it('listMine: dùng user.sub', () => {
    controller.listMine(user);
    expect(service.listMine).toHaveBeenCalledWith('u1');
  });

  it('save: gắn user.sub làm actor, truyền đúng target_type/target_id', () => {
    controller.save({ target_type: SavedItemTargetType.JOB_LISTING, target_id: 'job-1' }, user);
    expect(service.save).toHaveBeenCalledWith('u1', SavedItemTargetType.JOB_LISTING, 'job-1');
  });

  it('unsave: lấy target_type/target_id từ path, user.sub làm actor', () => {
    controller.unsave(SavedItemTargetType.REAL_ESTATE_LISTING, 'rel-1', user);
    expect(service.unsave).toHaveBeenCalledWith('u1', SavedItemTargetType.REAL_ESTATE_LISTING, 'rel-1');
  });
});
