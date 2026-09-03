import { buildApiUrl, getApiBaseUrl } from './api';

describe('api helpers', () => {
  const originalPublic = process.env.NEXT_PUBLIC_API_URL;
  const originalInternal = process.env.API_INTERNAL_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  // Gán `process.env.X = undefined` KHÔNG xoá khoá — Node ép nó thành chuỗi `"undefined"` (truthy!),
  // làm rò rỉ sang test sau. `API_INTERNAL_URL` vốn không tồn tại trước khi file này chạy nên phải
  // `delete`, không gán lại `undefined`.
  afterEach(() => {
    if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalPublic;
    if (originalInternal === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = originalInternal;
    if (originalNodeEnv === undefined) delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    else (process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv;
    delete (globalThis as { window?: unknown }).window;
  });

  // jest.config.js dùng testEnvironment: 'node' cho apps/web — `window` mặc định KHÔNG tồn tại,
  // đúng bối cảnh server-side (SSR/RSC). Test "browser" tự set `globalThis.window` để mô phỏng.
  describe('server-side (window undefined)', () => {
    it('chọn API_INTERNAL_URL khi có, bỏ qua NEXT_PUBLIC_API_URL', () => {
      process.env.API_INTERNAL_URL = 'http://api:4000/api';
      process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:14000/api';
      expect(getApiBaseUrl()).toBe('http://api:4000/api');
    });

    it('dev/test: thiếu API_INTERNAL_URL thì rơi về NEXT_PUBLIC_API_URL (không throw)', () => {
      delete process.env.API_INTERNAL_URL;
      process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:14000/api';
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'test';
      expect(getApiBaseUrl()).toBe('http://127.0.0.1:14000/api');
    });

    it('production: thiếu API_INTERNAL_URL phải throw, KHÔNG âm thầm dùng localhost', () => {
      delete process.env.API_INTERNAL_URL;
      delete process.env.NEXT_PUBLIC_API_URL;
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
      expect(() => getApiBaseUrl()).toThrow(/API_INTERNAL_URL/);
    });

    it('production: có API_INTERNAL_URL thì dùng bình thường, không throw', () => {
      process.env.API_INTERNAL_URL = 'http://api:4000/api';
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
      expect(getApiBaseUrl()).toBe('http://api:4000/api');
    });

    it('có mặc định khi thiếu cả hai env (dev/test)', () => {
      delete process.env.API_INTERNAL_URL;
      delete process.env.NEXT_PUBLIC_API_URL;
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'test';
      expect(getApiBaseUrl()).toBe('http://localhost:4000/api');
    });
  });

  describe('browser (window defined)', () => {
    beforeEach(() => {
      (globalThis as { window?: unknown }).window = {};
    });

    it('luôn dùng NEXT_PUBLIC_API_URL, bỏ qua API_INTERNAL_URL kể cả khi nó tồn tại', () => {
      process.env.API_INTERNAL_URL = 'http://api:4000/api';
      process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:14000/api';
      expect(getApiBaseUrl()).toBe('http://127.0.0.1:14000/api');
    });

    it('không throw ở production dù thiếu API_INTERNAL_URL — nhánh internal chỉ áp dụng server-side', () => {
      delete process.env.API_INTERNAL_URL;
      process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:14000/api';
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
      expect(() => getApiBaseUrl()).not.toThrow();
      expect(getApiBaseUrl()).toBe('http://127.0.0.1:14000/api');
    });

    it('có mặc định khi thiếu NEXT_PUBLIC_API_URL', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      expect(getApiBaseUrl()).toBe('http://localhost:4000/api');
    });
  });

  describe('buildApiUrl', () => {
    it('ghép path đúng, không nhân đôi dấu gạch', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000/api/';
      expect(buildApiUrl('/health')).toBe('http://localhost:4000/api/health');
      expect(buildApiUrl('health')).toBe('http://localhost:4000/api/health');
    });

    it('server-side dùng API_INTERNAL_URL khi ghép URL, không tạo //api', () => {
      process.env.API_INTERNAL_URL = 'http://api:4000/api/';
      expect(buildApiUrl('/places/vinwonders-phu-quoc')).toBe(
        'http://api:4000/api/places/vinwonders-phu-quoc',
      );
    });
  });
});
