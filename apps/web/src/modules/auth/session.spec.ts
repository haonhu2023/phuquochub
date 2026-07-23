import {
  clearSession,
  EXPIRY_SKEW_MS,
  isAccessTokenFresh,
  isValidSession,
  readSession,
  SESSION_STORAGE_KEY,
  writeSession,
  type SessionStorageLike,
} from './session';
import type { AuthSession } from './types';

// Fake storage in-memory — cho phép test thuần trong jest env=node (không cần localStorage).
function fakeStorage(): SessionStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const sample: AuthSession = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 10_000,
  user: { id: 'u1', email: 'x@y.z', displayName: 'X', avatarUrl: null },
};

describe('session storage', () => {
  it('ghi rồi đọc lại đúng phiên', () => {
    const store = fakeStorage();
    writeSession(sample, store);
    expect(store.map.has(SESSION_STORAGE_KEY)).toBe(true);
    expect(readSession(store)).toEqual(sample);
  });

  it('đọc trả null khi trống hoặc JSON hỏng', () => {
    const store = fakeStorage();
    expect(readSession(store)).toBeNull();
    store.setItem(SESSION_STORAGE_KEY, '{not json');
    expect(readSession(store)).toBeNull();
  });

  it('đọc trả null khi cấu trúc không hợp lệ', () => {
    const store = fakeStorage();
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'a' }));
    expect(readSession(store)).toBeNull();
  });

  it('clearSession xóa dữ liệu', () => {
    const store = fakeStorage();
    writeSession(sample, store);
    clearSession(store);
    expect(readSession(store)).toBeNull();
  });

  it('no-op an toàn khi storage null (server-side)', () => {
    expect(() => writeSession(sample, null)).not.toThrow();
    expect(readSession(null)).toBeNull();
  });
});

describe('isAccessTokenFresh', () => {
  it('còn hạn khi now trước mốc trừ skew', () => {
    expect(isAccessTokenFresh(sample, sample.expiresAt - EXPIRY_SKEW_MS - 1)).toBe(true);
  });
  it('hết hạn khi now chạm vùng skew', () => {
    expect(isAccessTokenFresh(sample, sample.expiresAt - EXPIRY_SKEW_MS + 1)).toBe(false);
    expect(isAccessTokenFresh(sample, sample.expiresAt + 1)).toBe(false);
  });
});

describe('isValidSession', () => {
  it('true cho phiên hợp lệ', () => {
    expect(isValidSession(sample)).toBe(true);
  });
  it('false cho giá trị thiếu trường / sai kiểu', () => {
    expect(isValidSession(null)).toBe(false);
    expect(isValidSession({})).toBe(false);
    expect(isValidSession({ ...sample, expiresAt: 'soon' })).toBe(false);
    expect(isValidSession({ ...sample, user: { id: 1 } })).toBe(false);
  });
});
