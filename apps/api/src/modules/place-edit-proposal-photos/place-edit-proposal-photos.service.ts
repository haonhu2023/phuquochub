import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StorageService } from '../../core/storage/storage.service';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { RedisService } from '../../core/redis/redis.service';
import { MediaRepository } from '../media/repositories/media.repository';
import { ModerationCasesRepository } from '../moderation/repositories/moderation-cases.repository';
import { ModerationCaseSeverity, ModerationCaseSource, ModerationTargetType } from '../moderation/moderation.enums';
import { computePriority } from '../moderation/moderation-severity';
import { PlaceEditProposalsService } from '../place-edit-proposals/place-edit-proposals.service';
import {
  AllowedProposalPhotoMimeType,
  PresignProposalPhotoDto,
  RegisterProposalPhotoDto,
} from './dto/place-edit-proposal-photo.dto';

const MIME_TO_EXTENSION: Record<AllowedProposalPhotoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PRESIGN_SESSION_PREFIX = 'pep-photo-presign:';
// Cùng lý do PRESIGN_SESSION_TTL_SECONDS của media.service.ts — dài hơn 600s của chính signed PUT
// URL một chút, để client upload sát rìa hạn vẫn còn thời gian gọi register.
const PRESIGN_SESSION_TTL_SECONDS = 900;

// Ảnh BẰNG CHỨNG cho một góp ý, không phải một gallery — trần thấp hơn hẳn ảnh cơ sở/bất động sản.
const MAX_PHOTOS_PER_PROPOSAL = 3;

interface PresignSession {
  userId: string;
  proposalId: string;
  contentType: string;
  size: number;
  checksumSha256: string;
}

export interface ProposalPhotoView {
  id: string;
  status: string;
  created_at: string;
}

/**
 * "Ảnh góp ý qua media moderation" (mục V đợt 2 — phần còn lại DUY NHẤT sau sender_message). Tái
 * dùng TRỰC TIẾP `MediaRepository`/`ModerationCasesRepository` (cả hai đã export sẵn cho đúng mục
 * đích này) — KHÔNG đụng `MediaService`/`MediaModule`'s nội bộ (presign/register/audit của nó vẫn
 * giữ nguyên, không rẽ nhánh thêm `if (session.proposalId)` nào vào đó). Đây là bảng/luồng CHUYÊN
 * BIỆT thứ 6 kiểu như `media.entity.ts` đã mô tả ("exclusive arc 6 nhánh"), không phải một module
 * song song tự ý nghĩa — ảnh vẫn là MỘT hàng `media` thật, vẫn qua ĐÚNG hàng chờ kiểm duyệt chung
 * (`ModerationTargetType.MEDIA`, cùng `ModerationService.decide()` xử lý published/rejected cho
 * MỌI loại media, không cần code riêng cho nhánh proposal).
 *
 * Lý do KHÔNG tiêm `MediaService` vào đây: `MediaModule` không thể import `PlaceEditProposalsModule`
 * (sẽ tạo cycle — `PlacesModule` đã import `MediaModule`, và `PlaceEditProposalsModule` đã import
 * `PlacesModule`). Module NÀY đi hướng ngược lại (import `MediaModule` để lấy `MediaRepository`),
 * hướng đó AN TOÀN vì không ai import module này quay lại.
 */
@Injectable()
export class PlaceEditProposalPhotosService {
  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly mediaUrl: MediaUrlService,
    private readonly proposalsService: PlaceEditProposalsService,
    private readonly moderationCases: ModerationCasesRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private sessionKey(objectKey: string): string {
    return `${PRESIGN_SESSION_PREFIX}${objectKey}`;
  }

  private async assertOwned(proposalId: string, userId: string): Promise<void> {
    // getMine() ném NotFoundException nếu đề xuất không tồn tại HOẶC không thuộc userId — không
    // phân biệt hai trường hợp (không lộ tồn tại của đề xuất người khác), cùng quy ước mọi module
    // "ownership" khác trong phiên này (saved-items/listing-reports/real-estate-listing-photos).
    await this.proposalsService.getMine(proposalId, userId);
  }

