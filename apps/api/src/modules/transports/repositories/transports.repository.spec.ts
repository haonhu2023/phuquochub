import { DataSource } from 'typeorm';
import { TransportsRepository } from './transports.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('TransportsRepository — đọc nền tảng (ADR-017)', () => {
  let ds: LooseMock<DataSource>;
  let sut: TransportsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new TransportsRepository(ds);
  });

  describe('listTransports', () => {
    it('không tham số → chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('giới hạn đúng danh mục transport qua JOIN categories', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).toContain(
        "JOIN categories c ON c.id = p.category_id AND c.slug = 'transport'",
      );
    });

    it('JOIN place_transport_details + transport_types (bắt buộc, INNER JOIN) — mọi transport listing phải có cả hai', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('JOIN place_transport_details ptd ON ptd.place_id = p.id');
      expect(q).toContain('JOIN transport_types tt ON tt.id = ptd.transport_type_id');
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0, 'name_asc');

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('sort=newest → ORDER BY created_at DESC + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0, 'newest');

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.created_at DESC, p.id ASC');
    });

    it('offset tính theo trang: limit 5 offset 15 → LIMIT $1 OFFSET $2 = [5,15]', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(5, 15);

      expect(ds.query.mock.calls[0][1]).toEqual([5, 15]);
    });

    it('SELECT có cover_image_url, transport_type (code/label_vi/label_en), pricing đầy đủ — một query duy nhất (không N+1)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      expect(ds.query).toHaveBeenCalledTimes(1);
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain(
        '(SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url',
      );
      expect(q).toContain('tt.code AS transport_type_code, tt.label_vi AS transport_type_label_vi, tt.label_en AS transport_type_label_en');
      expect(q).toContain('ptd.pricing_model, ptd.price_ref, ptd.price_currency, ptd.price_unit');
      expect(q).toContain('ptd.capacity_passengers, ptd.booking_required, ptd.airport_transfer');
    });

    it('không có DISTINCT — mọi JOIN đều N:1 trên khoá chính/UNIQUE, không nhân dòng', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('DISTINCT');
    });
  });

  describe('countTransports', () => {
    it('cùng WHERE/JOIN như listTransports, không LIMIT/OFFSET (đếm toàn bộ tập đã lọc)', async () => {
      ds.query.mockResolvedValue([{ c: 4 }]);

      await expect(sut.countTransports()).resolves.toBe(4);

      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain("c.slug = 'transport'");
      expect(q).not.toContain('LIMIT');
    });

    it('không có dòng nào → 0 (không NaN/undefined)', async () => {
      ds.query.mockResolvedValue([]);
      await expect(sut.countTransports()).resolves.toBe(0);
    });
  });

  describe('detail', () => {
    it('JOIN places lọc deleted_at IS NULL — Place đã xoá mềm không lộ ra dù gọi trực tiếp bằng place_id', async () => {
      ds.query.mockResolvedValue([]);

      await sut.detail('p1');

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('JOIN places p ON p.id = ptd.place_id AND p.deleted_at IS NULL');
      expect(params).toEqual(['p1']);
    });

    it('JOIN transport_types cho nhãn loại hình, tham số hoá place_id (không nội suy chuỗi)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.detail("p1' OR '1'='1");

      const [query, params] = ds.query.mock.calls[0];
      expect(query).not.toContain("OR '1'='1");
      expect(params[0]).toBe("p1' OR '1'='1");
    });

    it('không có hàng nào → null (không ném lỗi ở tầng repository)', async () => {
      ds.query.mockResolvedValue([]);
      await expect(sut.detail('missing')).resolves.toBeNull();
    });

    it('có hàng → trả nguyên row đầu tiên', async () => {
      const row = { transport_type_code: 'taxi', pricing_model: 'fixed' };
      ds.query.mockResolvedValue([row]);
      await expect(sut.detail('p1')).resolves.toEqual(row);
    });
  });

  describe('listServiceOptions / listRoutes / listServiceAreas', () => {
    it('listServiceOptions: lọc theo place_id, sắp theo sort_order', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listServiceOptions('p1');
      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('FROM transport_service_options WHERE place_id = $1 ORDER BY sort_order ASC');
      expect(params).toEqual(['p1']);
    });

    it('listRoutes: toạ độ NULL-safe qua CASE WHEN (không ném lỗi ST_Y trên NULL)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listRoutes('p1');
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('CASE WHEN origin_location IS NULL THEN NULL ELSE ST_Y(origin_location::geometry) END');
      expect(q).toContain('CASE WHEN destination_location IS NULL THEN NULL ELSE ST_X(destination_location::geometry) END');
    });

    it('listServiceAreas: trả về ward, sắp theo ward', async () => {
      ds.query.mockResolvedValue([{ ward: 'An Thới' }]);
      await expect(sut.listServiceAreas('p1')).resolves.toEqual([{ ward: 'An Thới' }]);
      expect(sql(ds.query.mock.calls[0][0])).toContain('FROM transport_service_areas WHERE place_id = $1 ORDER BY ward ASC');
    });
  });

  describe('listTypes', () => {
    it('chỉ lấy loại còn active, sắp theo sort_order rồi label_vi', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTypes();

      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('WHERE is_active = true');
      expect(q).toContain('ORDER BY sort_order ASC, label_vi ASC');
    });

    it('không tham số nào (danh sách cố định, không lọc theo input người dùng)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listTypes();
      expect(ds.query.mock.calls[0][1]).toBeUndefined();
    });
  });
});
