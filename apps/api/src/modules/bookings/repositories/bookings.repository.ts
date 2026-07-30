import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { BookingItem } from '../entities/booking-item.entity';
import { BookingFulfillmentStatus, BookingPaymentStatus, BookingStatus } from '../booking.enums';
import { BookingSortField } from '../dto/bookings.dto';
import { InventoryHoldsRepository } from '../../availability/repositories/inventory-holds.repository';
import { InventoryHold } from '../../availability/entities/inventory-hold.entity';

export interface NewBookingItem {
  label: string;
  quantity: number;
  unitPrice: number;
}

// Availability & Inventory Foundation — HOÀN TOÀN optional; khi vắng mặt, create() hành xử y hệt
// Booking Request Foundation gốc (không transaction thêm nào, không bảng inventory_holds nào bị đụng).
export interface NewBookingHold {
  availabilitySlotId: string;
  quantity: number;
  expiresAt: Date;
}

export interface NewBooking {
  bookingCode: string;
  bookingType: string | null;
  entityType: string;
  entityId: string;
  placeId: string;
  customerUserId: string;
  serviceStartAt: Date | null;
  serviceEndAt: Date | null;
  partySize: number;
  guestNote: string | null;
  items: NewBookingItem[];
  hold?: NewBookingHold;
}

@Injectable()
export class BookingsRepository {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly holdsRepo: InventoryHoldsRepository,
  ) {}

  existsByCode(bookingCode: string): Promise<boolean> {
    return this.bookings.exists({ where: { bookingCode } });
  }

  findByCode(bookingCode: string): Promise<Booking | null> {
    return this.bookings.findOne({ where: { bookingCode } });
  }

  /** Phase 2 — dùng cho POST /bookings/:id/{confirm,cancel,expire} (đích danh id nội bộ, kênh
   * đặc quyền — KHÔNG phải booking_code công khai). */
  findById(id: string): Promise<Booking | null> {
    return this.bookings.findOne({ where: { id } });
  }

  /** Phase 2 — GET /bookings (Booking.List). QueryBuilder (không raw SQL — Booking không có cột
   * geography cần ST_* như PlacesRepository, nên QueryBuilder là công cụ phù hợp hơn, cùng tiền
   * lệ đã có ở SourceAttributionsRepository). */
  async list(params: {
    bookingStatus?: BookingStatus;
    paymentStatus?: BookingPaymentStatus;
    fulfillmentStatus?: BookingFulfillmentStatus;
    entityType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sortBy: BookingSortField;
    sortDir: 'ASC' | 'DESC';
    limit: number;
    offset: number;
  }): Promise<{ items: Booking[]; total: number }> {
    const qb = this.bookings.createQueryBuilder('b');

    if (params.bookingStatus) {
      qb.andWhere('b.bookingStatus = :bookingStatus', { bookingStatus: params.bookingStatus });
    }
    if (params.paymentStatus) {
      qb.andWhere('b.paymentStatus = :paymentStatus', { paymentStatus: params.paymentStatus });
    }
    if (params.fulfillmentStatus) {
      qb.andWhere('b.fulfillmentStatus = :fulfillmentStatus', { fulfillmentStatus: params.fulfillmentStatus });
    }
    if (params.entityType) {
      qb.andWhere('b.entityType = :entityType', { entityType: params.entityType });
    }
    // Lọc theo service_start_at (xem chú thích ListBookingsQueryDto.date_from/date_to) — booking
    // không có service_start_at (nullable) sẽ KHÔNG khớp khi filter date được truyền, đúng ngữ
    // nghĩa "trong khoảng ngày dịch vụ X-Y" (một booking không có ngày dịch vụ thì không thuộc
    // bất kỳ khoảng nào).
    if (params.dateFrom) {
      qb.andWhere('b.serviceStartAt >= :dateFrom', { dateFrom: params.dateFrom });
    }
    if (params.dateTo) {
      qb.andWhere('b.serviceStartAt <= :dateTo', { dateTo: params.dateTo });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy(`b.${toSortProperty(params.sortBy)}`, params.sortDir)
      .addOrderBy('b.id', params.sortDir) // tie-breaker ổn định — cùng nguyên tắc GAP-12 (PlacesRepository.list)
      .skip(params.offset)
      .take(params.limit)
      .getMany();

    return { items, total };
  }

  /** Phase 2 — update TRẠNG THÁI DUY NHẤT (không update tuỳ ý entity). Gọi bởi
   * BookingsService.{confirm,cancel,markExpired} SAU khi assertValidTransition đã xác nhận hợp
   * lệ — repository không tự kiểm tra FSM (tách rõ trách nhiệm: validation ở booking-status.
   * transition.ts, cưỡng chế permission ở controller, persistence thuần ở đây). */
  async updateStatus(id: string, status: BookingStatus): Promise<void> {
    await this.bookings.update({ id }, { bookingStatus: status });
  }

  findItemsByBookingId(bookingId: string): Promise<BookingItem[]> {
    return this.ds.getRepository(BookingItem).find({ where: { bookingId }, order: { createdAt: 'ASC' } });
  }

  /** Tạo booking + items trong MỘT transaction — không có booking mồ côi 0 item. */
  async create(data: NewBooking): Promise<{ booking: Booking; items: BookingItem[]; hold?: InventoryHold }> {
    return this.ds.transaction(async (manager) => {
      const subtotal = data.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

      const booking = manager.getRepository(Booking).create({
        bookingCode: data.bookingCode,
        bookingType: data.bookingType,
        entityType: data.entityType,
        entityId: data.entityId,
        placeId: data.placeId,
        customerUserId: data.customerUserId,
        serviceStartAt: data.serviceStartAt,
        serviceEndAt: data.serviceEndAt,
        partySize: data.partySize,
        guestNote: data.guestNote,
        subtotal: subtotal.toFixed(2),
        discount: '0',
        fees: '0',
        grandTotal: subtotal.toFixed(2),
      });
      const savedBooking = await manager.getRepository(Booking).save(booking);

      const itemEntities = data.items.map((it) =>
        manager.getRepository(BookingItem).create({
          bookingId: savedBooking.id,
          label: it.label,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toFixed(2),
          subtotal: (it.quantity * it.unitPrice).toFixed(2),
        }),
      );
      const savedItems = await manager.getRepository(BookingItem).save(itemEntities);

      // Availability & Inventory Foundation — placeHold CHẠY TRONG CHÍNH transaction này (dùng
      // `manager` vừa lưu booking/items ở trên), KHÔNG mở transaction riêng. Nếu placeHold ném
      // lỗi (over-allocation, ConflictException), toàn bộ transaction ROLLBACK — booking+items
      // vừa insert ở trên cũng biến mất, KHÔNG có booking "mồ côi" claim một slot không thật sự
      // giữ được (yêu cầu mục E: transactional consistency).
      let hold: InventoryHold | undefined;
      if (data.hold) {
        hold = await this.holdsRepo.placeHold(manager, {
          availabilitySlotId: data.hold.availabilitySlotId,
          bookingId: savedBooking.id,
          quantity: data.hold.quantity,
          expiresAt: data.hold.expiresAt,
        });
      }

      return { booking: savedBooking, items: savedItems, hold };
    });
  }
}

/** snake_case (DTO/API) -> tên property entity (camelCase, dùng bởi QueryBuilder). */
function toSortProperty(field: BookingSortField): 'createdAt' | 'serviceStartAt' | 'grandTotal' {
  switch (field) {
    case 'created_at':
      return 'createdAt';
    case 'service_start_at':
      return 'serviceStartAt';
    case 'grand_total':
      return 'grandTotal';
  }
}