  async presign(proposalId: string, userId: string, dto: PresignProposalPhotoDto) {
    await this.assertOwned(proposalId, userId);

    const existing = await this.mediaRepo.listAllByProposal(proposalId);
    if (existing.length >= MAX_PHOTOS_PER_PROPOSAL) {
      throw new ConflictException(`Tối đa ${MAX_PHOTOS_PER_PROPOSAL} ảnh mỗi góp ý — hãy liên hệ nếu cần gửi thêm bằng chứng khác.`);
    }

    const generatedKey = `media/${randomUUID()}.${MIME_TO_EXTENSION[dto.content_type]}`;
    const presigned = await this.storage.createPresignedPutUrl(generatedKey, dto.content_type);

    const session: PresignSession = {
      userId,
      proposalId,
      contentType: dto.content_type,
      size: dto.size,
      checksumSha256: dto.checksum_sha256,
    };
    await this.redis
      .getClient()
      .set(this.sessionKey(presigned.key), JSON.stringify(session), 'EX', PRESIGN_SESSION_TTL_SECONDS);

    return { key: presigned.key, upload_url: presigned.uploadUrl, expires_in: presigned.expiresIn };
  }

  async register(proposalId: string, userId: string, dto: RegisterProposalPhotoDto): Promise<ProposalPhotoView> {
    const sessionKey = this.sessionKey(dto.key);
    const raw = await this.redis.getClient().get(sessionKey);
    if (!raw) {
      throw new UnprocessableEntityException(
        'Không có phiên presign hợp lệ cho key này (chưa từng presign, đã đăng ký, hoặc đã hết hạn)',
      );
    }

    const session = JSON.parse(raw) as PresignSession;
    if (session.userId !== userId || session.proposalId !== proposalId) {
      throw new NotFoundException('Không tìm thấy đề xuất');
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

    // Ảnh góp ý KHÔNG tự công khai — luôn vào hàng chờ chung (ModerationTargetType.MEDIA), ĐÚNG
    // yêu cầu "qua media moderation". Tạo hàng media + case kiểm duyệt trong CÙNG transaction,
    // cùng nguyên tắc MediaService.register() áp cho ảnh cơ sở (không để ảnh pending mồ côi không
    // case nào mở nếu có sự cố giữa chừng).
    const created = await this.dataSource.transaction(async (manager) => {
      const media = await this.mediaRepo.createUploaded(manager, {
        objectKey: dto.key,
        bucket: this.storage.bucketName,
        contentType: session.contentType,
        sizeBytes: session.size,
        checksumSha256: session.checksumSha256,
        uploadedBy: userId,
        placeId: null,
        proposalId,
        caption: null,
        altText: null,
      });
      const severity = ModerationCaseSeverity.LOW;
      await this.moderationCases.createOpenCase(manager, {
        targetType: ModerationTargetType.MEDIA,
        targetId: media.id,
        source: ModerationCaseSource.NEW_CONTENT,
        severity,
        priority: computePriority(severity, 0),
      });
      return media;
    });

    await this.redis.getClient().del(sessionKey);
    return { id: created.id, status: created.status, created_at: created.createdAt.toISOString() };
  }

  async listMine(proposalId: string, userId: string): Promise<Array<ProposalPhotoView & { url: string }>> {
    await this.assertOwned(proposalId, userId);
    const rows = await this.mediaRepo.listAllByProposal(proposalId);
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      url: this.mediaUrl.placeEditProposalPhotoFileUrl(proposalId, row.id),
    }));
  }

  /** Kênh CHỦ ĐỀ XUẤT — xem ảnh của chính mình ở BẤT KỲ trạng thái kiểm duyệt. */
  async resolveOwnerFileUrl(proposalId: string, mediaId: string, userId: string): Promise<string> {
    await this.assertOwned(proposalId, userId);
    const belongs = await this.mediaRepo.existsForProposal(proposalId, mediaId);
    if (!belongs) {
      throw new NotFoundException('Không tìm thấy ảnh');
    }
    const objectKey = await this.mediaRepo.findAnyStatusObjectKey(mediaId);
    if (!objectKey) {
      throw new NotFoundException('Không tìm thấy ảnh');
    }
    return this.storage.createPresignedGetUrl(objectKey);
  }

  get fileUrlTtl(): number {
    return this.storage.presignGetTtl;
  }
}
