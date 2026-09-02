/** @jest-environment jsdom */
import { notFound } from 'next/navigation';
import LocaleRootLayout from './layout';

jest.mock('next/navigation', () => ({ notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
jest.mock('@/modules/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// `LocaleRootLayout` tự khai <html>/<body> (root layout thật, "multiple root layouts" — xem PR A
// design) — render qua RTL sẽ lồng <html> sai chỗ, nên test trực tiếp trên React element tree trả
// về bởi component (một async function thuần) thay vì DOM, đúng bản chất Server Component.
describe('LocaleRootLayout — html lang động theo params.locale', () => {
  it('lang="vi" khi params.locale = vi', async () => {
    const el = (await LocaleRootLayout({
      children: 'x',
      params: Promise.resolve({ locale: 'vi' }),
    })) as React.ReactElement<{ lang: string }>;
    expect(el.type).toBe('html');
    expect(el.props.lang).toBe('vi');
  });

  it('lang="en" khi params.locale = en', async () => {
    const el = (await LocaleRootLayout({
      children: 'x',
      params: Promise.resolve({ locale: 'en' }),
    })) as React.ReactElement<{ lang: string }>;
    expect(el.props.lang).toBe('en');
  });

  it('locale không hỗ trợ (vd "fr") → gọi notFound(), không render <html> với locale lạ', async () => {
    await expect(
      LocaleRootLayout({ children: 'x', params: Promise.resolve({ locale: 'fr' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
