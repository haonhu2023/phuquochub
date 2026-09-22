/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { listPlaces } from '@/modules/places/api/places.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import type { PlaceCard as PlaceCardType } from '@/modules/places/types';
import PlacesPage from './page';

jest.mock('@/modules/places/api/places.api', () => ({ listPlaces: jest.fn() }));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockListPlaces = listPlaces as jest.Mock;
const mockListCategories = listCategories as jest.Mock;

function place(overrides: Partial<PlaceCardType> = {}): PlaceCardType {
  return {
    id: 'p1',
    name: 'Dinh Cậu',
    slug: 'dinh-cau',
    category_id: 'cat-attraction',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    content_version: 1,
    status: 'published',
    location: { lat: 10, lng: 104 },
    ...overrides,
  };
}

describe('PlacesPage', () => {
  beforeEach(() => {
    mockListPlaces.mockReset();
    mockListCategories.mockReset().mockResolvedValue([
      { id: 'cat-attraction', slug: 'attraction', name_vi: 'Điểm tham quan', name_en: 'Attraction', icon: null, parent_id: null },
    ]);
  });

  it('gắn đúng tên danh mục thật (tra qua GET /categories) lên mỗi thẻ', async () => {
    mockListPlaces.mockResolvedValue([place()]);
    render(await PlacesPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByText('Điểm tham quan')).toBeInTheDocument();
  });

  it('lỗi tra tên danh mục -> vẫn render danh sách bình thường, chỉ thiếu nhãn danh mục', async () => {
    mockListPlaces.mockResolvedValue([place()]);
    mockListCategories.mockRejectedValue(new Error('network'));
    render(await PlacesPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByText('Dinh Cậu')).toBeInTheDocument();
  });

  it('danh sách rỗng -> hiện empty state, không render lưới', async () => {
    mockListPlaces.mockResolvedValue([]);
    render(await PlacesPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByText('Chưa có địa điểm nào')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('EN: empty state dịch đúng', async () => {
    mockListPlaces.mockResolvedValue([]);
    render(await PlacesPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('No places yet')).toBeInTheDocument();
  });
});
