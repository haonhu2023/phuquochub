import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { VerificationStatusValue } from '@phuquochub/shared-types';
import { Place } from '../entities/place.entity';
import { PlaceStatus, PriceRange } from '../place.enums';

// Row phẳng cho card (đã trích lng/lat từ geography).
export interface PlaceCardRow {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  short_description: string | null;
  price_range: PriceRange | null;
  cover_image_url: string | null;
  rating_avg: string | null;
  rating_count: number;
  // Cột là ENUM "verification_status" NOT NULL ở DB (InitPlaces1720000400000:47), nên tập giá
  // trị đóng — khai đúng ngay tại row thay vì để mapper phải ép kiểu (F-18). Union này lấy từ
  // shared-types vì nó CHÍNH LÀ tập giá trị của enum, dùng chung cả hai phía; `status` bên dưới
  // đã theo tiền lệ tương tự với enum nội bộ PlaceStatus.
  verification_status: VerificationStatusValue;
  status: PlaceStatus;
  lat: number;
  lng: number;
  distance_m?: number;
  /**
   * ts_rank của searchFullText — tín hiệu xếp hạng NỘI BỘ, KHÔNG thuộc hợp đồng công khai.
   *
   * F-17/OD-F-17: `score` đã bị gỡ khỏi shared-types `PlaceCard` và khỏi toPlaceCard, nhưng
   * GIỮ LẠI ở đây vì nó thực sự có người dùng và có mục đích rõ ràng: SearchService đọc
   * `r.score` (search.service.ts:24) để dựng `SearchResult` — một schema riêng, không phải
   * PlaceCard. Không có đường nào đưa trường này ra PlaceCard nữa.
   */
  score?: number;
}

// Row chi tiết = card + trường mở rộng (khớp openapi Place).
export interface PlaceDetailRow extends PlaceCardRow {
  /**
   * Slug danh mục (`categories.slug`) — chỉ có ở đường CHI TIẾT, không có ở card.
   * `category_id` một mình là UUID mà client không làm gì được nếu không gọi thêm
   * `GET /categories`; slug cho phép trang chi tiết biết mình thuộc nhóm nào (vd trỏ
   * breadcrumb về đúng trang duyệt `/attractions`) mà không cần round-trip thứ hai.
   */
  category_slug: string | null;
  address: string | null;
  ward: string | null;
  description: string | null;
  opening_hours: Record<string, unknown> | null;
  osm_id: string | null; // bigint → string qua driver
  created_at: Date;
  updated_at: Date;
}

// FAQ published của Place (đọc cho trang chi tiết).
export interface PlaceFaqRow {
  id: string;
  question: string;
  answer: string;
  sort_order: number | null;
  is_ai_generated: boolean;
  status: string;
}

// Cụm điểm bản đồ (grid clustering theo bbox+zoom).
export interface GeoClusterRow {
  cnt: number;
  lng: number;
  lat: number;
  sample_id: string;
  sample_slug: string;
  sample_name: string;
}

export interface CreatePlaceRow {
  name: string;
  slug: string;
  categoryId: string;
  lng: number;
  lat: number;
  address?: string | null;
  ward?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  openingHours?: Record<string, unknown> | null;
  priceRange?: PriceRange | null;
  status: PlaceStatus;
  createdBy?: string | null;
}

// Repository Pattern cho `places`. Ghi + đọc không gian đi qua raw SQL tham số hóa
// (ST_MakePoint/ST_DWithin/FTS) — geo tập trung một chỗ (coding-standard §7).
// cover_image_url: resolve URL của media cover (openapi PlaceCard.cover_image_url, format uri).
// Subquery scalar → dùng chung mọi truy vấn card mà không cần đổi FROM.
//
// `AND m.status = 'published'` (Secure Private Media, 2026-08-10): trước đây subquery này KHÔNG lọc
// status — bất biến "chỉ media published mới lộ URL" được thực thi ở `toMedia()` nhưng cover đi
// đường raw SQL riêng, KHÔNG qua mapper đó. Trên thực tế chưa từng rò rỉ (đường upload luôn ghi
// `url = NULL`, và không có luồng nào ghi `cover_image_id`), nên đây là bịt lỗ hổng theo chiều sâu
// TRƯỚC khi có luồng đặt cover, không phải vá một sự cố. Cùng vị từ được lặp lại y hệt ở 6
// repository chuyên biệt khác (attractions/beaches/hotels/restaurants/tours/transports).
const CARD_COLS = `
  p.id, p.name, p.slug, p.category_id, p.short_description, p.price_range,
  (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL AND m.status = 'published') AS cover_image_url,
  p.rating_avg, p.rating_count, p.verification_status, p.status,
  ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
`;

