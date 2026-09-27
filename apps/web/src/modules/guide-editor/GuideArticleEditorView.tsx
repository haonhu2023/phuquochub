'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { ApiError } from '@/lib/http';
import { slugify } from '@phuquochub/utils';
import {
  createGuideDraft,
  flagContentGap,
  getGuideDraft,
  publishGuideArticle,
  saveGuideDraft,
  unpublishGuideArticle,
} from './api/guide-editor.api';
import type { GuideBlockType } from '../guide/types';
import { GuideMediaPicker } from './GuideMediaPicker';
import placeStyles from '@/modules/places/places.module.css';

interface EditableBlock {
  key: string; // client-only React key, not sent to the API
  blockType: GuideBlockType;
  content: Record<string, unknown>;
  id?: string; // present once the article has been saved at least once
}

interface FormState {
  slug: string;
  locale: 'vi' | 'en';
  title: string;
  intro: string;
  heroMediaId: string;
  /** Chỉ để hiển thị xem trước (G-C) — KHÔNG gửi lên API, backend tự tính lại từ heroMediaId. */
  heroImageUrl: string | null;
  blocks: EditableBlock[];
}

// Nhãn tiếng Việt cho các trường của SaveGuideDraftDto/UpdateGuideDraftDto — dùng để "dịch" thông
// điệp lỗi field-level từ ApiError.details (xem describeValidationError bên dưới) thành "Trường
// nào sai", không chỉ hiện chuỗi chung "Dữ liệu không hợp lệ" (AllExceptionsFilter luôn thay message
// gốc bằng chuỗi đó cho VALIDATION_ERROR — chi tiết thật nằm ở details, trước đây bị bỏ qua).
const FIELD_LABEL: Record<string, string> = {
  slug: 'Slug (đường dẫn URL)',
  locale: 'Ngôn ngữ',
  title: 'Tiêu đề',
  intro: 'Giới thiệu ngắn',
  heroMediaId: 'Ảnh đại diện',
  blocks: 'Các khối nội dung',
};

/**
 * class-validator luôn đặt tên trường ở đầu thông điệp — dạng thường gặp là "<field> ..." (vd.
 * "slug must be longer than or equal to 1 characters") hoặc, với forbidNonWhitelisted, "property
 * <field> should not exist". Trích tên trường để gắn nhãn tiếng Việt; nếu không nhận ra trường nào
 * (constraint lạ), hiện nguyên văn thông điệp gốc — không bao giờ nuốt mất thông tin.
 */
function describeValidationError(message: string): string {
  const whitelistMatch = message.match(/^property (\w+) /);
  const field = whitelistMatch ? whitelistMatch[1] : message.split(' ')[0];
  const label = field ? FIELD_LABEL[field] : undefined;
  return label ? `${label}: ${message}` : message;
}

const BLOCK_LABEL: Record<GuideBlockType, string> = {
  section_heading: 'Tiêu đề mục',
  rich_text: 'Đoạn văn',
  place_collection: 'Nhóm địa điểm',
  callout: 'Lưu ý (callout)',
  faq: 'Câu hỏi thường gặp',
  image_with_rights: 'Ảnh có nguồn',
};

function emptyContentFor(blockType: GuideBlockType): Record<string, unknown> {
  switch (blockType) {
    case 'section_heading':
      return { text: '' };
    case 'rich_text':
      return { paragraphs: [] };
    case 'place_collection':
      return { heading: '', placeSlugs: [], emptyStateText: 'Chưa có địa điểm phù hợp.' };
    case 'callout':
      return { variant: 'info', text: '' };
    case 'faq':
      return { items: [] };
    case 'image_with_rights':
      return { mediaId: '', caption: '' };
  }
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `block-${keySeq}`;
}

/**
 * Guide CMS candidate (2026-09-18) editor. `id === 'new'` creates a draft on first Save; otherwise
 * loads the existing article (any status) and edits in place. CAS-aware: `expectedContentVersion`
 * is always the value from the last successful load/save, and a 409 (ApiError.isConflict) on Save
 * surfaces the same "someone else edited this — reload" message the translation-review UI uses,
 * rather than silently retrying with a guessed version.
 */
