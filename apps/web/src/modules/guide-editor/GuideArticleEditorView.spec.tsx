/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuideArticleEditorView } from './GuideArticleEditorView';
import { createGuideDraft } from './api/guide-editor.api';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { ApiError } from '@/lib/http';
import { presignMedia, putToPresignedUrl, registerMedia } from '@/modules/media/api/media.api';
import { sha256Hex } from '@/lib/sha256';

jest.mock('@/modules/media/api/media.api');
jest.mock('@/lib/sha256');
jest.mock('./api/guide-editor.api', () => ({
  createGuideDraft: jest.fn(),
  getGuideDraft: jest.fn(),
  saveGuideDraft: jest.fn(),
  publishGuideArticle: jest.fn(),
  unpublishGuideArticle: jest.fn(),
  flagContentGap: jest.fn(),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const session = readSession as jest.Mock;
const caps = fetchCapabilities as jest.Mock;
const create = createGuideDraft as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom has no createObjectURL/revokeObjectURL — GuideMediaPicker's upload preview needs them
  // (same stub used by useSingleImageUpload.spec.tsx and PhotosView.spec.tsx).
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
  global.URL.revokeObjectURL = jest.fn();
  session.mockReturnValue({ accessToken: 'tok' });
  caps.mockResolvedValue({ canEditGuides: true });
});

// Regression coverage for the 2026-09-27 production incident: an owner filled in Title only (Slug
// has no auto-fill, no visible "required" marker) and got a bare "Dữ liệu không hợp lệ" on save
// with no indication which field was wrong — root cause confirmed live via a real
// POST /admin/guide-articles reproduction (slug: '' → SaveGuideDraftDto's @MinLength(1)).
describe('slug auto-suggestion (new draft only)', () => {
  it('fills the slug from the title as the owner types, before the first manual slug edit', async () => {
    render(<GuideArticleEditorView id="new" />);
    const title = await screen.findByLabelText('Tiêu đề');
    fireEvent.change(title, { target: { value: 'Bãi Sao — Phú Quốc' } });
    const slug = screen.getByLabelText(/Slug/) as HTMLInputElement;
    expect(slug.value).toBe('bai-sao-phu-quoc');
  });

  it('stops auto-filling once the owner edits the slug field directly', async () => {
    render(<GuideArticleEditorView id="new" />);
    const title = await screen.findByLabelText('Tiêu đề');
    fireEvent.change(title, { target: { value: 'Bãi Sao' } });
    const slug = screen.getByLabelText(/Slug/) as HTMLInputElement;
    fireEvent.change(slug, { target: { value: 'slug-tuy-chinh' } });
    fireEvent.change(title, { target: { value: 'Bãi Sao — Phú Quốc' } });
    expect(slug.value).toBe('slug-tuy-chinh');
  });

  it('does not auto-fill slug when editing an existing draft (id !== "new")', async () => {
    const { getGuideDraft } = jest.requireMock('./api/guide-editor.api');
    getGuideDraft.mockResolvedValue({
      id: 'art-1', slug: 'bai-goc', locale: 'vi', title: 'Bãi gốc', intro: null,
      heroMediaId: null, heroImageUrl: null, blocks: [], contentVersion: 1, status: 'draft',
    });
    render(<GuideArticleEditorView id="art-1" />);
    const title = await screen.findByLabelText('Tiêu đề');
    fireEvent.change(title, { target: { value: 'Bãi gốc đã sửa tên' } });
    const slug = screen.getByLabelText(/Slug/) as HTMLInputElement;
    expect(slug.value).toBe('bai-goc');
  });
});

describe('validation error surfacing on save', () => {
  it('shows the specific field-level message instead of only the generic banner', async () => {
    create.mockRejectedValue(
      new ApiError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR', [
        { message: 'slug must be longer than or equal to 1 characters' },
      ]),
    );
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Tiêu đề thật' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dữ liệu không hợp lệ');
    expect(alert).toHaveTextContent('Slug (đường dẫn URL)');
    expect(alert).toHaveTextContent('slug must be longer than or equal to 1 characters');
  });

  it('falls back to the plain message when the server sends no details', async () => {
    create.mockRejectedValue(new ApiError('Lỗi máy chủ', 500, 'INTERNAL_SERVER_ERROR'));
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Tiêu đề thật' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lỗi máy chủ');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('saves successfully and navigates to the new draft edit route when the payload is valid', async () => {
    create.mockResolvedValue({ id: 'new-id', contentVersion: 1, status: 'draft' });
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Tiêu đề thật' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/editorial/guides/new-id'));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'tieu-de-that', title: 'Tiêu đề thật' }),
      'tok',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // createDraft's 409 (guide_articles UNIQUE(slug, locale)) and saveGuideDraft's 409 (CAS
  // expectedContentVersion mismatch) are DIFFERENT failures that both surface as
  // ApiError.isConflict — conflating them previously told the owner to "reload the page" for a
  // duplicate slug, which does nothing to fix it.
  it('reports a duplicate slug distinctly from a CAS conflict, on create', async () => {
    create.mockRejectedValue(new ApiError('Conflict', 409, 'CONFLICT'));
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Tiêu đề thật' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Slug này đã được dùng');
    expect(alert).not.toHaveTextContent('Có người khác vừa sửa');
  });

  it('still shows the CAS reload banner for a real version conflict on an existing draft', async () => {
    const { getGuideDraft, saveGuideDraft } = jest.requireMock('./api/guide-editor.api');
    getGuideDraft.mockResolvedValue({
      id: 'art-1', slug: 'bai-goc', locale: 'vi', title: 'Bãi gốc', intro: null,
      heroMediaId: null, heroImageUrl: null, blocks: [], contentVersion: 1, status: 'draft',
    });
    saveGuideDraft.mockRejectedValue(new ApiError('Conflict', 409, 'CONFLICT'));
    render(<GuideArticleEditorView id="art-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu bản nháp' }));

    expect(await screen.findByText(/Có người khác vừa sửa cẩm nang này/)).toBeInTheDocument();
  });
});

