import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidMediaTransition } from './media-moderation.transition';
import { MediaStatus } from '../media/media.enums';

describe('assertValidMediaTransition', () => {
  it.each([
    ['approve', MediaStatus.PENDING, undefined, MediaStatus.PUBLISHED],
    ['reject', MediaStatus.PENDING, undefined, MediaStatus.REJECTED],
    ['hide', MediaStatus.PUBLISHED, undefined, MediaStatus.HIDDEN],
    ['restore', MediaStatus.HIDDEN, MediaStatus.PUBLISHED, MediaStatus.PUBLISHED],
    ['restore', MediaStatus.HIDDEN, MediaStatus.PENDING, MediaStatus.PENDING],
    ['restore', MediaStatus.REJECTED, MediaStatus.PUBLISHED, MediaStatus.PUBLISHED],
    ['restore', MediaStatus.REJECTED, MediaStatus.PENDING, MediaStatus.PENDING],
  ] as const)('%s từ %s (target=%s) -> trả về %s (hợp lệ)', (action, from, target, expected) => {
    expect(assertValidMediaTransition(from, action, target)).toBe(expected);
  });

  // Toàn bộ 16 tổ hợp (4 status x 4 action) trừ 7 tổ hợp hợp lệ ở trên — bao gồm cả 3 tổ hợp
  // INV-13 nêu tường minh (published->rejected, hidden->rejected, pending->hidden).
  it.each([
    ['approve', MediaStatus.PUBLISHED],
    ['approve', MediaStatus.HIDDEN],
    ['approve', MediaStatus.REJECTED],
    ['reject', MediaStatus.PUBLISHED], // INV-13: published -> rejected không hợp lệ
    ['reject', MediaStatus.HIDDEN], // INV-13: hidden -> rejected không hợp lệ
    ['reject', MediaStatus.REJECTED],
    ['hide', MediaStatus.PENDING], // pending -> hidden không hợp lệ (chưa từng công khai)
    ['hide', MediaStatus.HIDDEN],
    ['hide', MediaStatus.REJECTED],
    ['restore', MediaStatus.PENDING],
    ['restore', MediaStatus.PUBLISHED],
  ] as const)('%s từ %s -> KHÔNG hợp lệ, ném UnprocessableEntityException', (action, from) => {
    expect(() => assertValidMediaTransition(from, action, MediaStatus.PUBLISHED)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('restore không kèm target_status -> ném lỗi, không tự đoán (INV-10)', () => {
    expect(() => assertValidMediaTransition(MediaStatus.HIDDEN, 'restore')).toThrow(
      UnprocessableEntityException,
    );
    try {
      assertValidMediaTransition(MediaStatus.REJECTED, 'restore');
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('target_status');
    }
  });

  it('restore kèm target_status không hợp lệ (khác published/pending) -> ném lỗi', () => {
    expect(() =>
      assertValidMediaTransition(MediaStatus.HIDDEN, 'restore', MediaStatus.HIDDEN),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      assertValidMediaTransition(MediaStatus.HIDDEN, 'restore', MediaStatus.REJECTED),
    ).toThrow(UnprocessableEntityException);
  });

  it('thông báo lỗi nêu rõ trạng thái hiện tại (không phải thông báo chung chung)', () => {
    try {
      assertValidMediaTransition(MediaStatus.PUBLISHED, 'reject', undefined);
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('đã công khai');
    }
  });
});
