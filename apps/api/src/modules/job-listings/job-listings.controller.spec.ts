import { JobListingsController } from './job-listings.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Controller mỏng — chỉ uỷ quyền đúng tham số xuống service. Giá trị kiểm thử ở đây là đúng
// user.sub được trích ra cho ownership, và đúng route nào gọi hàm service nào (dễ lẫn vì
// create/update/submit/close/reopen/decide đều POST/PATCH với cùng id).
describe('JobListingsController', () => {
  type Ctor = ConstructorParameters<typeof JobListingsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: JobListingsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      listPublic: jest.fn(),
      getPublicById: jest.fn(),
      listMine: jest.fn(),
      getMine: jest.fn(),
      listPending: jest.fn(),
      listAllForAdmin: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      submit: jest.fn(),
      close: jest.fn(),
      reopen: jest.fn(),
      decide: jest.fn(),
    });
    controller = new JobListingsController(service);
  });

  it('list/getById: công khai, không đụng user', () => {
    controller.list({});
    expect(service.listPublic).toHaveBeenCalledWith({});
    controller.getById('job-1', {});
    expect(service.getPublicById).toHaveBeenCalledWith('job-1', undefined);
  });

  // Gói C (17/10/2026) — `?locale=en` chuyển thẳng xuống service, không diễn giải gì ở controller.
  it('getById: chuyển đúng locale xuống service', () => {
    controller.getById('job-1', { locale: 'en' });
    expect(service.getPublicById).toHaveBeenCalledWith('job-1', 'en');
  });

  it('listMine/getMine: dùng user.sub, không phải object user nguyên', () => {
    controller.listMine(user);
    expect(service.listMine).toHaveBeenCalledWith('u1');
    controller.getMine('job-1', user);
    expect(service.getMine).toHaveBeenCalledWith('job-1', 'u1');
  });

  it('create/update/submit: gắn user.sub làm actor', () => {
    const dto = { employer_name: 'E' } as never;
    controller.create(dto, user);
    expect(service.create).toHaveBeenCalledWith(dto, 'u1');
    controller.update('job-1', dto, user);
    expect(service.update).toHaveBeenCalledWith('job-1', dto, 'u1');
    controller.submit('job-1', user);
    expect(service.submit).toHaveBeenCalledWith('job-1', 'u1');
  });

  it('close/reopen: chỉ id + user.sub (quyết định sở hữu-hoặc-moderator nằm trong service)', () => {
    controller.close('job-1', user);
    expect(service.close).toHaveBeenCalledWith('job-1', 'u1');
    controller.reopen('job-1', user);
    expect(service.reopen).toHaveBeenCalledWith('job-1', 'u1');
  });

  it('decide: id + dto + user.sub làm reviewer', () => {
    const dto = { decision: 'approve' as const };
    controller.decide('job-1', dto, user);
    expect(service.decide).toHaveBeenCalledWith('job-1', dto, 'u1');
  });

  it('listPending: không tham số (service tự lọc PENDING)', () => {
    controller.listPending();
    expect(service.listPending).toHaveBeenCalledWith();
  });

  // Gói B (17/10/2026) — route riêng, KHÔNG dùng chung với listPending (hàng chờ duyệt KHÔNG phải
  // màn hình quản lý tổng thể). Chuyển thẳng query xuống service (DTO đã validate hình dạng).
  it('listAllForAdmin: chuyển thẳng query xuống service', () => {
    const query = { created_by: 'owner-1' };
    controller.listAllForAdmin(query);
    expect(service.listAllForAdmin).toHaveBeenCalledWith(query);
  });
});
