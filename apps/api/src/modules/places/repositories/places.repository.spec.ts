import { EntityManager, Repository } from 'typeorm';
import { PlacesRepository, PlaceDetailRow } from './places.repository';
import { Place } from '../entities/place.entity';
import { PlaceStatus, PriceRange } from '../place.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';
import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chuẩn hoá khoảng trắng để assert nội dung SQL không phụ thuộc cách xuống dòng/thụt lề.
function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function detailRow(overrides: Partial<PlaceDetailRow> = {}): PlaceDetailRow {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển',
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10.05,
    lng: 104.0,
    address: null,
    ward: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PlacesRepository — hiển thị công khai (GAP-02/GAP-04)', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn(), exists: jest.fn(), update: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  describe('existsById', () => {
    it('không lộ status/nội dung — chỉ trả boolean', async () => {
      repo.exists.mockResolvedValue(true);

      await expect(sut.existsById('p1')).resolves.toBe(true);
      expect(repo.exists).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('existsByIdAndCategorySlug', () => {
    it('có dòng khớp → true, lọc deleted_at IS NULL', async () => {
      repo.query.mockResolvedValue([{ '?column?': 1 }]);

      await expect(sut.existsByIdAndCategorySlug('p1', 'tour')).resolves.toBe(true);
      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('c.slug = $2 AND p.deleted_at IS NULL');
      expect(params).toEqual(['p1', 'tour']);
    });

    it('không có dòng khớp (category sai hoặc đã xoá mềm) → false', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.existsByIdAndCategorySlug('p1', 'hotel')).resolves.toBe(false);
    });
  });

  describe('recalculateRating', () => {
    it('tính lại rating_avg/rating_count từ reviews published của đúng place', async () => {
      repo.query.mockResolvedValue(undefined);

      await sut.recalculateRating('p1');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain("status = 'published'");
      expect(sql(query)).toContain('rating_avg');
      expect(sql(query)).toContain('rating_count');
      expect(params).toEqual(['p1']);
    });

    it('nhận manager tuỳ chọn → chạy TRONG transaction đó (T1/T2, INV-4), không dùng this.repo', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn() });
      await sut.recalculateRating('p1', manager);
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(repo.query).not.toHaveBeenCalled();
    });
  });

  describe('getDetailBySlug', () => {
    it('chỉ đọc Place đã published (không lộ draft/pending ra kênh công khai)', async () => {
      repo.query.mockResolvedValue([detailRow()]);

      await sut.getDetailBySlug('bai-sao');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('p.status = $2');
      expect(sql(query)).toContain('p.deleted_at IS NULL');
      expect(params).toEqual(['bai-sao', PlaceStatus.PUBLISHED]);
    });

    it('slug tồn tại nhưng chưa published → không có row → trả null', async () => {
      // DB đã lọc theo status nên trả rỗng; repository phải map thành null (→ 404 ở service).
      repo.query.mockResolvedValue([]);

      await expect(sut.getDetailBySlug('dia-diem-cho-duyet')).resolves.toBeNull();
    });

    it('published → trả row chi tiết', async () => {
      repo.query.mockResolvedValue([detailRow({ slug: 'bai-sao' })]);

      const row = await sut.getDetailBySlug('bai-sao');

      expect(row).not.toBeNull();
      expect(row?.slug).toBe('bai-sao');
    });

    it('kèm category_slug qua subquery — chi tiết biết mình thuộc danh mục nào, không cần gọi thêm /categories', async () => {
      repo.query.mockResolvedValue([detailRow()]);

      await sut.getDetailBySlug('bai-sao');

      expect(sql(repo.query.mock.calls[0][0])).toContain(
        '(SELECT c.slug FROM categories c WHERE c.id = p.category_id) AS category_slug',
      );
    });

    it('truyền slug qua tham số (không nội suy chuỗi vào SQL)', async () => {
      repo.query.mockResolvedValue([]);

      await sut.getDetailBySlug("bai-sao' OR '1'='1");

      const [query, params] = repo.query.mock.calls[0];
      expect(query).not.toContain("OR '1'='1");
      expect(params[0]).toBe("bai-sao' OR '1'='1");
    });
  });

  describe('list', () => {
    // Mỗi lần list() gọi 2 query: [0] đếm tổng, [1] lấy items.
    beforeEach(() => {
      repo.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    });

    it('bỏ trống status → mặc định chỉ published', async () => {
      await sut.list({ limit: 20, offset: 0 });

      const [countQuery, countParams] = repo.query.mock.calls[0];
      expect(sql(countQuery)).toContain('p.status = $1');
      expect(countParams).toEqual([PlaceStatus.PUBLISHED]);
    });

    it('status truyền tường minh (caller đặc quyền) được tôn trọng', async () => {
      // Repository vẫn tổng quát cho hàng đợi kiểm duyệt sau này; chốt chặn nằm ở DTO công khai.
      await sut.list({ status: PlaceStatus.PENDING, limit: 20, offset: 0 });

      const [, countParams] = repo.query.mock.calls[0];
      expect(countParams).toEqual([PlaceStatus.PENDING]);
    });

    it('lọc category/ward đi qua tham số, đúng thứ tự placeholder', async () => {
      await sut.list({ category: 'c1', ward: 'An Thới', limit: 20, offset: 0 });

      const [countQuery, countParams] = repo.query.mock.calls[0];
      expect(sql(countQuery)).toContain('p.category_id = $1');
      expect(sql(countQuery)).toContain('p.ward = $2');
      expect(sql(countQuery)).toContain('p.status = $3');
      expect(countParams).toEqual(['c1', 'An Thới', PlaceStatus.PUBLISHED]);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-12 — thứ tự phân trang phải xác định (PLACE-004)
// ---------------------------------------------------------------------------

interface OrderKey {
  col: string;
  dir: 'ASC' | 'DESC';
  nullsLast: boolean;
}

/** Trích ORDER BY từ SQL thật mà repository phát ra (không hard-code kỳ vọng). */
function orderKeysFrom(query: string): OrderKey[] {
  const clause = /ORDER BY (.+?) LIMIT/.exec(sql(query))?.[1] ?? '';
  return clause
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      col: part.replace(/^p\./, '').split(/\s+/)[0],
      dir: /\bDESC\b/.test(part) ? 'DESC' : 'ASC',
      nullsLast: /NULLS LAST/i.test(part),
    }));
}

type SortRow = Record<string, string | number | null>;

/** So sánh theo đúng ngữ nghĩa ORDER BY vừa trích (kể cả NULLS LAST). */
function comparatorFor(keys: OrderKey[]) {
  return (a: SortRow, b: SortRow): number => {
    for (const key of keys) {
      const av = a[key.col];
      const bv = b[key.col];
      if (av === bv) {
        continue;
      }
      if (av === null) {
        return key.nullsLast ? 1 : -1;
      }
      if (bv === null) {
        return key.nullsLast ? -1 : 1;
      }
      const cmp = av < bv ? -1 : 1;
      return key.dir === 'DESC' ? -cmp : cmp;
    }
    return 0;
  };
}

describe('PlacesRepository.list — thứ tự phân trang xác định (GAP-12)', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  async function capturedItemsQuery(): Promise<string> {
    repo.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    await sut.list({ limit: 20, offset: 0 });
    return repo.query.mock.calls[1][0];
  }

  it('ORDER BY kết thúc bằng khoá DUY NHẤT (p.id) — điều kiện đủ cho thứ tự toàn phần', async () => {
    const keys = orderKeysFrom(await capturedItemsQuery());

    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys[keys.length - 1]).toEqual({ col: 'id', dir: 'ASC', nullsLast: false });
  });

  it('hai khoá sắp xếp gốc giữ nguyên vị trí và hướng (không đổi thứ tự người dùng thấy)', async () => {
    const keys = orderKeysFrom(await capturedItemsQuery());

    expect(keys[0]).toEqual({ col: 'rating_avg', dir: 'DESC', nullsLast: true });
    expect(keys[1]).toEqual({ col: 'created_at', dir: 'DESC', nullsLast: false });
  });

  it('query đếm KHÔNG có ORDER BY nên không bị ảnh hưởng', async () => {
    repo.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    await sut.list({ limit: 20, offset: 0 });

    expect(sql(repo.query.mock.calls[0][0])).not.toContain('ORDER BY');
  });

  // F-16 (PLACE-014): nearby() không phân trang bằng OFFSET, nên lỗi "một hàng ở hai trang"
  // không áp dụng. Lỗi CÓ áp dụng là: khi số hàng khớp vượt LIMIT, lát cắt phụ thuộc thứ tự
  // của các hàng bằng nhau ⇒ hai lần gọi giống hệt nhau trả tập khác nhau.
  it('nearby: ORDER BY kết thúc bằng khoá DUY NHẤT (p.id) sau khoảng cách', async () => {
    repo.query.mockResolvedValue([]);
    await sut.nearby({ lat: 10.05, lng: 104.0, radius: 2000, limit: 20 });

    const keys = orderKeysFrom(repo.query.mock.calls[0][0]);
    expect(keys[0]).toEqual({ col: 'distance_m', dir: 'ASC', nullsLast: false });
    expect(keys[keys.length - 1]).toEqual({ col: 'id', dir: 'ASC', nullsLast: false });
  });

  it('nearby: hai lần gọi giống hệt nhau trả CÙNG lát cắt dù toạ độ trùng khít', async () => {
    // 4 địa điểm cùng một địa chỉ ⇒ ST_Distance bằng nhau tuyệt đối; LIMIT 2 cắt giữa nhóm hoà.
    const tied: SortRow[] = ['d', 'a', 'c', 'b'].map((id) => ({ id, distance_m: 150 }));
    repo.query.mockResolvedValue([]);
    await sut.nearby({ lat: 10.05, lng: 104.0, radius: 2000, limit: 2 });
    const cmp = comparatorFor(orderKeysFrom(repo.query.mock.calls[0][0]));

    const slice = (rotate: number): string[] =>
      [...tied.slice(rotate), ...tied.slice(0, rotate)]
        .sort(cmp)
        .slice(0, 2)
        .map((r) => String(r.id));

    // Thứ tự đầu vào khác nhau (quyền tự do của planner) nhưng lát cắt phải như nhau.
    expect(slice(0)).toEqual(slice(3));
    expect(slice(0)).toEqual(['a', 'b']);
  });

  it('hai trang liên tiếp trên dữ liệu TRÙNG KHOÁ: rời nhau và phủ đủ, kể cả khi planner đảo hàng bằng nhau', async () => {
    // 6 hàng cố tình trùng: cùng rating_avg + cùng created_at ⇒ chỉ khoá thứ ba phân xử.
    const tied: SortRow[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
      id,
      rating_avg: '4.5',
      created_at: '2026-01-01T00:00:00Z',
    }));
    const keys = orderKeysFrom(await capturedItemsQuery());
    const cmp = comparatorFor(keys);

    // Mô phỏng quyền tự do của Postgres: với các hàng bằng nhau, thứ tự đầu vào có thể khác
    // giữa hai lần chạy. Xoay mảng trước khi sắp xếp — chỉ khoá duy nhất mới triệt tiêu được.
    const page = (offset: number, limit: number, rotate: number): string[] =>
      [...tied.slice(rotate), ...tied.slice(0, rotate)]
        .sort(cmp)
        .slice(offset, offset + limit)
        .map((r) => String(r.id));

    const first = page(0, 3, 0);
    const second = page(3, 3, 4);

    expect(new Set([...first, ...second]).size).toBe(6); // không trùng lặp
    expect([...first, ...second].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); // không sót
  });

  // F-32 (PLACE-015): searchFullText là query DUY NHẤT vừa ORDER BY khoá không duy nhất
  // (ts_rank) vừa phân trang bằng OFFSET ⇒ áp dụng ĐÚNG lỗi GAP-12 (một hàng ở hai trang
  // hoặc không ở trang nào), chứ không phải lỗi "lát cắt đổi" như nearby.
  it('search: ORDER BY giữ score DESC dẫn đầu và kết thúc bằng khoá DUY NHẤT (p.id)', async () => {
    repo.query.mockResolvedValue([]);
    await sut.searchFullText('bai sao', 20, 0);

    const keys = orderKeysFrom(repo.query.mock.calls[0][0]);
    expect(keys[0]).toEqual({ col: 'score', dir: 'DESC', nullsLast: false });
    expect(keys[keys.length - 1]).toEqual({ col: 'id', dir: 'ASC', nullsLast: false });
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it('search: hai trang liên tiếp trên các hàng TRÙNG score rời nhau và phủ đủ', async () => {
    // 6 Place khớp truy vấn ngang nhau ⇒ ts_rank bằng nhau tuyệt đối; chỉ p.id phân xử được.
    const tied: SortRow[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, score: 0.0607927 }));
    repo.query.mockResolvedValue([]);
    await sut.searchFullText('bai', 3, 0);
    const cmp = comparatorFor(orderKeysFrom(repo.query.mock.calls[0][0]));

    // Xoay mảng giữa hai lần gọi = mô phỏng quyền tự do của planner với các hàng bằng nhau,
    // đúng như SearchService phân trang: page1 offset 0, page2 offset 3.
    const page = (offset: number, rotate: number): string[] =>
      [...tied.slice(rotate), ...tied.slice(0, rotate)]
        .sort(cmp)
        .slice(offset, offset + 3)
        .map((r) => String(r.id));

    const first = page(0, 0);
    const second = page(3, 4);

    expect(new Set([...first, ...second]).size).toBe(6); // không trùng lặp giữa hai trang
    expect([...first, ...second].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); // không sót
  });

  // F-33 (PLACE-019): bbox() đã bị xoá vì không có consumer. Spec này khoá lại việc xoá đó —
  // nếu ai vô tình thêm lại một hàm chết cùng tên, nó sẽ đỏ ngay.
  it('F-33: PlacesRepository KHÔNG còn phương thức bbox() (bboxClusters mới là thứ có consumer)', () => {
    expect((sut as unknown as Record<string, unknown>).bbox).toBeUndefined();
    expect(typeof (sut as unknown as Record<string, unknown>).bboxClusters).toBe('function');
  });

  it('search: query đếm KHÔNG có ORDER BY nên không cần đổi', async () => {
    repo.query.mockResolvedValue([{ count: 0 }]);
    await sut.searchCount('bai sao');

    expect(sql(repo.query.mock.calls[0][0])).not.toContain('ORDER BY');
  });

  // Search Filters (category/ward/price_range) — cùng cột/thứ tự tham số như list(), chỉ khác
  // WHERE gốc là điều kiện FTS. Không truyền filters (hoặc {}) phải giữ nguyên hành vi cũ
  // (backward-compat) — đã phủ ở 2 test "F-32" phía trên (gọi searchFullText/searchCount không
  // có filters, dùng giá trị mặc định {}).
  describe('searchFullText/searchCount — Search Filters', () => {
    it('không truyền filter → không thêm điều kiện p.category_id/p.ward/p.price_range nào', async () => {
      repo.query.mockResolvedValue([]);
      await sut.searchFullText('bai sao', 20, 0);

      const [query, params] = repo.query.mock.calls[0];
      // p.category_id luôn có trong SELECT (CARD_COLS) — chỉ kiểm tra KHÔNG có điều kiện lọc
      // "= $n" trên nó, không phải kiểm tra cột đó vắng mặt khỏi SELECT.
      expect(sql(query)).not.toContain('p.category_id =');
      expect(sql(query)).not.toContain('p.ward =');
      expect(sql(query)).not.toContain('p.price_range =');
      expect(params).toEqual(['bai sao', 20, 0]);
    });

    it('lọc category/ward/price_range đi qua tham số hoá, đúng thứ tự placeholder', async () => {
      repo.query.mockResolvedValue([]);
      await sut.searchFullText('resort', 20, 0, {
        category: 'c1',
        ward: 'An Thới',
        priceRange: PriceRange.HIGH,
      });

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('p.category_id = $2');
      expect(sql(query)).toContain('p.ward = $3');
      expect(sql(query)).toContain('p.price_range = $4');
      expect(sql(query)).toContain('LIMIT $5 OFFSET $6');
      expect(params).toEqual(['resort', 'c1', 'An Thới', PriceRange.HIGH, 20, 0]);
    });

    it('chỉ ward (không category/price_range) → chỉ 1 điều kiện lọc thêm, placeholder $2', async () => {
      repo.query.mockResolvedValue([]);
      await sut.searchFullText('bai', 10, 0, { ward: 'Dương Đông' });

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).not.toContain('p.category_id =');
      expect(sql(query)).toContain('p.ward = $2');
      expect(sql(query)).not.toContain('p.price_range =');
      expect(params).toEqual(['bai', 'Dương Đông', 10, 0]);
    });

    it('searchCount áp dụng cùng filters như searchFullText (đếm khớp kết quả thật)', async () => {
      repo.query.mockResolvedValue([{ count: 3 }]);
      await sut.searchCount('resort', { category: 'c1', priceRange: PriceRange.MID });

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('p.category_id = $2');
      expect(sql(query)).toContain('p.price_range = $3');
      expect(sql(query)).not.toContain('ORDER BY');
      expect(params).toEqual(['resort', 'c1', PriceRange.MID]);
    });
  });
});

