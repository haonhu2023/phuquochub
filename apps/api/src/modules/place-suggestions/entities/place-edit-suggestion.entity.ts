import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// "Báo thông tin sai / Đề xuất chỉnh sửa" — bản tối thiểu (2026-09-24). Một hàng = MỘT đề xuất sửa
// MỘT trường của MỘT địa điểm, kèm nguồn. KHÔNG BAO GIỜ tự ghi vào `places` — không có code path
// nào đọc `proposedValue` rồi ghi thẳng xuống bảng đó (xem PlaceSuggestionsService). Owner xem
// `currentValue` (chụp tại thời điểm gửi) cạnh `proposedValue`, rồi TỰ đi sửa qua editor CAS hiện
// có (PlaceForm/PlaceDescriptionEditor) nếu đồng ý — resolve() ở đây chỉ đổi status, không đụng
// place. Cùng lý do `currentValue` là chụp ảnh, không phải tham chiếu sống: giá trị thật có thể đã
// đổi giữa lúc gửi và lúc owner xem, xem cũ/mới ở đây là "so với lúc người dùng gửi", không phải
// "so với hiện tại" — nếu cần giá trị hiện tại, editor CAS đã tự tải lại khi owner mở nó.
export type PlaceSuggestionStatus = 'pending' | 'applied' | 'rejected';

@Entity('place_edit_suggestions')
@Index('idx_place_suggestions_place_pending', ['placeId', 'status'], { where: "status = 'pending'" })
@Index('idx_place_suggestions_status', ['status', 'createdAt'], { where: "status = 'pending'" })
export class PlaceEditSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  // Giới hạn ở DTO (allow-list các trường CAS-editable hiện có), KHÔNG phải CHECK constraint ở DB —
  // cùng cách ODQ để field là varchar trần, xem OwnerDecisionQueueItem.field.
  @Column({ type: 'varchar', length: 60 })
  field!: string;

  // Chụp giá trị hiện tại của field TẠI THỜI ĐIỂM gửi — null nếu trường đang trống. Không phải FK/
  // tham chiếu sống, xem ghi chú đầu file.
  @Column({ type: 'text', nullable: true })
  currentValue!: string | null;

  @Column({ type: 'text' })
  proposedValue!: string;

  @Column({ type: 'varchar', length: 500 })
  sourceUrl!: string;

  @Column({ type: 'text', nullable: true })
  sourceNote!: string | null;

  @Column({ type: 'uuid' })
  submittedBy!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: PlaceSuggestionStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
