import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { VerificationStatusValue } from '@phuquochub/shared-types';
import { Place } from '../entities/place.entity';
import { PlaceStatus, PriceRange } from '../place.enums';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import {
  COVER_IMAGE_COLS,
  CoverImageColumns,
  withCoverImageUrl,
  withCoverImageUrlOne,
} from '../../../core/media-url/cover-image';
import { computeFieldValueHash } from '../../evidence/field-value-hash';
import { OFFICIAL_SOURCE_TYPES } from '../../evidence/evidence-trust';

// Row phẳng cho card (đã trích lng/lat từ geography).
//
// `cover_image_url` (+ cột nội bộ `cover_image_media_id`) đến từ `CoverImageColumns`. Mọi phương
// thức trả row ở đây đều đã chạy qua `withCoverImageUrl()` TRƯỚC KHI trả, nên với caller
// `cover_image_url` là URL cuối cùng và `cover_image_media_id` không còn tồn tại.
export interface PlaceCardRow extends CoverImageColumns {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  short_description: string | null;
  price_range: PriceRange | null;
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

// Trusted Nearby + Opening State v0 — card row + `opening_hours`, dùng chung bởi
// `nearbyTrusted()` và `rightNow()` (GET /geo/nearby-trusted, GET /places/now). KHÔNG gộp vào
// PlaceCardRow: không caller nào khác của PlaceCardRow cần cột này.
export interface PlaceNowCardRow extends PlaceCardRow {
  opening_hours: Record<string, unknown> | null;
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
  /** Nhãn khu vực (vd `Dương Đông`) — KHÔNG phải đơn vị hành chính, xem `admin_area`. */
  ward: string | null;
  /** Tỉnh/thành hiện hành → schema.org `addressRegion`. `null` = chưa xác minh (không đoán). */
  province: string | null;
  /** Đơn vị hành chính cấp xã hiện hành → `addressLocality`. */
  admin_area: string | null;
  description: string | null;
  opening_hours: Record<string, unknown> | null;
  osm_id: string | null; // bigint → string qua driver
  created_at: Date;
  updated_at: Date;
  /**
   * Lần cuối chuyển sang trạng thái tin cậy (`verified`/`official`/`community_verified`) — CHỈ
   * `VerificationsService.syncTargetCache()` ghi cột này (xem chú thích `updateScalars` dưới),
   * và chỉ ghi khi ĐẾN một trong ba trạng thái đó (`isTrustedStatus()`). `null` = chưa từng đạt
   * trạng thái tin cậy. Cột tồn tại từ InitPlaces nhưng CHƯA từng lộ ra hợp đồng công khai trước
   * Place Trust & Freshness Surface — không có gì phải backfill, chỉ cần đọc ra.
   */
  verified_at: Date | null;
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
  province?: string | null;
  adminArea?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  openingHours?: Record<string, unknown> | null;
  priceRange?: PriceRange | null;
  status: PlaceStatus;
  createdBy?: string | null;
}

// Repository Pattern cho `places`. Ghi + đọc không gian đi qua raw SQL tham số hóa
// (ST_MakePoint/ST_DWithin/FTS) — geo tập trung một chỗ (coding-standard §7).
//
// cover_image_url (openapi PlaceCard.cover_image_url, format uri) đến từ `COVER_IMAGE_COLS` —
// MỘT định nghĩa dùng chung với 6 repository chuyên biệt (attractions/beaches/hotels/restaurants/
// tours/transports), xem core/media-url/cover-image.ts để biết đủ ba bất biến nó cưỡng chế
// (published-only, đúng cơ sở, chưa xoá mềm) và vì sao URL cuối cùng phải được phân giải ở tầng
// ứng dụng (`withCoverImageUrl`) thay vì trong SQL. Subquery scalar → dùng chung mọi truy vấn card
// mà không cần đổi FROM; một correlated subquery/cột, KHÔNG phải N+1.
const CARD_COLS = `
  p.id, p.name, p.slug, p.category_id, p.short_description, p.price_range,
  ${COVER_IMAGE_COLS},
  p.rating_avg, p.rating_count, p.verification_status, p.status,
  ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
`;

// rightNow()'s trust+presence candidate query is overfetched by this factor (capped) before
// current-value field-evidence filtering removes ineligible rows — see that method's own comment
// for why the filter can't happen inside the same SQL statement. 5x/60 keeps this a small, bounded
// operation: RIGHT_NOW_MAX_LIMIT (12, places.service.ts) × 5 = 60, already at the cap, so the
// multiplier never actually exceeds it in practice — both constants are named explicitly anyway so
// neither bound is a silent, undocumented ceiling.
const RIGHT_NOW_CANDIDATE_MULTIPLIER = 5;
const RIGHT_NOW_CANDIDATE_CAP = 60;

// Cột CHỈ có ở shape chi tiết (`PlaceDetailRow` = card + những cột này). Tách hằng số vì HAI truy
// vấn dùng chung y hệt danh sách này — `getDetailBySlug` (công khai, lọc published) và
// `getCardByIdIncludingInactive` (đặc quyền, không lọc status). Trước đây danh sách được viết lặp
// hai lần, nên thêm một cột mà quên một chỗ thì trường đó lặng lẽ thành `undefined` ở đúng một
// đường đọc — kiểu lỗi chỉ lộ ra ở production. Một định nghĩa, hai chỗ dùng, không lệch được.
const DETAIL_EXTRA_COLS = `
  (SELECT c.slug FROM categories c WHERE c.id = p.category_id) AS category_slug,
  p.address, p.ward, p.province, p.admin_area, p.description, p.opening_hours, p.osm_id,
  p.created_at, p.updated_at, p.verified_at
`;

@Injectable()
export class PlacesRepository {
  constructor(
    @InjectRepository(Place)
    private readonly repo: Repository<Place>,
    // MediaUrlService là @Global (core/media-url) — chỉ để dựng URL API ổn định cho ảnh bìa đã
    // upload; repository KHÔNG chạm tới object storage ở bất kỳ đâu.
    private readonly mediaUrl: MediaUrlService,
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
         (name, slug, category_id, location, address, ward, province, admin_area, description,
          short_description, opening_hours, price_range, status, created_by)
       VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,
               $6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        input.name,
        input.slug,
        input.categoryId,
        input.lng,
        input.lat,
        input.address ?? null,
        input.ward ?? null,
        input.province ?? null,
        input.adminArea ?? null,
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
      `SELECT ${CARD_COLS}, ${DETAIL_EXTRA_COLS}
       FROM places p WHERE p.id = $1 AND p.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows[0] ? withCoverImageUrlOne(rows[0], this.mediaUrl) : null;
  }

  /**
   * Locking twin of `getCardByIdIncludingInactive()` — `SELECT ... FOR UPDATE` run through the
   * CALLER's own transaction manager (`manager.query`, not `this.repo.query`, so it shares the
   * caller's connection/transaction instead of opening a second one). `FROM places p` here is a
   * single table with only scalar subqueries for its extra columns (COVER_IMAGE_COLS/category_slug
   * — see their own comments), so `FOR UPDATE` is unambiguous: it locks exactly this place row.
   *
   * Exists for callers that must read-then-write the SAME row atomically against a concurrent
   * writer — a plain read (the method above) cannot provide that on its own. First caller:
   * `PlacesService.update()`'s optional `manager` param, itself added for
   * `PlaceEditProposalsService.decide()` (base-value-hash conflict check + the actual apply must
   * lock this row for their whole combined duration, not just re-check after the fact).
   */
  async getCardByIdIncludingInactiveForUpdate(id: string, manager: EntityManager): Promise<PlaceDetailRow | null> {
    const rows: PlaceDetailRow[] = await manager.query(
      `SELECT ${CARD_COLS}, ${DETAIL_EXTRA_COLS}
       FROM places p WHERE p.id = $1 AND p.deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [id],
    );
    return rows[0] ? withCoverImageUrlOne(rows[0], this.mediaUrl) : null;
  }

