import { JobListingTranslationsController } from './job-listing-translations.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('JobListingTranslationsController', () => {
  type Ctor = ConstructorParameters<typeof JobListingTranslationsController>;
  let service: LooseMock<Ctor[0]>;
  let controller: JobListingTranslationsController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      listPending: jest.fn(),
      getMine: jest.fn(),
      save: jest.fn(),
      submit: jest.fn(),
      decide: jest.fn(),
    });
    controller = new JobListingTranslationsController(service);
  });

  it('listPending: không tham số', () => {
    controller.listPending();
    expect(service.listPending).toHaveBeenCalledWith();
  });

  it('getMine: dùng user.sub, không phải object user nguyên', () => {
    controller.getMine('job-1', user);
    expect(service.getMine).toHaveBeenCalledWith('job-1', 'u1');
  });

  it('save/submit: gắn user.sub làm actor', () => {
    const dto = { title: 'EN title' };
    controller.save('job-1', dto, user);
    expect(service.save).toHaveBeenCalledWith('job-1', dto, 'u1');
    controller.submit('job-1', user);
    expect(service.submit).toHaveBeenCalledWith('job-1', 'u1');
  });

  it('decide: id + dto + user.sub làm reviewer', () => {
    const dto = { decision: 'approve' as const };
    controller.decide('job-1', dto, user);
    expect(service.decide).toHaveBeenCalledWith('job-1', dto, 'u1');
  });
});
