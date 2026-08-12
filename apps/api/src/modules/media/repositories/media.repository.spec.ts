import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { MediaRepository } from './media.repository';
import { Media } from '../entities/media.entity';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('MediaRepository.listPublishedByReviewIds', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ find: jest.fn() });
    sut = new MediaRepository(repo);
  });

  it('reviewIds rỗng → không gọi DB, trả về mảng rỗng', async () => {
    const result = await sut.listPublishedByReviewIds([]);
    expect(repo.find).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('lọc đúng status=published, deleted_at IS NULL, review_id IN (...), sắp theo sort_order rồi created_at/id', async () => {
    repo.find.mockResolvedValue([]);
    await sut.listPublishedByReviewIds(['r1', 'r2']);

    expect(repo.find).toHaveBeenCalledWith({
      where: { reviewId: In(['r1', 'r2']), status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
  });

  it('trả về đúng danh sách media từ repo.find', async () => {
    const media = [{ id: 'm1' }, { id: 'm2' }] as Media[];
    repo.find.mockResolvedValue(media);
    await expect(sut.listPublishedByReviewIds(['r1'])).resolves.toEqual(media);
  });
});

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

  describe('existsPublished (WF-12/T3, M5)', () => {
    it('media published (chưa xoá mềm) → true', async () => {
      repo.query.mockResolvedValue([{ '?column?': 1 }]);
      await expect(sut.existsPublished('m1')).resolves.toBe(true);
      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain("FROM media WHERE id = $1 AND status = 'published' AND deleted_at IS NULL");
      expect(params).toEqual(['m1']);
    });

    it('không tồn tại, chưa/không còn published, hoặc đã xoá mềm → false (CÙNG một 404 ở service, không phân biệt lý do)', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.existsPublished('m1')).resolves.toBe(false);
    });
  });

  // Secure Private Media (2026-08-10). Bốn vị từ nằm TRONG SQL — đây là lớp thực thi cuối cùng
  // trước khi một object được ký URL, nên chúng được khẳng định tường minh ở đây.
  describe('findPublishedObjectKey (GET /media/{id}/file)', () => {
    it('SQL lọc đủ published + chưa xoá mềm + object_key IS NOT NULL', async () => {
      repo.query.mockResolvedValue([{ object_key: 'media/abc.jpg' }]);

      await expect(sut.findPublishedObjectKey('m1')).resolves.toBe('media/abc.jpg');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain(
        "SELECT object_key FROM media WHERE id = $1 AND status = 'published' AND deleted_at IS NULL AND object_key IS NOT NULL",
      );
      expect(params).toEqual(['m1']);
    });

    it('không khớp (không tồn tại / pending / hidden / rejected / đã xoá mềm) → null', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.findPublishedObjectKey('m1')).resolves.toBeNull();
    });

    it('dòng legacy/embed không có object_key → null (không có object nào để ký URL)', async () => {
      // SQL đã loại bằng `object_key IS NOT NULL`; phòng thêm ở tầng JS cho trường hợp driver trả
      // về NULL — không được để `undefined` lọt ra ngoài dưới dạng giá trị "có key".
      repo.query.mockResolvedValue([{ object_key: null }]);
      await expect(sut.findPublishedObjectKey('m1')).resolves.toBeNull();
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

// Owner Cover & Photo Ordering (2026-08-12) — thứ tự ảnh + ảnh bìa.
describe('MediaRepository — thứ tự gallery của cơ sở', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ find: jest.fn().mockResolvedValue([]) });
    sut = new MediaRepository(repo);
  });

  // Trước milestone này câu công khai chỉ có `sort_order ASC`; khi tất cả cùng NULL (đúng thực tế
  // dữ liệu hiện có) thứ tự hoàn toàn do planner quyết định.
  it('gallery CÔNG KHAI: sort_order ASC NULLS LAST + khoá phụ xác định tới tận PK', async () => {
    await sut.listPublishedByPlace('p1');
    expect(repo.find).toHaveBeenCalledWith({
      where: { placeId: 'p1', status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: { direction: 'ASC', nulls: 'LAST' }, createdAt: 'DESC', id: 'DESC' },
    });
  });

  // Hai danh sách PHẢI cùng thứ tự, nếu không "Lên/Xuống" của chủ cơ sở không phản ánh đúng thứ tự
  // khách nhìn thấy.
  it('danh sách của CHỦ CƠ SỞ dùng ĐÚNG cùng khoá sắp xếp với gallery công khai', async () => {
    await sut.listAllByPlace('p1');
    expect(repo.find).toHaveBeenCalledWith({
      where: { placeId: 'p1', deletedAt: IsNull() },
      order: { sortOrder: { direction: 'ASC', nulls: 'LAST' }, createdAt: 'DESC', id: 'DESC' },
    });
  });
});

