import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Media } from '../entities/media.entity';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';

export interface OrphanCleanupCandidate {
  id: string;
  objectKey: string | null;
  bucket: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  /**
   * Post-implementation review fix (2026-08-02): Postgres's own exact TEXT rendering of
   * `created_at` (microsecond precision), captured ONLY to build the next page's keyset cursor —
   * never for display (use `createdAt` for that). A plain JS `Date` is NOT safe here: `Date` only
   * has millisecond resolution, but `timestamptz` keeps microseconds — round-tripping a `Date`
   * back into a query parameter silently truncates it, and two rows that differ only in their
   * sub-millisecond component collapse to the SAME truncated cursor value. Confirmed live: a row
   * built from its own truncated `createdAt` still satisfies `created_at > cursor` against ITS
   * OWN real (untruncated) stored value, so it gets re-fetched on the next page instead of the
   * genuinely next row — starving every row behind it for the rest of the run (bounded only by
   * `maxBatches`, so not literally infinite, but no forward progress). Passing Postgres's own text
   * form back as `$N::timestamptz` avoids any JS-side (de)serialization of the timestamp.
   */
  cursorCreatedAt: string;
}

export interface OrphanCleanupCursor {
  createdAt: string;
  id: string;
}

// Media Orphan Cleanup (2026-08-02, Owner-approved execution plan): điều kiện đủ điều kiện dọn dẹp
// — media mồ côi (không owner nào), còn `pending` (chưa từng qua moderation), quá hạn lưu giữ 24h.
// Dùng LẠI đúng chuỗi WHERE này ở CẢ hai truy vấn dưới (SELECT batch + UPDATE điều kiện) — cố tình
// KHÔNG tách hằng số riêng cho từng cột để hai câu SQL không thể lệch nhau qua thời gian.
const ORPHAN_ELIGIBILITY_WHERE = `
  status = 'pending'
  AND place_id IS NULL
  AND review_id IS NULL
  AND post_id IS NULL
  AND business_id IS NULL
  AND event_id IS NULL
  AND deleted_at IS NULL
  AND created_at < now() - interval '24 hours'
`;

export interface NewUploadedMedia {
  objectKey: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string;
  placeId: string | null;
  caption: string | null;
  altText: string | null;
}

// Repository `media`. Sprint 2: chỉ đọc gallery Place (published) cho trang chi tiết.
// Media Upload Foundation (2026-07-30): thêm đường ghi (findByUploaderAndChecksum/createUploaded).
@Injectable()
export class MediaRepository {
  constructor(
    @InjectRepository(Media)
    private readonly repo: Repository<Media>,
  ) {}

