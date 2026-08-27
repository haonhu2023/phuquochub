import type { PlaceTrustSource, VerificationStatusValue } from '@phuquochub/shared-types';
import {
  canDisplayPrice,
  fieldLabel,
  formatVerifiedAt,
  getTrustBadge,
  isPendingVerification,
  isTrustedVerification,
  PRICE_VERIFYING_TEXT,
  resolvePriceDisplay,
  summarizeTrustSources,
  TRUST_BADGE_LABEL,
} from './trust';

describe('isTrustedVerification / getTrustBadge', () => {
  it.each<VerificationStatusValue>(['verified', 'official', 'community_verified'])(
    '%s → trạng thái tin cậy, badge "verified"',
    (status) => {
      expect(isTrustedVerification(status)).toBe(true);
      expect(getTrustBadge(status)).toBe('verified');
    },
  );

  it('expired → KHÔNG tin cậy, badge "stale" (đã lâu chưa xác minh lại)', () => {
    expect(isTrustedVerification('expired')).toBe(false);
    expect(getTrustBadge('expired')).toBe('stale');
  });

  it.each<VerificationStatusValue>(['pending', 'rejected'])(
    '%s → badge "unverified"',
    (status) => {
      expect(isTrustedVerification(status)).toBe(false);
      expect(getTrustBadge(status)).toBe('unverified');
    },
  );

  // Cấm cụm "Đã xác minh chính thức" cho trạng thái `official` (task brief Phần 3, cấm rõ cụm
  // này) — cả ba trạng thái tin cậy PHẢI dùng chung một nhãn, không được có nhãn mạnh hơn cho
  // riêng `official`.
  it('nhãn của "official" giống hệt "verified"/"community_verified" — không có nhãn riêng mạnh hơn', () => {
    expect(TRUST_BADGE_LABEL[getTrustBadge('official')]).toBe(TRUST_BADGE_LABEL[getTrustBadge('verified')]);
    expect(TRUST_BADGE_LABEL.verified).not.toContain('chính thức');
  });

  it('không nhãn nào chứa các cụm bị cấm (task brief Phần 3)', () => {
    const forbidden = ['Chính xác 100%', 'Được PhuQuocHub đảm bảo', 'Đã xác minh chính thức'];
    const allLabels = Object.values(TRUST_BADGE_LABEL);
    for (const phrase of forbidden) {
      for (const label of allLabels) {
        expect(label).not.toContain(phrase);
      }
    }
  });
});

describe('isPendingVerification', () => {
  it('pending → true', () => {
    expect(isPendingVerification('pending')).toBe(true);
  });

  // rejected KHÔNG được gộp với pending — đây là hai trạng thái thật khác nhau (đã bị từ chối vs
  // chưa ai xem tới), dù cả hai cùng rơi vào badge "unverified".
  it.each<VerificationStatusValue>(['rejected', 'verified', 'official', 'community_verified', 'expired'])(
    '%s → false (không phải pending)',
    (status) => {
      expect(isPendingVerification(status)).toBe(false);
    },
  );
});

describe('canDisplayPrice — Public Beta price trust gate (2026-08-28)', () => {
  it.each<VerificationStatusValue>(['verified', 'official', 'community_verified'])(
    '%s → được phép hiện giá thật',
    (status) => {
      expect(canDisplayPrice(status)).toBe(true);
    },
  );

  // KHÔNG phụ thuộc category — mọi trạng thái chưa tin cậy đều bị chặn như nhau, bất kể place
  // thuộc nhóm "thương mại" hay không (beach/attraction/market không còn là ngoại lệ).
  it.each<VerificationStatusValue>(['pending', 'expired', 'rejected'])(
    '%s → KHÔNG được hiện giá thật',
    (status) => {
      expect(canDisplayPrice(status)).toBe(false);
    },
  );
});

describe('resolvePriceDisplay', () => {
  it('trusted + có giá → trả nguyên nhãn thật, verifying=false', () => {
    expect(resolvePriceDisplay('Cao cấp', 'verified')).toEqual({ label: 'Cao cấp', verifying: false });
  });

  it('chưa tin cậy + có giá → label=null, verifying=true (nơi gọi hiện PRICE_VERIFYING_TEXT)', () => {
    expect(resolvePriceDisplay('Cao cấp', 'pending')).toEqual({ label: null, verifying: true });
  });

  // Không được bịa dòng "đang xác minh" cho một place CHƯA TỪNG có giá trị.
  it('chưa tin cậy + KHÔNG có giá (null) → label=null, verifying=false', () => {
    expect(resolvePriceDisplay(null, 'pending')).toEqual({ label: null, verifying: false });
  });

  it('trusted + không có giá → label=null, verifying=false', () => {
    expect(resolvePriceDisplay(null, 'verified')).toEqual({ label: null, verifying: false });
  });
});