describe('MediaRepository.reorderPlaceMedia', () => {
  let sut: MediaRepository;

  beforeEach(() => {
    sut = new MediaRepository(createMock<Repository<Media>>({ query: jest.fn() }));
  });

  it('mảng rỗng → không gọi DB', async () => {
    const manager = createMock<EntityManager>({ query: jest.fn() });
    await expect(sut.reorderPlaceMedia(manager, 'p1', [])).resolves.toEqual([]);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('MỘT câu UPDATE set-based cho cả danh sách (không N+1), sort_order đánh số từ 0 theo vị trí', async () => {
    const manager = createMock<EntityManager>({
      query: jest.fn().mockResolvedValue([[{ id: 'm2' }, { id: 'm1' }], 2]),
    });

    const result = await sut.reorderPlaceMedia(manager, 'p1', ['m2', 'm1']);

    expect(manager.query).toHaveBeenCalledTimes(1);
    const [query, params] = manager.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('SET sort_order = v.ord - 1');
    expect(q).toContain('unnest($1::uuid[]) WITH ORDINALITY AS v(id, ord)');
    expect(params).toEqual([['m2', 'm1'], 'p1']);
    expect(result).toEqual(['m2', 'm1']);
  });

  // Không có kiểm tra ở service nào có thể thay thế điều này: place_id nằm TRONG WHERE nên một id
  // của cơ sở khác khớp 0 dòng, không có khe TOCTOU giữa "kiểm tra" và "ghi".
  it('place_id + deleted_at nằm TRONG WHERE — id của cơ sở khác không thể bị chạm tới', async () => {
    const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([[], 0]) });
    await sut.reorderPlaceMedia(manager, 'p1', ['m-other']);
    const q = sql(manager.query.mock.calls[0][0]);
    expect(q).toContain('m.place_id = $2');
    expect(q).toContain('m.deleted_at IS NULL');
  });

  // UPDATE + RETURNING trả TUPLE [rows, rowCount] — quên destructure là bug đã từng xảy ra hai lần
  // trong repository này (attachAndPublish, softDeleteOrphanCandidate).
  it('đọc đúng hình dạng tuple [rows, rowCount] của UPDATE…RETURNING', async () => {
    const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([[{ id: 'm1' }], 1]) });
    await expect(sut.reorderPlaceMedia(manager, 'p1', ['m1'])).resolves.toEqual(['m1']);
  });
});

describe('MediaRepository — ảnh bìa', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  describe('setPlaceCoverImage', () => {
    it('mọi điều kiện đủ tư cách nằm TRONG EXISTS của chính câu UPDATE (không TOCTOU)', async () => {
      repo.query.mockResolvedValue([[{ id: 'p1' }], 1]);

      await expect(sut.setPlaceCoverImage('p1', 'm1')).resolves.toBe(true);

      const [query, params] = repo.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('UPDATE places p SET cover_image_id = $2');
      expect(q).toContain('EXISTS (SELECT 1 FROM media m');
      expect(q).toContain('m.place_id = $1'); // chặn tráo media id sang cơ sở khác
      expect(q).toContain("m.status = 'published'"); // pending/rejected/hidden không thể thành bìa
      expect(q).toContain('m.object_key IS NOT NULL');
      expect(q).toContain('m.deleted_at IS NULL');
      expect(params).toEqual(['p1', 'm1']);
    });

    it('không dòng nào khớp (ảnh chưa duyệt / khác cơ sở / đã gỡ) → false', async () => {
      repo.query.mockResolvedValue([[], 0]);
      await expect(sut.setPlaceCoverImage('p1', 'm1')).resolves.toBe(false);
    });
  });

  describe('clearCoverImageByMedia', () => {
    it('dọn con trỏ theo media id, chạy được trong transaction của caller', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([[], 0]) });
      await sut.clearCoverImageByMedia('m1', manager);

      const [query, params] = manager.query.mock.calls[0];
      expect(sql(query)).toContain('UPDATE places SET cover_image_id = NULL, updated_at = now() WHERE cover_image_id = $1');
      expect(params).toEqual(['m1']);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('không có manager → dùng repository mặc định (idempotent, 0 dòng không phải lỗi)', async () => {
      repo.query.mockResolvedValue([[], 0]);
      await expect(sut.clearCoverImageByMedia('m1')).resolves.toBeUndefined();
      expect(repo.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listIdsForPlaceForUpdate', () => {
    it('KHOÁ hàng (FOR UPDATE) để hai lần sắp xếp đồng thời không lồng vào nhau', async () => {
      const manager = createMock<EntityManager>({
        query: jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]),
      });

      await expect(sut.listIdsForPlaceForUpdate(manager, 'p1')).resolves.toEqual(['m1', 'm2']);

      const q = sql(manager.query.mock.calls[0][0]);
      expect(q).toContain('FOR UPDATE');
      expect(q).toContain('place_id = $1 AND deleted_at IS NULL');
    });
  });

  describe('getCoverImageId', () => {
    it('trả cover_image_id của cơ sở chưa xoá mềm; không có → null', async () => {
      repo.query.mockResolvedValueOnce([{ cover_image_id: 'm9' }]);
      await expect(sut.getCoverImageId('p1')).resolves.toBe('m9');

      repo.query.mockResolvedValueOnce([]);
      await expect(sut.getCoverImageId('p2')).resolves.toBeNull();
    });
  });
});

