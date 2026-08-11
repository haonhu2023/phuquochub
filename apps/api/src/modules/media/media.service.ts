import {
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
import { AllowedMediaMimeType, CreateMediaDto, PresignMediaDto } from './dto/media.dto';
import { toMedia } from './media.mapper';

const MIME_TO_EXTENSION: Record<AllowedMediaMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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
   */
  async listForPlaceOwner(placeId: string) {
    const rows = await this.mediaRepo.listAllByPlace(placeId);
    return rows.map((m) => ({
      id: m.id,
      status: m.status,
      caption: m.caption,
      alt_text: m.altText,
      created_at: m.createdAt.toISOString(),
      url: `${this.mediaUrl.placeMediaFileUrl(placeId, m.id)}`,
    }));
  }

  /**
   * Chủ cơ sở gỡ một ảnh CỦA CHÍNH CƠ SỞ ĐÓ. Xoá MỀM (`deleted_at`) — cùng ngữ nghĩa
   * `softDeleteOrphanCandidate()`, giữ được dấu vết cho kiểm toán và cho case kiểm duyệt đang mở
   * (preview của case sẽ tự chuyển sang `found:false`, đã có nhánh xử lý sẵn).
   *
   * `placeId` đến từ ROUTE PARAM đã qua kiểm tra quyền, và được đưa THẲNG vào điều kiện WHERE —
   * nên một mediaId của cơ sở KHÁC sẽ khớp 0 dòng và trả 404, không phải 403 "đúng ảnh nhưng sai
   * người" (không rò rỉ sự tồn tại của ảnh thuộc cơ sở khác).
   */
  async removeFromPlace(placeId: string, mediaId: string, actorId: string): Promise<void> {
    const removed = await this.mediaRepo.softDeletePlaceMedia(placeId, mediaId);
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
