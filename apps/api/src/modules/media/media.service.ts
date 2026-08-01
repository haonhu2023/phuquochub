import { ConflictException, ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { StorageService } from '../../core/storage/storage.service';
import { RedisService } from '../../core/redis/redis.service';
import { MediaRepository } from './repositories/media.repository';
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
    private readonly redis: RedisService,
    private readonly mediaRepo: MediaRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async presign(dto: PresignMediaDto, userId: string) {
    if (dto.place_id) {
      const exists = await this.mediaRepo.placeExists(dto.place_id);
      if (!exists) {
        throw new UnprocessableEntityException('place_id không tồn tại');
      }
    }

    const generatedKey = `media/${randomUUID()}.${MIME_TO_EXTENSION[dto.content_type]}`;
    const presigned = await this.storage.createPresignedPutUrl(generatedKey, dto.content_type);

    const session: PresignSession = {
      userId,
      contentType: dto.content_type,
      size: dto.size,
      checksumSha256: dto.checksum_sha256,
      placeId: dto.place_id ?? null,
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

    const media = await this.dataSource.transaction((manager) =>
      this.mediaRepo.createUploaded(manager, {
        objectKey: dto.key,
        bucket: this.storage.bucketName,
        contentType: session.contentType,
        sizeBytes: session.size,
        checksumSha256: session.checksumSha256,
        uploadedBy: userId,
        placeId: session.placeId,
        caption: dto.caption?.trim() || null,
        altText: dto.alt?.trim() || null,
      }),
    );

    await this.redis.getClient().del(sessionKey);

    // media.status is always 'pending' here (createUploaded never sets anything else) — toMedia()
    // reads url straight from the row, which createUploaded always inserts as NULL for these rows,
    // so no public URL is ever exposed for pending, unmoderated media (design review §A/§8).
    return toMedia(media);
  }

  private sessionKey(key: string): string {
    return `${PRESIGN_SESSION_PREFIX}${key}`;
  }
}
