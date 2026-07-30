import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from '../entities/availability-slot.entity';
import { InventoryHold } from '../entities/inventory-hold.entity';
import { InventoryHoldStatus } from '../availability.enums';
import { AvailabilitySortField } from '../dto/availability.dto';

export interface NewAvailabilitySlot {
  entityType: string;
  entityId: string;
  placeId: string;
  slotStart: Date;
  slotEnd: Date | null;
  totalCapacity: number;
}

// Đếm giữ chỗ hiện tại cho MỘT slot — dùng cả bởi InventoryHoldsRepository.placeHold (kiểm tra
// over-allocation, trong transaction có lock) LẪN list() dưới đây (hiển thị remaining_capacity,
// KHÔNG lock — chỉ đọc tham khảo, không cần chính xác tuyệt đối tại thời điểm hiển thị).
// 'active' VÀ 'confirmed' đều tính là "đang chiếm dụng" — chỉ 'released'/'expired' mới trả lại
// dung lượng.
const OCCUPYING_STATUSES = [InventoryHoldStatus.ACTIVE, InventoryHoldStatus.CONFIRMED];

const SORT_COLUMN: Record<AvailabilitySortField, string> = {
  slot_start: 'slotStart',
  created_at: 'createdAt',
};

@Injectable()
export class AvailabilitySlotsRepository {
  constructor(
    @InjectRepository(AvailabilitySlot) private readonly slots: Repository<AvailabilitySlot>,
    @InjectRepository(InventoryHold) private readonly holds: Repository<InventoryHold>,
  ) {}

  create(data: NewAvailabilitySlot): Promise<AvailabilitySlot> {
    return this.slots.save(this.slots.create(data));
  }

  findById(id: string): Promise<AvailabilitySlot | null> {
    return this.slots.findOne({ where: { id } });
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    placeId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sortBy: AvailabilitySortField;
    sortDir: 'ASC' | 'DESC';
    limit: number;
    offset: number;
  }): Promise<{ items: Array<{ slot: AvailabilitySlot; heldQuantity: number }>; total: number }> {
    const qb = this.slots.createQueryBuilder('s');

    if (params.entityType) {
      qb.andWhere('s.entityType = :entityType', { entityType: params.entityType });
    }
    if (params.entityId) {
      qb.andWhere('s.entityId = :entityId', { entityId: params.entityId });
    }
    if (params.placeId) {
      qb.andWhere('s.placeId = :placeId', { placeId: params.placeId });
    }
    if (params.dateFrom) {
      qb.andWhere('s.slotStart >= :dateFrom', { dateFrom: params.dateFrom });
    }
    if (params.dateTo) {
      qb.andWhere('s.slotStart <= :dateTo', { dateTo: params.dateTo });
    }

    const total = await qb.getCount();
    const slots = await qb
      .orderBy(`s.${SORT_COLUMN[params.sortBy]}`, params.sortDir)
      .addOrderBy('s.id', params.sortDir)
      .skip(params.offset)
      .take(params.limit)
      .getMany();

    if (slots.length === 0) {
      return { items: [], total };
    }

    // Một truy vấn duy nhất cho held_quantity của MỌI slot trong trang này — KHÔNG N+1.
    const heldRows: Array<{ availability_slot_id: string; held: string }> = await this.holds
      .createQueryBuilder('h')
      .select('h.availabilitySlotId', 'availability_slot_id')
      .addSelect('COALESCE(SUM(h.quantity), 0)', 'held')
      .where('h.availabilitySlotId IN (:...ids)', { ids: slots.map((s) => s.id) })
      .andWhere('h.status IN (:...statuses)', { statuses: OCCUPYING_STATUSES })
      .groupBy('h.availabilitySlotId')
      .getRawMany();
    const heldBySlot = new Map(heldRows.map((r) => [r.availability_slot_id, Number(r.held)]));

    return {
      items: slots.map((slot) => ({ slot, heldQuantity: heldBySlot.get(slot.id) ?? 0 })),
      total,
    };
  }
}

export { OCCUPYING_STATUSES };
