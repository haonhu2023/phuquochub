/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { GuideMediaPicker } from './GuideMediaPicker';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';
import { useAuthenticatedImage } from '@/modules/media/useAuthenticatedImage';
import { readSession } from '@/modules/auth/session';

jest.mock('@/modules/media/useSingleImageUpload');
jest.mock('@/modules/media/useAuthenticatedImage');
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const mockUpload = useSingleImageUpload as jest.Mock;
const mockAuthImage = useAuthenticatedImage as jest.Mock;
const mockSession = readSession as jest.Mock;

const NOOP_UPLOAD_STATE = { preview: null, mediaId: null, uploading: false, error: null, onFileSelected: jest.fn(), reset: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockReturnValue(NOOP_UPLOAD_STATE);
  mockAuthImage.mockReturnValue({ src: null, loading: false, error: false });
  mockSession.mockReturnValue({ accessToken: 'tok' });
});

// 2026-09-27 P0 fix — `existingImageUrl` is built from the PUBLIC file path, which 404s for
// anything not `published`. Without `mediaStatus`, a pending image the owner just uploaded looks
// exactly like a broken image on reload, with zero explanation.
describe('GuideMediaPicker — pending/rejected media status', () => {
  it('shows "đang chờ duyệt" + a link to the moderation queue for a pending, already-saved image', () => {
    render(
      <GuideMediaPicker
        label="Ảnh đại diện (hero)"
        mediaId="media-1"
        existingImageUrl="https://api.test/media/media-1/file"
        mediaStatus="pending"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Ảnh đã chọn — đang chờ duyệt.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hàng chờ kiểm duyệt/ })).toHaveAttribute('href', '/dashboard/moderation');
  });

  it('uses the authenticated moderation-file endpoint (not the public URL) to preview a pending image', () => {
    mockAuthImage.mockReturnValue({ src: 'blob:internal-preview', loading: false, error: false });
    const { container } = render(
      <GuideMediaPicker
        label="Ảnh"
        mediaId="media-1"
        existingImageUrl="https://api.test/media/media-1/file"
        mediaStatus="pending"
        onChange={jest.fn()}
      />,
    );
    expect(mockAuthImage).toHaveBeenCalledWith(expect.stringContaining('/media/media-1/moderation-file'), 'tok');
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('blob:internal-preview');
  });

  it('does not call the internal preview hook when the image is already published (public URL works)', () => {
    const { container } = render(
      <GuideMediaPicker
        label="Ảnh"
        mediaId="media-1"
        existingImageUrl="https://api.test/media/media-1/file"
        mediaStatus="published"
        onChange={jest.fn()}
      />,
    );
    expect(mockAuthImage).toHaveBeenCalledWith(null, undefined);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('https://api.test/media/media-1/file');
  });

  it('shows a distinct rejected message', () => {
    render(<GuideMediaPicker label="Ảnh" mediaId="media-1" existingImageUrl={null} mediaStatus="rejected" onChange={jest.fn()} />);
    expect(screen.getByText(/đã bị từ chối/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Hàng chờ kiểm duyệt/ })).not.toBeInTheDocument();
  });

  it('shows the "just uploaded, will queue on save" message for a fresh upload this session, before mediaStatus is known', () => {
    mockUpload.mockReturnValue({ ...NOOP_UPLOAD_STATE, preview: 'blob:fresh-upload', mediaId: 'media-2' });
    render(<GuideMediaPicker label="Ảnh" mediaId="media-2" existingImageUrl={null} mediaStatus={null} onChange={jest.fn()} />);
    expect(screen.getByText(/sẽ vào hàng chờ duyệt khi bạn lưu bản nháp/)).toBeInTheDocument();
  });
});
