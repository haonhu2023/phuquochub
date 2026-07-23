import { BadRequestException, NotFoundException } from '@nestjs/common';

// Mapper đã có test riêng (events.mapper.spec) → mock để test thuần logic service.
jest.mock('./events.mapper', () => ({ toEvent: (r: { id?: string }) => ({ id: r?.id, mapped: true }) }));

import { EventsService } from './events.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Event = peer entity (ADR-002). Mock repo (new + mock).
describe('EventsService', () => {
  let repo: LooseMock<ConstructorParameters<typeof EventsService>[0]>;
  let service: EventsService;

  beforeEach(() => {
    repo = createMock<ConstructorParameters<typeof EventsService>[0]>({
      listEvents: jest.fn(),
      count: jest.fn(),
      getBySlug: jest.fn(),
      calendar: jest.fn(),
      create: jest.fn(),
      existsBySlug: jest.fn(),
    });
    service = new EventsService(repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: paginate + map', async () => {
    repo.listEvents.mockResolvedValue([{ id: 'e1' }]);
    repo.count.mockResolvedValue(1);
    const res = await service.list();
    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toEqual({ id: 'e1', mapped: true });
  });

  it('getBySlug: không thấy → NotFound', async () => {
    repo.getBySlug.mockResolvedValue(null);
    await expect(service.getBySlug('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: start_at >= end_at → BadRequest', async () => {
    await expect(
      service.create(
        { title: 'E', start_at: '2026-08-02T00:00:00Z', end_at: '2026-08-01T00:00:00Z', timezone: 'Asia/Ho_Chi_Minh' } as Parameters<typeof service.create>[0],
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create: hợp lệ → tạo + trả event; slug tránh trùng', async () => {
    repo.existsBySlug.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // base trùng → tạo biến thể
    repo.create.mockResolvedValue(undefined);
    repo.getBySlug.mockResolvedValue({ id: 'e9' });

    const res = await service.create(
      { title: 'Hội chợ', start_at: '2026-08-01T00:00:00Z', end_at: '2026-08-02T00:00:00Z', timezone: 'Asia/Ho_Chi_Minh' } as Parameters<typeof service.create>[0],
      'u1',
    );

    expect(repo.existsBySlug).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalled();
    expect(res).toEqual({ id: 'e9', mapped: true });
  });
});
