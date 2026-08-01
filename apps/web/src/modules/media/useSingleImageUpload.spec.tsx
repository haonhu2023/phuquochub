/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSingleImageUpload } from './useSingleImageUpload';
import { readSession } from '@/modules/auth/session';
import { presignMedia, putToPresignedUrl, registerMedia } from './api/media.api';
import { sha256Hex } from '@/lib/sha256';

jest.mock('@/modules/auth/session');
jest.mock('./api/media.api');
jest.mock('@/lib/sha256');

const mockReadSession = readSession as jest.MockedFunction<typeof readSession>;
const mockPresign = presignMedia as jest.MockedFunction<typeof presignMedia>;
const mockPut = putToPresignedUrl as jest.MockedFunction<typeof putToPresignedUrl>;
const mockRegister = registerMedia as jest.MockedFunction<typeof registerMedia>;
const mockHash = sha256Hex as jest.MockedFunction<typeof sha256Hex>;

const SESSION = {
  accessToken: 'token-abc',
  refreshToken: 'refresh-abc',
  expiresAt: Date.now() + 900_000,
  user: { id: 'u1', email: 'a@b.com', displayName: 'A', avatarUrl: null },
};

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'photo.jpg', { type });
}

function selectFile(result: { current: ReturnType<typeof useSingleImageUpload> }, file: File | null) {
  const files = file ? [file] : [];
  const event = {
    target: { files, value: '' },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
  act(() => {
    result.current.onFileSelected(event);
  });
}

describe('useSingleImageUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSession.mockReturnValue(SESSION);
    mockHash.mockResolvedValue('a'.repeat(64));
    mockPresign.mockResolvedValue({ key: 'media/x.jpg', upload_url: 'https://storage.example/x', expires_in: 600 });
    mockPut.mockResolvedValue(undefined);
    mockRegister.mockResolvedValue({
      id: 'media-1',
      type: 'image',
      url: null,
      thumbnail_url: null,
      caption: null,
      alt_text: null,
      status: 'pending',
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('uploads a valid image end-to-end and exposes the resulting media id', async () => {
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/jpeg', 1024));

    await waitFor(() => expect(result.current.mediaId).toBe('media-1'));
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.preview).toBe('blob:mock-preview');
    expect(mockPresign).toHaveBeenCalledWith(
      { content_type: 'image/jpeg', size: 1024, checksum_sha256: 'a'.repeat(64) },
      'token-abc',
    );
    expect(mockPut).toHaveBeenCalledWith('https://storage.example/x', expect.any(File), 'image/jpeg');
    expect(mockRegister).toHaveBeenCalledWith('media/x.jpg', 'token-abc');
  });

  it('rejects a disallowed MIME type before making any network call', () => {
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/gif', 1024));

    expect(result.current.error).toMatch(/JPEG, PNG hoặc WebP/);
    expect(result.current.mediaId).toBeNull();
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('rejects a file over 10MB before making any network call', () => {
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/jpeg', 10 * 1024 * 1024 + 1));

    expect(result.current.error).toMatch(/10MB/);
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('surfaces an error and clears mediaId when presign fails', async () => {
    mockPresign.mockRejectedValue(new Error('Yêu cầu thất bại (401)'));
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/png', 2048));

    await waitFor(() => expect(result.current.uploading).toBe(false));
    expect(result.current.error).toBe('Yêu cầu thất bại (401)');
    expect(result.current.mediaId).toBeNull();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('surfaces an error when the storage PUT fails', async () => {
    mockPut.mockRejectedValue(new Error('Tải ảnh lên storage thất bại (403)'));
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/webp', 2048));

    await waitFor(() => expect(result.current.uploading).toBe(false));
    expect(result.current.error).toBe('Tải ảnh lên storage thất bại (403)');
    expect(result.current.mediaId).toBeNull();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does not upload when there is no active session', async () => {
    mockReadSession.mockReturnValue(null);
    const { result } = renderHook(() => useSingleImageUpload());

    selectFile(result, makeFile('image/jpeg', 1024));

    await waitFor(() => expect(result.current.error).toMatch(/Phiên đăng nhập/));
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('reset() clears preview, mediaId and error', async () => {
    const { result } = renderHook(() => useSingleImageUpload());
    selectFile(result, makeFile('image/jpeg', 1024));
    await waitFor(() => expect(result.current.mediaId).toBe('media-1'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.mediaId).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');
  });
});
