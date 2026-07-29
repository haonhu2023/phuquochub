import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Booking } from './booking.entity';

// `booking_items` (InitBooking) — line item TRONG một booking (vd "2x vé người lớn", "3 đêm
// Deluxe"), KHÔNG phải một giỏ hàng đa-nơi-bán: entity_type/entity_id/place_id của "cái gì được
// đặt" sống ở Booking (một booking = một satellite), item chỉ là dòng giá bên trong nó.
@Entity('booking_items')
@Index(['bookingId'])
export class BookingItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;
}
