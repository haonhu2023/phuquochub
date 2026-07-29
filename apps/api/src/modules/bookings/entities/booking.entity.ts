import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BookingFulfillmentStatus, BookingPaymentStatus, BookingStatus } from '../booking.enums';

// `bookings` (InitBooking, Booking Request Foundation) — mot yeu cau dat cho MOT satellite Place
// (hotel/restaurant/tour/event/transport). entity_type/entity_id la tham chieu DA HINH (ADR-003
// ngoai le, dung nguyen mau `price_history.entity_type/entity_id` - khong FK cung, toan ven
// cuong che o BookingsService qua PlacesRepository/entity-specific findByPlaceId). place_id LA
// FK that (Place la thuc the loi, ADR-001) dung de truy van/index nhanh du entity_type nao.
//
// Khong co quan he ORM toi Place/User o day (giong PriceHistory.entityId) - service tu doi chieu
// qua repository tuong ung khi can, tranh ket hop entity khong can thiet o vertical slice dau.
@Entity('bookings')
@Index(['entityType', 'entityId'])
@Index(['customerUserId', 'createdAt'])
@Index(['placeId'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  bookingCode!: string;

  // Chua co phan loai xac nhan (khong hardcode enum khi chua ro taxonomy - cung nguyen tac
  // ADR-017 ap dung cho cot tri-state chua xac dinh).
  @Column({ type: 'varchar', length: 30, nullable: true })
  bookingType!: string | null;

  @Column({ type: 'varchar', length: 30 })
  entityType!: string; // lowercase: hotel|restaurant|tour|event|transport (BOOKABLE_ENTITY_TYPES)

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  // Khach hang toi thieu hoa: chi tham chieu users.id, KHONG bang booking_customers/guests rieng
  // o slice nay. Nullable de danh cho guest checkout tuong lai (chua xay dung).
  @Column({ type: 'uuid', nullable: true })
  customerUserId!: string | null;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currencyCode!: string;

  @Column({ type: 'enum', enum: BookingStatus, enumName: 'booking_status', default: BookingStatus.PENDING })
  bookingStatus!: BookingStatus;

  @Column({
    type: 'enum',
    enum: BookingPaymentStatus,
    enumName: 'booking_payment_status',
    default: BookingPaymentStatus.UNPAID,
  })
  paymentStatus!: BookingPaymentStatus;

  @Column({
    type: 'enum',
    enum: BookingFulfillmentStatus,
    enumName: 'booking_fulfillment_status',
    default: BookingFulfillmentStatus.PENDING,
  })
  fulfillmentStatus!: BookingFulfillmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  serviceStartAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  serviceEndAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  partySize!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: string;

  // Chua co dong gia/voucher engine (booking_discounts ngoai pham vi slice nay) - luon 0.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fees!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  grandTotal!: string;

  @Column({ type: 'text', nullable: true })
  guestNote!: string | null;

  // Khong bao gio tra ve qua API cong khai - chi nhan vien/chu co so.
  @Column({ type: 'text', nullable: true })
  internalNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