// Owner Photo Metadata (2026-08-12).
describe('MediaRepository.updatePlaceMediaMetadata', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  it('cả hai trường có mặt -> UPDATE cả hai cột, WHERE ràng buộc id + place_id + deleted_at IS NULL', async () => {
    repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);

    const result = await sut.updatePlaceMediaMetadata('p1', 'm1', { caption: 'new', altText: 'alt' });

    expect(result).toBe(true);
    const [query, params] = repo.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('UPDATE media SET caption = $3, alt_text = $4');
    expect(q).toContain('WHERE id = $1 AND place_id = $2 AND deleted_at IS NULL');
    expect(params).toEqual(['m1', 'p1', 'new', 'alt']);
  });

  it('chỉ caption có mặt -> SET chỉ có caption, KHÔNG đụng alt_text', async () => {
    repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
    await sut.updatePlaceMediaMetadata('p1', 'm1', { caption: 'only caption' });

    const [query, params] = repo.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('SET caption = $3');
    expect(q).not.toContain('alt_text');
    expect(params).toEqual(['m1', 'p1', 'only caption']);
  });

  it('chỉ alt_text có mặt -> SET chỉ có alt_text, KHÔNG đụng caption', async () => {
    repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
    await sut.updatePlaceMediaMetadata('p1', 'm1', { altText: 'only alt' });

    const [query, params] = repo.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('SET alt_text = $3');
    expect(q).not.toContain('caption =');
    expect(params).toEqual(['m1', 'p1', 'only alt']);
  });

  it('giá trị null (ý định xoá) được ghi thẳng, không bị lọc khỏi params', async () => {
    repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
    await sut.updatePlaceMediaMetadata('p1', 'm1', { caption: null });

    const [, params] = repo.query.mock.calls[0];
    expect(params).toEqual(['m1', 'p1', null]);
  });

  // Chốt chặn quan trọng nhất: id của cơ sở khác khớp 0 dòng vì place_id nằm TRONG WHERE.
  it('media thuộc cơ sở KHÁC -> UPDATE khớp 0 dòng -> false (không có khe TOCTOU)', async () => {
    repo.query.mockResolvedValue([[], 0]);
    await expect(sut.updatePlaceMediaMetadata('p1', 'm-foreign', { caption: 'x' })).resolves.toBe(false);
  });

  it('media đã xoá mềm -> false', async () => {
    repo.query.mockResolvedValue([[], 0]);
    await expect(sut.updatePlaceMediaMetadata('p1', 'm-deleted', { caption: 'x' })).resolves.toBe(false);
  });

  it('patch rỗng (cả hai undefined) -> KHÔNG chạy UPDATE, fallback kiểm tra tồn tại', async () => {
    repo.query.mockResolvedValue([{ '?column?': 1 }]); // existsForPlace: SELECT 1 ... (không RETURNING)
    const result = await sut.updatePlaceMediaMetadata('p1', 'm1', {});

    expect(result).toBe(true);
    const q = sql(repo.query.mock.calls[0][0]);
    expect(q).toContain('SELECT 1 FROM media WHERE id = $1 AND place_id = $2');
    expect(q).not.toContain('UPDATE');
  });

  // Không có đường nào mass-assign: chỉ hai cột literal có thể xuất hiện trong SET.
  it('mệnh đề SET không bao giờ chứa cột nào ngoài caption/alt_text (chỉ kiểm tra SET, WHERE hợp lệ có place_id)', async () => {
    repo.query.mockResolvedValue([[{ id: 'm1' }], 1]);
    await sut.updatePlaceMediaMetadata('p1', 'm1', { caption: 'x', altText: 'y' });

    const q = sql(repo.query.mock.calls[0][0]);
    const setClause = q.slice(q.indexOf('SET'), q.indexOf('WHERE'));
    expect(setClause).not.toMatch(/status|sort_order|cover_image_id|object_key|bucket|checksum_sha256|review_id|place_id/);
    expect(setClause).toContain('caption');
    expect(setClause).toContain('alt_text');
  });
});
