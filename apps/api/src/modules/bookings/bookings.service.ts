import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { BookingsRepository } from './repositories/bookings.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { CreateBookingRequestDto } from './dto/bookings.dto';
import { generateBookingCode } from './booking-code';
import { toBooking, BookingResponse } from './bookings.mapper';

const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class BookingsService {
  constructor(
    private readonly bookingsRepo: BookingsRepository,
    private readonly placesRepo: PlacesRepository,
  ) {}

  async create(dto: CreateBookingRequestDto, customerUserId: string): Promise<BookingResponse> {
    const placeMatches = await this.placesRepo.existsByIdAndCategorySlug(dto.place_id, dto.entity_type);
    if (!placeMatches) {
      throw new UnprocessableEntityException(
        'place_id không tồn tại hoặc không thuộc đúng entity_type khai báo',
      );
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
    });

    return toBooking(booking, items);
  }

  /** Tra cứu theo booking_code công khai — CHỈ trả về cho đúng chủ booking (không lộ tồn tại). */
  async getByCodeForUser(bookingCode: string, userId: string): Promise<BookingResponse> {
    const booking = await this.bookingsRepo.findByCode(bookingCode);
    if (!booking || booking.customerUserId !== userId) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    const items = await this.bookingsRepo.findItemsByBookingId(booking.id);
    return toBooking(booking, items);
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
