/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlacePicker } from './PlacePicker';
import { suggest } from '@/modules/search/api/search.api';
import { getPlace } from '@/modules/places/api/places.api';

jest.mock('@/modules/search/api/search.api', () => ({ suggest: jest.fn() }));
jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));

const mockSuggest = suggest as jest.MockedFunction<typeof suggest>;
const mockGetPlace = getPlace as jest.MockedFunction<typeof getPlace>;

beforeEach(() => {
  jest.clearAllMocks();
});

// Place picker (2026-09-29) — reuses GET /search/suggest (published-only, see search.service.ts)
// and GET /places/:slug (to resolve titles for slugs an existing draft already had — place_
// collection only ever stores slugs). No new backend endpoint.
describe('PlacePicker', () => {
  it('resolves titles via getPlace for slugs the draft already had, on mount', async () => {
    mockGetPlace.mockResolvedValueOnce({ name: 'Bãi Sao' } as never);
    render(<PlacePicker slugs={['bai-sao']} onChange={jest.fn()} />);

    expect(await screen.findByText('Bãi Sao')).toBeInTheDocument();
    expect(mockGetPlace).toHaveBeenCalledWith('bai-sao');
  });

  it('falls back to the raw slug as a title when getPlace fails', async () => {
    mockGetPlace.mockRejectedValueOnce(new Error('not found'));
    render(<PlacePicker slugs={['ghost-place']} onChange={jest.fn()} />);
    expect(await screen.findByText('ghost-place')).toBeInTheDocument();
  });

  it('searches by name (debounced) and lets the owner add a suggestion', async () => {
    mockSuggest.mockResolvedValueOnce([{ id: '1', title: 'Bãi Sao', slug: 'bai-sao' }]);
    const onChange = jest.fn();
    render(<PlacePicker slugs={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('Tìm địa điểm theo tên...'), { target: { value: 'sao' } });

    await waitFor(() => expect(mockSuggest).toHaveBeenCalledWith('sao'), { timeout: 1000 });
    const addButton = await screen.findByRole('button', { name: /Bãi Sao/ });
    fireEvent.click(addButton);

    expect(onChange).toHaveBeenCalledWith(['bai-sao']);
    expect(await screen.findByText('Đã chọn (1) — dùng mũi tên để sắp xếp thứ tự hiển thị')).toBeInTheDocument();
  });

  it('does not search for a query shorter than 2 characters', async () => {
    render(<PlacePicker slugs={[]} onChange={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Tìm địa điểm theo tên...'), { target: { value: 'a' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('reorders selected places with the up/down buttons', async () => {
    mockGetPlace.mockResolvedValueOnce({ name: 'Bãi Sao' } as never).mockResolvedValueOnce({ name: 'Dinh Cậu' } as never);
    const onChange = jest.fn();
    render(<PlacePicker slugs={['bai-sao', 'dinh-cau']} onChange={onChange} />);

    await screen.findByText('Bãi Sao');
    await screen.findByText('Dinh Cậu');

    fireEvent.click(screen.getByRole('button', { name: 'Đưa Dinh Cậu lên trên' }));
    expect(onChange).toHaveBeenCalledWith(['dinh-cau', 'bai-sao']);
  });

  it('removes a selected place', async () => {
    mockGetPlace.mockResolvedValueOnce({ name: 'Bãi Sao' } as never);
    const onChange = jest.fn();
    render(<PlacePicker slugs={['bai-sao']} onChange={onChange} />);

    await screen.findByText('Bãi Sao');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ Bãi Sao khỏi danh sách' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables the suggestion button for an already-selected place', async () => {
    mockGetPlace.mockResolvedValueOnce({ name: 'Bãi Sao' } as never);
    mockSuggest.mockResolvedValueOnce([{ id: '1', title: 'Bãi Sao', slug: 'bai-sao' }]);
    render(<PlacePicker slugs={['bai-sao']} onChange={jest.fn()} />);

    await screen.findByText('Bãi Sao');
    fireEvent.change(screen.getByPlaceholderText('Tìm địa điểm theo tên...'), { target: { value: 'sao' } });
    const addButton = await screen.findByRole('button', { name: /Bãi Sao.*đã chọn/ });
    expect(addButton).toBeDisabled();
  });
});