// F-34 (PLACE-023): bboxClusters phải CẮT ở LIMIT một cách XÁC ĐỊNH.
describe('PlacesRepository.bboxClusters — cắt LIMIT xác định (F-34)', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  async function capturedQuery(): Promise<string> {
    repo.query.mockResolvedValueOnce([]);
    await sut.bboxClusters({
      minLng: 103.4,
      minLat: 9.8,
      maxLng: 104.2,
      maxLat: 10.5,
      cellDeg: 0.01,
      limit: 500,
    });
    return repo.query.mock.calls[0][0] as string;
  }

  it('có ORDER BY cnt DESC, sample_id ASC NGAY TRƯỚC LIMIT', async () => {
    const q = sql(await capturedQuery());
    expect(q).toContain('ORDER BY cnt DESC, sample_id ASC LIMIT');
  });

  // ORDER BY nội bộ trong `array_agg(p.id ORDER BY p.id)` khiến orderKeysFrom (bắt ORDER BY ĐẦU
  // TIÊN) không dùng được ở đây; trích mệnh đề TRUNCATION = ORDER BY CUỐI CÙNG trước LIMIT.
  function truncationOrderKeys(query: string): OrderKey[] {
    const s = sql(query);
    const clause = s.slice(s.lastIndexOf('ORDER BY')).replace(/^ORDER BY /, '').replace(/ LIMIT.*$/, '');
    return clause
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ col: p.split(/\s+/)[0], dir: /\bDESC\b/.test(p) ? 'DESC' : 'ASC', nullsLast: false }));
  }

  it('ORDER BY truncation trích từ SQL thật = [cnt DESC, sample_id ASC] và kết thúc bằng khoá DUY NHẤT sample_id', async () => {
    const keys = truncationOrderKeys(await capturedQuery());
    expect(keys).toEqual([
      { col: 'cnt', dir: 'DESC', nullsLast: false },
      { col: 'sample_id', dir: 'ASC', nullsLast: false },
    ]);
    // Khoá cuối là DUY NHẤT (id nhỏ nhất mỗi cell) ⇒ đủ cho thứ tự toàn phần trước khi cắt.
    expect(keys[keys.length - 1].col).toBe('sample_id');
    expect(keys[keys.length - 1].dir).toBe('ASC');
  });

  it('CHỈ đổi thứ tự: grouping, cell size ($5), tổng hợp và WHERE giữ nguyên', async () => {
    const q = sql(await capturedQuery());
    // Grouping theo lưới đều không đổi.
    expect(q).toContain('GROUP BY floor(ST_X(p.location::geometry) / $5), floor(ST_Y(p.location::geometry) / $5)');
    // Tổng hợp/centroid + sample không đổi.
    expect(q).toContain('count(*)::int AS cnt');
    expect(q).toContain('avg(ST_X(p.location::geometry)) AS lng');
    expect(q).toContain('avg(ST_Y(p.location::geometry)) AS lat');
    expect(q).toContain('(array_agg(p.id ORDER BY p.id))[1] AS sample_id');
    // WHERE (chỉ published, chưa xoá, trong envelope) không đổi.
    expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
    expect(q).toContain('ST_Intersects(p.location::geometry, ST_MakeEnvelope($1,$2,$3,$4,4326))');
    // LIMIT vẫn là tham số $6 (không đổi cơ chế/không hard-code 500).
    expect(q).toContain('LIMIT $6');
  });

  it('comparator theo ORDER BY thật: cnt DESC rồi sample_id ASC là thứ tự toàn phần trên cell hoà cnt', async () => {
    const keys = truncationOrderKeys(await capturedQuery());
    const cmp = comparatorFor(keys);
    // 3 cell hoà cnt=1 (tie) — phải xếp theo sample_id ASC một cách xác định.
    const rows: SortRow[] = [
      { cnt: 1, sample_id: 'c' },
      { cnt: 1, sample_id: 'a' },
      { cnt: 1, sample_id: 'b' },
      { cnt: 5, sample_id: 'z' }, // cụm dày nhất phải lên đầu (cnt DESC)
    ];
    const sorted = [...rows].sort(cmp).map((r) => r.sample_id);
    expect(sorted).toEqual(['z', 'a', 'b', 'c']);
  });
});

