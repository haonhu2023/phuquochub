import { EntityManager, Repository } from 'typeorm';
import { PlacesRepository, PlaceDetailRow } from './places.repository';
import { Place } from '../entities/place.entity';
import { PlaceStatus, PriceRange } from '../place.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';
import type { MediaUrlService } from '../../../core/media-url/media-url.service';
import { computeFieldValueHash } from '../../evidence/field-value-hash';

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
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    verified_at: null,
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

    // Place Trust & Freshness Surface (2026-08-19) — cột đã có từ InitPlaces, lần đầu CHỌN ra.
    it('kèm verified_at trong SELECT (Place Trust & Freshness Surface)', async () => {
      repo.query.mockResolvedValue([detailRow()]);

      await sut.getDetailBySlug('bai-sao');

      expect(sql(repo.query.mock.calls[0][0])).toContain('p.verified_at');
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

// Trusted Nearby + Opening State v0 (Phase 2) — GET /geo/nearby-trusted.
describe('PlacesRepository.nearbyTrusted — Trusted Nearby + Opening State v0', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  const PARAMS = { lat: 10.05, lng: 104.0, radius: 2000, limit: 20 };

  it('lọc verification_status theo whitelist verified/official/community_verified, TRƯỚC LIMIT', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    const [query] = repo.query.mock.calls[0];
    const normalized = sql(query);
    const whitelistIdx = normalized.indexOf("p.verification_status IN ('verified', 'official', 'community_verified')");
    const limitIdx = normalized.indexOf('LIMIT $');
    expect(whitelistIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(-1);
    expect(whitelistIdx).toBeLessThan(limitIdx);
  });

  it('không lộ expired/pending/rejected qua whitelist (không xuất hiện dạng liệt kê riêng)', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    const [query] = repo.query.mock.calls[0];
    const normalized = sql(query);
    expect(normalized).not.toContain('expired');
    expect(normalized).not.toContain('pending');
    expect(normalized).not.toContain('rejected');
  });

  it("giữ nguyên p.deleted_at IS NULL AND p.status = 'published'", async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    const [query] = repo.query.mock.calls[0];
    expect(sql(query)).toContain("p.deleted_at IS NULL AND p.status = 'published'");
  });

  it('giữ nguyên thứ tự distance_m ASC, p.id ASC làm khoá phụ', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    const [query] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('ORDER BY distance_m ASC, p.id ASC');
  });

  it('SELECT có p.opening_hours', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    const [query] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('p.opening_hours');
  });

  it('tham số hoá lng/lat/radius/limit giống hệt nearby() (không đổi hợp đồng tham số)', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted({ ...PARAMS, category: 'c1' });

    const [, params] = repo.query.mock.calls[0];
    expect(params).toEqual([104.0, 10.05, 2000, 'c1', 20]);
  });

  it('opening_hours null truyền qua nguyên trạng (null, không suy diễn)', async () => {
    repo.query.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Bãi Sao',
        slug: 'bai-sao',
        category_id: 'c1',
        short_description: null,
        price_range: null,
        cover_image_url: null,
        cover_image_media_id: null,
        rating_avg: null,
        rating_count: 0,
        verification_status: 'verified',
        status: 'published',
        lat: 10.05,
        lng: 104.0,
        opening_hours: null,
        distance_m: 12.3,
      },
    ]);
    const rows = await sut.nearbyTrusted(PARAMS);
    expect(rows[0].opening_hours).toBeNull();
  });

  it('opening_hours object truyền qua nguyên trạng (không đổi hình dạng)', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '08:00', close: '22:00' }] } };
    repo.query.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Bãi Sao',
        slug: 'bai-sao',
        category_id: 'c1',
        short_description: null,
        price_range: null,
        cover_image_url: null,
        cover_image_media_id: null,
        rating_avg: null,
        rating_count: 0,
        verification_status: 'verified',
        status: 'published',
        lat: 10.05,
        lng: 104.0,
        opening_hours: oh,
        distance_m: 12.3,
      },
    ]);
    const rows = await sut.nearbyTrusted(PARAMS);
    expect(rows[0].opening_hours).toEqual(oh);
  });

  // 2026-09-08 Right Now trust semantics gate: nearbyTrusted() deliberately did NOT receive
  // rightNow()'s current-value field-evidence filter (see this method's own doc comment for why —
  // it never asserts opening_hours as an operational claim, so a same-field evidence requirement
  // would be scope creep). These two tests lock that decision in: a single query, no
  // place_field_evidence_links join, and a trusted place with opening_hours but ZERO field
  // evidence still appears — proving the method is unaffected by (and does not need) the fix
  // applied to rightNow().
  it('KHÔNG join place_field_evidence_links — không áp gate bằng chứng theo trường (ngoài phạm vi cố ý)', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.nearbyTrusted(PARAMS);

    expect(repo.query).toHaveBeenCalledTimes(1);
    const [query] = repo.query.mock.calls[0];
    expect(sql(query)).not.toContain('place_field_evidence_links');
  });

  it('place tin cậy có opening_hours nhưng KHÔNG có field-evidence vẫn xuất hiện (không đổi hành vi)', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '08:00', close: '22:00' }] } };
    repo.query.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Bãi Sao',
        slug: 'bai-sao',
        category_id: 'c1',
        short_description: null,
        price_range: null,
        cover_image_url: null,
        cover_image_media_id: null,
        rating_avg: null,
        rating_count: 0,
        verification_status: 'official',
        status: 'published',
        lat: 10.05,
        lng: 104.0,
        opening_hours: oh,
        distance_m: 12.3,
      },
    ]);
    const rows = await sut.nearbyTrusted(PARAMS);
    expect(rows.map((r) => r.id)).toEqual(['p1']);
  });
});

