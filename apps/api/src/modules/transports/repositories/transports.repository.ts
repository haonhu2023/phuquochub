import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PricingModel, TransportSort } from '../dto/transports.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

export interface TransportListFilters {
  transportType?: string;
  ward?: string;
  pricingModel?: PricingModel;
  bookingRequired?: boolean;
  airportTransfer?: boolean;
}

/**
 * Repository của miền Transport (ADR-017 — Accepted 2026-07-28).
 *
 * Khác Hotel/Restaurant/Tour/Attraction/Beach: Transport CÓ bảng vệ tinh (`place_transport_details`,
 * 1:1) NHƯNG trục phân loại chính là bảng từ điển (`transport_types`), không phải ENUM — xem lý
 * do đầy đủ ở docs/99-decisions/ADR-017-transport-domain-foundation.md.
 *
 * Nhiệm vụ nền tảng: chỉ đọc tối thiểu để chứng minh domain hoạt động (page/limit/sort, KHÔNG
 * có bộ lọc transport_type/ward/pricing_model/booleans — xem ghi chú ở ListTransportsQueryDto).
 * Mọi thao tác GHI vẫn đi qua PlacesService (một đường ghi duy nhất, giữ nguyên luồng kiểm
 * duyệt/revision) — repository này không có phương thức create/update nào.
 */
@Injectable()
export class TransportsRepository {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  // Cùng chủ trương mọi repository browse khác: ORDER BY cố định phía server, `p.id ASC` là
  // khoá phụ chốt cuối cho MỌI nhánh — tránh LIMIT/OFFSET cắt trang không xác định (GAP-12).
  private static readonly ORDER_BY: Record<TransportSort, string> = {
    rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
    name_asc: 'p.name ASC, p.id ASC',
    newest: 'p.created_at DESC, p.id ASC',
  };

  // JOIN categories/place_transport_details/transport_types đều N:1 trên khoá chính (hoặc
  // UNIQUE) ⇒ KHÔNG nhân dòng, không cần DISTINCT, count(*) vẫn đúng.
  private static readonly FROM = `
    places p
    JOIN categories c ON c.id = p.category_id AND c.slug = 'transport'
    JOIN place_transport_details ptd ON ptd.place_id = p.id
    JOIN transport_types tt ON tt.id = ptd.transport_type_id
  `;

  // Transport Browse Filters (2026-07-30) — cùng mẫu tham số hoá PlacesRepository.list()/
  // searchFullText() đã dùng (conds/args tích luỹ, filter tuỳ chọn). `ward` khớp qua EXISTS trên
  // transport_service_areas (1:N junction — KHÁC cột places.ward đơn của Hotel/Restaurant/Tour),
  // không JOIN thêm vào FROM chính để không nhân dòng (đã có INNER JOIN place_transport_details/
  // transport_types ở đó, không cần DISTINCT). booking_required/airport_transfer là tri-state:
  // `= $n` trong SQL tự nhiên KHÔNG khớp NULL khi $n là false — không cần CASE/COALESCE riêng.
  private static filterConds(filters: TransportListFilters, args: unknown[]): string {
    let extra = '';
    if (filters.transportType) {
      args.push(filters.transportType);
      extra += ` AND tt.code = $${args.length}`;
    }
    if (filters.ward) {
      args.push(filters.ward);
      extra += ` AND EXISTS (SELECT 1 FROM transport_service_areas tsa WHERE tsa.place_id = p.id AND tsa.ward = $${args.length})`;
    }
    if (filters.pricingModel) {
      args.push(filters.pricingModel);
      extra += ` AND ptd.pricing_model = $${args.length}`;
    }
    if (filters.bookingRequired !== undefined) {
      args.push(filters.bookingRequired);
      extra += ` AND ptd.booking_required = $${args.length}`;
    }
    if (filters.airportTransfer !== undefined) {
      args.push(filters.airportTransfer);
      extra += ` AND ptd.airport_transfer = $${args.length}`;
    }
    return extra;
  }