// Search Filters trên bản đồ — category/ward đi qua cùng searchFilterConds() với list()/
// searchFullText(), tham số hoá y hệt. cellDeg/limit phải dịch chỉ số theo số filter thêm vào.
describe('PlacesRepository.bboxClusters — Search Filters (category/ward)', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  const BASE = { minLng: 103.4, minLat: 9.8, maxLng: 104.2, maxLat: 10.5, cellDeg: 0.01, limit: 500 };

  it('không truyền filter → không thêm điều kiện, cellDeg/limit vẫn ở $5/$6', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.bboxClusters(BASE);

    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).not.toContain('p.category_id =');
    expect(sql(query)).not.toContain('p.ward =');
    expect(sql(query)).toContain('GROUP BY floor(ST_X(p.location::geometry) / $5), floor(ST_Y(p.location::geometry) / $5)');
    expect(sql(query)).toContain('LIMIT $6');
    expect(params).toEqual([103.4, 9.8, 104.2, 10.5, 0.01, 500]);
  });

  it('lọc category+ward → điều kiện tham số hoá ở $5/$6, cellDeg/limit dịch xuống $7/$8', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.bboxClusters({ ...BASE, category: 'c1', ward: 'An Thới' });

    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('p.category_id = $5');
    expect(sql(query)).toContain('p.ward = $6');
    expect(sql(query)).toContain('GROUP BY floor(ST_X(p.location::geometry) / $7), floor(ST_Y(p.location::geometry) / $7)');
    expect(sql(query)).toContain('LIMIT $8');
    expect(params).toEqual([103.4, 9.8, 104.2, 10.5, 'c1', 'An Thới', 0.01, 500]);
  });

  it('chỉ category → một điều kiện lọc, không chạm ward', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.bboxClusters({ ...BASE, category: 'c1' });

    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('p.category_id = $5');
    expect(sql(query)).not.toContain('p.ward =');
    expect(params).toEqual([103.4, 9.8, 104.2, 10.5, 'c1', 0.01, 500]);
  });
});
