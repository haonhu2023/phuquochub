import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localizedHref,
  normalizeLocaleInput,
  PUBLIC_ROUTE_ROOTS,
  SUPPORTED_LOCALES,
} from './locale';

describe('SUPPORTED_LOCALES / DEFAULT_LOCALE', () => {
  it('chỉ gồm vi và en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['vi', 'en']);
  });

  it('mặc định là vi', () => {
    expect(DEFAULT_LOCALE).toBe('vi');
  });
});

describe('isSupportedLocale', () => {
  it.each(['vi', 'en'])('%s hợp lệ', (v) => {
    expect(isSupportedLocale(v)).toBe(true);
  });

  it.each(['fr', 'de', 'xx', '', 'VI', 'places', 'map'])('%s KHÔNG hợp lệ', (v) => {
    expect(isSupportedLocale(v)).toBe(false);
  });
});

describe('normalizeLocaleInput', () => {
  it('trả về locale hợp lệ nguyên trạng', () => {
    expect(normalizeLocaleInput('en')).toBe('en');
  });

  it.each([null, undefined, '', 'fr', 'malicious-value', '../../etc/passwd'])(
    'trả về null cho input không hợp lệ: %s',
    (v) => {
      expect(normalizeLocaleInput(v)).toBeNull();
    },
  );
});

describe('localizedHref', () => {
  it('nối locale vào đầu path thường', () => {
    expect(localizedHref('vi', '/places')).toBe('/vi/places');
    expect(localizedHref('en', '/hotels/abc')).toBe('/en/hotels/abc');
  });

  it('path gốc "/" → "/{locale}", không có dấu "/" thừa ở cuối', () => {
    expect(localizedHref('vi', '/')).toBe('/vi');
    expect(localizedHref('en', '/')).toBe('/en');
  });

  it('KHÔNG double-prefix nếu path đã có locale hợp lệ ở đầu', () => {
    expect(localizedHref('vi', '/en/places')).toBe('/en/places');
    expect(localizedHref('en', '/vi/places')).toBe('/vi/places');
  });
});

describe('PUBLIC_ROUTE_ROOTS', () => {
  it('khớp đúng danh sách route public thật (không bao gồm dashboard/login/register)', () => {
    expect(PUBLIC_ROUTE_ROOTS).toEqual([
      'places',
      'search',
      'map',
      'explore',
      'hotels',
      'restaurants',
      'tours',
      'beaches',
      'attractions',
      'events',
      'about',
      'contact',
      'privacy',
      'terms',
    ]);
    expect(PUBLIC_ROUTE_ROOTS).not.toContain('dashboard');
    expect(PUBLIC_ROUTE_ROOTS).not.toContain('login');
    expect(PUBLIC_ROUTE_ROOTS).not.toContain('register');
  });
});
