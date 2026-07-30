import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InventoryHoldStatus } from '../availability.enums';
import { AvailabilitySlot } from './availability-slot.entity';

// `inventory_holds` (Availability & Inventory Foundation) — giữ chỗ TẠM THỜI trên một
// AvailabilitySlot, gắn với ĐÚNG MỘT booking (uq_inventory_holds_booking — một booking chỉ có
// tối đa một hold ở slice này). expires_at là hết hạn TỰ THÂN (kiểm tra "lazy" tại thời điểm
// confirm — xem AvailabilityService.confirmHoldForBooking — vì repo chưa có hạ tầng lập lịch
// nào, xem availability.service.ts's expireOverdueHolds()).
@Entity('inventory_holds')
@Index(['availabilitySlotId'])
@Index(['status'])
export class InventoryHold {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  availabilitySlotId!: string;

  @Column({ type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: InventoryHoldStatus,
    enumName: 'inventory_hold_status',
    default: InventoryHoldStatus.ACTIVE,
  })
  status!: InventoryHoldStatus;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => AvailabilitySlot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'availability_slot_id' })
  availabilitySlot!: AvailabilitySlot;
}
