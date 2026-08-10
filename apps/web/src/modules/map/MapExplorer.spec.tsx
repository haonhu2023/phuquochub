/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { MapExplorer } from './MapExplorer';
import type { Category } from '@/modules/categories/api/categories.api';

// MapView thật cần maplibre-gl (canvas/WebGL, không có trong Jest) — mock lại nhưng RENDER
// props nhận được để assert bộ lọc thực sự đi tới MapView (Search Filters trên bản đồ).
jest.mock('./MapView', () => ({
  MapView: ({ category, ward }: { category?: string; ward?: string }) => (
    <div data-testid="mapview" data-category={category ?? ''} data-ward={ward ?? ''} />
  ),
}));

const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'beach', name_vi: 'Bãi biển', name_en: 'Beach', icon: null, parent_id: null },
  { id: 'c2', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null },
];

describe('MapExplorer — bộ lọc category/ward (Map Audit Phase F)', () => {
  it('mặc định không lọc gì → MapView nhận category/ward rỗng', () => {
    render(<MapExplorer categories={CATEGORIES} />);
    const el = screen.getByTestId('mapview');
    expect(el.dataset.category).toBe('');
    expect(el.dataset.ward).toBe('');
  });

  it('chọn category → MapView nhận đúng category_id đã chọn', () => {
    render(<MapExplorer categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: 'c2' } });
    expect(screen.getByTestId('mapview').dataset.category).toBe('c2');
  });

  it('chọn khu vực → MapView nhận đúng tên ward đã chọn', () => {
    render(<MapExplorer categories={CATEGORIES} />);
    const wardSelect = screen.getByLabelText('Khu vực') as HTMLSelectElement;
    const firstRealOption = wardSelect.options[1].value;
    fireEvent.change(wardSelect, { target: { value: firstRealOption } });
    expect(screen.getByTestId('mapview').dataset.ward).toBe(firstRealOption);
  });

  it('chọn "Tất cả" trở lại → bộ lọc quay về rỗng (không kẹt giá trị cũ)', () => {
    render(<MapExplorer categories={CATEGORIES} />);
    const select = screen.getByLabelText('Danh mục');
    fireEvent.change(select, { target: { value: 'c1' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByTestId('mapview').dataset.category).toBe('');
  });

  it('render đủ option category theo danh sách truyền vào', () => {
    render(<MapExplorer categories={CATEGORIES} />);
    expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Khách sạn' })).toBeInTheDocument();
  });
});
