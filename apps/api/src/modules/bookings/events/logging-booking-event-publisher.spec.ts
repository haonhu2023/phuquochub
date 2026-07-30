import { Logger } from '@nestjs/common';
import { LoggingBookingEventPublisher } from './logging-booking-event-publisher';
import { BookingCancelledEvent, BookingConfirmedEvent, BookingCreatedEvent } from './booking-events';

describe('LoggingBookingEventPublisher', () => {
  it('publish(BookingCreatedEvent): log chứa type + bookingId + bookingCode, KHÔNG throw, KHÔNG gọi network/broker nào', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggingBookingEventPublisher();

    publisher.publish(new BookingCreatedEvent('b1', 'CODE0001', 'tour', 'p1'));

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('BookingCreated'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('b1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('CODE0001'));
    logSpy.mockRestore();
  });

  it('publish(BookingConfirmedEvent) và publish(BookingCancelledEvent): mỗi loại log đúng `type` của chính nó', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggingBookingEventPublisher();

    publisher.publish(new BookingConfirmedEvent('b1', 'CODE0001'));
    publisher.publish(new BookingCancelledEvent('b1', 'CODE0001'));

    expect(logSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('BookingConfirmed'));
    expect(logSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('BookingCancelled'));
    logSpy.mockRestore();
  });
});
