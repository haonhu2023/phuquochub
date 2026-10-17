import { listingEffectiveStatus, matchesListingFilter, todayInVietnam, EXPIRING_SOON_DAYS } from './listingExpiry';

describe('listingEffectiveStatus', () => {
  it('status khác published -> luôn null, kể cả còn/hết hạn', () => {
    expect(listingEffectiveStatus('draft', '2026-01-01', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('pending', '2026-01-01', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('closed', '2026-01-01', '2026-06-01')).toBeNull();
  });

  it('published, expires_at null -> null (chưa đặt hạn, không phải sắp/đã hết hạn)', () => {
    expect(listingEffectiveStatus('published', null, '2026-06-01')).toBeNull();
  });

  it('published, hạn đã qua -> "expired"', () => {
    expect(listingEffectiveStatus('published', '2026-05-01', '2026-06-01')).toBe('expired');
    expect(listingEffectiveStatus('published', '2026-05-31', '2026-06-01')).toBe('expired');
  });

  it('published, hạn đúng hôm nay -> CHƯA hết hạn (status=expired chỉ khi đã QUA, khớp backend expiresAt >= CURRENT_DATE)', () => {
    expect(listingEffectiveStatus('published', '2026-06-01', '2026-06-01')).not.toBe('expired');
  });

  it(`published, còn <= ${EXPIRING_SOON_DAYS} ngày -> "expiring_soon"`, () => {
    expect(listingEffectiveStatus('published', '2026-06-01', '2026-06-01')).toBe('expiring_soon');
    expect(listingEffectiveStatus('published', '2026-06-08', '2026-06-01')).toBe('expiring_soon');
  });

  it(`published, còn > ${EXPIRING_SOON_DAYS} ngày -> null (còn hạn, chưa cần cảnh báo)`, () => {
    expect(listingEffectiveStatus('published', '2026-06-09', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('published', '2026-12-31', '2026-06-01')).toBeNull();
  });
});

describe('matchesListingFilter', () => {
  const base = { status: 'published', expires_at: '2026-06-01' as string | null };

  it('"all" khớp mọi item', () => {
    expect(matchesListingFilter(base, 'all', '2026-01-01')).toBe(true);
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'all', '2026-01-01')).toBe(true);
  });

  it('lọc theo status thật (draft/pending/published/closed/rejected)', () => {
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'draft', '2026-01-01')).toBe(true);
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'pending', '2026-01-01')).toBe(false);
  });

  it('"expiring_soon"/"expired" lọc theo trạng thái SUY RA, không phải cột status thật', () => {
    // Hạn 2026-06-01, hôm nay 2026-06-01 -> sắp hết hạn (status thật vẫn "published").
    expect(matchesListingFilter(base, 'expiring_soon', '2026-06-01')).toBe(true);
    expect(matchesListingFilter(base, 'expired', '2026-06-01')).toBe(false);
    // Hạn đã qua.
    expect(matchesListingFilter(base, 'expired', '2026-07-01')).toBe(true);
    expect(matchesListingFilter(base, 'expiring_soon', '2026-07-01')).toBe(false);
    // Lọc "published" (status thật) KHÔNG tự động khớp/loại theo hạn — tin published còn hạn xa vẫn khớp "published".
    expect(matchesListingFilter({ status: 'published', expires_at: '2026-12-31' }, 'published', '2026-01-01')).toBe(true);
  });
});

describe('todayInVietnam', () => {
  it('trả đúng dạng YYYY-MM-DD', () => {
    expect(todayInVietnam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
