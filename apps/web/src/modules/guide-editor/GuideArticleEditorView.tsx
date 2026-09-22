'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { ApiError } from '@/lib/http';
import {
  createGuideDraft,
  flagContentGap,
  getGuideDraft,
  publishGuideArticle,
  saveGuideDraft,
} from './api/guide-editor.api';
import type { GuideBlockType } from '../guide/types';
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
  blocks: EditableBlock[];
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
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(isNew ? null : id);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [articleStatus, setArticleStatus] = useState<'draft' | 'published' | null>(null);
  const [form, setForm] = useState<FormState>({
    slug: '',
    locale: 'vi',
    title: '',
    intro: '',
    heroMediaId: '',
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
          setForm({
            slug: article.slug,
            locale: article.locale as 'vi' | 'en',
            title: article.title,
            intro: article.intro ?? '',
            heroMediaId: article.heroMediaId ?? '',
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
    setSaving(true);
    setConflict(false);
    setErrorMessage(null);

    const payload = {
      slug: form.slug,
      locale: form.locale,
      title: form.title,
      intro: form.intro || undefined,
      heroMediaId: form.heroMediaId || undefined,
      blocks: form.blocks.map((b) => ({ blockType: b.blockType, content: b.content })),
    };

    try {
      if (!articleId) {
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
      if (err instanceof ApiError && err.isConflict) {
        setConflict(true);
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

  async function handleFlagGap(blockId: string | undefined) {
    const session = readSession();
    if (!session || !articleId || !blockId) return;
    const note = window.prompt('Mô tả fact còn thiếu / cần xác nhận:');
    if (!note) return;
    await flagContentGap(articleId, blockId, note, session.accessToken);
    window.alert('Đã gửi vào Owner Decision Queue.');
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
        <p role="alert" style={{ color: 'crimson' }}>
          {errorMessage}
        </p>
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
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Slug
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            disabled={!isNew && !!articleId}
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
        <label style={{ display: 'block' }}>
          Hero media ID (UUID, phải là ảnh đã published + có quyền)
          <input
            type="text"
            value={form.heroMediaId}
            onChange={(e) => setForm((f) => ({ ...f, heroMediaId: e.target.value }))}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: '1.5rem' }}>
        <legend>Các khối nội dung</legend>
        {form.blocks.map((block, i) => (
          <BlockEditorRow
            key={block.key}
            block={block}
            index={i}
            total={form.blocks.length}
            onPatch={(patch) => patchBlockContent(i, patch)}
            onRemove={() => removeBlock(i)}
            onMove={(dir) => moveBlock(i, dir)}
            onFlagGap={() => void handleFlagGap(block.id)}
          />
        ))}

        <AddBlockPicker onAdd={addBlock} />
      </fieldset>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={() => void handleSave()} disabled={saving} className={placeStyles.btn}>
          {saving ? 'Đang lưu…' : 'Lưu bản nháp'}
        </button>
        {articleId && articleStatus === 'draft' && (
          <button type="button" onClick={() => void handlePublish()} disabled={saving} className={placeStyles.btn}>
            Xuất bản
          </button>
        )}
        {articleId && articleStatus === 'published' && (
          <Link href={`/${form.locale}/guide/${form.slug}`} className={placeStyles.btn} target="_blank">
            Xem trang công khai →
          </Link>
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
}: {
  block: EditableBlock;
  index: number;
  total: number;
  onPatch: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onFlagGap: () => void;
}) {
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
          {block.id && (
            <button type="button" onClick={onFlagGap} title="Đánh dấu thiếu fact">
              🚩
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label="Xoá khối">
            ✕
          </button>
        </span>
      </div>
      <BlockContentFields block={block} onPatch={onPatch} />
    </div>
  );
}

function BlockContentFields({ block, onPatch }: { block: EditableBlock; onPatch: (patch: Record<string, unknown>) => void }) {
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
          <input
            type="text"
            placeholder="Media ID (UUID, phải published + có quyền)"
            value={(c.mediaId as string) ?? ''}
            onChange={(e) => onPatch({ mediaId: e.target.value })}
            style={{ width: '100%', marginBottom: '0.4rem' }}
          />
          <input
            type="text"
            placeholder="Chú thích ảnh (tuỳ chọn)"
            value={(c.caption as string) ?? ''}
            onChange={(e) => onPatch({ caption: e.target.value })}
            style={{ width: '100%' }}
          />
        </>
      );
  }
}
