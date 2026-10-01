/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorialPlacesView } from './EditorialPlacesView';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { listEditorialPlaces } from '@/modules/place-management/api/place-management.api';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));
jest.mock('@/modules/place-management/api/place-management.api', () => ({ listEditorialPlaces: jest.fn(), publishPlace: jest.fn(), unpublishPlace: jest.fn() }));

beforeEach(() => {
  (readSession as jest.Mock).mockReturnValue({ accessToken: 'tok' });
  (fetchCapabilities as jest.Mock).mockResolvedValue({ canEditorial: true });
  (listCategories as jest.Mock).mockResolvedValue([
    { id: 'c1', slug: 'restaurant', name_vi: 'Nhà hàng' },
    { id: 'c2', slug: 'hotel', name_vi: 'Khách sạn' },
  ]);
  (listEditorialPlaces as jest.Mock).mockResolvedValue({
    data: [{ id: 'p1', slug: 'quan-phu-quoc', name: 'Quán Phú Quốc', category_id: 'c1', status: 'published', cover_image_url: null, short_description: null }],
    meta: { total: 52, totalPages: 2 },
  });
  mockReplace.mockReset();
});

it('mục nhà hàng có hướng dẫn riêng và chỉ gọi dữ liệu nhà hàng từ server', async () => {
  render(<EditorialPlacesView initialCategory="restaurant" />);
  expect(await screen.findByRole('heading', { name: 'Nhà hàng và ăn uống' })).toBeInTheDocument();
  expect(screen.getByText(/Món hoặc ẩm thực có thật/)).toBeInTheDocument();
  expect(await screen.findByText('Cần bổ sung mô tả ngắn')).toBeInTheDocument();
  expect(screen.getByText('Cần ảnh bìa có quyền sử dụng')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Thêm nhà hàng và ăn uống/ })).toHaveAttribute('href', '/dashboard/places/new?category=restaurant');
  expect(screen.getByRole('link', { name: /Xem trang công khai/ })).toHaveAttribute('href', '/restaurants/quan-phu-quoc');
  expect(listEditorialPlaces).toHaveBeenCalledWith('tok', { page: 1, limit: 50, category: 'restaurant' });
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await waitFor(() => expect(listEditorialPlaces).toHaveBeenCalledWith('tok', { page: 2, limit: 50, category: 'restaurant' }));
});

it('đổi danh mục đặt lại phân trang và đồng bộ đường dẫn', async () => {
  render(<EditorialPlacesView initialCategory="restaurant" />);
  await screen.findByRole('heading', { name: 'Nhà hàng và ăn uống' });
  await screen.findByRole('option', { name: 'Khách sạn' });
  fireEvent.change(screen.getByLabelText('Loại địa điểm'), { target: { value: 'hotel' } });
  await waitFor(() => expect(listEditorialPlaces).toHaveBeenCalledWith('tok', { page: 1, limit: 50, category: 'hotel' }));
  expect(mockReplace).toHaveBeenCalledWith('/dashboard/editorial/places?category=hotel');
  expect(screen.getByRole('heading', { name: 'Khách sạn và resort' })).toBeInTheDocument();
});
