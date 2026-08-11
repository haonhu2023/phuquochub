import {
  createPlaceContact,
  deletePlaceContact,
  listPlaceContacts,
  updatePlaceContact,
} from './place-contacts.api';
import { apiDeleteAuth, apiGet, apiPatchAuth, apiPost } from '@/lib/http';
import type { ContactFormInput, PlaceContact } from '../types';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatchAuth: jest.fn(),
  apiDeleteAuth: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;
const mockPost = apiPost as jest.Mock;
const mockPatch = apiPatchAuth as jest.Mock;
const mockDelete = apiDeleteAuth as jest.Mock;

const INPUT: ContactFormInput = {
  contact_type: 'PHONE',
  value: '0909123456',
  label: 'Lễ tân',
  is_primary: true,
};

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([]);
  mockPost.mockReset().mockResolvedValue(undefined);
  mockPatch.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(null);
});

describe('listPlaceContacts', () => {
  it('GET /places/{id}/contacts, không token (endpoint công khai), không cache', async () => {
    await listPlaceContacts('place-1');
    expect(mockGet).toHaveBeenCalledWith('/places/place-1/contacts', { cache: 'no-store' });
  });

  it('encode placeId trong URL', async () => {
    await listPlaceContacts('place with space');
    expect(mockGet).toHaveBeenCalledWith('/places/place%20with%20space/contacts', { cache: 'no-store' });
  });

  it('trả về ĐÚNG dữ liệu apiGet trả', async () => {
    const contacts: PlaceContact[] = [
      { id: 'c1', contact_type: 'PHONE', value: '0909123456', label: null, is_primary: true, verification_status: 'pending', display_order: 0 },
    ];
    mockGet.mockResolvedValue(contacts);
    await expect(listPlaceContacts('place-1')).resolves.toEqual(contacts);
  });
});

describe('createPlaceContact', () => {
  it('POST /places/{id}/contacts với payload + token', async () => {
    await createPlaceContact('place-1', INPUT, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/place-1/contacts', 'tok', INPUT);
  });
});

describe('updatePlaceContact', () => {
  it('PATCH /contacts/{id} (encode id) với payload + token', async () => {
    await updatePlaceContact('contact 1', INPUT, 'tok');
    expect(mockPatch).toHaveBeenCalledWith('/contacts/contact%201', 'tok', INPUT);
  });
});

describe('deletePlaceContact', () => {
  it('DELETE /contacts/{id} (encode id) với token', async () => {
    await deletePlaceContact('contact 1', 'tok');
    expect(mockDelete).toHaveBeenCalledWith('/contacts/contact%201', 'tok');
  });
});
