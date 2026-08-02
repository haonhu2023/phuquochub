import { EntityManager, Repository } from 'typeorm';
import { MediaRepository } from './media.repository';
import { Media } from '../entities/media.entity';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('MediaRepository.attachAndPublish', () => {
  let sut: MediaRepository;

  beforeEach(() => {
    const repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  it('mediaIds rỗng → không gọi DB, trả về mảng rỗng', async () => {
    const manager = createMock<EntityManager>({ query: jest.fn() });
    const result = await sut.attachAndPublish(manager, [], 'r1', 'u1');
    expect(manager.query).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('UPDATE đủ 6 điều kiện D3 (object_key/uploaded_by/status/deleted_at/mồ côi), publish TRONG cùng câu SQL', async () => {
    // manager.query() cho UPDATE...RETURNING trả về TUPLE [rows, rowCount] (driver Postgres của
    // TypeORM, KHÁC INSERT trả rows trực tiếp) — xác nhận trực tiếp với Postgres thật (Phase 8),
    // không phải giả định. Mock phải phản ánh đúng hình dạng thật này.
    const manager = createMock<EntityManager>({
      query: jest.fn().mockResolvedValue([[{ id: 'm1' }, { id: 'm2' }], 2]),
    });

    const result = await sut.attachAndPublish(manager, ['m1', 'm2'], 'r1', 'u1');

    const [query, params] = manager.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain("SET review_id = $1, status = 'published'");
    expect(q).toContain('uploaded_by = $3');
    expect(q).toContain('object_key IS NOT NULL');
    expect(q).toContain("status = 'pending'");
    expect(q).toContain('deleted_at IS NULL');
    expect(q).toContain('review_id IS NULL');
    expect(q).toContain('place_id IS NULL');
    expect(q).toContain('post_id IS NULL');
    expect(q).toContain('business_id IS NULL');
    expect(q).toContain('event_id IS NULL');
    expect(q).toContain('RETURNING id');
    expect(params).toEqual(['r1', ['m1', 'm2'], 'u1']);
    expect(result).toEqual(['m1', 'm2']);
  });

  it('một phần media không đủ điều kiện → trả về DANH SÁCH ngắn hơn (caller tự so length, INV-14)', async () => {
    const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([[{ id: 'm1' }], 1]) });
    const result = await sut.attachAndPublish(manager, ['m1', 'm2'], 'r1', 'u1');
    expect(result).toEqual(['m1']); // chỉ 1/2 — caller (ReviewsRepository) phát hiện và rollback
  });
});

describe('MediaRepository.findByIdForUpdate / updateStatus', () => {
  it('findByIdForUpdate: đọc qua manager.getRepository(Media)', async () => {
    const inner = createMock<Repository<Media>>({ findOne: jest.fn().mockResolvedValue({ id: 'm1' }) });
    const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });
    const sut = new MediaRepository(createMock<Repository<Media>>());

    const result = await sut.findByIdForUpdate(manager, 'm1');

    expect(manager.getRepository).toHaveBeenCalledWith(Media);
    expect(inner.findOne).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(result).toEqual({ id: 'm1' });
  });

  it('updateStatus: ghi status qua manager, KHÔNG tự kiểm tra FSM', async () => {
    const inner = createMock<Repository<Media>>({ update: jest.fn() });
    const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });
    const sut = new MediaRepository(createMock<Repository<Media>>());

    await sut.updateStatus(manager, 'm1', MediaStatus.PUBLISHED);

    expect(inner.update).toHaveBeenCalledWith({ id: 'm1' }, { status: MediaStatus.PUBLISHED });
  });
});

