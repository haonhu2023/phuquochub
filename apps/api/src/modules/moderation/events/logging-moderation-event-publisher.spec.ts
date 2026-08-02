import { Logger } from '@nestjs/common';
import { LoggingModerationEventPublisher } from './logging-moderation-event-publisher';
import {
  CaseResolvedEvent,
  ContentApprovedEvent,
  ContentHiddenEvent,
  MediaAutoPublishedEvent,
  ReviewCreatedEvent,
} from './moderation-events';
import { ModerationDecision, ModerationTargetType } from '../moderation.enums';

describe('LoggingModerationEventPublisher', () => {
  it('publish(ReviewCreatedEvent): log chứa type + reviewId, KHÔNG throw, KHÔNG gọi network/broker nào', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggingModerationEventPublisher();

    publisher.publish(new ReviewCreatedEvent('r1', 'p1', 'u1'));

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ReviewCreated'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('r1'));
    logSpy.mockRestore();
  });

  it('publish(MediaAutoPublishedEvent): log chứa type + mediaId + reviewId', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggingModerationEventPublisher();

    publisher.publish(new MediaAutoPublishedEvent('m1', 'r1'));

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MediaAutoPublished'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('m1'));
    logSpy.mockRestore();
  });

  it('mỗi loại sự kiện log đúng `type` của chính nó (Approved/Hidden/Resolved)', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const publisher = new LoggingModerationEventPublisher();

    publisher.publish(new ContentApprovedEvent(ModerationTargetType.MEDIA, 'm1', 'c1'));
    publisher.publish(new ContentHiddenEvent(ModerationTargetType.MEDIA, 'm1', 'c1'));
    publisher.publish(new CaseResolvedEvent('c1', ModerationDecision.APPROVE));

    expect(logSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('ContentApproved'));
    expect(logSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('ContentHidden'));
    expect(logSpy).toHaveBeenNthCalledWith(3, expect.stringContaining('CaseResolved'));
    logSpy.mockRestore();
  });
});
