import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { StorageService } from '../../core/storage/storage.service';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { RedisService } from '../../core/redis/redis.service';
import { MediaRepository } from './repositories/media.repository';
import { ModerationReportsService } from '../moderation/moderation-reports.service';
import { ModerationCasesRepository } from '../moderation/repositories/moderation-cases.repository';
import { computePriority } from '../moderation/moderation-severity';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationTargetType,
} from '../moderation/moderation.enums';
import { CreateReportDto } from '../moderation/dto/moderation.dto';
import {
  AllowedMediaMimeType,
  CreateMediaDto,
  PresignMediaDto,
  UpdatePlaceMediaMetadataDto,
} from './dto/media.dto';
import { MediaStatus } from './media.enums';
import { toMedia } from './media.mapper';

const MIME_TO_EXTENSION: Record<AllowedMediaMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Chuẩn hoá MỘT trường metadata (caption/alt_text) trước khi ghi — Owner Photo Metadata
 * (2026-08-12), cùng ngữ nghĩa `dto.caption?.trim() || null` mà `register()` đã dùng, viết thành
 * hàm riêng vì giờ phải phân biệt BA trạng thái thay vì hai:
 *
 *  • `undefined` (trường vắng mặt trong request) → `undefined` — KHÔNG đổi giá trị đang lưu.
 *  • `null` — `@IsOptional()` cho phép `null` bỏ qua kiểm tra `@IsString()` của DTO (cùng hành vi
 *    đã có ở `UpdateContactDto.label`, contacts.service.ts), nên phải xử lý tường minh ở đây thay
 *    vì gọi `.trim()` trên `null` và ném lỗi 500. Coi `null` như ý định "xoá", cùng kết quả với
 *    chuỗi rỗng.
 *  • chuỗi bất kỳ (kể cả rỗng/toàn khoảng trắng) → trim; rỗng sau khi trim thành `null`.
 */