// Media Upload Foundation (2026-07-30) — presign/register support methods.
describe('MediaRepository — Media Upload Foundation', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn(), findOne: jest.fn() });
    sut = new MediaRepository(repo);
  });

  describe('placeExists', () => {
    it('có dòng khớp (chưa xoá mềm) → true', async () => {
      repo.query.mockResolvedValue([{ '?column?': 1 }]);
      await expect(sut.placeExists('p1')).resolves.toBe(true);
      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('FROM places WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['p1']);
    });

    it('không có dòng khớp (không tồn tại hoặc đã xoá mềm) → false', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.placeExists('p1')).resolves.toBe(false);
    });
  });

  describe('findByUploaderAndChecksum', () => {
    it('tìm theo đúng uploaded_by + checksum_sha256, loại trừ đã xoá mềm', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1' });
      const res = await sut.findByUploaderAndChecksum('u1', 'a'.repeat(64));
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { uploadedBy: 'u1', checksumSha256: 'a'.repeat(64), deletedAt: expect.anything() },
      });
      expect(res).toEqual({ id: 'm1' });
    });

    it('không tìm thấy → null', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(sut.findByUploaderAndChecksum('u1', 'a'.repeat(64))).resolves.toBeNull();
    });
  });

  describe('createUploaded', () => {
    it('luôn tạo với type=image, provider=upload, status=pending, url=null (không bao giờ lưu URL)', async () => {
      const created = { id: 'm1' };
      const mediaTypeRepo = createMock<Repository<Media>>({
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockResolvedValue(created),
      });
      const manager = createMock<EntityManager>({
        getRepository: jest.fn().mockReturnValue(mediaTypeRepo),
      });

      const res = await sut.createUploaded(manager, {
        objectKey: 'media/abc.jpg',
        bucket: 'phuquochub-test',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        checksumSha256: 'a'.repeat(64),
        uploadedBy: 'u1',
        placeId: 'p1',
        caption: 'a caption',
        altText: null,
      });

      expect(mediaTypeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaType.IMAGE,
          url: null,
          provider: MediaProvider.UPLOAD,
          status: MediaStatus.PENDING,
          objectKey: 'media/abc.jpg',
          bucket: 'phuquochub-test',
          contentType: 'image/jpeg',
          sizeBytes: 1000,
          checksumSha256: 'a'.repeat(64),
          uploadedBy: 'u1',
          placeId: 'p1',
          caption: 'a caption',
          altText: null,
        }),
      );
      expect(res).toEqual(created);
    });
  });
});

