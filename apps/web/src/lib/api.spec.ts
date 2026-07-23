import { buildApiUrl, getApiBaseUrl } from './api';

describe('api helpers', () => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
  });

  it('getApiBaseUrl có mặc định khi thiếu env', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getApiBaseUrl()).toBe('http://localhost:4000/api');
  });

  it('buildApiUrl ghép path đúng, không nhân đôi dấu gạch', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000/api/';
    expect(buildApiUrl('/health')).toBe('http://localhost:4000/api/health');
    expect(buildApiUrl('health')).toBe('http://localhost:4000/api/health');
  });
});
