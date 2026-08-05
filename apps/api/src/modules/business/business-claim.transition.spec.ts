import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidClaimTransition } from './business-claim.transition';
import { ClaimStatus } from './business.enums';

describe('assertValidClaimTransition', () => {
  // 7 transition hợp lệ (business.md §4 sơ đồ).
  it.each([
    ['submit', null, ClaimStatus.PENDING],
    ['approve', ClaimStatus.PENDING, ClaimStatus.APPROVED],
    ['reject', ClaimStatus.PENDING, ClaimStatus.REJECTED],
    ['dispute', ClaimStatus.PENDING, ClaimStatus.DISPUTED],
    ['withdraw', ClaimStatus.PENDING, ClaimStatus.WITHDRAWN],
    ['approve', ClaimStatus.DISPUTED, ClaimStatus.APPROVED],
    ['reject', ClaimStatus.DISPUTED, ClaimStatus.REJECTED],
  ] as const)('%s từ %s -> trả về %s (hợp lệ)', (action, from, expected) => {
    expect(assertValidClaimTransition(from, action)).toBe(expected);
  });

  // Toàn bộ 23 tổ hợp còn lại (6 trạng thái x 5 action = 30, trừ 7 tổ hợp hợp lệ ở trên) — liệt
  // kê tường minh, không tính toán động, để ma trận đầy đủ luôn hiện rõ trong review.
  it.each([
    // current = null (claim chưa tồn tại) — chỉ submit hợp lệ.
    ['approve', null],
    ['reject', null],
    ['dispute', null],
    ['withdraw', null],
    // current = pending — submit không hợp lệ (claim đã tồn tại).
    ['submit', ClaimStatus.PENDING],
    // current = approved — trạng thái cuối, không transition nào đi ra.
    ['submit', ClaimStatus.APPROVED],
    ['approve', ClaimStatus.APPROVED],
    ['reject', ClaimStatus.APPROVED],
    ['dispute', ClaimStatus.APPROVED],
    ['withdraw', ClaimStatus.APPROVED],
    // current = rejected — trạng thái cuối.
    ['submit', ClaimStatus.REJECTED],
    ['approve', ClaimStatus.REJECTED],
    ['reject', ClaimStatus.REJECTED],
    ['dispute', ClaimStatus.REJECTED],
    ['withdraw', ClaimStatus.REJECTED],
    // current = disputed — chỉ approve/reject (phân xử) hợp lệ.
    ['submit', ClaimStatus.DISPUTED],
    ['dispute', ClaimStatus.DISPUTED],
    ['withdraw', ClaimStatus.DISPUTED],
    // current = withdrawn — trạng thái cuối.
    ['submit', ClaimStatus.WITHDRAWN],
    ['approve', ClaimStatus.WITHDRAWN],
    ['reject', ClaimStatus.WITHDRAWN],
    ['dispute', ClaimStatus.WITHDRAWN],
    ['withdraw', ClaimStatus.WITHDRAWN],
  ] as const)('%s từ %s -> KHÔNG hợp lệ, ném UnprocessableEntityException', (action, from) => {
    expect(() => assertValidClaimTransition(from, action)).toThrow(UnprocessableEntityException);
  });

  it('thông báo lỗi nêu rõ trạng thái hiện tại', () => {
    try {
      assertValidClaimTransition(ClaimStatus.APPROVED, 'withdraw');
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('đã duyệt');
    }
  });

  it('thông báo lỗi khi claim chưa tồn tại nêu rõ "chưa tồn tại"', () => {
    try {
      assertValidClaimTransition(null, 'approve');
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('chưa tồn tại');
    }
  });
});