  /**
   * Row chi tiết cho trang công khai (card + address/ward/description/opening_hours/osm_id/
   * timestamps). Chỉ trả Place đã `published` — giống `nearby()`/`bbox()`: nội dung
   * `draft`/`pending` chưa qua kiểm duyệt **không** được lộ ra kênh công khai.
   * Luồng xem trước của moderator (nếu có) phải dùng truy vấn riêng đã kiểm tra quyền.
   */
  /**
   * `getDetailBySlug` is shared by MORE than the public detail response: `AdministrativeBackfillService`,
   * `DataQualityAuditService` and `VerifiedFactsIngestionService` (all internal/privileged tooling)
   * also call it and read the RAW `opening_hours` value off the row on purpose (audit "is this field
   * present" reporting, ingestion "does the current value already match" comparisons) — gating INSIDE
   * this method would silently corrupt those, e.g. the audit would report a real DB value as MISSING.
   * The public opening-hours evidence gate therefore lives one layer up, in
   * `PlacesService.getBySlug()`, via `hasCurrentQualifiedOpeningHoursEvidence()` below — this method
   * itself is intentionally unchanged, still a bare pass-through of `p.opening_hours`.
   */
  async getDetailBySlug(slug: string): Promise<PlaceDetailRow | null> {
    const rows: PlaceDetailRow[] = await this.repo.query(
      `SELECT ${CARD_COLS}, ${DETAIL_EXTRA_COLS}
       FROM places p
       WHERE p.slug = $1 AND p.deleted_at IS NULL AND p.status = $2
       LIMIT 1`,
      [slug, PlaceStatus.PUBLISHED],
    );
    return rows[0] ? withCoverImageUrlOne(rows[0], this.mediaUrl) : null;
  }

