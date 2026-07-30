import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AvailabilitySlotsRepository } from './repositories/availability-slots.repository';
import { InventoryHoldsRepository, PlaceHoldParams } from './repositories/inventory-holds.repository';
import { InventoryHoldStatus } from './availability.enums';
import { CreateAvailabilitySlotDto, ListAvailabilityQueryDto } from './dto/availability.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

// Availability & Inventory Foundation — service TỔNG QUÁT, không có logic riêng cho bất kỳ
// entity_type nào (hotel/restaurant/tour/event/transport đều đi qua CÙNG code path). Đây là điểm
// tích hợp duy nhất BookingsService gọi vào cho mọi thao tác liên quan hold.
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly slotsRepo: AvailabilitySlotsRepository,
    private readonly holdsRepo: InventoryHoldsRepository,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async createSlot(dto: CreateAvailabilitySlotDto) {
    const slot = await this.slotsRepo.create({
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      placeId: dto.place_id,
      slotStart: new Date(dto.slot_start),
      slotEnd: dto.slot_end ? new Date(dto.slot_end) : null,
      totalCapacity: dto.total_capacity,
    });
    return toSlotResponse(slot, 0);
  }

  async list(query: ListAvailabilityQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const { items, total } = await this.slotsRepo.list({
      entityType: query.entity_type,
      entityId: query.entity_id,
      placeId: query.place_id,
      dateFrom: query.date_from ? new Date(query.date_from) : undefined,
      dateTo: query.date_to ? new Date(query.date_to) : undefined,
      sortBy: query.sort_by ?? 'slot_start',
      sortDir: query.sort_dir === 'desc' ? 'DESC' : 'ASC',
      limit,
      offset: (page - 1) * limit,
    });
    return paginate(
      items.map(({ slot, heldQuantity }) => toSlotResponse(slot, heldQuantity)),
      page,
      limit,
      total,
    );
  }

  /** Điểm vào ĐỘC LẬP (mở transaction riêng) — dùng khi giữ chỗ KHÔNG diễn ra như một phần của
   * việc tạo booking (vd một hold thao tác nội bộ tương lai). BookingsRepository.create() KHÔNG
   * gọi hàm này — nó gọi thẳng InventoryHoldsRepository.placeHold(manager, ...) để dùng chung
   * transaction booking+items của chính nó (xem bookings.repository.ts). */
  placeHold(params: PlaceHoldParams) {
    return this.ds.transaction((manager) => this.holdsRepo.placeHold(manager, params));
  }

  /** Gọi bởi BookingsService.confirm() SAU KHI booking_status đã update thành công. No-op nếu
   * booking chưa từng yêu cầu hold. Ném lỗi nếu hold không còn 'active' HOẶC đã hết hạn theo thời
   * gian thực (kiểm tra "lazy" — repo chưa có scheduler tự động chuyển expired, xem
   * InventoryHoldsRepository.expireOverdueHolds). */
  async confirmHoldForBooking(bookingId: string): Promise<void> {
    const hold = await this.holdsRepo.findByBookingId(bookingId);
    if (!hold) return;

    if (hold.status !== InventoryHoldStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        `Không thể confirm hold: hold ở trạng thái ${hold.status}, không phải active`,
      );
    }
    if (hold.expiresAt.getTime() <= Date.now()) {
      // Lazy expiration — ghi lại trạng thái thật thay vì chỉ ném lỗi, để lần đọc sau phản ánh
      // đúng (không phụ thuộc một job nền nào từng chạy).
      await this.holdsRepo.markExpired(hold.id);
      throw new UnprocessableEntityException('Không thể confirm: hold đã expired');
    }

    await this.holdsRepo.markConfirmed(hold.id);
  }

  /** Gọi bởi BookingsService.cancel() SAU KHI booking_status đã update thành công. No-op nếu
   * booking chưa từng yêu cầu hold, hoặc hold đã ở trạng thái cuối (released/expired). */
  async releaseHoldForBooking(bookingId: string): Promise<void> {
    const hold = await this.holdsRepo.findByBookingId(bookingId);
    if (!hold) return;
    if (hold.status === InventoryHoldStatus.ACTIVE || hold.status === InventoryHoldStatus.CONFIRMED) {
      await this.holdsRepo.markReleased(hold.id);
    }
  }

  /** Abstraction cho automatic expiration — xem InventoryHoldsRepository.expireOverdueHolds. */
  expireOverdueHolds(now?: Date): Promise<number> {
    return this.holdsRepo.expireOverdueHolds(now);
  }
}

function toSlotResponse(
  slot: { id: string; entityType: string; entityId: string; placeId: string; slotStart: Date; slotEnd: Date | null; totalCapacity: number; createdAt: Date; updatedAt: Date },
  heldQuantity: number,
) {
  return {
    id: slot.id,
    entity_type: slot.entityType,
    entity_id: slot.entityId,
    place_id: slot.placeId,
    slot_start: slot.slotStart,
    slot_end: slot.slotEnd,
    total_capacity: slot.totalCapacity,
    held_quantity: heldQuantity,
    remaining_capacity: slot.totalCapacity - heldQuantity,
    created_at: slot.createdAt,
    updated_at: slot.updatedAt,
  };
}
