/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchMapExplorer } from './SearchMapExplorer';
import { searchPlaces } from './api/search.api';

jest.mock('@/modules/map/MapView', () => ({
  MapView: () => null,
}));
jest.mock('./api/search.api');
jest.mock('@/modules/places/api/places.api');

const mockSearchPlaces = searchPlaces as jest.MockedFunction<typeof searchPlaces>;

describe('SearchMapExplorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('announces a search failure via role="alert"', async () => {
    mockSearchPlaces.mockRejectedValue(new Error('Không tải được kết quả tìm kiếm.'));
    render(<SearchMapExplorer />);

    fireEvent.change(screen.getByLabelText('Từ khoá tìm kiếm'), { target: { value: 'bai sao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('Không tải được kết quả tìm kiếm.');
  });

  it('renders results with no error alert on success', async () => {
    mockSearchPlaces.mockResolvedValue({
      data: [{ type: 'place', id: 'p1', title: 'Bãi Sao', slug: 'bai-sao', snippet: null }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, timestamp: '2026-08-02T00:00:00.000Z' },
    });
    render(<SearchMapExplorer />);

    fireEvent.change(screen.getByLabelText('Từ khoá tìm kiếm'), { target: { value: 'bai sao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
