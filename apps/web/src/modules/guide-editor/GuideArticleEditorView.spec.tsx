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
  listGuideDrafts: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));
const replace = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(),
}));

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
  caps.mockResolvedValue({ canEditGuides: true, canModerate: false });
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

// Mục tiêu 2/E (2026-09-27): "Xuất bản phải dùng nội dung mới nhất đã lưu... không xuất bản phiên
// bản cũ khi editor đang có thay đổi chưa lưu." Trước bản này, handlePublish không hề biết tới
// thay đổi chưa lưu — sửa tiêu đề rồi bấm Xuất bản ngay sẽ xuất bản đúng nội dung ĐÃ LƯU TRƯỚC ĐÓ
// trong khi UI vẫn hiện chữ mới gõ, một sai lệch âm thầm.
describe('dirty-state guards Publish', () => {
  const { getGuideDraft, saveGuideDraft, publishGuideArticle } = jest.requireMock('./api/guide-editor.api');
  const EXISTING = {
    id: 'art-1', slug: 'bai-viet', locale: 'vi', title: 'Tiêu đề gốc', intro: null,
    heroMediaId: null, heroImageUrl: null, blocks: [], contentVersion: 1, status: 'draft',
  };

  it('disables Xuất bản and explains why while there are unsaved edits, then re-enables after Save', async () => {
    getGuideDraft.mockResolvedValue(EXISTING);
    saveGuideDraft.mockResolvedValue({ ...EXISTING, contentVersion: 2 });
    render(<GuideArticleEditorView id="art-1" />);

    const publishBtn = await screen.findByRole('button', { name: 'Xuất bản' });
    expect(publishBtn).not.toBeDisabled();

    fireEvent.change(screen.getByDisplayValue('Tiêu đề gốc'), { target: { value: 'Tiêu đề đã sửa' } });
    expect(publishBtn).toBeDisabled();
    expect(screen.getByText(/Còn thay đổi chưa lưu/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(publishBtn).not.toBeDisabled());
    expect(screen.queryByText(/Còn thay đổi chưa lưu/)).not.toBeInTheDocument();

    fireEvent.click(publishBtn);
    await waitFor(() => expect(publishGuideArticle).toHaveBeenCalledWith('art-1', 2, 'tok'));
  });
});

describe('VI/EN translation tab', () => {
  const { getGuideDraft, listGuideDrafts } = jest.requireMock('./api/guide-editor.api');
  const EXISTING = {
    id: 'art-1', slug: 'bai-viet', locale: 'vi', title: 'Bài viết', intro: null,
    heroMediaId: null, heroImageUrl: null, blocks: [], contentVersion: 1, status: 'draft',
  };

  it('offers "Tạo bản EN" when no sibling-locale record exists yet', async () => {
    getGuideDraft.mockResolvedValue(EXISTING);
    listGuideDrafts.mockResolvedValue([{ id: 'art-1', slug: 'bai-viet', locale: 'vi', title: 'Bài viết', status: 'draft', updatedAt: 't' }]);
    render(<GuideArticleEditorView id="art-1" />);
    expect(await screen.findByRole('button', { name: /Tạo bản EN/ })).toBeInTheDocument();
  });

  it('navigates to the sibling record when one exists, without a confirm prompt when not dirty', async () => {
    getGuideDraft.mockResolvedValue(EXISTING);
    listGuideDrafts.mockResolvedValue([
      { id: 'art-1', slug: 'bai-viet', locale: 'vi', title: 'Bài viết', status: 'draft', updatedAt: 't' },
      { id: 'art-2', slug: 'bai-viet', locale: 'en', title: 'Article', status: 'draft', updatedAt: 't' },
    ]);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GuideArticleEditorView id="art-1" />);
    const enTab = await screen.findByRole('tab', { name: 'EN' });
    expect(enTab).not.toBeDisabled();
    // Sibling lookup (listGuideDrafts) resolves asynchronously after articleId/slug are known —
    // wait for it to land (the "+ Tạo bản" CTA disappearing is the observable signal) before
    // clicking, or the click fires while `sibling` is still null.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Tạo bản/ })).not.toBeInTheDocument());
    fireEvent.click(enTab);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/dashboard/editorial/guides/art-2');
    confirmSpy.mockRestore();
  });
});

// Mục tiêu 2/A,C (2026-09-27): danh sách và các trường ảnh mở rộng (alt/attribution/licenseUrl) đã
// được backend + public renderer chấp nhận từ trước — chỉ thiếu ô nhập ở editor. Kiểm tra cả hai
// đi trọn đường tới payload gửi lên API.
describe('rich text list and extended image fields reach the save payload', () => {
  it('sends a list paragraph alongside prose paragraphs', async () => {
    create.mockResolvedValue({ id: 'new-id', contentVersion: 1, status: 'draft' });
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Bài có danh sách' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Loại khối mới' }), { target: { value: 'rich_text' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm khối' }));
    fireEvent.change(screen.getByPlaceholderText('Mỗi dòng là một đoạn văn'), { target: { value: 'Đoạn mở đầu' } });
    fireEvent.change(screen.getByPlaceholderText(/Mang giày đi bộ/), { target: { value: 'Mang giày\nMang nước' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const payload = create.mock.calls[0][0];
    expect(payload.blocks[0]).toEqual({
      blockType: 'rich_text',
      content: {
        paragraphs: [
          { type: 'p', text: 'Đoạn mở đầu' },
          { type: 'list', items: ['Mang giày', 'Mang nước'] },
        ],
      },
    });
  });

  it('saves alt for an image_with_rights block', async () => {
    create.mockResolvedValue({ id: 'new-id', contentVersion: 1, status: 'draft' });
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Bài có ảnh nguồn' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Loại khối mới' }), { target: { value: 'image_with_rights' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm khối' }));

    fireEvent.change(screen.getByPlaceholderText(/Văn bản thay thế/), { target: { value: 'Bãi biển lúc hoàng hôn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const payload = create.mock.calls[0][0];
    expect(payload.blocks[0].content).toMatchObject({ alt: 'Bãi biển lúc hoàng hôn' });
  });

  // 2026-09-27 — found live: GuideArticlesService.resolveImageBlockContent() always overwrites
  // attribution/licenseUrl from the Media row, never from the block's own content, so an editable
  // input for them here would silently discard whatever the owner typed on the next reload (a
  // "nút giả"). They belong to the moderation-approval step instead (ModerationService.decideMedia)
  // — the editor must not offer a text field that looks like it saves but never does.
  it('does not offer attribution/licenseUrl as editable inputs on an image_with_rights block', async () => {
    render(<GuideArticleEditorView id="new" />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Bài có ảnh nguồn' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Loại khối mới' }), { target: { value: 'image_with_rights' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm khối' }));

    expect(screen.queryByPlaceholderText(/Nguồn ảnh/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/giấy phép/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nguồn\/giấy phép ảnh do người duyệt xác nhận/)).toBeInTheDocument();
  });
});