  /**
   * Public detail opening-hours evidence gate (2026-09-09 fix/public-opening-hours-evidence-gate) —
   * the smallest reusable answer to "does THIS CURRENT opening_hours value have qualifying current
   * evidence", for exactly one place. Wraps the SAME two private helpers `rightNow()`/`nearbyTrusted()`
   * already use (`getVerifiedOpeningHoursHashes()`/`hasVerifiedOpeningHours()` above) — no duplicated
   * trust constants, no new SQL shape, one bounded query and only when `currentValue` is non-null
   * (nothing to have evidence for otherwise). Named for the one field this repository's evidence gate
   * actually covers today (`getVerifiedOpeningHoursHashes()`'s query is opening_hours-specific) rather
   * than a generic `fieldName` parameter the underlying query doesn't support — extend both together
   * if a second gated field is ever needed, not just this method's signature.
   *
   * Used by `PlacesService.getBySlug()` to decide the PUBLIC response's `opening_hours` value —
   * deliberately NOT inlined into `getDetailBySlug()` itself, which stays a raw pass-through for its
   * other, privileged callers (see that method's own comment).
   */
  async hasCurrentQualifiedOpeningHoursEvidence(
    placeId: string,
    currentValue: Record<string, unknown> | null,
  ): Promise<boolean> {
    if (currentValue === null) return false;
    const hashesByPlace = await this.getVerifiedOpeningHoursHashes([placeId]);
    return this.hasVerifiedOpeningHours(placeId, currentValue, hashesByPlace);
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
    return { items: withCoverImageUrl(items, this.mediaUrl), total };
  }

