import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidVerificationTransition, isTrustedStatus } from './verification.transition';
import { VerificationStatus } from '../places/place.enums';

const ALL_STATUSES = [
  VerificationStatus.PENDING,
  VerificationStatus.VERIFIED,
  VerificationStatus.OFFICIAL,
  VerificationStatus.COMMUNITY_VERIFIED,
  VerificationStatus.EXPIRED,
  VerificationStatus.REJECTED,
];

describe('assertValidVerificationTransition (ADR-008, verification.md §3.2)', () => {
  describe('submit', () => {
    it('null (chưa tồn tại) -> pending', () => {
      expect(assertValidVerificationTransition(null, 'submit')).toBe(VerificationStatus.PENDING);
    });
    it.each([VerificationStatus.EXPIRED, VerificationStatus.REJECTED])('%s -> pending (gửi lại)', (s) => {
      expect(assertValidVerificationTransition(s, 'submit')).toBe(VerificationStatus.PENDING);
    });
    it.each([
      VerificationStatus.PENDING,
      VerificationStatus.VERIFIED,
      VerificationStatus.OFFICIAL,
      VerificationStatus.COMMUNITY_VERIFIED,
    ])('%s -> submit KHÔNG hợp lệ (đã có dòng active)', (s) => {
      expect(() => assertValidVerificationTransition(s, 'submit')).toThrow(UnprocessableEntityException);
    });
  });

  describe('verify', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.COMMUNITY_VERIFIED])('%s -> verified', (s) => {
      expect(assertValidVerificationTransition(s, 'verify')).toBe(VerificationStatus.VERIFIED);
    });
    it.each([
      VerificationStatus.VERIFIED,
      VerificationStatus.OFFICIAL,
      VerificationStatus.EXPIRED,
      VerificationStatus.REJECTED,
    ])('%s -> verify KHÔNG hợp lệ', (s) => {
      expect(() => assertValidVerificationTransition(s, 'verify')).toThrow(UnprocessableEntityException);
    });
  });

  describe('official', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.VERIFIED, VerificationStatus.COMMUNITY_VERIFIED])(
      '%s -> official',
      (s) => {
        expect(assertValidVerificationTransition(s, 'official')).toBe(VerificationStatus.OFFICIAL);
      },
    );
    it.each([VerificationStatus.OFFICIAL, VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      '%s -> official KHÔNG hợp lệ',
      (s) => {
        expect(() => assertValidVerificationTransition(s, 'official')).toThrow(UnprocessableEntityException);
      },
    );
  });

  describe('communityVerify', () => {
    it('pending -> community_verified', () => {
      expect(assertValidVerificationTransition(VerificationStatus.PENDING, 'communityVerify')).toBe(
        VerificationStatus.COMMUNITY_VERIFIED,
      );
    });
    it.each([
      VerificationStatus.VERIFIED,
      VerificationStatus.OFFICIAL,
      VerificationStatus.COMMUNITY_VERIFIED,
      VerificationStatus.EXPIRED,
      VerificationStatus.REJECTED,
    ])('%s -> communityVerify KHÔNG hợp lệ (chỉ từ pending)', (s) => {
      expect(() => assertValidVerificationTransition(s, 'communityVerify')).toThrow(UnprocessableEntityException);
    });
  });

  describe('reject', () => {
    it.each([
      VerificationStatus.PENDING,
      VerificationStatus.VERIFIED,
      VerificationStatus.OFFICIAL,
      VerificationStatus.COMMUNITY_VERIFIED,
    ])('%s -> rejected', (s) => {
      expect(assertValidVerificationTransition(s, 'reject')).toBe(VerificationStatus.REJECTED);
    });
    it.each([VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      '%s -> reject KHÔNG hợp lệ (phải gửi lại/pending trước)',
      (s) => {
        expect(() => assertValidVerificationTransition(s, 'reject')).toThrow(UnprocessableEntityException);
      },
    );
  });

  describe('expire', () => {
    it.each([VerificationStatus.VERIFIED, VerificationStatus.OFFICIAL, VerificationStatus.COMMUNITY_VERIFIED])(
      '%s -> expired',
      (s) => {
        expect(assertValidVerificationTransition(s, 'expire')).toBe(VerificationStatus.EXPIRED);
      },
    );
    it.each([VerificationStatus.PENDING, VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      '%s -> expire KHÔNG hợp lệ',
      (s) => {
        expect(() => assertValidVerificationTransition(s, 'expire')).toThrow(UnprocessableEntityException);
      },
    );
  });

  it('mọi action trên mọi status: transition không throw LUÔN trả về một VerificationStatus hợp lệ', () => {
    const actions = ['submit', 'verify', 'official', 'communityVerify', 'reject', 'expire'] as const;
    for (const status of [...ALL_STATUSES, null]) {
      for (const action of actions) {
        try {
          const result = assertValidVerificationTransition(status, action);
          expect(ALL_STATUSES).toContain(result);
        } catch (e) {
          expect(e).toBeInstanceOf(UnprocessableEntityException);
        }
      }
    }
  });
});

describe('isTrustedStatus', () => {
  it.each([VerificationStatus.VERIFIED, VerificationStatus.OFFICIAL, VerificationStatus.COMMUNITY_VERIFIED])(
    '%s -> true',
    (s) => {
      expect(isTrustedStatus(s)).toBe(true);
    },
  );
  it.each([VerificationStatus.PENDING, VerificationStatus.EXPIRED, VerificationStatus.REJECTED])('%s -> false', (s) => {
    expect(isTrustedStatus(s)).toBe(false);
  });
});