  /** Gallery đã duyệt của một Place, theo sort_order (dùng partial index idx_media_place). */
  listPublishedByPlace(placeId: string): Promise<Media[]> {
    return this.repo.find({
      where: { placeId, status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Chống trùng theo người upload (idx_media_uploader_checksum) — chỉ media chưa xoá mềm. */
  findByUploaderAndChecksum(uploadedBy: string, checksumSha256: string): Promise<Media | null> {
    return this.repo.findOne({ where: { uploadedBy, checksumSha256, deletedAt: IsNull() } });
  }

  /**
   * Kiểm tra place_id tồn tại (chưa xoá mềm) — dùng raw query trực tiếp trên `places` thay vì
   * tiêm PlacesRepository, vì PlacesModule đã import MediaModule (đọc gallery Place); tiêm ngược
   * lại sẽ tạo circular dependency. Cùng ngữ nghĩa PlacesRepository.existsById() (deleted_at IS
   * NULL), chỉ khác cách truy cập.
   */
  async placeExists(placeId: string): Promise<boolean> {
    const rows: unknown[] = await this.repo.query(
      'SELECT 1 FROM places WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [placeId],
    );
    return rows.length > 0;
  }

  /**
   * WF-12 (Moderation Foundation M5) — "target tồn tại và ở trạng thái báo cáo được" (T3 bước 1)
   * cho `POST /media/{id}/report`. Chỉ media `published` là nội dung công khai một người dùng
   * thường có thể GẶP để báo cáo — `pending`/`hidden`/`rejected` không hiển thị, nên trả về false
   * y hệt "không tồn tại" (`existsById` sẽ không phân biệt được hai trường hợp và endpoint trả về
   * CÙNG một 404 cho cả hai — không rò rỉ trạng thái kiểm duyệt nội bộ cho reporter).
   */
  async existsPublished(id: string): Promise<boolean> {
    const rows: unknown[] = await this.repo.query(
      `SELECT 1 FROM media WHERE id = $1 AND status = 'published' AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  }

  /**
   * Tạo media row mới cho một upload đã xác thực. Luôn `status=pending`, `provider=upload`,
   * `url=null` (Design review §A — không bao giờ lưu URL tuyệt đối/signed; sinh động lúc đọc).
   * Nhận `manager` trực tiếp (không dùng `this.repo`) để caller kiểm soát transaction.
   */
  createUploaded(manager: EntityManager, data: NewUploadedMedia): Promise<Media> {
    const repo = manager.getRepository(Media);
    const media = repo.create({
      type: MediaType.IMAGE,
      url: null,
      provider: MediaProvider.UPLOAD,
      status: MediaStatus.PENDING,
      objectKey: data.objectKey,
      bucket: data.bucket,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      checksumSha256: data.checksumSha256,
      uploadedBy: data.uploadedBy,
      placeId: data.placeId,
      caption: data.caption,
      altText: data.altText,
    });
    return repo.save(media);
  }

  /**
   * ADR-018 D3/T1 (Moderation Foundation M3) — gắn media MỒ CÔI vào một review VỪA ĐƯỢC TẠO **và**
   * auto-publish nó trong CÙNG một câu UPDATE, đúng 6 điều kiện D3 (đk 6 — transaction commit —
   * do caller đảm bảo, xem `ReviewsRepository.createWithMedia`). Toàn bộ điều kiện nằm trong
   * WHERE của SQL, KHÔNG phải vòng lặp TypeScript — một câu UPDATE set-based, không N+1.
   *
   * Trả về DANH SÁCH id đã thực sự published (không phải chỉ đếm) — caller so `length` với số
   * `mediaIds` yêu cầu (INV-14 "toàn bộ hoặc không có gì": khác nhau → caller tự rollback bằng
   * cách ném lỗi trong transaction, repository không tự quyết định rollback) **và** dùng chính
   * danh sách này để ghi một dòng audit `media.auto_published` cho MỖI media sau khi commit
   * (INV-9 — không bao giờ trong transaction).
   *
   * Đây là bản THAY THẾ HOÀN TOÀN cho `attachToReview()` cũ (chỉ gắn `review_id`, không publish —
   * chính là lỗ hổng "ảnh không bao giờ hiển thị" mà ADR-018 §Context ghi nhận). Nhận `manager`
   * trực tiếp để chạy trong transaction của caller, cùng quy ước `createUploaded()`.
   */
  async attachAndPublish(
    manager: EntityManager,
    mediaIds: string[],
    reviewId: string,
    userId: string,
  ): Promise<string[]> {
    if (mediaIds.length === 0) return [];
    // QUAN TRỌNG: với UPDATE/DELETE (khác INSERT), driver Postgres của TypeORM trả về TUPLE
    // `[rows, rowCount]` từ `manager.query()`/`repo.query()` khi câu lệnh có RETURNING — KHÔNG
    // phải mảng rows trực tiếp như INSERT (xem PostgresQueryRunner.query(): switch theo
    // raw.command, case UPDATE/DELETE gán `result.raw = [raw.rows, raw.rowCount]`, default —
    // gồm cả INSERT/SELECT — gán thẳng `raw.rows`). Phát hiện qua kiểm chứng TRỰC TIẾP với
    // Postgres thật (Phase 8, không chỉ unit test có mock) — mock cũ từng giả định sai hình dạng
    // này. PHẢI destructure `[rows]`, nếu không `rows.map()` chạy nhầm trên chính cặp tuple.
    const [rows]: [Array<{ id: string }>, number] = await manager.query(
      `UPDATE media
          SET review_id = $1, status = 'published'
        WHERE id = ANY($2)
          AND uploaded_by  = $3
          AND object_key  IS NOT NULL
          AND status       = 'pending'
          AND deleted_at  IS NULL
          AND review_id   IS NULL
          AND place_id    IS NULL
          AND post_id     IS NULL
          AND business_id IS NULL
          AND event_id    IS NULL
        RETURNING id`,
      [reviewId, mediaIds, userId],
    );
    return rows.map((r) => r.id);
  }

  /** T2 (Moderation Foundation M3) — nạp media target của một case. Nhận `manager` trực tiếp để
   * đọc trong CÙNG transaction với quyết định (không có FOR UPDATE riêng trên media — khoá case
   * cha, đã có ở `ModerationCasesRepository.findByIdForUpdate`, là đủ: INV-3 đảm bảo tối đa một
   * case mở cho mỗi target nên không có quyết định thứ hai nào có thể chạy song song trên CÙNG
   * media này). */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<Media | null> {
    return manager.getRepository(Media).findOne({ where: { id } });
  }

  /** T2 — ghi status ĐÃ ĐƯỢC XÁC NHẬN hợp lệ bởi FSM (`assertValidMediaTransition`). Repository
   * KHÔNG tự kiểm tra transition — cùng nguyên tắc `BookingsRepository.updateStatus()`. */
  async updateStatus(manager: EntityManager, id: string, status: MediaStatus): Promise<void> {
    await manager.getRepository(Media).update({ id }, { status });
  }

  /**
   * Media Orphan Cleanup (2026-08-02, post-implementation review fix): quét theo lô, chỉ đọc
   * (không khoá) — batch cũ nhất trước (`ORDER BY created_at ASC, id ASC`), giới hạn `limit` dòng.
   * An toàn concurrency đến từ `softDeleteOrphanCandidate()` bên dưới (điều kiện đầy đủ lặp lại
   * trong UPDATE), không phải từ khoá ở bước đọc này — xem execution plan §7.
   *
   * `after` (con trỏ keyset, tuỳ chọn): BẮT BUỘC để đảm bảo lô SAU luôn khác lô TRƯỚC, độc lập với
   * việc dòng có thực sự bị ghi hay không. Không có nó, hai tình huống làm vòng lặp KHÔNG tiến lên
   * được: (1) dry-run — không dòng nào bị đổi trạng thái, nên `LIMIT $1` không con trỏ sẽ trả lại
   * CHÍNH lô cũ đó mỗi lần, phóng đại scanned/eligible thay vì liệt kê hết tập ứng viên thật; (2)
   * real run gặp lỗi storage KHÔNG PHẢI not-found trên một dòng — dòng đó CỐ Ý bị bỏ qua (không
   * UPDATE), nên nếu nó vẫn nằm trong top `limit` dòng cũ nhất, nó sẽ bị fetch lại NGAY lô kế tiếp
   * CỦA CÙNG LẦN CHẠY, có thể chiếm hết toàn bộ maxBatches/maxExecutionMs chỉ để thử lại đúng một
   * dòng lỗi thay vì xử lý hàng nghìn ứng viên khác đang chờ — mâu thuẫn với thiết kế "không retry
   * trong tiến trình, để lần chạy SAU tự nhiên thử lại" (execution plan §10). Phát hiện qua rà soát
   * hậu triển khai (post-implementation review), không phải giả định đúng từ đầu.
   */
  async findOrphanCleanupCandidates(
    limit: number,
    after?: OrphanCleanupCursor,
  ): Promise<OrphanCleanupCandidate[]> {
    // `after.createdAt` is Postgres's own exact TEXT rendering (see OrphanCleanupCandidate
    // .cursorCreatedAt's doc comment) — bound with an explicit ::timestamptz cast so Postgres
    // parses it back to the identical microsecond-precision value it originally produced, never
    // round-tripped through a precision-lossy JS Date.
    const params: unknown[] = after ? [limit, after.createdAt, after.id] : [limit];
    const rows: Array<{
      id: string;
      object_key: string | null;
      bucket: string | null;
      uploaded_by: string | null;
      created_at: Date;
      created_at_text: string;
    }> = await this.repo.query(
      `SELECT id, object_key, bucket, uploaded_by, created_at, created_at::text AS created_at_text
       FROM media
       WHERE ${ORPHAN_ELIGIBILITY_WHERE}
       ${after ? 'AND (created_at, id) > ($2::timestamptz, $3)' : ''}
       ORDER BY created_at ASC, id ASC
       LIMIT $1`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      objectKey: r.object_key,
      bucket: r.bucket,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
      cursorCreatedAt: r.created_at_text,
    }));
  }

  /**
   * Media Orphan Cleanup (2026-08-02): soft-delete có ĐIỀU KIỆN — lặp lại TOÀN BỘ vị từ đủ điều
   * kiện (không chỉ `id`) trong WHERE của chính UPDATE này. Đây là cơ chế idempotency/concurrency
   * duy nhất của job (execution plan §7/§8): nếu dòng đã bị dọn bởi lần chạy khác (hoặc không còn
   * đủ điều kiện vì vừa được gắn owner), UPDATE khớp 0 dòng — coi là no-op, KHÔNG phải lỗi. Trả về
   * true chỉ khi CHÍNH lần gọi này thực sự chuyển trạng thái (dùng để quyết định có ghi audit hay
   * không — chỉ ghi khi có thay đổi thật).
   *
   * QUAN TRỌNG (Moderation M3 post-implementation fix, 2026-08-02): với UPDATE/DELETE (khác
   * INSERT), driver Postgres của TypeORM trả về TUPLE `[rows, rowCount]` từ `repo.query()` khi câu
   * lệnh có RETURNING — KHÔNG phải mảng rows trực tiếp như INSERT (xem
   * PostgresQueryRunner.query(): switch theo raw.command, case UPDATE/DELETE gán
   * `result.raw = [raw.rows, raw.rowCount]`, default gán thẳng `raw.rows`). Bản gốc của hàm này
   * đọc kết quả CHƯA destructure (`const rows: Array<{id}> = await this.repo.query(...)`) nên
   * `rows` thực chất LÀ tuple 2 phần tử — `rows.length > 0` do đó LUÔN true bất kể UPDATE có khớp
   * dòng nào hay không, khiến hàm không bao giờ báo cáo đúng "đã bị dọn bởi lần chạy khác". Phát
   * hiện qua kiểm chứng TRỰC TIẾP với Postgres thật (không phải mock): một dòng đã có `deleted_at`
   * (KHÔNG còn đủ điều kiện, UPDATE khớp 0 dòng) vẫn khiến hàm trả về `true`. PHẢI destructure
   * `[rows]`, cùng cách khắc phục đã áp dụng cho `MediaRepository.attachAndPublish()`.
   */
  async softDeleteOrphanCandidate(id: string): Promise<boolean> {
    const [rows]: [Array<{ id: string }>, number] = await this.repo.query(
      `UPDATE media SET deleted_at = now()
       WHERE id = $1 AND ${ORPHAN_ELIGIBILITY_WHERE}
       RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }
}