// ---------------------------------------------------------------------------
// "Right Now" MVP — PlacesRepository.rightNow()
// ---------------------------------------------------------------------------
describe('PlacesRepository.rightNow — "Right Now" MVP', () => {
  let repo: LooseMock<Repository<Place>>;
  let sut: PlacesRepository;

  beforeEach(() => {
    repo = createMock<Repository<Place>>({ query: jest.fn() });
    sut = new PlacesRepository(repo, MEDIA_URL);
  });

  // rightNow() is now TWO queries (2026-09-08 trust semantics gate): query 1 fetches
  // trust+presence candidates (overfetched), query 2 bulk-fetches gate-passing field-evidence
  // links for exactly those candidates. Most tests below only care about query 1's SQL shape, so
  // this helper mocks an empty candidate set — the second query is never issued when there are no
  // candidates (see the dedicated test for that below), keeping these assertions unaffected by the
  // evidence-filtering logic.
  async function capturedQuery(): Promise<string> {
    repo.query.mockResolvedValueOnce([]);
    await sut.rightNow({ limit: 6 });
    return repo.query.mock.calls[0][0];
  }

  function mockCandidatesAndLinks(
    candidates: Array<{ id: string; opening_hours: unknown; [key: string]: unknown }>,
    links: Array<{ place_id: string; field_value_hash: string }> = [],
  ) {
    repo.query.mockResolvedValueOnce(candidates).mockResolvedValueOnce(links);
  }

  // PR #24 final trust-semantics review (2026-09-08): the whole-place `verification_status`
  // whitelist is REMOVED from the candidate query, not just supplemented — see this repository's
  // rightNow() doc comment for the full reasoning (verifications has no field/scope column,
  // `official` is routinely admin-backfill-only, `published` is already a privileged gate). The
  // candidate query now selects on `published` + presence alone; trust for the specific claim
  // being shown is enforced entirely by query 2's field-evidence + source-authority check below.
  it('KHÔNG còn lọc theo whitelist verification_status — cổng tin cậy chuyển hẳn sang field-evidence', async () => {
    const query = sql(await capturedQuery());
    // p.verification_status is still SELECTed (part of CARD_COLS, needed for the row shape) — the
    // whitelist FILTER on it is what's gone. Assert there is no IN(...) predicate on the column,
    // and none of the three whitelist literal values appear anywhere in the query text at all
    // (they never appeared outside that predicate before this change, so their total absence here
    // is a reliable proxy for "the predicate itself is gone").
    expect(query).not.toContain('verification_status IN');
    expect(query).not.toContain('verified');
    expect(query).not.toContain('official');
    expect(query).not.toContain('community_verified');
    expect(query).toContain('p.verification_status'); // still selected, just not filtered on
  });

  it('giữ ràng buộc published + chưa xoá mềm', async () => {
    const query = sql(await capturedQuery());
    expect(query).toContain('p.deleted_at IS NULL');
    expect(query).toContain("p.status = 'published'");
  });

  it('chỉ nhận place CÓ opening_hours (presence check, không suy diễn nội dung)', async () => {
    const query = sql(await capturedQuery());
    expect(query).toContain('p.opening_hours IS NOT NULL');
  });

  it('SELECT có p.opening_hours (đường DETAIL-only, không nằm trong CARD_COLS)', async () => {
    const query = sql(await capturedQuery());
    expect(query).toContain('p.opening_hours');
  });

  it('ORDER BY khớp thứ tự mặc định của list() — không xếp hạng bịa ra', async () => {
    const keys = orderKeysFrom(await capturedQuery());
    expect(keys).toEqual([
      { col: 'rating_avg', dir: 'DESC', nullsLast: true },
      { col: 'created_at', dir: 'DESC', nullsLast: false },
      { col: 'id', dir: 'ASC', nullsLast: false },
    ]);
  });

  it('candidate query overfetches (bounded, x5) thay vì dùng thẳng limit của caller — còn khoảng trống cho lọc evidence', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.rightNow({ limit: 9 });
    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('LIMIT $1');
    expect(params).toEqual([45]);
  });

  it('overfetch bị chặn trần (cap) kể cả với limit lớn', async () => {
    repo.query.mockResolvedValueOnce([]);
    await sut.rightNow({ limit: 12 });
    const [, params] = repo.query.mock.calls[0];
    expect(params).toEqual([60]);
  });

  it('không có candidate nào -> trả về [] mà KHÔNG gọi truy vấn field-evidence (khỏi tốn round trip)', async () => {
    repo.query.mockResolvedValueOnce([]);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
    expect(repo.query).toHaveBeenCalledTimes(1);
  });

  it('truy vấn thứ hai lấy field-evidence đúng phạm vi: đúng candidate id, field_name=opening_hours, đúng whitelist trạng thái xác minh VÀ nguồn có thẩm quyền', async () => {
    mockCandidatesAndLinks([
      { id: 'p1', opening_hours: { a: 1 } },
      { id: 'p2', opening_hours: { b: 2 } },
    ]);
    await sut.rightNow({ limit: 6 });
    const [query, params] = repo.query.mock.calls[1];
    expect(sql(query)).toContain("pfel.field_name = 'opening_hours'");
    expect(sql(query)).toContain('pfel.place_id = ANY($1)');
    expect(sql(query)).toContain('ea.verification_status = ANY($2)');
    expect(sql(query)).toContain('JOIN sources s ON s.id = ea.source_id');
    expect(sql(query)).toContain('s.type = ANY($3)');
    expect(params[0]).toEqual(['p1', 'p2']);
    expect(params[1]).toEqual(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED']);
    expect(params[1]).not.toContain('NEEDS_REVIEW');
    expect(params[2]).toEqual(['official_website', 'business_owner', 'government']);
  });

  // Category 1: admin-backfill-only `official` (trusted status + opening_hours present, but no
  // field-evidence link at all) must NOT satisfy Right Now's operational "open now" claim — this
  // is the exact scenario the gate was built to close (see evidence-trust.ts / this repository's
  // rightNow() doc comment).
  it('place official CHỈ nhờ administrative backfill (không có field-evidence) bị loại khỏi Right Now', async () => {
    mockCandidatesAndLinks(
      [{ id: 'p1', opening_hours: { timezone: 'Asia/Ho_Chi_Minh', is_24h: false } }],
      [],
    );
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
  });

  // PR #24 merge-gate audit (2026-09-08): explicit, literal coverage for "pending + currently open
  // → excluded" using verification_status:'pending' in the mock — proves the SAME no-evidence
  // exclusion mechanism as the test above applies identically regardless of what verification_status
  // value a candidate carries (the query no longer reads it at all — see the "KHÔNG còn lọc" test).
  // `is_24h: true` stands in for "currently open" without needing real clock injection at this layer
  // (open/closed computation itself is a pure client-side concern — getOpeningToday() — never
  // performed by this repository; see rightNow()'s own doc comment).
  it('place pending, giờ mở cửa cho thấy đang mở, nhưng KHÔNG có field-evidence — vẫn bị loại khỏi Right Now', async () => {
    mockCandidatesAndLinks(
      [{ id: 'p1', opening_hours: { timezone: 'Asia/Ho_Chi_Minh', is_24h: true }, verification_status: 'pending' }],
      [],
    );
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
  });

  // Category 2/3: trust status + a gate-passing field-evidence link whose hash matches the
  // place's CURRENT opening_hours value qualifies.
  it('place có trạng thái tin cậy VÀ field-evidence khớp giá trị opening_hours hiện tại thì ĐƯỢC nhận vào Right Now', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '19:30' }] } };
    const hash = computeFieldValueHash(oh);
    mockCandidatesAndLinks([{ id: 'p1', opening_hours: oh }], [{ place_id: 'p1', field_value_hash: hash }]);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows.map((r) => r.id)).toEqual(['p1']);
  });

  // Category 4: a link whose hash was computed against an OLDER opening_hours value (the place's
  // hours have since changed) must not be mistaken for support of the current value.
  it('field_value_hash cũ (giá trị opening_hours đã đổi sau khi liên kết) KHÔNG được tính là hợp lệ', async () => {
    const oldValue = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '16:00' }] } };
    const currentValue = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '19:30' }] } };
    const staleHash = computeFieldValueHash(oldValue);
    mockCandidatesAndLinks([{ id: 'p1', opening_hours: currentValue }], [{ place_id: 'p1', field_value_hash: staleHash }]);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
  });

  // CASE 3 (Phase 5, PR #24 final review): a `pending` place — never separately reviewed at the
  // whole-place level — now QUALIFIES for Right Now as long as it is `published` (still required by
  // query 1's unchanged WHERE clause) and its opening_hours have real, current, gate-passing,
  // source-authoritative evidence. This is the deliberate behavior change of this review: the
  // place's own `verification_status` value is no longer read by rightNow() at all (the row shape
  // still carries it for the SELECT, but the query never filters on it — see the "KHÔNG còn lọc"
  // test above), so a mocked candidate can freely claim any verification_status here and the
  // outcome depends ONLY on the field-evidence link.
  it('place pending (chưa từng qua xác minh riêng) NHƯNG có field-evidence hợp lệ, có thẩm quyền vẫn ĐƯỢC nhận vào Right Now', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '19:30' }] } };
    const hash = computeFieldValueHash(oh);
    mockCandidatesAndLinks(
      [{ id: 'p1', opening_hours: oh, verification_status: 'pending' }],
      [{ place_id: 'p1', field_value_hash: hash }],
    );
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows.map((r) => r.id)).toEqual(['p1']);
  });

  // CASE 6 (Phase 5, PR #24 final review): "VERIFIED" evidence status alone does not guarantee the
  // backing SOURCE is credible — evidence_artifacts.verification_status is an unconstrained string
  // with no real write path in this codebase, so it cannot by itself vouch for source authority.
  // Query 2's `s.type = ANY($3)` filter is the mechanism that closes this; simulated here by NOT
  // returning a row from query 2 for a place whose only backing evidence is on a low-authority
  // source type (e.g. `community`/`facebook`/`ai`) — exactly what the real SQL's JOIN+WHERE would
  // do, since such a row would never be SELECTed by that query in the first place.
  it('field-evidence có trạng thái VERIFIED nhưng nguồn KHÔNG thuộc nhóm có thẩm quyền (official_website/business_owner/government) bị loại khỏi Right Now', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '19:30' }] } };
    // Query 2's own WHERE clause (s.type = ANY($3)) means a low-authority-source-backed link is
    // never part of its result set at all — represented here by an EMPTY links array, the same
    // outcome the real filtered SQL would produce for this scenario.
    mockCandidatesAndLinks([{ id: 'p1', opening_hours: oh }], []);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
  });

  // Category 6 (part 2): NEEDS_REVIEW evidence never appears among gate-passing statuses (locked
  // in by the "đúng whitelist trạng thái xác minh" test above); a link stuck at NEEDS_REVIEW is
  // simply never returned by query 2's own WHERE clause, so a candidate backed only by such a link
  // behaves identically to having no link at all — excluded.
  it('field-evidence còn ở NEEDS_REVIEW (chưa qua gate) bị coi như không có bằng chứng — vẫn loại khỏi Right Now', async () => {
    mockCandidatesAndLinks([{ id: 'p1', opening_hours: { a: 1 } }], []);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows).toEqual([]);
  });

  it('nhiều link cho cùng một place: chỉ cần MỘT hash khớp là đủ', async () => {
    const oh = { a: 1 };
    const hash = computeFieldValueHash(oh);
    mockCandidatesAndLinks(
      [{ id: 'p1', opening_hours: oh }],
      [
        { place_id: 'p1', field_value_hash: 'unrelated-hash-tu-mot-evidence-khac' },
        { place_id: 'p1', field_value_hash: hash },
      ],
    );
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows.map((r) => r.id)).toEqual(['p1']);
  });

  it('giữ nguyên thứ tự ORDER BY ban đầu sau khi lọc — không sắp xếp lại candidate hợp lệ', async () => {
    const oh = { a: 1 };
    const hash = computeFieldValueHash(oh);
    mockCandidatesAndLinks(
      [
        { id: 'p1', opening_hours: oh, rating_avg: 5 },
        { id: 'p2', opening_hours: oh, rating_avg: 4 },
        { id: 'p3', opening_hours: oh, rating_avg: 3 },
      ],
      [
        { place_id: 'p1', field_value_hash: hash },
        { place_id: 'p3', field_value_hash: hash },
      ],
    );
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p3']);
  });

  it('cắt về đúng limit của caller SAU KHI lọc evidence, không phải trước', async () => {
    const oh = { a: 1 };
    const hash = computeFieldValueHash(oh);
    const candidates = ['p1', 'p2', 'p3'].map((id) => ({ id, opening_hours: oh }));
    const links = ['p1', 'p2', 'p3'].map((id) => ({ place_id: id, field_value_hash: hash }));
    mockCandidatesAndLinks(candidates, links);
    const rows = await sut.rightNow({ limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('opening_hours object truyền qua row nguyên trạng (không đổi hình dạng) khi có evidence khớp', async () => {
    const oh = { timezone: 'Asia/Ho_Chi_Minh', is_24h: true };
    const hash = computeFieldValueHash(oh);
    mockCandidatesAndLinks([{ id: 'p1', opening_hours: oh }], [{ place_id: 'p1', field_value_hash: hash }]);
    const rows = await sut.rightNow({ limit: 6 });
    expect(rows[0].opening_hours).toEqual(oh);
  });
});