describe('PRICE_VERIFYING_TEXT', () => {
  it('không chứa bất kỳ nhãn mức giá thật nào', () => {
    for (const real of ['Miễn phí', 'Bình dân', 'Tầm trung', 'Cao cấp']) {
      expect(PRICE_VERIFYING_TEXT).not.toContain(real);
    }
  });
});

describe('formatVerifiedAt', () => {
  it('định dạng dd/mm/yyyy theo vi-VN', () => {
    expect(formatVerifiedAt('2026-08-12T03:00:00.000Z')).toBe('12/08/2026');
  });
});

describe('summarizeTrustSources', () => {
  it('mảng rỗng → không có nguồn nào, không bịa ra một nguồn', () => {
    expect(summarizeTrustSources([])).toEqual({ label: null, url: null });
  });

  it('một nguồn duy nhất, có publisher và url → nhắc tên publisher + kèm url', () => {
    const sources: PlaceTrustSource[] = [
      {
        field: 'province',
        publisher: 'Ủy ban Thường vụ Quốc hội',
        title: 'Nghị quyết 1654/NQ-UBTVQH15',
        url: 'https://example.gov.vn/nq-1654',
        retrieved_at: '2026-08-18T00:00:00.000Z',
      },
    ];
    expect(summarizeTrustSources(sources)).toEqual({
      label: 'Thông tin được đối chiếu với nguồn: Ủy ban Thường vụ Quốc hội.',
      url: 'https://example.gov.vn/nq-1654',
    });
  });

  // Cùng MỘT nguồn được gắn cho nhiều field (vd province + admin_area) KHÔNG được đếm thành "2
  // nguồn" — đó là phóng đại số nguồn thật sự đứng sau các trường này.
  it('nhiều dòng attribution (nhiều field) nhưng CÙNG một publisher → vẫn là MỘT nguồn, không đếm nhân đôi', () => {
    const sources: PlaceTrustSource[] = [
      { field: 'province', publisher: 'Ủy ban Thường vụ Quốc hội', title: 't', url: null, retrieved_at: null },
      { field: 'admin_area', publisher: 'Ủy ban Thường vụ Quốc hội', title: 't', url: null, retrieved_at: null },
    ];
    const result = summarizeTrustSources(sources);
    expect(result.label).toBe('Thông tin được đối chiếu với nguồn: Ủy ban Thường vụ Quốc hội.');
  });

  it('nhiều publisher KHÁC NHAU → nói số lượng, không liệt kê dài dòng', () => {
    const sources: PlaceTrustSource[] = [
      { field: 'province', publisher: 'Nguồn A', title: 't', url: null, retrieved_at: null },
      { field: 'address', publisher: 'Nguồn B', title: 't', url: null, retrieved_at: null },
    ];
    expect(summarizeTrustSources(sources)).toEqual({
      label: 'Thông tin được đối chiếu với 2 nguồn khác nhau.',
      url: null,
    });
  });

  it('có attribution nhưng publisher rỗng (null) → không bịa tên nguồn, chỉ nói có đối chiếu', () => {
    const sources: PlaceTrustSource[] = [
      { field: 'province', publisher: null, title: null, url: null, retrieved_at: null },
    ];
    expect(summarizeTrustSources(sources)).toEqual({
      label: 'Một số thông tin đã được đối chiếu với nguồn tham khảo.',
      url: null,
    });
  });
});

describe('fieldLabel', () => {
  it('null → nhãn trung tính "thông tin"', () => {
    expect(fieldLabel(null)).toBe('thông tin');
  });

  it('field đã biết (province) → nhãn tiếng Việt tương ứng', () => {
    expect(fieldLabel('province')).toBe('đơn vị hành chính');
  });

  it('field lạ (chưa có trong bảng nhãn) → fallback trung tính, không lộ tên cột kỹ thuật', () => {
    expect(fieldLabel('some_future_column')).toBe('thông tin');
  });
});
