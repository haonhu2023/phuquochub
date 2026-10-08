/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { RealEstateListingPhotoGallery } from './RealEstateListingPhotoGallery';
import { listRealEstateListingPhotos } from './api/real-estate-listing-photos.api';
import type { RealEstateListingPhoto } from './types';

jest.mock('./api/real-estate-listing-photos.api', () => ({ listRealEstateListingPhotos: jest.fn() }));

const mockList = listRealEstateListingPhotos as jest.Mock;
const LISTING_ID = 'rel-1';

function photo(id: string): RealEstateListingPhoto {
  return { id, sort_order: 0, url: `/api/real-estate-listings/${LISTING_ID}/photos/${id}/file`, created_at: '2026-10-08T00:00:00.000Z' };
}

afterEach(() => jest.clearAllMocks());

describe('RealEstateListingPhotoGallery', () => {
  it('chưa có ảnh → không render gì (không cả khung rỗng)', async () => {
    mockList.mockResolvedValue([]);
    const { container } = render(<RealEstateListingPhotoGallery listingId={LISTING_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(LISTING_ID));
    expect(container).toBeEmptyDOMElement();
  });

  it('có ảnh → render <img> gắn thẳng url công khai (không cần xác thực)', async () => {
    mockList.mockResolvedValue([photo('p1'), photo('p2')]);
    render(<RealEstateListingPhotoGallery listingId={LISTING_ID} />);
    const images = await screen.findAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', `/api/real-estate-listings/${LISTING_ID}/photos/p1/file`);
  });

  it('lỗi tải danh sách → không render gì (không làm hỏng cả trang)', async () => {
    mockList.mockRejectedValue(new Error('network down'));
    const { container } = render(<RealEstateListingPhotoGallery listingId={LISTING_ID} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