  /**
   * Bulk-fetches, for the given place ids, every CURRENT opening_hours value's evidence hash that
   * clears the gate. Shared by `rightNow()` and `nearbyTrusted()` (2026-09-09 Nearby operational-
   * trust fix) and by `hasCurrentQualifiedOpeningHoursEvidence()` (public detail) so all three apply
   * the exact SAME opening_hours evidence semantics from one query instead of three independently-
   * maintained copies — see `rightNow()`'s own comment below for why each individual condition exists.
   *
   * EVIDENCE FIELD-BINDING V2 (ADR-022 "Known limitation — evidence-to-link binding" follow-up,
   * AddFieldBindingToEvidenceReviews 1720005600000): a `place_field_evidence_links` row alone —
   * even one whose linked `evidence_artifacts` row is VERIFIED and unexpired — is NOT sufficient.
   * `evidence_artifacts.verification_status`/`verification_expires_at` are a single denormalized
   * mirror of that artifact's LATEST eligible APPROVE, REGARDLESS of which (place, field, value)
   * tuple it was for — an artifact reviewed once for place A's opening_hours could, before this
   * gate existed, be re-linked to a totally different place B (or the SAME place after its hours
   * changed) and clear this gate with zero human review of that new binding. This query instead
   * requires the LATEST `evidence_reviews` row for the EXACT tuple (evidence_artifact_id, place_id,
   * field_name, field_value_hash) — found via the LATERAL join below — to itself be `APPROVE` and
   * unexpired. Ordering (`reviewed_at DESC, created_at DESC, <decision-precedence> ASC, id DESC`):
   *   - `reviewed_at DESC` is the real temporal signal (server-clock time, captured once per review).
   *   - `created_at DESC` breaks a `reviewed_at` tie — still temporal (DB-assigned TIMESTAMPTZ
   *     default), though nothing GUARANTEES it can never also tie.
   *   - The decision-precedence term (`CASE WHEN er.decision = 'APPROVE' THEN 1 ELSE 0 END ASC`)
   *     is a FAIL-CLOSED SAFETY RULE, not a temporal signal: it only ever applies when `reviewed_at`
   *     AND `created_at` are BOTH exactly tied between two reviews for the same tuple — in that one
   *     genuinely ambiguous case (we cannot tell which review actually happened "later"), a negative
   *     decision (REJECT/NEEDS_CHANGES) outranks APPROVE, so the tie resolves to NOT clearing the
   *     gate rather than arbitrarily clearing it. This is deliberate and must never be left to
   *     accidental UUID ordering — an earlier version of this query used `id DESC` as the only
   *     tie-break beyond `created_at`, which could let an APPROVE row "win" a tie against a REJECT
   *     purely because its random UUID happened to sort higher; that is exactly the kind of ambiguity
   *     this codebase's fail-closed posture (see ADR-022's own NULL-expiry-never-eligible rule) exists
   *     to resolve toward "don't trust it," not toward whichever row a coin flip favors.
   *   - `id DESC` remains only as the FINAL tie-break, reached only when `reviewed_at`, `created_at`,
   *     AND decision-precedence ALL tie too (i.e. two reviews with the SAME decision at the exact same
   *     instant) — a random UUID has no temporal meaning, so this case is genuinely "doesn't matter
   *     which one wins" (both APPROVE, or both negative — the gate's outcome is identical either way).
   * Consequences:
   *   - A legacy V1 review (place_id/field_name/field_value_hash all NULL) can never satisfy the
   *     LATERAL join's equality predicates — NULL never equals NULL in SQL — so it fails closed by
   *     construction, not by an explicit exclusion this query would have to encode and could get wrong.
   *   - An APPROVE followed by a newer REJECT/NEEDS_CHANGES for the SAME exact tuple immediately
   *     stops clearing this gate: the LATERAL join always picks up the newest row, and only APPROVE
   *     passes `latest_review.decision = 'APPROVE'` — no dependency on `evidence_artifacts`' own
   *     columns, which never get reset by a later non-APPROVE review (see EvidenceService.
   *     reviewEvidenceArtifact — it only ever writes evidence_artifacts on an ELIGIBLE APPROVE).
   *   - `s.type = ANY($2)` (source authority) is still re-checked live against the CURRENT `sources`
   *     row, the same defense-in-depth posture V1 already had — a source's authority is not trusted
   *     from a stale snapshot at review time.
   *
   * ONE bounded query for however many ids are passed in (never N+1) — callers own keeping that id
   * list itself bounded (both current callers pass an already-LIMIT-ed row set).
   */
  private async getVerifiedOpeningHoursHashes(placeIds: string[]): Promise<Map<string, Set<string>>> {
    if (placeIds.length === 0) return new Map();
    const links: Array<{ place_id: string; field_value_hash: string }> = await this.repo.query(
      `SELECT pfel.place_id, pfel.field_value_hash
       FROM place_field_evidence_links pfel
       JOIN evidence_artifacts ea ON ea.id = pfel.evidence_artifact_id
       JOIN sources s ON s.id = ea.source_id
       JOIN LATERAL (
         SELECT er.decision, er.verification_expires_at
         FROM evidence_reviews er
         WHERE er.evidence_artifact_id = pfel.evidence_artifact_id
           AND er.place_id = pfel.place_id
           AND er.field_name = pfel.field_name
           AND er.field_value_hash = pfel.field_value_hash
         ORDER BY er.reviewed_at DESC, er.created_at DESC,
                  (CASE WHEN er.decision = 'APPROVE' THEN 1 ELSE 0 END) ASC, er.id DESC
         LIMIT 1
       ) latest_review ON TRUE
       WHERE pfel.place_id = ANY($1) AND pfel.field_name = 'opening_hours'
         AND s.type = ANY($2)
         AND latest_review.decision = 'APPROVE'
         AND latest_review.verification_expires_at IS NOT NULL
         AND latest_review.verification_expires_at > NOW()`,
      [placeIds, [...OFFICIAL_SOURCE_TYPES]],
    );
    const byPlace = new Map<string, Set<string>>();
    for (const link of links) {
      const set = byPlace.get(link.place_id) ?? new Set<string>();
      set.add(link.field_value_hash);
      byPlace.set(link.place_id, set);
    }
    return byPlace;
  }

