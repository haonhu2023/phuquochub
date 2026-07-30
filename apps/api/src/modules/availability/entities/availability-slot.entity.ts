import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// `availability_slots` (Availability & Inventory Foundation) — dung lượng bookable cho MỘT
// entity (hotel/restaurant/tour/event/transport) tại MỘT khung thời gian cụ thể. entity_type/
// entity_id là tham chiếu ĐA HÌNH — cùng nguyên mẫu `bookings.entity_type/entity_id` (Booking
// Request Foundation), tự nó cùng nguyên mẫu `price_history.entity_type` (ADR-006), một ngoại lệ
// có kiểm soát của ADR-003. place_id là FK thật, cùng lý do Booking: Place là thực thể lõi
// (ADR-001), dùng để truy vấn/index nhanh không phụ thuộc entity_type nào.
//
// KHÔNG có business logic riêng cho hotel/tour/... ở đây — total_capacity là con số trừu tượng
// (số phòng/vé/chỗ/ghế, tuỳ entity_type), AvailabilityService không biết và không cần biết đơn
// vị cụ thể là gì.
@Entity('availability_slots')
@Index(['entityType', 'entityId'])
@Index(['placeId'])
@Index(['slotStart'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  entityType!: string; // lowercase: hotel|restaurant|tour|event|transport (BOOKABLE_ENTITY_TYPES)

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'timestamptz' })
  slotStart!: Date;

  // Nullable — một "điểm thời gian" (vd giờ khởi hành tour) không cần slot_end; một "khung thời
  // gian" (vd một đêm khách sạn, một khoảng thuê xe) thì có.
  @Column({ type: 'timestamptz', nullable: true })
  slotEnd!: Date | null;

  @Column({ type: 'int' })
  totalCapacity!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
