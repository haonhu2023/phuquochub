import { DataSource } from 'typeorm';
import { TransportsRepository } from './transports.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('TransportsRepository — đọc nền tảng (ADR-017)', () => {
  let ds: LooseMock<DataSource>;
  let sut: TransportsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new TransportsRepository(ds, MEDIA_URL);
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
      // Ảnh bìa dùng mảnh SQL CHUNG (core/media-url/cover-image.ts). Ghim các vị từ BẢO MẬT ngay
      // tại truy vấn này thay vì chép nguyên chuỗi: chỉ ảnh đã duyệt, thuộc đúng cơ sở, chưa xoá
      // mềm mới ra được ảnh bìa; kèm cột id để tầng ứng dụng dựng URL API cho ảnh đã upload.
      expect(q).toContain('AS cover_image_url');
      expect(q).toContain('AS cover_image_media_id');
      expect(q).toContain("m.status = 'published'");
      expect(q).toContain('m.place_id = p.id');
      expect(q).toContain('m.deleted_at IS NULL');
      expect(q).toContain('tt.code AS transport_type_code, tt.label_vi AS transport_type_label_vi, tt.label_en AS transport_type_label_en');
      expect(q).toContain('ptd.pricing_model, ptd.price_ref, ptd.price_currency, ptd.price_unit');
      expect(q).toContain('ptd.capacity_passengers, ptd.booking_required, ptd.airport_transfer');
    });

    it('không có DISTINCT — mọi JOIN đều N:1 trên khoá chính/UNIQUE, không nhân dòng', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTransports(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('DISTINCT');
    });

    // Transport Browse Filters (2026-07-30)
    describe('filters', () => {
      it('không truyền filter → không thêm điều kiện tt.code/ptd.pricing_model/booking_required/airport_transfer/EXISTS ward nào', async () => {
        ds.query.mockResolvedValue([]);
        await sut.listTransports(20, 0);

        const [query, params] = ds.query.mock.calls[0];
        expect(sql(query)).not.toContain('tt.code =');
        expect(sql(query)).not.toContain('EXISTS');
        expect(sql(query)).not.toContain('ptd.pricing_model =');
        expect(sql(query)).not.toContain('ptd.booking_required =');
        expect(sql(query)).not.toContain('ptd.airport_transfer =');
        expect(params).toEqual([20, 0]); // hành vi y hệt trước khi có Transport Browse Filters
      });

      it('lọc cả 5 filter cùng lúc, đúng thứ tự placeholder, LIMIT/OFFSET dịch đúng theo số filter', async () => {
        ds.query.mockResolvedValue([]);
        await sut.listTransports(20, 0, 'rating_desc', {
          transportType: 'taxi',
          ward: 'An Thới',
          pricingModel: 'per_km',
          bookingRequired: true,
          airportTransfer: false,
        });

        const [query, params] = ds.query.mock.calls[0];
        const q = sql(query);
        expect(q).toContain('tt.code = $1');
        expect(q).toContain(
          'EXISTS (SELECT 1 FROM transport_service_areas tsa WHERE tsa.place_id = p.id AND tsa.ward = $2)',
        );
        expect(q).toContain('ptd.pricing_model = $3');
        expect(q).toContain('ptd.booking_required = $4');
        expect(q).toContain('ptd.airport_transfer = $5');
        expect(q).toContain('LIMIT $6 OFFSET $7');
        expect(params).toEqual(['taxi', 'An Thới', 'per_km', true, false, 20, 0]);
      });

      it('chỉ transport_type → chỉ 1 điều kiện lọc thêm, placeholder $1', async () => {
        ds.query.mockResolvedValue([]);
        await sut.listTransports(10, 0, 'rating_desc', { transportType: 'ferry' });

        const [query, params] = ds.query.mock.calls[0];
        expect(sql(query)).toContain('tt.code = $1');
        expect(sql(query)).not.toContain('EXISTS');
        expect(params).toEqual(['ferry', 10, 0]);
      });

      it('booking_required=false được lọc (khác "không truyền") — SQL "= false" tự nhiên KHÔNG khớp NULL', async () => {
        ds.query.mockResolvedValue([]);
        await sut.listTransports(20, 0, 'rating_desc', { bookingRequired: false });

        const [query, params] = ds.query.mock.calls[0];
        expect(sql(query)).toContain('ptd.booking_required = $1');
        expect(params).toEqual([false, 20, 0]);
      });

      it('ward dùng EXISTS trên transport_service_areas, tham số hoá (không nội suy chuỗi)', async () => {
        ds.query.mockResolvedValue([]);
        await sut.listTransports(20, 0, 'rating_desc', { ward: "An Thới' OR '1'='1" });

        const [query, params] = ds.query.mock.calls[0];
        expect(query).not.toContain("OR '1'='1");
        expect(params[0]).toBe("An Thới' OR '1'='1");
      });
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

    it('áp dụng cùng filters như listTransports (đếm khớp kết quả thật đã lọc)', async () => {
      ds.query.mockResolvedValue([{ c: 2 }]);
      await expect(sut.countTransports({ transportType: 'taxi', pricingModel: 'per_km' })).resolves.toBe(2);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('tt.code = $1');
      expect(q).toContain('ptd.pricing_model = $2');
      expect(q).not.toContain('LIMIT');
      expect(params).toEqual(['taxi', 'per_km']);
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

    // Public Beta price trust gate (2026-08-28): the repository layer is intentionally a raw
    // passthrough — it does NOT redact price_ref itself. Redaction happens one layer up, in
    // TransportsService's mapPricing()/mapServiceOption() (see transports.service.spec.ts sentinel
    // tests). This test pins that boundary: if the repository ever raw-passthrough behavior were
    // removed by mistake, the service-level redaction tests would then be vacuously true (nothing
    // to redact) instead of proving anything.
    it('price_ref đi qua nguyên vẹn ở tầng repository — redaction là trách nhiệm của service, không phải ở đây', async () => {
      const row = { transport_type_code: 'taxi', pricing_model: 'fixed', price_ref: '987654' };
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