export function GuideArticleEditorView({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === 'new';

  const [status, setStatus] = useState<'loading' | 'signed-out' | 'forbidden' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(isNew ? null : id);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [articleStatus, setArticleStatus] = useState<'draft' | 'published' | null>(null);
  const [flaggingBlockId, setFlaggingBlockId] = useState<string | null>(null);
  const [flagGapError, setFlagGapError] = useState<string | null>(null);
  const [flagGapNotice, setFlagGapNotice] = useState<string | null>(null);
  // Theo dõi xem chủ bài viết đã tự gõ vào ô Slug chưa — chỉ auto-gợi ý slug từ Tiêu đề TRƯỚC lần
  // gõ tay đầu tiên (Mục tiêu 2/A: "gợi ý slug từ tiêu đề nhưng cho sửa trước lần lưu đầu"). Sau khi
  // đã lưu (articleId tồn tại), slug bị khoá (`disabled` ở input bên dưới) nên biến này hết tác dụng.
  const [slugTouched, setSlugTouched] = useState(false);
  // Khoá thao tác Lưu trong lúc BẤT KỲ ảnh nào (hero hoặc trong một khối image_with_rights) còn
  // đang tải lên (2026-09-27) — trước đây bấm Lưu giữa lúc tải xong ngay lập tức mà không đợi
  // upload xong sẽ lưu THIẾU mediaId mới, không có lỗi nào báo cho chủ bài viết biết ("thành công
  // giả"). Một Set, không phải boolean đơn: nhiều picker (hero + mỗi khối ảnh) có thể tải song song.
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  function setPickerUploading(key: string, uploading: boolean) {
    setUploadingKeys((prev) => {
      if (uploading === prev.has(key)) return prev;
      const next = new Set(prev);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  const [form, setForm] = useState<FormState>({
    slug: '',
    locale: 'vi',
    title: '',
    intro: '',
    heroMediaId: '',
    heroImageUrl: null,
    blocks: [],
  });

  useEffect(() => {
    const session = readSession();
    let cancelled = false;

    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setStatus('signed-out');
      });
      return () => {
        cancelled = true;
      };
    }

    void fetchCapabilities(session.accessToken).then((caps) => {
      if (cancelled) return;
      if (!caps.canEditGuides) {
        setStatus('forbidden');
        return;
      }
      if (isNew) {
        setStatus('ready');
        return;
      }
      void getGuideDraft(id, session.accessToken)
        .then((article) => {
          if (cancelled) return;
          setArticleId(article.id);
          setContentVersion(article.contentVersion);
          setArticleStatus(article.status);
          setSlugTouched(true);
          setForm({
            slug: article.slug,
            locale: article.locale as 'vi' | 'en',
            title: article.title,
            intro: article.intro ?? '',
            heroMediaId: article.heroMediaId ?? '',
            heroImageUrl: article.heroImageUrl,
            blocks: article.blocks.map((b) => ({
              key: nextKey(),
              blockType: b.blockType,
              content: b.content as Record<string, unknown>,
              id: b.id,
            })),
          });
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) {
            setErrorMessage('Không tải được cẩm nang này.');
            setStatus('error');
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id/isNew are route params, stable per mount
  }, []);

  function addBlock(blockType: GuideBlockType) {
    setForm((f) => ({ ...f, blocks: [...f.blocks, { key: nextKey(), blockType, content: emptyContentFor(blockType) }] }));
  }

  function removeBlock(index: number) {
    setForm((f) => ({ ...f, blocks: f.blocks.filter((_, i) => i !== index) }));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setForm((f) => {
      const target = index + dir;
      if (target < 0 || target >= f.blocks.length) return f;
      const blocks = [...f.blocks];
      [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
      return { ...f, blocks };
    });
  }

  function patchBlockContent(index: number, patch: Record<string, unknown>) {
    setForm((f) => {
      const blocks = [...f.blocks];
      blocks[index] = { ...blocks[index]!, content: { ...blocks[index]!.content, ...patch } };
      return { ...f, blocks };
    });
  }

  async function handleSave() {
    const session = readSession();
    if (!session) return;
    if (uploadingKeys.size > 0) {
      setErrorMessage('Còn ảnh đang tải lên — đợi tải xong rồi lưu lại để không bị thiếu ảnh.');
      setErrorDetails(null);
      return;
    }
    setSaving(true);
    setConflict(false);
    setErrorMessage(null);
    setErrorDetails(null);

    const payload = {
      slug: form.slug,
      locale: form.locale,
      title: form.title,
      intro: form.intro || undefined,
      heroMediaId: form.heroMediaId || undefined,
      blocks: form.blocks.map((b) => ({ blockType: b.blockType, content: b.content })),
    };
    // Chốt TRƯỚC lúc gọi API — articleId có thể vừa được set trong chính lần gọi này (createDraft
    // thành công), nên đọc lại trong catch sẽ luôn thấy "đã có id", che mất việc request đang xét
    // là create hay update.
    const isCreate = !articleId;

    try {
      if (isCreate) {
        const created = await createGuideDraft(payload, session.accessToken);
        setArticleId(created.id);
        setContentVersion(created.contentVersion);
        setArticleStatus(created.status);
        router.replace(`/dashboard/editorial/guides/${created.id}`);
      } else {
        // slug/locale are immutable after creation — the PATCH DTO no longer accepts them
        // (fixed 2026-09-22: it used to require+silently-drop them). Only send what can change.
        const saved = await saveGuideDraft(
          articleId,
          {
            title: payload.title,
            intro: payload.intro,
            heroMediaId: payload.heroMediaId,
            blocks: payload.blocks,
            expectedContentVersion: contentVersion!,
          },
          session.accessToken,
        );
        setContentVersion(saved.contentVersion);
        setArticleStatus(saved.status);
      }
    } catch (err) {
      if (isCreate && err instanceof ApiError && err.isConflict) {
        // createDraft's 409 means "slug đã tồn tại" (guide_articles UNIQUE(slug, locale)) — KHÔNG
        // phải CAS content-version conflict (draft mới chưa từng có contentVersion nào để lệch).
        // Bảng "Có người khác vừa sửa..." + "Tải lại trang" bên dưới SAI hoàn toàn ở đây: tải lại
        // chỉ xoá sạch form, không đổi được việc slug đã bị dùng.
        setErrorMessage('Slug này đã được dùng cho một cẩm nang khác cùng ngôn ngữ. Đổi sang slug khác rồi lưu lại.');
      } else if (err instanceof ApiError && err.isConflict) {
        setConflict(true);
      } else if (err instanceof ApiError && err.details) {
        // VALIDATION_ERROR: err.message is always the generic "Dữ liệu không hợp lệ"
        // (AllExceptionsFilter) — the real per-field reason lives in err.details.
        setErrorMessage(err.message);
        setErrorDetails(err.details.map((d) => describeValidationError(d.message)));
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Lưu thất bại.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const session = readSession();
    if (!session || !articleId || contentVersion === null) return;
    setSaving(true);
    setConflict(false);
    setErrorMessage(null);
    setErrorDetails(null);
    try {
      const published = await publishGuideArticle(articleId, contentVersion, session.accessToken);
      setContentVersion(published.contentVersion);
      setArticleStatus(published.status);
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setConflict(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Xuất bản thất bại.');
      }
    } finally {
      setSaving(false);
    }
  }

  // G-B (2026-09-22) — đối xứng handlePublish.
  async function handleUnpublish() {
    const session = readSession();
    if (!session || !articleId || contentVersion === null) return;
    if (!window.confirm('Gỡ công khai bài viết này? Trang công khai sẽ không còn hiển thị bài này cho tới khi bạn xuất bản lại.')) return;
    setSaving(true);
    setConflict(false);
    setErrorMessage(null);
    setErrorDetails(null);
    try {
      const unpublished = await unpublishGuideArticle(articleId, contentVersion, session.accessToken);
      setContentVersion(unpublished.contentVersion);
      setArticleStatus(unpublished.status);
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setConflict(true);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gỡ công khai thất bại.');
      }
    } finally {
      setSaving(false);
    }
  }

  // G7 (2026-09-22) — thay window.prompt/window.alert bằng form nội tuyến + trạng thái thật
  // (đang gửi/thành công/lỗi), cùng khuôn mọi thao tác ghi khác trong component này (handlePublish/
  // handleUnpublish đều setErrorMessage thay vì alert()).
  async function handleFlagGap(blockId: string, note: string) {
    const session = readSession();
    if (!session || !articleId) return;
    setFlaggingBlockId(blockId);
    setFlagGapError(null);
    setFlagGapNotice(null);
    try {
      await flagContentGap(articleId, blockId, note, session.accessToken);
      setFlagGapNotice('Đã gửi vào hàng chờ quyết định của owner.');
    } catch (err) {
      setFlagGapError(err instanceof Error ? err.message : 'Gửi thất bại.');
    } finally {
      setFlaggingBlockId(null);
    }
  }

  if (status === 'signed-out') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <Link href="/login" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }
  if (status === 'forbidden') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }
  if (status === 'loading') return <p role="status">Đang tải…</p>;
  if (status === 'error') return <p role="alert">{errorMessage}</p>;

  return (
    <main>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard/editorial/guides">Biên tập cẩm nang</Link>
        <span className={placeStyles.sep}>/</span>
        <span aria-current="page">{isNew ? 'Cẩm nang mới' : form.title || '…'}</span>
      </nav>

      {conflict && (
        <div className={placeStyles.state} role="alert" style={{ marginBottom: '1rem' }}>
          <p className={placeStyles.stateTitle}>Có người khác vừa sửa cẩm nang này</p>
          <p>Tải lại trang để lấy bản mới nhất trước khi lưu tiếp.</p>
        </div>
      )}
      {errorMessage && (
        <div role="alert" style={{ color: 'crimson', marginBottom: errorDetails ? '0.25rem' : undefined }}>
          <p>{errorMessage}</p>
          {errorDetails && (
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
              {errorDetails.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {articleStatus && (
        <p style={{ marginBottom: '1rem' }}>
          Trạng thái: <strong>{articleStatus === 'published' ? 'Đã xuất bản' : 'Bản nháp'}</strong>
          {contentVersion !== null ? ` (content_version=${contentVersion})` : ''}
        </p>
      )}

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend>Thông tin bài viết</legend>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Tiêu đề
          <input
            type="text"
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              setForm((f) => ({
                ...f,
                title,
                // Gợi ý slug từ tiêu đề CHỈ khi đang tạo mới và chủ bài viết chưa tự gõ slug —
                // gõ tay vào ô Slug (bên dưới) tắt hẳn auto-gợi ý, không bao giờ ghi đè lựa chọn
                // của người dùng.
                slug: isNew && !slugTouched ? slugify(title) : f.slug,
              }));
            }}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Slug {isNew && <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>(bắt buộc — tự gợi ý từ tiêu đề, có thể sửa trước khi lưu lần đầu)</span>}
          <input
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm((f) => ({ ...f, slug: e.target.value }));
            }}
            disabled={!isNew && !!articleId}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Ngôn ngữ
          <select
            value={form.locale}
            onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value as 'vi' | 'en' }))}
            disabled={!isNew && !!articleId}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Giới thiệu ngắn
          <textarea
            value={form.intro}
            onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <GuideMediaPicker
          label="Ảnh đại diện (hero)"
          mediaId={form.heroMediaId}
          existingImageUrl={form.heroImageUrl}
          onChange={(id) => setForm((f) => ({ ...f, heroMediaId: id, heroImageUrl: null }))}
          onUploadingChange={(u) => setPickerUploading('hero', u)}
        />
      </fieldset>

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend>Các khối nội dung</legend>
        {flagGapNotice && (
          <p role="status" style={{ color: 'var(--ok, green)', marginBottom: '0.5rem' }}>
            {flagGapNotice}
          </p>
        )}
        {flagGapError && (
          <p role="alert" style={{ color: 'var(--err, red)', marginBottom: '0.5rem' }}>
            {flagGapError}
          </p>
        )}
        {form.blocks.map((block, i) => (
          <BlockEditorRow
            key={block.key}
            block={block}
            index={i}
            total={form.blocks.length}
            onPatch={(patch) => patchBlockContent(i, patch)}
            onRemove={() => removeBlock(i)}
            onMove={(dir) => moveBlock(i, dir)}
            onFlagGap={block.id ? (note) => void handleFlagGap(block.id!, note) : undefined}
            flagging={flaggingBlockId === block.id}
            onUploadingChange={(u) => setPickerUploading(block.key, u)}
          />
        ))}

        <AddBlockPicker onAdd={addBlock} />
      </fieldset>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="button" onClick={() => void handleSave()} disabled={saving || uploadingKeys.size > 0} className={placeStyles.btn}>
          {saving ? 'Đang lưu…' : 'Lưu bản nháp'}
        </button>
        {articleId && articleStatus === 'draft' && (
          <button type="button" onClick={() => void handlePublish()} disabled={saving || uploadingKeys.size > 0} className={placeStyles.btn}>
            Xuất bản
          </button>
        )}
        {articleId && articleStatus === 'published' && (
          <>
            <Link href={`/${form.locale}/guide/${form.slug}`} className={placeStyles.btn} target="_blank">
              Xem trang công khai →
            </Link>
            <button type="button" onClick={() => void handleUnpublish()} disabled={saving} className={placeStyles.btn}>
              Gỡ công khai
            </button>
          </>
        )}
        {uploadingKeys.size > 0 && (
          <span role="status" style={{ color: 'var(--muted)' }}>
            Đang tải {uploadingKeys.size > 1 ? `${uploadingKeys.size} ảnh` : 'ảnh'} lên…
          </span>
        )}
      </div>
    </main>
  );
}

function AddBlockPicker({ onAdd }: { onAdd: (t: GuideBlockType) => void }) {
  const [choice, setChoice] = useState<GuideBlockType>('section_heading');
  return (
    <div style={{ marginTop: '1rem' }}>
      <select value={choice} onChange={(e) => setChoice(e.target.value as GuideBlockType)}>
        {(Object.keys(BLOCK_LABEL) as GuideBlockType[]).map((t) => (
          <option key={t} value={t}>
            {BLOCK_LABEL[t]}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd(choice)} style={{ marginLeft: '0.5rem' }}>
        + Thêm khối
      </button>
    </div>
  );
}

function BlockEditorRow({
  block,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
  onFlagGap,
  flagging,
  onUploadingChange,
}: {
  block: EditableBlock;
  index: number;
  total: number;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** `undefined` khi block chưa có id thật (chưa lưu lần nào) — nút 🚩 tự ẩn trong trường hợp đó. */
  onFlagGap?: (note: string) => void;
  flagging: boolean;
  /** Chỉ dùng cho khối `image_with_rights` — xem GuideMediaPicker's onUploadingChange. */
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [flagFormOpen, setFlagFormOpen] = useState(false);
  const [note, setNote] = useState('');

  function submitFlag() {
    if (!note.trim() || !onFlagGap) return;
    onFlagGap(note.trim());
    setFlagFormOpen(false);
    setNote('');
  }

  return (
    <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong>
          #{index + 1} — {BLOCK_LABEL[block.blockType]}
        </strong>
        <span style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Di chuyển lên">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Di chuyển xuống">
            ↓
          </button>
          {onFlagGap && (
            <button
              type="button"
              onClick={() => setFlagFormOpen((v) => !v)}
              title="Đánh dấu thiếu fact"
              aria-expanded={flagFormOpen}
            >
              🚩
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label="Xoá khối">
            ✕
          </button>
        </span>
      </div>
      {/* G7 (2026-09-22) — form nội tuyến thay window.prompt: mô tả fact còn thiếu, gửi vào Owner
          Decision Queue. Trạng thái gửi/thành công/lỗi hiện ở component cha (dùng chung cho mọi
          block, tránh một banner riêng lặp lại cho từng khối). */}
      {flagFormOpen && onFlagGap && (
        <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface-2, #f3f4f6)', borderRadius: 6 }}>
          <label htmlFor={`flag-note-${block.key}`} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
            Mô tả fact còn thiếu / cần xác nhận
          </label>
          <textarea
            id={`flag-note-${block.key}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ width: '100%', marginBottom: '0.4rem' }}
            disabled={flagging}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={submitFlag} disabled={flagging || !note.trim()}>
              {flagging ? 'Đang gửi…' : 'Gửi'}
            </button>
            <button type="button" onClick={() => setFlagFormOpen(false)} disabled={flagging}>
              Huỷ
            </button>
          </div>
        </div>
      )}
      <BlockContentFields block={block} onPatch={onPatch} onUploadingChange={onUploadingChange} />
    </div>
  );
}

function BlockContentFields({
  block,
  onPatch,
  onUploadingChange,
}: {
  block: EditableBlock;
  onPatch: (patch: Record<string, unknown>) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const c = block.content;
  switch (block.blockType) {
    case 'section_heading':
      return (
        <input
          type="text"
          placeholder="Tiêu đề mục"
          value={(c.text as string) ?? ''}
          onChange={(e) => onPatch({ text: e.target.value })}
          style={{ width: '100%' }}
        />
      );
    case 'rich_text': {
      const paragraphs = (c.paragraphs as Array<{ text?: string }>) ?? [];
      const text = paragraphs.map((p) => p.text ?? '').join('\n');
      return (
        <textarea
          placeholder="Mỗi dòng là một đoạn văn"
          value={text}
          onChange={(e) =>
            onPatch({
              paragraphs: e.target.value
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line) => ({ type: 'p', text: line })),
            })
          }
          rows={4}
          style={{ width: '100%' }}
        />
      );
    }
    case 'place_collection':
      return (
        <>
          <input
            type="text"
            placeholder="Tiêu đề nhóm (vd: Ở đâu)"
            value={(c.heading as string) ?? ''}
            onChange={(e) => onPatch({ heading: e.target.value })}
            style={{ width: '100%', marginBottom: '0.4rem' }}
          />
          <textarea
            placeholder="Mỗi dòng một slug địa điểm đã published"
            value={((c.placeSlugs as string[]) ?? []).join('\n')}
            onChange={(e) => onPatch({ placeSlugs: e.target.value.split('\n').filter((s) => s.trim() !== '') })}
            rows={3}
            style={{ width: '100%', marginBottom: '0.4rem' }}
          />
          <input
            type="text"
            placeholder="Thông báo khi không có địa điểm nào"
            value={(c.emptyStateText as string) ?? ''}
            onChange={(e) => onPatch({ emptyStateText: e.target.value })}
            style={{ width: '100%' }}
          />
        </>
      );
    case 'callout':
      return (
        <>
          <select
            value={(c.variant as string) ?? 'info'}
            onChange={(e) => onPatch({ variant: e.target.value })}
            style={{ marginBottom: '0.4rem' }}
          >
            <option value="info">Thông tin</option>
            <option value="warning">Cảnh báo</option>
            <option value="tip">Mẹo</option>
          </select>
          <textarea
            placeholder="Nội dung lưu ý"
            value={(c.text as string) ?? ''}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={2}
            style={{ width: '100%' }}
          />
        </>
      );
    case 'faq': {
      const items = (c.items as Array<{ question: string; answer: string }>) ?? [];
      const text = items.map((it) => `${it.question}::${it.answer}`).join('\n');
      return (
        <textarea
          placeholder={'Mỗi dòng: Câu hỏi::Câu trả lời'}
          value={text}
          onChange={(e) =>
            onPatch({
              items: e.target.value
                .split('\n')
                .filter((line) => line.includes('::'))
                .map((line) => {
                  const [question, ...rest] = line.split('::');
                  return { question: question!.trim(), answer: rest.join('::').trim() };
                }),
            })
          }
          rows={4}
          style={{ width: '100%' }}
        />
      );
    }
    case 'image_with_rights':
      return (
        <>
          <GuideMediaPicker
            label="Ảnh"
            mediaId={(c.mediaId as string) ?? ''}
            existingImageUrl={(c.imageUrl as string) ?? null}
            onChange={(id) => onPatch({ mediaId: id })}
            onUploadingChange={onUploadingChange}
          />
          <input
            type="text"
            placeholder="Chú thích ảnh (tuỳ chọn)"
            value={(c.caption as string) ?? ''}
            onChange={(e) => onPatch({ caption: e.target.value })}
            style={{ width: '100%', marginTop: '0.4rem' }}
          />
        </>
      );
  }
}