@Injectable()
export class PlacesRepository {
  constructor(
    @InjectRepository(Place)
    private readonly repo: Repository<Place>,
  ) {}

  async existsBySlug(slug: string): Promise<boolean> {
    const rows = await this.repo.query(`SELECT 1 FROM places WHERE slug = $1 LIMIT 1`, [slug]);
    return rows.length > 0;
  }

  /**
   * Chỉ trả về CÓ/KHÔNG tồn tại (không lộ status/nội dung) — dùng cho các module khác cần xác
   * nhận place_id hợp lệ (vd ReviewsService.create) mà không cần đọc `getCardByIdIncludingInactive`
   * (privileged, xem places-privileged-access.arch.spec.ts) hay `getDetailBySlug` (chỉ published).
   */
  async existsById(id: string): Promise<boolean> {
    return this.repo.exists({ where: { id } });
  }

  /**
   * Xác nhận Place tồn tại (chưa xoá mềm) VÀ thuộc đúng category slug — dùng để BookingsService
   * đối chiếu `entity_type` khai báo khớp category thật của `place_id`, không tin dữ liệu client.
   */
  async existsByIdAndCategorySlug(id: string, categorySlug: string): Promise<boolean> {
    const rows = await this.repo.query(
      `SELECT 1 FROM places p JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND c.slug = $2 AND p.deleted_at IS NULL LIMIT 1`,
      [id, categorySlug],
    );
    return rows.length > 0;
  }

