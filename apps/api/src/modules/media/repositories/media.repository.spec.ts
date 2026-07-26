import { Repository } from 'typeorm';
import { MediaRepository } from './media.repository';
import { Media } from '../entities/media.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('MediaRepository.attachToReview', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  it('mediaIds rỗng → không gọi DB', async () => {
    await sut.attachToReview([], 'r1', 'u1');
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('chỉ gắn media MỒ CÔI của đúng người upload (chặn chiếm dụng media người khác)', async () => {
    repo.query.mockResolvedValue(undefined);

    await sut.attachToReview(['m1', 'm2'], 'r1', 'u1');

    const [query, params] = repo.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('uploaded_by = $3');
    expect(q).toContain('place_id IS NULL');
    expect(q).toContain('review_id IS NULL');
    expect(q).toContain('post_id IS NULL');
    expect(q).toContain('business_id IS NULL');
    expect(q).toContain('event_id IS NULL');
    expect(params).toEqual(['r1', ['m1', 'm2'], 'u1']);
  });
});
