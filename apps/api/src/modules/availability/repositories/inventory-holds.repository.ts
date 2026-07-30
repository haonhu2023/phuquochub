import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryHold } from '../entities/inventory-hold.entity';
import { AvailabilitySlot } from '../entities/availability-slot.entity';
import { InventoryHoldStatus } from '../availability.enums';
import { OCCUPYING_STATUSES } from './availability-slots.repository';

export interface PlaceHoldParams {
  availabilitySlotId: string;
  bookingId: string;
  quantity: number;
  expiresAt: Date;
}

@Injectable()
export class InventoryHoldsRepository {
  constructor(
    @InjectRepository(InventoryHold) private readonly holds: Repository<InventoryHold>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  findByBookingId(bookingId: string): Promise<InventoryHold | null> {
    return this.holds.findOne({ where: { bookingId } });
  }

  /**
   * Chỗ duy nhất trong toàn bộ Foundation THỰC SỰ ghi hold — nhận `manager` thay vì tự mở
   * transaction, để BookingsRepository.create() có thể gọi trong CHÍNH transaction booking+items
   * của nó (yêu cầu mục E: "Ensure transactional consistency between Booking and Inventory Hold
   * where appropriate" — tạo booking yêu cầu hold mà hold thất bại (over-allocation) PHẢI khiến
   * cả booking không được tạo, không phải tạo xong rồi mới phát hiện hold lỗi).
   *
   * `SELECT ... FOR UPDATE` khoá đúng MỘT dòng availability_slots — chặn race condition giữa hai
   * request đồng thời cùng giữ chỗ trên một slot (mục E: "Prevent over-allocation"). Khoá dòng
   * (không khoá bảng) nên hai request nhắm HAI slot khác nhau không bị chặn nhau.
   */
  async placeHold(manager: EntityManager, params: PlaceHoldParams): Promise<InventoryHold> {
    const slot = await manager
      .getRepository(AvailabilitySlot)
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.id = :id', { id: params.availabilitySlotId })
      .getOne();
    if (!slot) {
      throw new ConflictException('availability_slot_id không tồn tại');
    }

    const heldRows: Array<{ held: string }> = await manager
      .getRepository(InventoryHold)
      .createQueryBuilder('h')
      .select('COALESCE(SUM(h.quantity), 0)', 'held')
      .where('h.availabilitySlotId = :id', { id: params.availabilitySlotId })
      .andWhere('h.status IN (:...statuses)', { statuses: OCCUPYING_STATUSES })
      .getRawMany();
    const currentlyHeld = Number(heldRows[0]?.held ?? 0);

    if (currentlyHeld + params.quantity > slot.totalCapacity) {
      throw new ConflictException(
        `Không đủ dung lượng: còn ${slot.totalCapacity - currentlyHeld}, yêu cầu ${params.quantity}`,
      );
    }

    const hold = manager.getRepository(InventoryHold).create({
      availabilitySlotId: params.availabilitySlotId,
      bookingId: params.bookingId,
      quantity: params.quantity,
      status: InventoryHoldStatus.ACTIVE,
      expiresAt: params.expiresAt,
    });
    return manager.getRepository(InventoryHold).save(hold);
  }

  /**
   * Confirm/release KHÔNG cần mở transaction chung với booking's own update (khác placeHold ở
   * trên) — best-effort, cùng mức độ "sau khi DB write chính thành công" như domain event publish
   * đã có (BookingsService.confirm/cancel). Nếu bước này thất bại giữa đường, booking vẫn ở
   * trạng thái đúng của NÓ; hold có thể cần đối soát thủ công — chấp nhận được ở quy mô Foundation
   * này (không có real money/payment provider đứng sau để cần atomicity nghiêm ngặt hơn).
   */
  async markConfirmed(id: string): Promise<void> {
    await this.holds.update({ id }, { status: InventoryHoldStatus.CONFIRMED });
  }

  async markReleased(id: string): Promise<void> {
    await this.holds.update({ id }, { status: InventoryHoldStatus.RELEASED });
  }

  async markExpired(id: string): Promise<void> {
    await this.holds.update({ id }, { status: InventoryHoldStatus.EXPIRED });
  }

  /** Abstraction cho automatic expiration (mục B) — repo KHÔNG có hạ tầng lập lịch nào
   * (@nestjs/schedule, BullMQ, cron...) nên KHÔNG tự đăng ký chạy định kỳ; một job thật (sprint
   * sau) chỉ cần gọi định kỳ phương thức này. Trả về số hold đã chuyển expired. */
  async expireOverdueHolds(now: Date = new Date()): Promise<number> {
    const result = await this.holds
      .createQueryBuilder()
      .update(InventoryHold)
      .set({ status: InventoryHoldStatus.EXPIRED })
      .where('status = :active', { active: InventoryHoldStatus.ACTIVE })
      .andWhere('expiresAt <= :now', { now })
      .execute();
    return result.affected ?? 0;
  }
}