  async listTransports(
    limit: number,
    offset: number,
    sort: TransportSort = 'rating_desc',
    filters: TransportListFilters = {},
  ): Promise<CardRow[]> {
    const orderBy = TransportsRepository.ORDER_BY[sort];
    const args: unknown[] = [];
    const filterConds = TransportsRepository.filterConds(filters, args);
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có truy vấn riêng theo từng hàng ở
    // tầng application; tất cả nằm trong một round-trip SQL). `withCoverImageUrl` chỉ dựng URL từ
    // dữ liệu ĐÃ có trong row, cũng không truy vấn thêm.
    const rows: CardRow[] = await this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.ward, p.rating_avg, p.rating_count,
              p.verification_status,
              ${COVER_IMAGE_COLS},
              tt.code AS transport_type_code, tt.label_vi AS transport_type_label_vi, tt.label_en AS transport_type_label_en,
              ptd.pricing_model, ptd.price_ref, ptd.price_currency, ptd.price_unit,
              ptd.capacity_passengers, ptd.booking_required, ptd.airport_transfer,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM ${TransportsRepository.FROM}
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         ${filterConds}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
  }

  countTransports(filters: TransportListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const filterConds = TransportsRepository.filterConds(filters, args);
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM ${TransportsRepository.FROM}
         WHERE p.deleted_at IS NULL AND p.status = 'published'
           ${filterConds}`,
        args,
      )
      .then((r) => Number(r[0]?.c ?? 0));
  }

  /**
   * Chi tiết satellite theo place_id — dùng cho cả findBySlug (sau khi PlacesService phân giải
   * slug→id, đã lọc published/chưa xoá) và findByPlaceId (nội bộ, chưa qua PlacesService).
   * JOIN `places` ở đây để tự lọc `deleted_at IS NULL` — Place đã xoá mềm KHÔNG được lộ ra như
   * một Transport record còn hoạt động (yêu cầu tường minh của ADR-017), bất kể caller nào gọi.
   * KHÔNG lọc thêm `status` (khác `getDetailBySlug` của Places): đây là đường đọc nội bộ, chưa
   * public qua controller nào, nên giữ hành vi giống `getCardByIdIncludingInactive` (đặc quyền).
   */
  async detail(placeId: string) {
    const rows = await this.ds.query(
      `SELECT ptd.transport_type_id, tt.code AS transport_type_code, tt.label_vi AS transport_type_label_vi,
              tt.label_en AS transport_type_label_en, ptd.provider_business_id,
              ptd.pricing_model, ptd.price_ref, ptd.price_currency, ptd.price_unit,
              ptd.capacity_passengers, ptd.booking_required, ptd.airport_transfer, ptd.booking_note
       FROM place_transport_details ptd
       JOIN places p ON p.id = ptd.place_id AND p.deleted_at IS NULL
       JOIN transport_types tt ON tt.id = ptd.transport_type_id
       WHERE ptd.place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  listServiceOptions(placeId: string) {
    return this.ds.query(
      `SELECT id, name, capacity_passengers, price_ref, price_currency, price_unit, valid_from, valid_to, sort_order
       FROM transport_service_options WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  listRoutes(placeId: string) {
    return this.ds.query(
      `SELECT id, origin_label,
              CASE WHEN origin_location IS NULL THEN NULL ELSE ST_Y(origin_location::geometry) END AS origin_lat,
              CASE WHEN origin_location IS NULL THEN NULL ELSE ST_X(origin_location::geometry) END AS origin_lng,
              destination_label,
              CASE WHEN destination_location IS NULL THEN NULL ELSE ST_Y(destination_location::geometry) END AS destination_lat,
              CASE WHEN destination_location IS NULL THEN NULL ELSE ST_X(destination_location::geometry) END AS destination_lng,
              note, sort_order
       FROM transport_routes WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  listServiceAreas(placeId: string): Promise<Array<{ ward: string }>> {
    return this.ds.query(`SELECT ward FROM transport_service_areas WHERE place_id = $1 ORDER BY ward ASC`, [
      placeId,
    ]);
  }

  /** Từ điển loại hình (GET /transport-types) — chỉ loại còn active, sắp theo sort_order. */
  listTypes() {
    return this.ds.query(
      `SELECT id, code, label_vi, label_en, icon, parent_id, sort_order
       FROM transport_types WHERE is_active = true ORDER BY sort_order ASC, label_vi ASC`,
    );
  }
}