function normalizeMetadataField(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const PRESIGN_SESSION_PREFIX = 'media-presign:';
// Slightly longer than the signed PUT URL's own 600s expiry (design review §6) — a client that
// uploads right at the edge of the signed URL's validity still has time to call POST /media.
const PRESIGN_SESSION_TTL_SECONDS = 900;

// Presign-session integrity (design review §6): the server cannot otherwise prove the caller of
// POST /media is the same user who requested the presign, or that they're registering the file
// they actually declared. Stored in Redis (existing infra/conventions — same TTL'd-key pattern as
// TokenService's refresh-token records), keyed by object key, never in a new DB table.
/**
 * `placeId` ở đây KHÔNG BAO GIỜ đến từ body của client (Owner Place Photos, 2026-08-11). Nó chỉ
 * được đặt bởi đường `POST /places/{id}/media/presign`, nơi giá trị lấy từ ROUTE PARAM đã được
 * `PermissionsGuard` cưỡng chế quyền `Media.Upload.Managed` trên CHÍNH place đó. Nhờ vậy `register`
 * không cần tin bất cứ thứ gì client gửi lên: place đích đã bị "khoá" vào phiên presign từ lúc
 * quyền được kiểm tra, nên không thể tráo sang place khác giữa hai bước.
 */
interface PresignSession {
  userId: string;
  contentType: string;
  size: number;
  checksumSha256: string;
  placeId: string | null;
}

/**
 * Một ảnh như MÀN HÌNH QUẢN LÝ của chủ cơ sở nhìn thấy. KHÔNG có `object_key`/`bucket`/`checksum`
 * — hình dạng này được liệt kê tường minh (không spread entity) chính là để những cột đó không thể
 * vô tình lọt ra ngoài khi entity `Media` có thêm trường mới.
 *
 * CỐ Ý không có `reason`/`rejection_reason`/bất kỳ trường nào phản ánh lý do kiểm duyệt (Owner-
 * facing Moderation Feedback, 2026-08-12 — điều tra kỹ, không phải thiếu sót). `status: 'rejected'`
 * là TOÀN BỘ tín hiệu chủ cơ sở nhận được. Xem ghi chú đầy đủ tại `listForPlaceOwner()` bên dưới
 * trước khi thêm bất kỳ trường lý do nào vào đây.
 */
export interface OwnerPlacePhoto {
  id: string;
  status: MediaStatus;
  caption: string | null;
  alt_text: string | null;
  created_at: string;
  /** Kênh NỘI BỘ theo cơ sở — ảnh chưa duyệt không có URL công khai nào. */
  url: string;
  sort_order: number | null;
  is_cover: boolean;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly storage: StorageService,
    private readonly mediaUrl: MediaUrlService,
    private readonly redis: RedisService,
    private readonly mediaRepo: MediaRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly moderationReports: ModerationReportsService,
    private readonly moderationCases: ModerationCasesRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Presign KHÔNG gắn chủ sở hữu (media mồ côi) — dùng cho ảnh review (gắn + auto-publish khi tạo
   * review). `placeId` luôn `null` ở đường này; ảnh của cơ sở đi qua `presignForPlace()`.
   */
  async presign(dto: PresignMediaDto, userId: string) {
    return this.createPresignSession(dto, userId, null);
  }

  /**
   * Presign CHO MỘT CƠ SỞ CỤ THỂ (Owner Place Photos). `placeId` đến từ route param đã qua
   * `Media.Upload.Managed` + `@AuthorizationContext(place)` ở controller — service nhận nó như một
   * giá trị ĐÃ được phép, không kiểm tra quyền lại (PDP là nơi duy nhất quyết định, ADR-019 D1).
   * Vẫn xác nhận place tồn tại để không tạo phiên trỏ vào cơ sở đã bị xoá mềm.
   */
  async presignForPlace(dto: PresignMediaDto, userId: string, placeId: string) {
    if (!(await this.mediaRepo.placeExists(placeId))) {
      throw new UnprocessableEntityException('Cơ sở không tồn tại');
    }
    return this.createPresignSession(dto, userId, placeId);
  }

  private async createPresignSession(dto: PresignMediaDto, userId: string, placeId: string | null) {
    const generatedKey = `media/${randomUUID()}.${MIME_TO_EXTENSION[dto.content_type]}`;
    const presigned = await this.storage.createPresignedPutUrl(generatedKey, dto.content_type);

    const session: PresignSession = {
      userId,
      contentType: dto.content_type,
      size: dto.size,
      checksumSha256: dto.checksum_sha256,
      placeId,
    };
    // Key the Redis session off presigned.key (the value StorageService actually returns as
    // authoritative), not generatedKey — they're always equal in practice, but register() and
    // the client both key off the RESPONSE's key, so this session must too, rather than relying
    // on an implicit "the service echoes back what it was given" assumption.
    await this.redis
      .getClient()
      .set(this.sessionKey(presigned.key), JSON.stringify(session), 'EX', PRESIGN_SESSION_TTL_SECONDS);

    // Never log presigned.uploadUrl (design review §5) — only the opaque key/expiry are returned.
    return { key: presigned.key, upload_url: presigned.uploadUrl, expires_in: presigned.expiresIn };
  }

  async register(dto: CreateMediaDto, userId: string) {
    const sessionKey = this.sessionKey(dto.key);
    const raw = await this.redis.getClient().get(sessionKey);
    if (!raw) {
      throw new UnprocessableEntityException(
        'Không có phiên presign hợp lệ cho key này (chưa từng presign, đã đăng ký, hoặc đã hết hạn)',
      );
    }

    const session = JSON.parse(raw) as PresignSession;
    if (session.userId !== userId) {
      // Deliberately do NOT delete the other user's session here — this request simply isn't
      // authorized to act on it; the rightful owner can still complete registration before TTL.
      throw new ForbiddenException('Phiên presign này không thuộc về bạn');
    }

    const verification = await this.storage.verifyUploadedObject({
      key: dto.key,
      expectedContentType: session.contentType,
      expectedSize: session.size,
      expectedChecksumSha256: session.checksumSha256,
    });
    if (!verification.ok) {
      await this.redis.getClient().del(sessionKey);
      throw new UnprocessableEntityException(`Xác thực object thất bại: ${verification.reason}`);
    }

    const duplicate = await this.mediaRepo.findByUploaderAndChecksum(userId, session.checksumSha256);
    if (duplicate) {
      // The just-uploaded object is a confirmed byte-for-byte duplicate of one this same uploader
      // already registered — remove the redundant object rather than leaving it orphaned in
      // storage, then refuse to create a second row for it.
      await this.storage.deleteObject(dto.key);
      await this.redis.getClient().del(sessionKey);
      throw new ConflictException('Bạn đã upload media này trước đó (trùng checksum)');
    }

    const media = await this.dataSource.transaction(async (manager) => {
      const created = await this.mediaRepo.createUploaded(manager, {
        objectKey: dto.key,
        bucket: this.storage.bucketName,
        contentType: session.contentType,
        sizeBytes: session.size,
        checksumSha256: session.checksumSha256,
        uploadedBy: userId,
        placeId: session.placeId,
        caption: dto.caption?.trim() || null,
        altText: dto.alt?.trim() || null,
      });

      // Ảnh của CƠ SỞ không bao giờ tự công khai (quyết định sản phẩm, MVP): nó ở `pending` và
      // phải có người duyệt. Vì vậy hàng chờ kiểm duyệt được tạo NGAY trong CÙNG transaction —
      // nếu tách ra sau commit, một sự cố giữa chừng sẽ để lại ảnh `pending` mà KHÔNG có case nào,
      // tức là ảnh mắc kẹt vĩnh viễn không ai duyệt (đúng lỗ hổng mà ADR-018 §Context mô tả cho
      // ảnh review trước đây).
      //
      // `source=new_content` (không phải `report`): đây là nội dung mới chờ duyệt lần đầu, không
      // phải nội dung bị tố cáo. `createOpenCase` idempotent theo INV-3 (ON CONFLICT DO NOTHING),
      // nên nếu vì lý do nào đó target đã có case mở thì không tạo trùng.
      if (session.placeId) {
        const severity = ModerationCaseSeverity.LOW;
        await this.moderationCases.createOpenCase(manager, {
          targetType: ModerationTargetType.MEDIA,
          targetId: created.id,
          source: ModerationCaseSource.NEW_CONTENT,
          severity,
          priority: computePriority(severity, 0),
        });
      }

      return created;
    });

    await this.redis.getClient().del(sessionKey);

    // Audit SAU commit (cùng nguyên tắc ModerationService.decide()/BusinessClaimsService.decide()).
    // Chỉ ảnh của cơ sở mới ghi — ảnh mồ côi (review) đã có `media.auto_published` riêng khi gắn.
    if (session.placeId) {
      await this.audit.record({
        event: 'media.place_submitted',
        entityType: 'media',
        entityId: media.id,
        actorId: userId,
        result: AuditResult.SUCCESS,
        after: { status: media.status, place_id: session.placeId },
      });
    }

    // media.status is always 'pending' here (createUploaded never sets anything else) — toMedia()
    // only resolves a public URL for status=published, so no public URL is ever exposed for
    // pending, unmoderated media (design review §A/§8).
    return toMedia(media, (id) => this.mediaUrl.fileUrl(id));
  }

  /**
   * Secure Private Media (2026-08-10) — phân giải `GET /media/{id}/file` thành một signed GET URL
   * ngắn hạn để controller redirect tới.
   *
   * `findPublishedObjectKey()` đã gộp TẤT CẢ các trường hợp không phục vụ được (không tồn tại,
   * pending, hidden, rejected, đã xoá mềm, không có object_key) thành cùng một `null` — nên chỉ có
   * đúng MỘT `NotFoundException` ở đây. Cố ý không phân biệt "không tồn tại" với "tồn tại nhưng
   * không published": phân biệt chúng sẽ biến endpoint công khai này thành một oracle cho phép dò
   * xem một media id nào đó có bị ẩn/từ chối hay không (cùng lý do `existsPublished()` đã gộp 404).
   *
   * KHÔNG stream bytes qua NestJS: chỉ trả URL để controller 302. Ảnh đi thẳng từ object storage
   * tới trình duyệt, API không nằm trên đường truyền dữ liệu.
   */
  async resolveFileUrl(mediaId: string): Promise<string> {
    const objectKey = await this.mediaRepo.findPublishedObjectKey(mediaId);
    if (!objectKey) {
      throw new NotFoundException('Không tìm thấy media');
    }
    return this.storage.createPresignedGetUrl(objectKey);
  }

  /** TTL (giây) của signed URL mà `resolveFileUrl()` sinh ra — controller dùng để đặt Cache-Control
   * sao cho response cache KHÔNG BAO GIỜ sống lâu hơn chính URL nó chứa. */
  get fileUrlTtl(): number {
    return this.storage.presignGetTtl;
  }

  /**
   * Owner Place Photos — phân giải file cho NGƯỜI CÓ QUYỀN XEM NỘI BỘ, ở BẤT KỲ trạng thái nào
   * (kể cả `pending`/`rejected`). Tách HẲN khỏi `resolveFileUrl()` công khai và KHÔNG nới lỏng nó:
   * `resolveFileUrl()` giữ nguyên điều kiện `published` cho kênh công khai.
   *
   * Lý do phải có: moderator không thể quyết định duyệt/từ chối một BỨC ẢNH mà họ không nhìn thấy
   * được, và chủ cơ sở cần thấy ảnh mình vừa gửi đang chờ duyệt. Trước đây giới hạn này được ghi
   * nhận tường minh ở `moderation-target-preview.ts` ("không có URL xem trước… hoãn tới milestone
   * sau") — đây chính là milestone đó.
   *
   * Quyền được cưỡng chế Ở CONTROLLER (`Media.Moderate` cho moderator; `Media.Upload.Managed` +
   * `@AuthorizationContext(place)` cho chủ cơ sở) — service chỉ phân giải, không tự quyết định
   * chính sách (ADR-019 D1). `deleted_at IS NULL` + `object_key IS NOT NULL` vẫn áp dụng.
   */
  async resolveInternalFileUrl(mediaId: string): Promise<string> {
    const objectKey = await this.mediaRepo.findAnyStatusObjectKey(mediaId);
    if (!objectKey) {
      throw new NotFoundException('Không tìm thấy media');
    }
    return this.storage.createPresignedGetUrl(objectKey);
  }

  /**
   * Ảnh của một cơ sở cho MÀN HÌNH QUẢN LÝ của chủ cơ sở — MỌI trạng thái (pending/published/
   * rejected/hidden), khác hẳn `listPublishedByPlace()` dùng cho trang công khai. Chủ cơ sở cần
   * thấy ảnh đang chờ duyệt và ảnh bị từ chối thì mới hiểu chuyện gì đang xảy ra với ảnh họ gửi.
   *
   * `url` trỏ tới endpoint NỘI BỘ (`/places/{placeId}/media/{id}/file`) chứ không phải endpoint
   * công khai: ảnh chưa duyệt không có URL công khai nào, theo đúng mô hình private media.
   *
   * KHÔNG đọc `moderation_cases` — CỐ Ý, đã điều tra (Owner-facing Moderation Feedback,
   * 2026-08-12). Chủ cơ sở chỉ nhận `status`, KHÔNG nhận `moderation_cases.reason`:
   *
   *  • `reason` là TEXT TỰ DO moderator gõ khi reject/hide (INV-11) — không có `reason_code` an
   *    toàn/có kiểm soát nào tồn tại cho quyết định media (khác `report_reason` — đó là lý do
   *    NGƯỜI DÙNG báo cáo, một khái niệm khác hoàn toàn, không phải lý do MODERATOR từ chối).
   *  • Repo này ĐÃ CÓ tiền lệ cho đúng tình huống "text nhân viên gõ về một yêu cầu của MỘT người
   *    dùng cụ thể, có nên lộ lại cho chính người đó không" — và tiền lệ đó trả lời KHÔNG cả hai
   *    lần: `business_claims.decision_note` không bao giờ lộ qua `GET /business-claims/mine`
   *    (chỉ `reason_code` — enum có kiểm soát — mới lộ, xem `business.mapper.ts`
   *    `toOwnBusinessClaimSummary`); `bookings.internal_note` được tài liệu hoá tường minh là
   *    "KHÔNG BAO GIỜ lộ qua API" dù nói về đúng booking của khách (docs/data/modules/booking.md).
   *    `moderation_cases.reason` giữ đúng vai trò như hai trường đó — free text nội bộ, không phải
   *    một khái niệm mới.
   *  • Lộ nó sẽ mở một kênh rò rỉ không kiểm soát được: reason có thể nhắc tới case khác, nghi vấn
   *    gian lận, hoặc bất cứ gì moderator thấy cần ghi — không có cách nào lọc an toàn bằng máy.
   *
   * Muốn cho chủ cơ sở một lý do THẬT SỰ hữu ích và an toàn cần một `reason_code` có kiểm soát
   * (cùng khuôn `business_claims`) — đòi hỏi migration + đổi giao diện quyết định của moderator,
   * cố ý NGOÀI PHẠM VI milestone này. `status: 'rejected'` là toàn bộ tín hiệu hiện có.
   */
  async listForPlaceOwner(placeId: string): Promise<OwnerPlacePhoto[]> {
    const [rows, coverImageId] = await Promise.all([
      this.mediaRepo.listAllByPlace(placeId),
      this.mediaRepo.getCoverImageId(placeId),
    ]);
    return rows.map((m) => ({
      id: m.id,
      status: m.status,
      caption: m.caption,
      alt_text: m.altText,
      created_at: m.createdAt.toISOString(),
      url: `${this.mediaUrl.placeMediaFileUrl(placeId, m.id)}`,
      sort_order: m.sortOrder,
      // `is_cover` tính từ `places.cover_image_id` — MỘT nguồn sự thật, không phải cờ nhân bản trên
      // media. Một ảnh vẫn có thể `is_cover: true` khi đang chờ kiểm duyệt lại (ví dụ bị ẩn rồi
      // khôi phục): giao diện dựa vào `status` để nói ảnh đã lên trang hay chưa, còn đường ĐỌC công
      // khai vẫn lọc `published` độc lập nên không có gì rò ra ngoài.
      is_cover: coverImageId !== null && coverImageId === m.id,
    }));
  }

  /**
   * Sắp xếp lại ảnh của cơ sở (Owner Cover & Photo Ordering, 2026-08-12).
   *
   * `placeId` đến từ ROUTE PARAM đã qua `Media.Upload.Managed` + `@AuthorizationContext(place)` —
   * service nhận nó như một giá trị ĐÃ được phép (PDP là nơi duy nhất quyết định, ADR-019 D1).
   *
   * Hợp đồng "TOÀN BỘ hay không có gì": `mediaIds` phải là ĐÚNG tập ảnh chưa gỡ của cơ sở (mọi
   * trạng thái), mỗi id một lần. Vì sao không chấp nhận danh sách một phần: với danh sách thiếu,
   * "ảnh bị bỏ qua nằm ở đâu" là một câu hỏi không có câu trả lời đúng duy nhất (giữ số cũ? đẩy
   * xuống cuối? xen kẽ?) — mọi lựa chọn đều làm chủ cơ sở bất ngờ. Màn hình quản lý luôn có sẵn
   * danh sách đầy đủ nên gửi đủ là chuyện tự nhiên, và nếu tập lệch (ảnh vừa bị gỡ ở tab khác,
   * hoặc client cố chèn id của cơ sở khác) thì 422 kèm yêu cầu tải lại là phản hồi đúng.
   *
   * Ảnh `pending`/`rejected` CŨNG được sắp: chủ cơ sở nhìn thấy chúng trên cùng màn hình, và một
   * ảnh chờ duyệt phải đáp xuống đúng vị trí đã chọn NGAY khi được duyệt. Việc này không nới lỏng
   * gì ở kênh công khai — `listPublishedByPlace()` vẫn chỉ trả `published`.
   *
   * Toàn bộ chạy trong MỘT transaction: đọc tập hiện tại có `FOR UPDATE` (hai lần sắp xếp đồng
   * thời bị tuần tự hoá, không lồng vào nhau), rồi một câu UPDATE set-based duy nhất.
   */
  async reorderPlaceMedia(placeId: string, mediaIds: string[], actorId: string): Promise<OwnerPlacePhoto[]> {
    const unique = new Set(mediaIds);
    if (unique.size !== mediaIds.length) {
      throw new UnprocessableEntityException('Danh sách ảnh có id trùng lặp');
    }

    await this.dataSource.transaction(async (manager) => {
      const currentIds = await this.mediaRepo.listIdsForPlaceForUpdate(manager, placeId);
      // So SÁNH TẬP, không chỉ so số lượng: chặn cả "thiếu ảnh" lẫn "chèn id lạ/của cơ sở khác"
      // với cùng một thông điệp không tiết lộ gì về tài nguyên của người khác.
      const sameSet = currentIds.length === mediaIds.length && currentIds.every((id) => unique.has(id));
      if (!sameSet) {
        throw new UnprocessableEntityException(
          'Danh sách ảnh không khớp với ảnh hiện có của cơ sở. Vui lòng tải lại trang rồi thử lại.',
        );
      }

      const updated = await this.mediaRepo.reorderPlaceMedia(manager, placeId, mediaIds);
      if (updated.length !== mediaIds.length) {
        // Không thể xảy ra sau kiểm tra tập ở trên (các hàng đã bị khoá) — nhưng nếu xảy ra thì
        // ném lỗi TRONG transaction để rollback, tuyệt đối không commit một thứ tự sắp dở dang.
        throw new UnprocessableEntityException('Không sắp xếp được toàn bộ ảnh. Vui lòng thử lại.');
      }
    });

    await this.audit.record({
      event: 'media.place_reordered',
      entityType: 'place',
      entityId: placeId,
      actorId,
      result: AuditResult.SUCCESS,
      after: { media_count: mediaIds.length },
    });

    return this.listForPlaceOwner(placeId);
  }

  /**
   * Đặt ảnh bìa cho cơ sở. Điều kiện đủ tư cách (thuộc đúng cơ sở, `published`, có object, chưa
   * gỡ) nằm TRONG câu UPDATE — xem `MediaRepository.setPlaceCoverImage`.
   *
   * Phân biệt 404 và 422 CHỈ để báo lỗi cho đúng, không phải để quyết định cho phép hay không:
   * quyết định đã do câu UPDATE đưa ra. 404 khi ảnh không thuộc cơ sở này (không tiết lộ ảnh của
   * cơ sở khác có tồn tại hay không — cùng khuôn `removeFromPlace`); 422 khi ảnh CÓ thuộc cơ sở
   * nhưng chưa được duyệt/đã bị từ chối — chủ cơ sở vốn đã nhìn thấy trạng thái đó trên màn hình
   * của mình nên nói thẳng ra là hữu ích và không rò rỉ gì.
   */
  async setPlaceCover(placeId: string, mediaId: string, actorId: string): Promise<OwnerPlacePhoto[]> {
    const applied = await this.mediaRepo.setPlaceCoverImage(placeId, mediaId);
    if (!applied) {
      if (!(await this.mediaRepo.existsForPlace(placeId, mediaId))) {
        throw new NotFoundException('Không tìm thấy ảnh của cơ sở này');
      }
      throw new UnprocessableEntityException(
        'Chỉ ảnh đã được kiểm duyệt viên duyệt mới đặt được làm ảnh bìa.',
      );
    }

    await this.audit.record({
      event: 'place.cover_image_set',
      entityType: 'place',
      entityId: placeId,
      actorId,
      result: AuditResult.SUCCESS,
      after: { cover_image_id: mediaId },
    });

    return this.listForPlaceOwner(placeId);
  }

  /**
   * Sửa `caption`/`alt_text` của MỘT ảnh cơ sở (Owner Photo Metadata, 2026-08-12).
   *
   * `placeId` đến từ ROUTE PARAM đã qua `Media.Upload.Managed` + `@AuthorizationContext(place)` —
   * service nhận nó như một giá trị ĐÃ được phép (ADR-019 D1), cùng mọi thao tác khác trên place
   * media. Điều kiện đủ tư cách ghi (đúng cơ sở, chưa xoá mềm) nằm TRONG câu UPDATE của repository
   * — không có khe TOCTOU giữa kiểm tra và ghi.
   *
   * **KHÔNG chạm** `status`/`sort_order`/`cover_image_id`: sửa mô tả ảnh không phải một quyết định
   * kiểm duyệt và không ảnh hưởng gì tới thứ tự hay ảnh bìa hiện tại. Ảnh `pending`/`rejected`/
   * `hidden` sửa được y hệt `published` — chủ cơ sở vốn đã thấy MỌI trạng thái trên màn hình quản
   * lý và không có lý do nghiệp vụ nào để khoá riêng trường mô tả theo trạng thái kiểm duyệt (FSM ở
   * `media-moderation.transition.ts` chỉ định nghĩa transition cho `status`, không hề nhắc tới
   * caption/alt_text). Không tạo case kiểm duyệt mới, không reset trạng thái.
   *
   * 400 khi CẢ HAI trường đều vắng mặt — một request không sửa gì là dấu hiệu lỗi client, không
   * phải "no-op hợp lệ". 404 khi ảnh không thuộc cơ sở này (không tiết lộ ảnh của cơ sở khác có tồn
   * tại hay không — cùng khuôn `removeFromPlace`/`setPlaceCover`).
   */
  async updatePlaceMediaMetadata(
    placeId: string,
    mediaId: string,
    dto: UpdatePlaceMediaMetadataDto,
    actorId: string,
  ): Promise<OwnerPlacePhoto[]> {
    const caption = normalizeMetadataField(dto.caption);
    const altText = normalizeMetadataField(dto.alt_text);
    if (caption === undefined && altText === undefined) {
      throw new BadRequestException('Cần ít nhất một trong hai trường caption hoặc alt_text.');
    }

    const applied = await this.mediaRepo.updatePlaceMediaMetadata(placeId, mediaId, { caption, altText });
    if (!applied) {
      throw new NotFoundException('Không tìm thấy ảnh của cơ sở này');
    }

    await this.audit.record({
      event: 'media.place_metadata_updated',
      entityType: 'media',
      entityId: mediaId,
      actorId,
      result: AuditResult.SUCCESS,
      after: { place_id: placeId, caption_changed: caption !== undefined, alt_text_changed: altText !== undefined },
    });

    return this.listForPlaceOwner(placeId);
  }

  /**
   * Chủ cơ sở gỡ một ảnh CỦA CHÍNH CƠ SỞ ĐÓ. Xoá MỀM (`deleted_at`) — cùng ngữ nghĩa
   * `softDeleteOrphanCandidate()`, giữ được dấu vết cho kiểm toán và cho case kiểm duyệt đang mở
   * (preview của case sẽ tự chuyển sang `found:false`, đã có nhánh xử lý sẵn).
   *
   * `placeId` đến từ ROUTE PARAM đã qua kiểm tra quyền, và được đưa THẲNG vào điều kiện WHERE —
   * nên một mediaId của cơ sở KHÁC sẽ khớp 0 dòng và trả 404, không phải 403 "đúng ảnh nhưng sai
   * người" (không rò rỉ sự tồn tại của ảnh thuộc cơ sở khác).
   *
   * Nếu ảnh vừa gỡ ĐANG là ảnh bìa, con trỏ `places.cover_image_id` được dọn trong CÙNG transaction
   * (Owner Cover & Photo Ordering, 2026-08-12) — không để lại bìa treo trỏ vào ảnh đã xoá. Kênh
   * công khai vốn đã an toàn kể cả khi không dọn (`COVER_IMAGE_COLS` lọc `deleted_at IS NULL`);
   * dọn ở đây là để trạng thái lưu trữ nói đúng sự thật.
   */
  async removeFromPlace(placeId: string, mediaId: string, actorId: string): Promise<void> {
    const removed = await this.dataSource.transaction(async (manager) => {
      const ok = await this.mediaRepo.softDeletePlaceMedia(placeId, mediaId, manager);
      if (ok) {
        await this.mediaRepo.clearCoverImageByMedia(mediaId, manager);
      }
      return ok;
    });
    if (!removed) {
      throw new NotFoundException('Không tìm thấy ảnh của cơ sở này');
    }
    await this.audit.record({
      event: 'media.place_removed',
      entityType: 'media',
      entityId: mediaId,
      actorId,
      result: AuditResult.SUCCESS,
      after: { place_id: placeId, deleted: true },
    });
  }

  /** Ảnh có thuộc ĐÚNG cơ sở này không — chốt chặn cho route phục vụ file nội bộ của chủ cơ sở. */
  belongsToPlace(placeId: string, mediaId: string): Promise<boolean> {
    return this.mediaRepo.existsForPlace(placeId, mediaId);
  }

  /**
   * WF-12/T3 (Moderation Foundation M5, ADR-018/moderation-design.md §9.2). T3 bước 1 ("target
   * tồn tại và ở trạng thái báo cáo được") sống Ở ĐÂY — chỉ MediaRepository biết `media`.
   * `existsPublished()` trả về false CHO CẢ "không tồn tại" LẪN "chưa/không còn published" — cùng
   * một 404, không rò rỉ trạng thái kiểm duyệt nội bộ cho reporter. Phần còn lại của T3 uỷ quyền
   * hoàn toàn cho `ModerationReportsService`.
   */
  async report(mediaId: string, dto: CreateReportDto, reporterId: string): Promise<void> {
    if (!(await this.mediaRepo.existsPublished(mediaId))) {
      throw new NotFoundException('Không tìm thấy media');
    }
    await this.moderationReports.report({
      targetType: ModerationTargetType.MEDIA,
      targetId: mediaId,
      reporterId,
      reason: dto.reason,
      description: dto.description || null,
    });
  }

  private sessionKey(key: string): string {
    return `${PRESIGN_SESSION_PREFIX}${key}`;
  }
}