// Media Orphan Cleanup (2026-08-02).
describe('MediaRepository — Media Orphan Cleanup', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  describe('findOrphanCleanupCandidates', () => {
    it('truy vấn đủ 7 điều kiện đủ điều kiện dọn dẹp + LIMIT + ORDER BY created_at ASC, id ASC', async () => {
      repo.query.mockResolvedValue([]);
      await sut.findOrphanCleanupCandidates(100);

      const [query, params] = repo.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("status = 'pending'");
      expect(q).toContain('place_id IS NULL');
      expect(q).toContain('review_id IS NULL');
      expect(q).toContain('post_id IS NULL');
      expect(q).toContain('business_id IS NULL');
      expect(q).toContain('event_id IS NULL');
      expect(q).toContain('deleted_at IS NULL');
      expect(q).toContain("created_at < now() - interval '24 hours'");
      expect(q).toContain('ORDER BY created_at ASC, id ASC');
      expect(q).toContain('LIMIT $1');
      expect(q).toContain('created_at::text AS created_at_text');
      expect(params).toEqual([100]);
    });

    it('không có con trỏ → KHÔNG thêm điều kiện keyset', async () => {
      repo.query.mockResolvedValue([]);
      await sut.findOrphanCleanupCandidates(100);
      const [query] = repo.query.mock.calls[0];
      expect(sql(query)).not.toContain('created_at, id) >');
    });

    it('có con trỏ → thêm điều kiện keyset (created_at, id) > ($2::timestamptz, $3), đúng params theo thứ tự', async () => {
      repo.query.mockResolvedValue([]);
      // Chuỗi text — KHÔNG phải Date — cố tình để khớp cursorCreatedAt thật (xem doc comment
      // OrphanCleanupCandidate.cursorCreatedAt: Date sẽ mất độ chính xác dưới mili giây).
      const cursorCreatedAt = '2026-07-30 00:00:00.123456+00';
      await sut.findOrphanCleanupCandidates(50, { createdAt: cursorCreatedAt, id: 'm1' });

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('AND (created_at, id) > ($2::timestamptz, $3)');
      expect(params).toEqual([50, cursorCreatedAt, 'm1']);
    });

    it('ánh xạ snake_case → camelCase cho mỗi dòng trả về, kèm cursorCreatedAt (text thô cho keyset)', async () => {
      const createdAt = new Date('2026-07-30T00:00:00.000Z');
      const createdAtText = '2026-07-30 00:00:00.123456+00';
      repo.query.mockResolvedValue([
        {
          id: 'm1',
          object_key: 'media/a.jpg',
          bucket: 'phuquochub-dev',
          uploaded_by: 'u1',
          created_at: createdAt,
          created_at_text: createdAtText,
        },
        {
          id: 'm2',
          object_key: null,
          bucket: null,
          uploaded_by: null,
          created_at: createdAt,
          created_at_text: createdAtText,
        },
      ]);

      const res = await sut.findOrphanCleanupCandidates(100);

      expect(res).toEqual([
        {
          id: 'm1',
          objectKey: 'media/a.jpg',
          bucket: 'phuquochub-dev',
          uploadedBy: 'u1',
          createdAt,
          cursorCreatedAt: createdAtText,
        },
        {
          id: 'm2',
          objectKey: null,
          bucket: null,
          uploadedBy: null,
          createdAt,
          cursorCreatedAt: createdAtText,
        },
      ]);
    });

    it('không có dòng khớp → mảng rỗng', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.findOrphanCleanupCandidates(100)).resolves.toEqual([]);
    });
  });

  describe('softDeleteOrphanCandidate', () => {
    it('UPDATE lặp lại toàn bộ vị từ đủ điều kiện (không chỉ id) + RETURNING id', async () => {
      repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
      await sut.softDeleteOrphanCandidate('m1');

      const [query, params] = repo.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('UPDATE media SET deleted_at = now()');
      expect(q).toContain('WHERE id = $1');
      expect(q).toContain("status = 'pending'");
      expect(q).toContain('place_id IS NULL');
      expect(q).toContain('review_id IS NULL');
      expect(q).toContain('post_id IS NULL');
      expect(q).toContain('business_id IS NULL');
      expect(q).toContain('event_id IS NULL');
      expect(q).toContain('deleted_at IS NULL');
      expect(q).toContain("created_at < now() - interval '24 hours'");
      expect(q).toContain('RETURNING id');
      expect(params).toEqual(['m1']);
    });

    // Postgres driver của TypeORM trả UPDATE...RETURNING dưới dạng TUPLE [rows, rowCount] từ
    // repo.query() — KHÁC INSERT/SELECT (trả rows trực tiếp). Xác nhận trực tiếp với Postgres thật
    // (không phải giả định): xem docs/delivery/reports/MEDIA-ORPHAN-CLEANUP-POST-IMPLEMENTATION-
    // REVIEW-2026-08-02.md phần "RETURNING result fix". Mock PHẢI phản ánh đúng hình dạng tuple
    // này — mock cũ dùng mảng phẳng (`[{id:'m1'}]` / `[]`) che giấu bug gốc (rows.length trên một
    // tuple 2 phần tử luôn là 2, luôn > 0, bất kể UPDATE có khớp dòng nào hay không).
    it('UPDATE khớp 1 dòng (còn đủ điều kiện) → true (tuple [rows, rowCount]=[[{id}],1])', async () => {
      repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
      await expect(sut.softDeleteOrphanCandidate('m1')).resolves.toBe(true);
    });

    it('UPDATE khớp 0 dòng (đã bị dọn bởi lần chạy khác, hoặc vừa được gắn owner) → false, không phải lỗi (tuple [[],0])', async () => {
      repo.query.mockResolvedValue([[], 0]);
      await expect(sut.softDeleteOrphanCandidate('m1')).resolves.toBe(false);
    });

    // Bug cụ thể đã sửa: nếu code đọc kết quả CHƯA destructure tuple, `rows` thực chất là chính
    // cái tuple 2 phần tử `[[], 0]` — `rows.length` sẽ LÀ 2 (luôn > 0) dù mảng rows con BÊN TRONG
    // rỗng. Test này thất bại trên code CHƯA sửa (`rows.length > 0` với rows=tuple luôn true) và
    // chỉ pass sau khi destructure đúng `const [rows] = await this.repo.query(...)`.
    it('KHÔNG có false positive từ độ dài tuple — rowCount=0 kèm mảng rows con rỗng vẫn phải false', async () => {
      repo.query.mockResolvedValue([[], 0]);
      const result = await sut.softDeleteOrphanCandidate('m1');
      expect(result).toBe(false);
    });
  });
});
