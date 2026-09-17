/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PlaceGallery } from './PlaceGallery';
import type { PlaceMedia } from './types';

function media(overrides: Partial<PlaceMedia> = {}): PlaceMedia {
  return {
    id: 'm1',
    type: 'image',
    url: 'https://api.example/api/media/m1/file',
    thumbnail_url: null,
    caption: null,
    alt_text: null,
    status: 'published',
    attribution: null,
    license_type: null,
    license_url: null,
    ...overrides,
  };
}

describe('PlaceGallery', () => {
  it('không có ảnh -> không render gì (không có khung rỗng)', () => {
    const { container } = render(<PlaceGallery media={[]} placeName="Dinh Cậu" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('render đúng URL ảnh THẬT do content_owner/kiểm duyệt viên đã duyệt', () => {
    render(
      <PlaceGallery
        media={[media({ url: 'https://api.example/api/media/555/file' })]}
        placeName="La Veranda Resort"
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://api.example/api/media/555/file');
  });

  it('ưu tiên thumbnail_url khi có, không phải url gốc', () => {
    render(<PlaceGallery media={[media({ thumbnail_url: 'https://api.example/thumb.jpg' })]} placeName="X" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://api.example/thumb.jpg');
  });

  it('alt ưu tiên alt_text, rồi caption, rồi tên địa điểm', () => {
    render(<PlaceGallery media={[media({ alt_text: 'Ảnh thật' })]} placeName="Dinh Cậu" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Ảnh thật');
  });

  it('không có alt_text/caption -> fallback về tên địa điểm', () => {
    render(<PlaceGallery media={[media()]} placeName="Dinh Cậu" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Dinh Cậu');
  });

  it('nhiều ảnh -> render đủ, ĐÚNG thứ tự API trả về', () => {
    render(
      <PlaceGallery
        media={[media({ id: 'a', url: 'https://x/a' }), media({ id: 'b', url: 'https://x/b' })]}
        placeName="X"
      />,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['https://x/a', 'https://x/b']);
  });

  it('có attribution -> hiện dòng ghi công', () => {
    render(<PlaceGallery media={[media({ attribution: 'Ảnh: Sở Du lịch Kiên Giang' })]} placeName="X" />);
    expect(screen.getByText('Ảnh: Sở Du lịch Kiên Giang')).toBeInTheDocument();
  });

  it('không có attribution -> không bịa dòng ghi công', () => {
    render(<PlaceGallery media={[media({ attribution: null })]} placeName="X" />);
    expect(screen.queryByText(/Giấy phép/)).not.toBeInTheDocument();
  });
});
