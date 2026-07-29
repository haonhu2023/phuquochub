import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { BookingItem } from '../entities/booking-item.entity';

export interface NewBookingItem {
  label: string;
  quantity: number;
  unitPrice: number;
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
}

@Injectable()
export class BookingsRepository {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  existsByCode(bookingCode: string): Promise<boolean> {
    return this.bookings.exists({ where: { bookingCode } });
  }

  findByCode(bookingCode: string): Promise<Booking | null> {
    return this.bookings.findOne({ where: { bookingCode } });
  }

  findItemsByBookingId(bookingId: string): Promise<BookingItem[]> {
    return this.ds.getRepository(BookingItem).find({ where: { bookingId }, order: { createdAt: 'ASC' } });
  }

  /** Tạo booking + items trong MỘT transaction — không có booking mồ côi 0 item. */
  async create(data: NewBooking): Promise<{ booking: Booking; items: BookingItem[] }> {
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

      return { booking: savedBooking, items: savedItems };
    });
  }
}