  /** `true` iff `openingHours` is the place's CURRENT value AND that exact value has a gate-passing,
   *  source-authoritative evidence link (see `getVerifiedOpeningHoursHashes`). `null` never qualifies
   *  — there is no value to have evidence for. */
  private hasVerifiedOpeningHours(
    placeId: string,
    openingHours: Record<string, unknown> | null,
    hashesByPlace: Map<string, Set<string>>,
  ): boolean {
    if (openingHours === null) return false;
    return hashesByPlace.get(placeId)?.has(computeFieldValueHash(openingHours)) ?? false;
  }

  /**
   * "Right Now" MVP — published places with sufficiently trustworthy CURRENT opening-hours
   * evidence, for the homepage RightNowSection. The user-facing promise (RightNowSection.tsx +
   * home.copy.ts's `rightNowTitle`/`rightNowEmptyBody`) is specifically about an ACTIONABLE,
   * CURRENT open/closed claim a visitor can act on right now — not a general "this business's
   * identity/operator has been verified" claim (that promise, if made anywhere, belongs to a
   * verification-scope model this codebase does not have — see docs/delivery/reports/PLACE-TRUST-SEMANTICS-MODEL-GAP-2026-09-08.md).
   *
   * Trust semantics correction (2026-09-08, PLACE_FIELD_EVIDENCE / Right Now trust semantics gate,
   * amended same day in the PR #24 final review): the ORIGINAL fix here added a current-value
   * field-evidence requirement ON TOP OF the existing `p.verification_status IN (...)` whole-place
   * whitelist. That whitelist is now REMOVED, not just supplemented — the final review established
   * it cannot be relied on at all for this purpose:
   *
   *  1. `verifications` has no field/scope column (verification.entity.ts) — a `verified`/
   *     `official`/`community_verified` row says a moderator or a source-match transitioned the
   *     WHOLE place, never WHICH fact was actually checked.
   *  2. `official` is reachable purely via `method=source_match` against an Administrative Data
   *     Backfill (province/ward boundary matching a government resolution) — proving the place's
   *     ADMINISTRATIVE ADDRESS, nothing about its opening hours. Confirmed empirically: most of the
   *     current cohort's `official` rows are exactly this, with zero human review of the place
   *     itself. `method=source_match` is ALSO used by the unrelated, legitimate
   *     `VerifiedFactsIngestionService` for real operational facts — so `method` cannot even
   *     reliably distinguish "admin-only" from "some real source matched" after the fact.
   *  3. `p.status = 'published'` is NOT similarly hollow — `PlacesService.approve()` is a
   *     privileged, audited action (`permission: 'Place.Approve'`; ADR-016) with no other code path
   *     that sets it. A published place has already had SOME human gatekeeping; `verification_status`
   *     was never the only legitimacy signal, and for this specific claim it was the WRONG one.
   *
   * So the whole-place whitelist added nothing this query actually needed and actively risked
   * overclaiming: a place could be Right-Now-eligible purely because an address string matched a
   * 2025 administrative-boundary resolution, which is exactly the "Đã xác minh chính thức" overclaim
   * `apps/web/.../places/trust.ts` already had to ban at the LABEL level. Removing it does not
   * loosen this query — `published` stays required, and the mandatory field-evidence check below
   * (now also SOURCE-AUTHORITY-scoped, see next paragraph) is a STRICTER, more specifically-targeted
   * guarantee than the whitelist it replaces: a `pending` place with real, current, source-
   * authoritative opening-hours evidence now qualifies; an `official`-only-via-backfill place
   * WITHOUT such evidence never did and still does not.
   *
   * SOURCE AUTHORITY (added in the same 2026-09-08 amendment): `evidence_artifacts.verification_status`
   * is a plain `string` column with no DB check and, as of this review, no real write path in this
   * codebase that ever sets a gate-passing value — its meaning is a convention trusted to whoever
   * calls `EvidenceService.ensureEvidenceArtifact`. "VERIFIED" alone therefore does NOT guarantee the
   * underlying SOURCE is credible (a `community`/`facebook`/`ai`-type source could reach it just as
   * easily as an official one). `OFFICIAL_SOURCE_TYPES` (evidence-trust.ts, the SAME set
   * `verifications.service.ts`'s `buildOfficialTransition` already requires for `official` status)
   * closes that gap here too: gate-passing evidence must ALSO be attributed to an
   * official_website/business_owner/government source.
   *
   * Mechanism: a place is Right-Now-eligible only when its CURRENT `opening_hours` value has a
   * `place_field_evidence_links` row whose `field_value_hash` matches sha256(canonicalJson(current
   * value)) AND that EXACT (place, field, value) tuple has a latest `evidence_reviews` row that is
   * APPROVE, unexpired, and attributed to an `OFFICIAL_SOURCE_TYPES` source (Evidence Field-Binding
   * V2 — see `getVerifiedOpeningHoursHashes()`'s own comment above for why a review must be bound to
   * the exact tuple, not just the evidence artifact). A stale link (hash computed against a value the
   * field no longer holds) is real, retained history that simply won't match — it can never support
   * a changed value.
   *
   * Two bounded queries, not N+1: query 1 overfetches published+presence candidates (no longer
   * trust-filtered — see above); query 2 bulk-fetches every gate-passing, source-authoritative
   * field-evidence link for exactly those candidate ids in ONE round trip (now joining `sources`
   * too). The hash comparison itself is pure JS (computeFieldValueHash), never interpolated into
   * SQL. Overfetch is capped (`RIGHT_NOW_CANDIDATE_MULTIPLIER`/`RIGHT_NOW_CANDIDATE_CAP`) so this
   * stays a small, deterministic operation regardless of how many places exist — not an unbounded
   * scan. Removing the whitelist from query 1 does not change this bound (same LIMIT, same cap); it
   * can only make the (still bounded) candidate window contain MORE not-yet-evidenced places, which
   * the unchanged query-2 filter removes exactly as before.
   *
   * `nearbyTrusted()` below still uses the whole-place whitelist as its SELECTION predicate (that
   * part is a real, separately-tracked model gap — see docs/delivery/reports/PLACE-TRUST-SEMANTICS-MODEL-GAP-2026-09-08.md,
   * closing it needs an actual verification-scope model, not a query edit). But
   * `getVerifiedOpeningHoursHashes()` above is now SHARED with `nearbyTrusted()` (2026-09-09 Nearby
   * operational-trust fix): NearbyDiscovery.tsx renders the SAME open/closed claim RightNowSection
   * does from whatever `opening_hours` this method passes through, so it needed the identical
   * current-value evidence gate, not a whitelist-only pass-through — see that method's own comment.
   *
   * Same ORDER BY as `list()` above (rating_avg DESC NULLS LAST, created_at DESC, id ASC) — reuses
   * the existing governed "browse" ordering instead of inventing a new ranking signal, with the
   * same `p.id ASC` deterministic tie-break convention used throughout this repository. Evidence
   * filtering only REMOVES ineligible candidates from this ordered set — it never reorders it.
   */
  async rightNow(params: { limit: number }): Promise<PlaceNowCardRow[]> {
    const candidateLimit = Math.min(params.limit * RIGHT_NOW_CANDIDATE_MULTIPLIER, RIGHT_NOW_CANDIDATE_CAP);
    const candidates: PlaceNowCardRow[] = await this.repo.query(
      `SELECT ${CARD_COLS}, p.opening_hours
       FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND p.opening_hours IS NOT NULL
       ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC
       LIMIT $1`,
      [candidateLimit],
    );
    if (candidates.length === 0) return [];

    const verifiedHashesByPlace = await this.getVerifiedOpeningHoursHashes(candidates.map((c) => c.id));

    const rows = candidates
      .filter((c) => this.hasVerifiedOpeningHours(c.id, c.opening_hours, verifiedHashesByPlace))
      .slice(0, params.limit);
    return withCoverImageUrl(rows, this.mediaUrl);
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
    const rows: PlaceCardRow[] = await this.repo.query(
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
    return withCoverImageUrl(rows, this.mediaUrl);
  }

  /**
   * Trusted Nearby + Opening State v0 (Phase 2) — bản dùng cho NearbyDiscovery: SAME semantics
   * as `nearby()` (radius/category/limit, distance ASC + p.id ASC tie-break, published +
   * deleted_at IS NULL) but adds two things:
   *   1. a trust whitelist filter BEFORE LIMIT — the three literal values here are the exact
   *      set `isTrustedStatus()` (verification.transition.ts) defines as "trusted"; kept as a
   *      literal here (same convention as the existing `p.status = 'published'` literal two
   *      lines below) rather than parameterized, since the whitelist is a fixed domain policy,
   *      not caller input.
   *   2. `p.opening_hours` in the SELECT — deliberately NOT added to `CARD_COLS` (shared by
   *      list/search/nearby/etc.) since no other caller needs it; this method has its own
   *      narrow row shape (`PlaceNowCardRow`) instead.
   *
   * POST-MERGE CORRECTION (2026-09-09, follow-up to PR #24): this method's PREVIOUS doc comment
   * claimed "this method asserts nothing about opening_hours" and left it as a bare pass-through.
   * That was factually wrong — `NearbyDiscovery.tsx` calls `getOpeningToday(p.opening_hours).state`
   * on every row this returns and renders "Open now"/"Closed now" from it, the exact same
   * operational claim `RightNowSection.tsx` makes from `rightNow()`'s output. A bare pass-through
   * therefore let an address-matched administrative-backfill `official` row (see the whitelist gap
   * below) assert a live open/closed state with zero opening-hours evidence behind it.
   *
   * Fixed by applying `rightNow()`'s CURRENT-value field-evidence gate (via the shared
   * `getVerifiedOpeningHoursHashes()`/`hasVerifiedOpeningHours()` helpers above) to `opening_hours`
   * specifically — NOT by filtering rows out of Nearby. Distance-based discovery should not shrink
   * just because hours evidence is missing, so a candidate that fails the gate stays in the result
   * with `opening_hours` forced to `null`; `getOpeningToday(null)` already resolves that to
   * `'unknown'` client-side ("Hours unknown"/"Chưa có thông tin giờ mở cửa"), never `'closed'` — see
   * openingHours.ts. This is a SECOND, small, bounded query (candidates already LIMIT-ed by the geo
   * query below, so the evidence lookup's id list is bounded by the SAME caller-supplied `limit` —
   * not unbounded, not N+1) run only when the geo query actually returned rows.
   *
   * SELECTION PREDICATE OVERCLAIM, STILL LEFT UNCHANGED (tracked separately, not this fix's job):
   * the `p.verification_status IN (...)` whitelist below decides WHICH places appear in Nearby at
   * all — that is a different question from what this fix closes (whether an APPEARING place's
   * opening_hours claim is trustworthy). It has the same root cause as the whole-place overclaim
   * `rightNow()` used to have (`official` routinely means only "an address matched a 2025
   * administrative-boundary resolution," not that anyone reviewed this place) and is NOT resolved by
   * this change. Closing it needs a real verification-scope model (no field/scope column exists on
   * `verifications` today), not a query edit — see
   * docs/delivery/reports/PLACE-TRUST-SEMANTICS-MODEL-GAP-2026-09-08.md, which this same follow-up
   * corrected to stop claiming this method makes no opening_hours assertion.
   *
   * Whole-place trust badge / price display for Nearby's cards are handled at the presentation layer
   * (`NearbyDiscovery.tsx` passing `showTrustBadge={false} showPrice={false}` to `PlaceCard`), not
   * here — this repository has no opinion on presentation, only on what data it returns.
   */
  async nearbyTrusted(params: {
    lat: number;
    lng: number;
    radius: number;
    category?: string;
    limit: number;
  }): Promise<PlaceNowCardRow[]> {
    const args: unknown[] = [params.lng, params.lat, params.radius];
    let categoryCond = '';
    if (params.category) {
      args.push(params.category);
      categoryCond = `AND p.category_id = $${args.length}`;
    }
    args.push(params.limit);
    const rows: PlaceNowCardRow[] = await this.repo.query(
      `SELECT ${CARD_COLS}, p.opening_hours,
              ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
       FROM places p
       WHERE p.deleted_at IS NULL AND p.status = 'published'
         AND p.verification_status IN ('verified', 'official', 'community_verified')
         AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
         ${categoryCond}
       ORDER BY distance_m ASC, p.id ASC
       LIMIT $${args.length}`,
      args,
    );
    if (rows.length > 0) {
      const verifiedHashesByPlace = await this.getVerifiedOpeningHoursHashes(rows.map((r) => r.id));
      for (const row of rows) {
        if (!this.hasVerifiedOpeningHours(row.id, row.opening_hours, verifiedHashesByPlace)) {
          row.opening_hours = null;
        }
      }
    }
    return withCoverImageUrl(rows, this.mediaUrl);
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
    const rows: PlaceCardRow[] = await this.repo.query(
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
    return withCoverImageUrl(rows, this.mediaUrl);
  }
}
