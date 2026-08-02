import { MediaStatus, MediaType } from '../media/media.enums';
import { ReviewStatus } from '../reviews/review.enums';
import { ModerationTargetType } from './moderation.enums';

// Ảnh chụp target cho GET /moderation/cases/{id} (moderation-design.md §9, dòng "Case + các
// report + ảnh chụp target"). Union theo target_type — CHỈ media/review có FSM đăng ký (ADR-018
// MR-4); `place` LUÔN found=false (chưa triển khai FSM cho nó, ngoài phạm vi M1–M7).
//
// Trường CỐ Ý loại trừ (không thuộc hợp đồng, không cần cho việc kiểm duyệt):
// - media: object_key/bucket/content_type/size_bytes/checksum_sha256 (nội bộ storage), url (luôn
//   NULL trước khi publish theo thiết kế — không có URL xem trước qua endpoint này; xem giới hạn
//   ở báo cáo M2, cần StorageService signed-URL — chưa được ADR-018 đặc tả, hoãn tới milestone sau).
// - review: không có trường nào bị loại (content CHÍNH LÀ thứ cần đọc để kiểm duyệt).
export type ModerationTargetPreview =
  | { found: false; targetType: ModerationTargetType; targetId: string }
  | {
      found: true;
      targetType: ModerationTargetType.MEDIA;
      targetId: string;
      mediaType: MediaType;
      status: MediaStatus;
      uploadedBy: string | null;
      createdAt: Date;
    }
  | {
      found: true;
      targetType: ModerationTargetType.REVIEW;
      targetId: string;
      status: ReviewStatus;
      rating: number;
      content: string | null;
      placeId: string;
      userId: string;
      createdAt: Date;
    };
