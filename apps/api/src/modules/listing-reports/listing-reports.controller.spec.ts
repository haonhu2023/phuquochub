import { ListingReportsController } from './listing-reports.controller';
import { ListableTargetType } from '../../common/listable-target-type.enum';
import { ListingReportReason } from './listing-reports.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('ListingReportsController', () => {
  type Ctor = ConstructorParameters<typeof ListingReportsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: ListingReportsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({ create: jest.fn(), listPending: jest.fn(), resolve: jest.fn() });
    controller = new ListingReportsController(service);
  });

  it('create: gắn user.sub làm reporter', () => {
    const dto = { target_type: ListableTargetType.JOB_LISTING, target_id: 'job-1', reason: ListingReportReason.SPAM };
    controller.create(dto, user);
    expect(service.create).toHaveBeenCalledWith('u1', dto);
  });

  it('listPending: dùng user.sub (lọc theo quyền nằm trong service)', () => {
    controller.listPending(user);
    expect(service.listPending).toHaveBeenCalledWith('u1');
  });

  it('resolve: id + dto + user.sub làm resolver', () => {
    const dto = { decision: 'resolved' as const };
    controller.resolve('lr-1', dto, user);
    expect(service.resolve).toHaveBeenCalledWith('lr-1', dto, 'u1');
  });
});
