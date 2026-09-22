/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { HomeAboutSection } from './HomeAboutSection';
import { getHomeContent } from '@/modules/site-content/api/site-content.api';

jest.mock('@/modules/site-content/api/site-content.api', () => ({ getHomeContent: jest.fn() }));

const mockGetHomeContent = getHomeContent as jest.Mock;

const NO_OVERRIDE = { hero: null, about: null, featuredPlaceSlugs: [], social: { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null } };

beforeEach(() => {
  mockGetHomeContent.mockReset().mockResolvedValue(NO_OVERRIDE);
});

describe('HomeAboutSection (S1, 2026-09-22)', () => {
  it('không có nội dung "about" → không render gì cả (không giữ chỗ rỗng)', async () => {
    const element = await HomeAboutSection({ locale: 'vi' });
    expect(element).toBeNull();
  });

  it('có nội dung → render đúng tiêu đề và nội dung owner đã viết', async () => {
    mockGetHomeContent.mockResolvedValue({ ...NO_OVERRIDE, about: { title: 'Về chúng tôi', body: 'Nội dung thật.' } });
    const element = await HomeAboutSection({ locale: 'vi' });
    render(element);
    expect(screen.getByRole('heading', { level: 2, name: 'Về chúng tôi' })).toBeInTheDocument();
    expect(screen.getByText('Nội dung thật.')).toBeInTheDocument();
  });

  it('getHomeContent lỗi → không render gì, không ném lỗi', async () => {
    mockGetHomeContent.mockRejectedValue(new Error('API down'));
    const element = await HomeAboutSection({ locale: 'vi' });
    expect(element).toBeNull();
  });
});
