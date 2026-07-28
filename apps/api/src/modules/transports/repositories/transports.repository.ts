import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransportSort } from '../dto/transports.dto';

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
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

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

  listTransports(limit: number, offset: number, sort: TransportSort = 'rating_desc') {
    const orderBy = TransportsRepository.ORDER_BY[sort];
    // Một correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có truy vấn riêng theo từng
    // hàng ở tầng application; tất cả nằm trong một round-trip SQL).
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.ward, p.rating_avg, p.rating_count,
              p.verification_status,
              (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url,
              tt.code AS transport_type_code, tt.label_vi AS transport_type_label_vi, tt.label_en AS transport_type_label_en,
              ptd.pricing_model, ptd.price_ref, ptd.price_currency, ptd.price_unit,
              ptd.capacity_passengers, ptd.booking_required, ptd.airport_transfer,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM ${TransportsRepository.FROM}
       WHERE p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY ${orderBy}
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  countTransports(): Promise<number> {
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM ${TransportsRepository.FROM}
         WHERE p.deleted_at IS NULL AND p.status = 'published'`,
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