describe('image upload guards the Save button', () => {
  // 2026-09-27 requirement: saving while an image is still mid-upload must never "succeed" having
  // silently dropped the new mediaId — the Save button must be unusable until every picker (hero
  // and any image_with_rights block) finishes.
  it('disables Save and refuses to submit while the hero image is still uploading', async () => {
    const mockPresign = presignMedia as jest.MockedFunction<typeof presignMedia>;
    const mockPut = putToPresignedUrl as jest.MockedFunction<typeof putToPresignedUrl>;
    const mockRegister = registerMedia as jest.MockedFunction<typeof registerMedia>;
    const mockHash = sha256Hex as jest.MockedFunction<typeof sha256Hex>;
    mockHash.mockResolvedValue('a'.repeat(64));
    mockPresign.mockResolvedValue({ key: 'media/x.jpg', upload_url: 'https://storage.example/x', expires_in: 600 });
    mockPut.mockResolvedValue(undefined);
    let resolveRegister!: (v: Awaited<ReturnType<typeof registerMedia>>) => void;
    mockRegister.mockImplementation(() => new Promise((res) => { resolveRegister = res; }));

    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Tiêu đề thật' } });

    const fileInput = screen.getByLabelText('Ảnh đại diện (hero)') as HTMLInputElement;
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const saveButton = await screen.findByRole('button', { name: /Lưu bản nháp/ });
    await waitFor(() => expect(saveButton).toBeDisabled());
    // Both GuideMediaPicker's own indicator and the aggregate one next to Save use role="status" —
    // assert on content across all of them rather than assuming there is only one.
    await waitFor(() => {
      const statuses = screen.getAllByRole('status').map((el) => el.textContent);
      expect(statuses.some((t) => t?.includes('Đang tải ảnh lên'))).toBe(true);
    });

    fireEvent.click(saveButton);
    expect(create).not.toHaveBeenCalled();

    resolveRegister({
      id: 'media-1', type: 'image', url: 'http://cdn/x.jpg', thumbnail_url: null,
    } as Awaited<ReturnType<typeof registerMedia>>);
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });
});