  async createPlace(input: CreatePlaceRow): Promise<string> {
    const rows: Array<{ id: string }> = await this.repo.query(
      `INSERT INTO places
         (name, slug, category_id, location, address, ward, description, short_description,
          opening_hours, price_range, status, created_by)
       VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,
               $6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        input.name,
        input.slug,
        input.categoryId,
        input.lng,
        input.lat,
        input.address ?? null,
        input.ward ?? null,
        input.description ?? null,
        input.shortDescription ?? null,
        input.openingHours ?? null,
        input.priceRange ?? null,
        input.status,
        input.createdBy ?? null,
      ],
    );
    return rows[0].id;
  }

  // GAP-13 (PLACE-007): `getCardBySlug` đã được GỠ BỎ. Không có consumer nào trong toàn
  // repository, và nó chỉ lọc `deleted_at IS NULL` — thiếu lọc `status` mà đường đọc công khai
  // theo slug (`getDetailBySlug`) bắt buộc phải có. Giữ lại là để sẵn một cái bẫy: ai đó nối
  // vào route công khai sau này sẽ làm tái xuất đúng lỗ hổng GAP-02/04 đã vá.
  //
  // F-24 / OD-B2 (PLACE-022, 2026-07-24): phương thức dưới đây ĐÃ ĐỔI TÊN từ `getCardById` thành
  // `getCardByIdIncludingInactive` để tên GỌI RÕ rủi ro. Nó CỐ TÌNH KHÔNG lọc `status` — trả về
  // cả bản `pending`/`draft`/`archived` (không public) — vì luồng kiểm duyệt/ghi (create/update/
  // archive/approve) cần đọc bản chưa publish. Vì thế:
  //   • Đây là truy cập ĐẶC QUYỀN: caller PHẢI đã được kiểm tra quyền TRƯỚC (route gắn
  //     @RequirePermissions, KHÔNG bao giờ @Public). Xem test kiến trúc
  //     apps/api/test/places-privileged-access.arch.spec.ts (chặn mọi đường @Public chạm tới đây).
  //   • KHÔNG "sửa" bằng cách thêm lọc status: thêm lọc là đoán ý định mà repository không xác
  //     định được và sẽ phá luồng kiểm duyệt. Cần đọc card công khai: dùng `getDetailBySlug`
  //     (đã lọc `status = published`) hoặc viết truy vấn mới có lọc status ngay tại đó.
  //
  // Place Content Management MVP (2026-08-11): hàng trả về được MỞ RỘNG từ shape card sang shape
  // chi tiết (address/ward/description/opening_hours/category_slug/osm_id/timestamps — CÙNG cột
  // với `getDetailBySlug`, chỉ khác WHERE không lọc `status`). Đây là mở rộng THÊM cột (superset
  // của `PlaceCardRow`), không đổi bất kỳ cột nào đã có — bốn caller hiện tại (create/update/
  // archive/approve, đều chỉ đọc `toPlaceCard(row)`) không bị ảnh hưởng. Lý do mở rộng: PLACE-041
  // (`PlacesService.listMine()`) cần đọc chi tiết đầy đủ của place mà CHÍNH người gọi quản lý (kể
  // cả khi `pending`/`draft`) để dựng form Edit — không có route công khai nào làm được việc đó
  // (`getDetailBySlug` chỉ trả `published`), và thêm một phương thức đặc quyền THỨ HAI sẽ phải mở
  // rộng guard kiến trúc ở trên sang nhiều phương thức, phức tạp hơn cần thiết cho MVP này.
  async getCardByIdIncludingInactive(id: string): Promise<PlaceDetailRow | null> {
    const rows: PlaceDetailRow[] = await this.repo.query(
      `SELECT ${CARD_COLS},
              (SELECT c.slug FROM categories c WHERE c.id = p.category_id) AS category_slug,
              p.address, p.ward, p.description, p.opening_hours, p.osm_id,
              p.created_at, p.updated_at
       FROM places p WHERE p.id = $1 AND p.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Row chi tiết cho trang công khai (card + address/ward/description/opening_hours/osm_id/
   * timestamps). Chỉ trả Place đã `published` — giống `nearby()`/`bbox()`: nội dung
   * `draft`/`pending` chưa qua kiểm duyệt **không** được lộ ra kênh công khai.
   * Luồng xem trước của moderator (nếu có) phải dùng truy vấn riêng đã kiểm tra quyền.
   */
  async getDetailBySlug(slug: string): Promise<PlaceDetailRow | null> {
    const rows: PlaceDetailRow[] = await this.repo.query(
      `SELECT ${CARD_COLS},
              (SELECT c.slug FROM categories c WHERE c.id = p.category_id) AS category_slug,
              p.address, p.ward, p.description, p.opening_hours, p.osm_id,
              p.created_at, p.updated_at
       FROM places p
       WHERE p.slug = $1 AND p.deleted_at IS NULL AND p.status = $2
       LIMIT 1`,
      [slug, PlaceStatus.PUBLISHED],
    );
    return rows[0] ?? null;
  }

  /** FAQ đã duyệt của Place (place_faqs — satellite của places). */
  listFaqs(placeId: string): Promise<PlaceFaqRow[]> {
    return this.repo.query(
      `SELECT id, question, answer, sort_order, is_ai_generated, status
       FROM place_faqs
       WHERE place_id = $1 AND status = 'published'
       ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
      [placeId],
    );
  }

  /**
   * Cập nhật trường scalar (không đụng location). `manager` TUỲ CHỌN — cùng quy ước
   * `recalculateRating()`: truyền vào khi caller cần chạy trong transaction của họ; bỏ trống dùng
   * `this.repo` như trước (không phá vỡ lời gọi cũ nào ngoài transaction).
   *
   * Caller DUY NHẤT ghi `verification_status`/`verified_at` qua đây là
   * `VerificationsService.syncTargetCache()` (ADR-008) — nó cần `manager` để đồng bộ cache CÙNG
   * transaction với `verifications`/`verification_events` (§5C "một transition = một transaction").
   * `BusinessClaimsService.decide()` từng ghi cặp cột đó trực tiếp ở đây nhưng KHÔNG còn nữa kể từ
   * CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06) — nó gọi
   * `VerificationsService.ensureOfficialFromClaim()` thay thế. Mọi caller khác (vd
   * `PlacesService.update()`) chỉ truyền các cột nội dung, KHÔNG bao giờ cặp cột cache xác minh.
   */
  async updateScalars(id: string, patch: Record<string, unknown>, manager?: EntityManager): Promise<void> {
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      return;
    }
    const runner = manager ? manager.getRepository(Place) : this.repo;
    await runner.update({ id }, patch);
  }

  async updateLocation(id: string, lng: number, lat: number): Promise<void> {
    await this.repo.query(
      `UPDATE places SET location = ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, updated_at = now() WHERE id = $1`,
      [id, lng, lat],
    );
  }

  async archive(id: string): Promise<void> {
    await this.repo.query(
      `UPDATE places SET status = 'archived', deleted_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async setStatus(id: string, status: PlaceStatus): Promise<void> {
    await this.repo.update({ id }, { status });
  }

  /**
   * Tính lại rating_avg/rating_count từ reviews `published` — luôn đọc lại từ trạng thái
   * `published` hiện tại (không cộng dồn tăng/giảm thủ công), nên đúng bất kể lý do thay đổi:
   * tạo review mới (ReviewsRepository.createWithMedia — ADR-018 T1), hoặc một review bị
   * hide/restore bởi kiểm duyệt (T2, M4 — INV-4 "mọi thay đổi reviews.status làm đổi tập
   * published phải gọi hàm này trong CÙNG transaction").
   *
   * `manager` TUỲ CHỌN — truyền vào khi caller cần hàm này chạy trong transaction của họ (T1/T2);
   * bỏ trống dùng `this.repo` như trước (không phá vỡ lời gọi cũ nào ngoài transaction).
   */
  async recalculateRating(placeId: string, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.repo;
    await runner.query(
      `UPDATE places SET
         rating_avg = (SELECT round(avg(rating)::numeric, 1) FROM reviews WHERE place_id = $1 AND status = 'published'),
         rating_count = (SELECT count(*)::int FROM reviews WHERE place_id = $1 AND status = 'published')
       WHERE id = $1`,
      [placeId],
    );
  }

  /**
   * Danh sách Place có lọc + phân trang.
   * `status` là tham số **đặc quyền**: bỏ trống ⇒ chỉ `published` (mặc định an toàn cho
   * kênh công khai). Chỉ truyền `status` khác khi caller đã được kiểm tra quyền —
   * **không** nhận thẳng từ query string công khai (xem `ListPlacesQueryDto`).
   */
  async list(params: {
    category?: string;
    ward?: string;
    priceRange?: PriceRange;
    status?: PlaceStatus;
    limit: number;
    offset: number;
  }): Promise<{ items: PlaceCardRow[]; total: number }> {
    const conds: string[] = ['p.deleted_at IS NULL'];
    const args: unknown[] = [];
    if (params.category) {
      args.push(params.category);
      conds.push(`p.category_id = $${args.length}`);
    }
    if (params.ward) {
      args.push(params.ward);
      conds.push(`p.ward = $${args.length}`);
    }
    if (params.priceRange) {
      args.push(params.priceRange);
      conds.push(`p.price_range = $${args.length}`);
    }
    // Mặc định chỉ public; cho phép override khi truyền status.
    args.push(params.status ?? PlaceStatus.PUBLISHED);
    conds.push(`p.status = $${args.length}`);

    const where = conds.join(' AND ');
    const countRows: Array<{ count: string }> = await this.repo.query(
      `SELECT count(*)::int AS count FROM places p WHERE ${where}`,
      args,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // GAP-12: `p.id ASC` là khoá phụ DUY NHẤT chốt cuối — bắt buộc cho phân trang
    // LIMIT/OFFSET. rating_avg là numeric(2,1) (rất nhiều giá trị trùng + cả nhóm NULL) và
    // created_at mặc định `now()` chung khi seed/import, nên hai khoá đầu KHÔNG tạo được thứ
    // tự toàn phần: Postgres được phép xếp các hàng bằng nhau khác đi giữa hai lần chạy →
    // một hàng có thể xuất hiện ở hai trang hoặc biến mất. Thứ tự người dùng thấy không đổi:
    // p.id chỉ phân xử khi hai khoá trước đã bằng nhau.
    const items: PlaceCardRow[] = await this.repo.query(
      `SELECT ${CARD_COLS} FROM places p WHERE ${where}
       ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, params.limit, params.offset],
    );
    return { items, total };
  }

  /**
   * Địa điểm trong bán kính (mét) — ST_DWithin trên GIST.
   *
   * F-16 (PLACE-014): `p.id ASC` là khoá phụ chốt cuối. distance_m là số thực nên hoà nhau
   * hiếm — nhưng KHÔNG phải không xảy ra: hai cơ sở cùng một địa chỉ có toạ độ trùng khít sẽ
   * cho ST_Distance bằng nhau tuyệt đối. Khi số hàng khớp vượt LIMIT, hàng nào lọt vào lát cắt
   * là tuỳ planner ⇒ hai lần gọi giống hệt nhau có thể trả tập khác nhau. Khoá phụ chỉ phân xử
   * đúng các hàng ĐÃ bằng nhau, nên thứ tự theo khoảng cách mà người dùng thấy không đổi.
   */
  async nearby(params: {
    lat: number;
    lng: number;
    radius: number;
    category?: string;
    limit: number;
  }): Promise<PlaceCardRow[]> {
    const args: unknown[] = [params.lng, params.lat, params.radius];
    let categoryCond = '';
    if (params.category) {
      args.push(params.category);
      categoryCond = `AND p.category_id = $${args.length}`;
    }
    args.push(params.limit);
    return this.repo.query(
      `SELECT ${CARD_COLS},
              ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
       FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
         ${categoryCond}
       ORDER BY distance_m ASC, p.id ASC
       LIMIT $${args.length}`,
      args,
    );
  }

  // F-33 (PLACE-019, 2026-07-23): `bbox()` REMOVED — it had no consumer. GeoService.bbox() calls
  // bboxClusters() (geo.service.ts:40), not this method. A four-pass repository sweep (bare
  // identifier, dynamic bracket access, every 'bbox' identifier, and all spec files) found ZERO
  // callers, and tsc exit 0 confirms none existed at compile time. Same class as GAP-13
  // (getCardBySlug, PLACE-007) but with no security trap, since it filtered status = 'published'.
  // Restore instructions: reports/PLACE-019-pre-build-readiness-report.md §10.

  /**
   * Gom cụm điểm theo lưới đều `cellDeg` (độ) trong bbox — trả điểm gom cụm cho bản đồ
   * (api.md §11 "clustered points"). Cell 1 điểm ⇒ trả điểm; nhiều điểm ⇒ cụm (count+centroid).
   *
   * F-34 / OD-B3 (PLACE-023, 2026-07-24): `ORDER BY cnt DESC, sample_id ASC` được thêm TRƯỚC
   * `LIMIT $6` để việc CẮT ở 500 là XÁC ĐỊNH. Trước đây không có ORDER BY nên khi số cell vượt 500,
   * planner tự chọn 500 hàng nào sống sót ⇒ hai lần gọi giống hệt có thể trả tập khác nhau và cụm
   * dày có thể bị bỏ tuỳ tiện. Nay: giữ các cụm DÀY nhất trước (`cnt DESC`), và `sample_id ASC` là
   * khoá phụ DUY NHẤT chốt cuối. `sample_id` = `(array_agg(p.id ORDER BY p.id))[1]` = id nhỏ nhất
   * trong cell; mỗi place thuộc đúng một cell nên id-nhỏ-nhất-mỗi-cell là DUY NHẤT giữa các cell,
   * và p.id là PK bất biến — đúng khoá `p.id ASC` mà list()/nearby()/searchFullText() đã dùng. Chỉ
   * đổi THỨ TỰ: grouping, cell size, tổng hợp và WHERE giữ nguyên; schema trả về không đổi.
   */
  // Search Filters (category/ward) — cùng cột/điều kiện list()/searchFullText() đã dùng
  // (searchFilterConds), tham số hoá giống hệt. Chèn TRƯỚC cellDeg/limit nên hai chỉ số đó phải
  // tính động theo args.length thay vì hằng số $5/$6 như cũ.
  async bboxClusters(params: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    cellDeg: number;
    limit: number;
    category?: string;
    ward?: string;
  }): Promise<GeoClusterRow[]> {
    const args: unknown[] = [params.minLng, params.minLat, params.maxLng, params.maxLat];
    const filterConds = this.searchFilterConds({ category: params.category, ward: params.ward }, args);
    const cellIdx = args.length + 1;
    const limitIdx = args.length + 2;
    args.push(params.cellDeg, params.limit);
    return this.repo.query(
      `SELECT count(*)::int AS cnt,
              avg(ST_X(p.location::geometry)) AS lng,
              avg(ST_Y(p.location::geometry)) AS lat,
              (array_agg(p.id ORDER BY p.id))[1] AS sample_id,
              (array_agg(p.slug ORDER BY p.id))[1] AS sample_slug,
              (array_agg(p.name ORDER BY p.id))[1] AS sample_name
       FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND ST_Intersects(p.location::geometry, ST_MakeEnvelope($1,$2,$3,$4,4326))
         ${filterConds}
       GROUP BY floor(ST_X(p.location::geometry) / $${cellIdx}), floor(ST_Y(p.location::geometry) / $${cellIdx})
       ORDER BY cnt DESC, sample_id ASC
       LIMIT $${limitIdx}`,
      args,
    );
  }

  // Cùng shape với list()'s params — tái dùng nguyên xi cho searchFullText/searchCount
  // (Search Filters, category/ward/price_range trên kết quả FTS).
  private searchFilterConds(
    params: { category?: string; ward?: string; priceRange?: PriceRange },
    args: unknown[],
  ): string {
    let extra = '';
    if (params.category) {
      args.push(params.category);
      extra += ` AND p.category_id = $${args.length}`;
    }
    if (params.ward) {
      args.push(params.ward);
      extra += ` AND p.ward = $${args.length}`;
    }
    if (params.priceRange) {
      args.push(params.priceRange);
      extra += ` AND p.price_range = $${args.length}`;
    }
    return extra;
  }

  async searchCount(
    q: string,
    filters: { category?: string; ward?: string; priceRange?: PriceRange } = {},
  ): Promise<number> {
    const args: unknown[] = [q];
    const filterConds = this.searchFilterConds(filters, args);
    const rows: Array<{ count: string }> = await this.repo.query(
      `SELECT count(*)::int AS count FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND to_tsvector('simple', immutable_unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')))
             @@ plainto_tsquery('simple', immutable_unaccent($1))
         ${filterConds}`,
      args,
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Tìm kiếm FTS tiếng Việt không dấu (immutable_unaccent + ts_rank).
   *
   * F-32: `score` (ts_rank) KHÔNG duy nhất — nhiều tài liệu khớp truy vấn ngang nhau cho ra
   * cùng một giá trị, chuyện thường gặp với truy vấn ngắn trên name+description. Đây là query
   * DUY NHẤT trong repo vừa `ORDER BY` khoá không duy nhất vừa phân trang bằng OFFSET
   * (search.service.ts:16 truyền `(page-1)*limit`), nên đúng lỗi GAP-12: giữa hai lần truy vấn
   * trang 1 và trang 2, planner có thể xếp các hàng hoà nhau khác đi ⇒ người dùng thấy một
   * Place hai lần hoặc không bao giờ thấy. `p.id ASC` là khoá cuối DUY NHẤT (PK, NOT NULL),
   * chỉ phân xử các hàng ĐÃ hoà `score` nên không đụng tới thứ tự liên quan.
   *
   * `filters` (category/ward/price_range) — Search Filters — dùng đúng cột/điều kiện `list()`
   * đã dùng (p.category_id/p.ward/p.price_range), tham số hoá giống hệt, chỉ khác WHERE gốc
   * là điều kiện FTS thay vì không-filter.
   */
  async searchFullText(
    q: string,
    limit: number,
    offset: number,
    filters: { category?: string; ward?: string; priceRange?: PriceRange } = {},
  ): Promise<PlaceCardRow[]> {
    const args: unknown[] = [q];
    const filterConds = this.searchFilterConds(filters, args);
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    return this.repo.query(
      `SELECT ${CARD_COLS},
              ts_rank(
                to_tsvector('simple', immutable_unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,''))),
                plainto_tsquery('simple', immutable_unaccent($1))
              ) AS score
       FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND to_tsvector('simple', immutable_unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')))
             @@ plainto_tsquery('simple', immutable_unaccent($1))
         ${filterConds}
       ORDER BY score DESC, p.id ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
  }
}
