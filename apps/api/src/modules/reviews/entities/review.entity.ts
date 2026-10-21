import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReviewStatus } from '../review.enums';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

// Bảng `reviews` (schema.prisma:825, migration InitReviews). Không có updated_at/deleted_at
// trong thiết kế gốc — review là bất biến sau khi tạo ở MVP (sửa/xoá thuộc PATCH/DELETE
// /reviews/{id}, ngoài phạm vi phiên này — xem openapi.yaml).
@Entity('reviews')
@Index(['placeId', 'status'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'enum', enum: ReviewStatus, enumName: 'review_status', default: ReviewStatus.PENDING })
  status!: ReviewStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Giai đoạn 4 (chiến lược data-hub, AddReviewConfirmedVisit1720010500000) — "đã xác nhận từng
  // đến", ghi MỘT LẦN lúc tạo (bất biến, cùng nguyên tắc review không có updated_at). null = không
  // có booking confirmed nào tại thời điểm viết — KHÔNG phải lỗi, chỉ là chưa/không có bằng chứng.
  @Column({ type: 'uuid', nullable: true })
  verifiedBookingId!: string | null;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
