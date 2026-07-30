import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { BookingsRepository } from './repositories/bookings.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import { AvailabilitySlotsRepository } from '../availability/repositories/availability-slots.repository';
import { AvailabilityService } from '../availability/availability.service';
import { CreateBookingRequestDto, ListBookingsQueryDto } from './dto/bookings.dto';
import { generateBookingCode, isValidBookingCodeFormat } from './booking-code';
import { toBooking, toBookingAdminCard, BookingResponse } from './bookings.mapper';
import { BOOKABLE_ENTITY_TYPES } from './booking.enums';
import { assertValidTransition, BookingTransitionAction } from './booking-status.transition';
import {
  BOOKING_EVENT_PUBLISHER,
  BookingCancelledEvent,
  BookingConfirmedEvent,
  BookingCreatedEvent,
  BookingEventPublisher,
} from './events/booking-events';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

const MAX_CODE_ATTEMPTS = 5;

// Availability & Inventory Foundation — mặc định TTL hold khi client không gửi hold_ttl_minutes
// (mục B: "Configurable expiration time" — cấu hình được PER-REQUEST qua DTO, mặc định này chỉ
// áp dụng khi bỏ trống).
const DEFAULT_HOLD_TTL_MINUTES = 30;

// Nhãn hành động dùng cho audit `event`/`permission` — khớp quy ước place.status_changed /
// Place.Approve đã có (ADR-016), KHÔNG phát minh format audit mới.
const TRANSITION_META: Record<BookingTransitionAction, { event: string; permission: string }> = {
  confirm: { event: 'booking.status_changed', permission: 'Booking.Confirm' },
  cancel: { event: 'booking.status_changed', permission: 'Booking.Cancel' },
  markExpired: { event: 'booking.status_changed', permission: 'Booking.MarkExpired' },
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly bookingsRepo: BookingsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly audit: AuditService,
    @Inject(BOOKING_EVENT_PUBLISHER) private readonly events: BookingEventPublisher,
    private readonly availabilitySlotsRepo: AvailabilitySlotsRepository,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async create(dto: CreateBookingRequestDto, customerUserId: string): Promise<BookingResponse> {
    const placeMatches = await this.placesRepo.existsByIdAndCategorySlug(dto.place_id, dto.entity_type);
    if (!placeMatches) {
      throw new UnprocessableEntityException(
        'place_id không tồn tại hoặc không thuộc đúng entity_type khai báo',
      );
    }

    // Availability & Inventory Foundation — HOÀN TOÀN optional (mục C: "Booking creation MAY
    // request an inventory hold"). Validate slot khớp đúng entity_type/entity_id/place_id của
    // chính booking này TRƯỚC KHI vào transaction — cùng nguyên tắc place_id/entity_type ở trên,
    // tránh một booking "tour X" claim dung lượng của slot "hotel Y".
    let hold: { availabilitySlotId: string; quantity: number; expiresAt: Date } | undefined;
    if (dto.availability_slot_id) {
      const slot = await this.availabilitySlotsRepo.findById(dto.availability_slot_id);
      if (!slot) {
        throw new UnprocessableEntityException('availability_slot_id không tồn tại');
      }
      if (slot.entityType !== dto.entity_type || slot.entityId !== dto.entity_id || slot.placeId !== dto.place_id) {
        throw new UnprocessableEntityException(
          'availability_slot_id không khớp entity_type/entity_id/place_id của booking này',
        );
      }
      const ttlMinutes = dto.hold_ttl_minutes ?? DEFAULT_HOLD_TTL_MINUTES;
      hold = {
        availabilitySlotId: dto.availability_slot_id,
        quantity: dto.party_size, // party_size đã có sẵn — không thêm trường "quantity" trùng lặp
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      };
    }

    const bookingCode = await this.generateUniqueCode();

    const { booking, items } = await this.bookingsRepo.create({
      bookingCode,
      bookingType: dto.booking_type ?? null,
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      placeId: dto.place_id,
      customerUserId,
      serviceStartAt: dto.service_start_at ? new Date(dto.service_start_at) : null,
      serviceEndAt: dto.service_end_at ? new Date(dto.service_end_at) : null,
      partySize: dto.party_size,
      guestNote: dto.guest_note ?? null,
      items: dto.items.map((it) => ({ label: it.label, quantity: it.quantity, unitPrice: it.unit_price })),
      hold,
    });

    // Phase 2 — abstraction domain event (KHÔNG notification/Kafka/RabbitMQ thật đứng sau, xem
    // events/booking-events.ts). Publish SAU KHI đã lưu thành công — không publish nếu create thất bại.
    await this.events.publish(new BookingCreatedEvent(booking.id, booking.bookingCode, booking.entityType, booking.placeId));

    return toBooking(booking, items);
  }

  /** Tra cứu theo booking_code công khai — CHỈ trả về cho đúng chủ booking (không lộ tồn tại). */
  async getByCodeForUser(bookingCode: string, userId: string): Promise<BookingResponse> {
    // Chặn sớm input sai định dạng (quá dài/ký tự lạ) trước khi chạm DB — không phải kiểm tra
    // tồn tại, chỉ validate hình thức.
    if (!isValidBookingCodeFormat(bookingCode)) {
      throw new BadRequestException('booking_code không đúng định dạng');
    }

    const booking = await this.bookingsRepo.findByCode(bookingCode);
    if (!booking || booking.customerUserId !== userId) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    const items = await this.bookingsRepo.findItemsByBookingId(booking.id);
    return toBooking(booking, items);
  }

  /** Phase 2 — GET /bookings (Booking.List, admin/staff). KHÔNG public, KHÔNG lọc theo
   * customer_user_id (đây là kênh đặc quyền xem MỌI booking, khác getByCodeForUser). */
  async list(query: ListBookingsQueryDto) {
    // module_code là bí danh của entity_type (xem ghi chú tại ListBookingsQueryDto) — nếu cả hai
    // được truyền và khác nhau, đó là input mâu thuẫn, không phải "module_code thắng" hay
    // "entity_type thắng" một cách ngầm định.
    if (query.module_code && query.entity_type && query.module_code !== query.entity_type) {
      throw new BadRequestException('module_code và entity_type mâu thuẫn nhau trong cùng một truy vấn');
    }
    const entityType = query.entity_type ?? query.module_code;
    if (entityType && !BOOKABLE_ENTITY_TYPES.includes(entityType)) {
      throw new BadRequestException('entity_type/module_code không hợp lệ');
    }

    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const sortBy = query.sort_by ?? 'created_at';
    const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC'; // mặc định DESC — mới nhất trước

    const { items, total } = await this.bookingsRepo.list({
      bookingStatus: query.booking_status,
      paymentStatus: query.payment_status,
      fulfillmentStatus: query.fulfillment_status,
      entityType,
      dateFrom: query.date_from ? new Date(query.date_from) : undefined,
      dateTo: query.date_to ? new Date(query.date_to) : undefined,
      sortBy,
      sortDir,
      limit,
      offset: (page - 1) * limit,
    });

    return paginate(items.map(toBookingAdminCard), page, limit, total);
  }

  /** Phase 2 — POST /bookings/:id/confirm (Booking.Confirm). pending -> confirmed. */
  async confirm(id: string, actorId: string): Promise<null> {
    await this.transition(id, 'confirm', actorId);
    return null;
  }

  /** Phase 2 — POST /bookings/:id/cancel (Booking.Cancel). pending|confirmed -> cancelled. */
  async cancel(id: string, actorId: string): Promise<null> {
    await this.transition(id, 'cancel', actorId);
    return null;
  }

  /** Phase 2 — POST /bookings/:id/expire (Booking.MarkExpired). pending -> expired. */
  async markExpired(id: string, actorId: string): Promise<null> {
    await this.transition(id, 'markExpired', actorId);
    return null;
  }

  /** Điểm chung cho cả 3 hành động chuyển trạng thái — MỌI thay đổi booking_status đi qua đây
   * (yêu cầu Phase 2 mục B: "Mọi thay đổi trạng thái phải đi qua BookingService"). Thứ tự cố ý:
   * validate FSM TRƯỚC KHI update DB, ghi audit + publish event SAU KHI update DB thành công. */
  private async transition(id: string, action: BookingTransitionAction, actorId: string): Promise<void> {
    const booking = await this.bookingsRepo.findById(id);
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }

    const fromStatus = booking.bookingStatus;
    const toStatus = assertValidTransition(fromStatus, action); // ném UnprocessableEntityException nếu không hợp lệ

    // Availability & Inventory Foundation — mục C: "confirm converts an active hold to
    // confirmed" + mục E: "Prevent confirming expired holds". Đặt TRƯỚC updateStatus có chủ đích
    // (khác cancel bên dưới): nếu hold đã expired, TOÀN BỘ confirm phải thất bại — không hợp lý
    // để booking chuyển 'confirmed' trong khi dung lượng nó giữ đã mất. No-op nếu booking chưa
    // từng yêu cầu hold (đa số trường hợp — hold là optional).
    if (action === 'confirm') {
      await this.availabilityService.confirmHoldForBooking(id);
    }

    await this.bookingsRepo.updateStatus(id, toStatus);

    const meta = TRANSITION_META[action];
    // ADR-016: đổi trạng thái booking là hành động đặc quyền → ghi audit, cùng khuôn
    // place.status_changed (PlacesService.archive/approve).
    await this.audit.record({
      event: meta.event,
      entityType: 'booking',
      entityId: id,
      actorId,
      permission: meta.permission,
      context: { from: fromStatus, to: toStatus },
    });

    // Chỉ BookingConfirmed/BookingCancelled có trong yêu cầu Phase 2 mục D — KHÔNG có
    // "BookingExpired" (chưa được yêu cầu, không tự thêm ngoài phạm vi).
    if (action === 'confirm') {
      await this.events.publish(new BookingConfirmedEvent(booking.id, booking.bookingCode));
    } else if (action === 'cancel') {
      // Mục C: "cancellation releases the hold". Đặt SAU updateStatus (khác confirm ở trên) —
      // đây là dọn dẹp best-effort, không phải điều kiện chặn: booking ĐÃ được quyết định huỷ,
      // việc giải phóng hold không nên (và không cần) chặn ngược lại quyết định đó. No-op nếu
      // booking chưa từng yêu cầu hold.
      await this.availabilityService.releaseHoldForBooking(id);
      await this.events.publish(new BookingCancelledEvent(booking.id, booking.bookingCode));
    }
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateBookingCode();
      if (!(await this.bookingsRepo.existsByCode(code))) {
        return code;
      }
    }
    throw new UnprocessableEntityException('Không thể sinh booking_code, thử lại sau');
  }
}
