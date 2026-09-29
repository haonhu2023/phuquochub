'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { ApiError } from '@/lib/http';
import { slugify } from '@phuquochub/utils';
import {
  createGuideDraft,
  flagContentGap,
  getGuideDraft,
  listGuideDrafts,
  publishGuideArticle,
  saveGuideDraft,
  unpublishGuideArticle,
  type GuideArticleSummary,
} from './api/guide-editor.api';
import type { GuideBlockType, MediaModerationStatus } from '../guide/types';
import { GuideArticleView } from '../guide/GuideArticleView';
import { GuideMediaPicker } from './GuideMediaPicker';
import styles from './guide-editor.module.css';

const INTRO_MAX_LENGTH = 500; // SaveGuideDraftDto.intro @MaxLength(500) — nguồn thật, không tự đặt số riêng.
const SITE_URL = 'phuquochub.com';

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
  /** Trạng thái duyệt THẬT của heroMediaId (2026-09-27) — chỉ để hiển thị, không gửi lên API. */
  heroMediaStatus: MediaModerationStatus | null;
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
  rich_text: 'Đoạn văn / danh sách',
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
      // `alt` bổ sung mới (JSONB, không cần migration) để phân biệt với `caption`. `attribution`/
      // `licenseUrl` KHÔNG có ở đây dù backend/renderer chấp nhận chúng (ImageWithRightsBlock.tsx)
      // — 2026-09-27 phát hiện: GuideArticlesService.resolveImageBlockContent() luôn GHI ĐÈ hai
      // trường đó bằng giá trị trên chính dòng Media (không phải nội dung khối), nên một ô nhập ở
      // đây từng là "nút giả" — gõ gì cũng bị bỏ qua khi tải lại. Nguồn/giấy phép thật thuộc về
      // bước duyệt (Media.license_type/attribution/licenseUrl, xem ModerationService.decideMedia) —
      // đúng thiết kế: chủ bài viết không được tự xác nhận "ảnh này được cấp phép mở" mà không ai
      // kiểm chứng.
      return { mediaId: '', caption: '', alt: '' };
  }
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `block-${keySeq}`;
}

/** So sánh nội dung có ý nghĩa (bỏ qua `heroImageUrl` — chỉ để hiển thị, backend tự tính lại; bỏ
 *  qua `key`/`id` của từng khối — id client-only hoặc do server gán). Dùng để biết editor có đang
 *  "dirty" (thay đổi chưa lưu) hay không — JSON.stringify là đủ ổn định vì form luôn được dựng lại
 *  từ đầu mỗi lần set (không có tham chiếu vòng, thứ tự khoá object nhất quán trong cùng phiên). */
function comparableSnapshot(form: FormState): string {
  return JSON.stringify({
    slug: form.slug,
    locale: form.locale,
    title: form.title,
    intro: form.intro,
    heroMediaId: form.heroMediaId,
    blocks: form.blocks.map((b) => ({ blockType: b.blockType, content: b.content })),
  });
}

/**
 * Guide CMS candidate (2026-09-18; UI pass 2026-09-27) editor. `id === 'new'` creates a draft on
 * first Save; otherwise loads the existing article (any status) and edits in place. CAS-aware:
 * `expectedContentVersion` is always the value from the last successful load/save, and a 409
 * (ApiError.isConflict) on Save surfaces the same "someone else edited this — reload" message the
 * translation-review UI uses, rather than silently retrying with a guessed version.
 */
export function GuideArticleEditorView({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [canModerate, setCanModerate] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
    slug: searchParams?.get('slug') ?? '',
    locale: (searchParams?.get('locale') as 'vi' | 'en' | null) ?? 'vi',
    title: '',
    intro: '',
    heroMediaId: '',
    heroImageUrl: null,
    heroMediaStatus: null,
    blocks: [],
  });
  // Ảnh chụp lần lưu/tải thành công gần nhất — so sánh với form hiện tại để biết "dirty" (2026-09-27,
  // Mục tiêu 2/E: "Xuất bản phải dùng nội dung mới nhất đã lưu... không xuất bản phiên bản cũ khi
  // editor đang có thay đổi chưa lưu"). `null` khi chưa từng lưu/tải (bản nháp mới tinh, coi là KHÔNG
  // dirty — chưa có gì để "xuất bản phiên bản cũ" cả, nút Xuất bản còn ẩn vì chưa có articleId).
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const isDirty = savedSnapshot !== null && comparableSnapshot(form) !== savedSnapshot;

  // VI/EN: tìm bản ghi cùng slug, khác locale (Mục tiêu 2/A — "Tab VI/EN chuyển được giữa bản dịch
  // tương ứng, giữ hai bản ghi (slug, locale) hiện có"). Chỉ tra cứu sau khi ĐÃ lưu ít nhất một lần
  // (có articleId) — trước đó chưa có gì để tìm bản dịch của.
  const [siblingDrafts, setSiblingDrafts] = useState<GuideArticleSummary[] | null>(null);
  useEffect(() => {
    if (!articleId || !form.slug) return;
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    void listGuideDrafts(session.accessToken).then((list) => {
      if (!cancelled) setSiblingDrafts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [articleId, form.slug]);
  const sibling = useMemo(
    () => siblingDrafts?.find((d) => d.slug === form.slug && d.locale !== form.locale) ?? null,
    [siblingDrafts, form.slug, form.locale],
  );

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
      setCanModerate(caps.canModerate);
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
          const loaded: FormState = {
            slug: article.slug,
            locale: article.locale as 'vi' | 'en',
            title: article.title,
            intro: article.intro ?? '',
            heroMediaId: article.heroMediaId ?? '',
            heroImageUrl: article.heroImageUrl,
            heroMediaStatus: article.heroMediaStatus ?? null,
            blocks: article.blocks.map((b) => ({
              key: nextKey(),
              blockType: b.blockType,
              content: b.content as Record<string, unknown>,
              id: b.id,
            })),
          };
          setForm(loaded);
          setSavedSnapshot(comparableSnapshot(loaded));
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

  // Cảnh báo rời trang khi có thay đổi chưa lưu (Mục 4 — "Cảnh báo khi rời trang... có thay đổi
  // chưa lưu"). Trình duyệt hiện dialog gốc, không tự đặt văn bản (mọi trình duyệt hiện đại phớt lờ
  // `returnValue` tuỳ chỉnh — chỉ `preventDefault()`/set `returnValue` là đủ để kích hoạt).
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /** Chặn điều hướng nội bộ (breadcrumb, tab VI/EN) khi đang dirty — trả `true` nếu được phép đi. */
  function confirmDiscardIfDirty(): boolean {
    if (!isDirty) return true;
    return window.confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang này sẽ mất thay đổi đó. Tiếp tục?');
  }

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
        setSavedSnapshot(comparableSnapshot(form));
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
        setSavedSnapshot(comparableSnapshot(form));
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
      // Nội dung form KHÔNG bị xoá ở đây (Mục 4 — "Giữ nội dung khi API lỗi, mất mạng, 401 hoặc CAS
      // 409"): mọi nhánh lỗi ở trên chỉ set thông điệp, không đụng tới `form`.
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const session = readSession();
    if (!session || !articleId || contentVersion === null || isDirty) return;
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
        const message = err instanceof Error ? err.message : 'Xuất bản thất bại.';
        // "Cannot publish: media not published/rights-cleared: <id>" — thông điệp nghiệp vụ thật từ
        // GuideArticlesService (xem assertMediaPublishEligible). Diễn giải rõ nguyên nhân THẬT: ảnh
        // mồ côi (không gắn cơ sở) hiện KHÔNG được tạo hàng chờ kiểm duyệt nào (MediaService.register
        // chỉ tạo case khi có placeId) — nên hiện KHÔNG có đường nào, kể cả cho content_owner giữ
        // Media.Moderate, để duyệt ảnh mồ côi qua UI. Không trỏ tới /dashboard/moderation như thể nó
        // sẽ hiện case đó — sẽ không hiện. Nêu đúng giới hạn và phương án nhỏ nhất thay vì nút giả.
        if (/media not published|rights-cleared/i.test(message)) {
          setErrorMessage(
            'Không xuất bản được: ảnh vừa chọn chưa được duyệt quyền sử dụng, và ảnh cẩm nang (không gắn địa điểm) hiện CHƯA có luồng duyệt nào trong hệ thống — kể cả tài khoản có quyền kiểm duyệt cũng không thấy ảnh này trong hàng chờ. Cách xử lý nhỏ nhất bây giờ: gỡ ảnh này và dùng một ảnh đã từng được duyệt trước đó (hoặc bỏ ảnh), rồi lưu và xuất bản lại. Cần bổ sung tính năng duyệt ảnh cẩm nang mới xuất bản được ảnh mới tải.',
          );
        } else {
          setErrorMessage(message);
        }
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

  function goToLocale(targetId: string) {
    if (!confirmDiscardIfDirty()) return;
    router.push(`/dashboard/editorial/guides/${targetId}`);
  }

  function createTranslation() {
    if (!confirmDiscardIfDirty()) return;
    const otherLocale = form.locale === 'vi' ? 'en' : 'vi';
    router.push(`/dashboard/editorial/guides/new?slug=${encodeURIComponent(form.slug)}&locale=${otherLocale}`);
  }

  if (status === 'signed-out') {
    return (
      <main>
        <div className={styles.alert} role="alert">
          <p>Cần đăng nhập.</p>
          <Link href="/login" className={styles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }
  if (status === 'forbidden') {
    return (
      <main>
        <div className={styles.alert} role="alert">
          <p>Không có quyền truy cập.</p>
          <Link href="/dashboard" className={styles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }
  if (status === 'loading') return <p role="status">Đang tải…</p>;
  if (status === 'error') return <p role="alert">{errorMessage}</p>;

  const introOver = form.intro.length > INTRO_MAX_LENGTH;
  const publicUrl = form.slug ? `/${form.locale}/guide/${form.slug}` : null;
  const publishBlockedReason = !articleId
    ? 'Lưu bản nháp trước khi có thể xuất bản.'
    : isDirty
      ? 'Còn thay đổi chưa lưu — lưu bản nháp trước khi xuất bản để không xuất bản nhầm phiên bản cũ.'
      : uploadingKeys.size > 0
        ? 'Đợi ảnh tải xong trước khi xuất bản.'
        : null;

  return (
    <main className={styles.page}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: '0.5rem' }}>
        <Link
          href="/dashboard/editorial/guides"
          onClick={(e) => {
            if (!confirmDiscardIfDirty()) e.preventDefault();
          }}
        >
          Biên tập cẩm nang
        </Link>
        <span style={{ margin: '0 0.4rem', color: 'var(--muted)' }}>/</span>
        <span aria-current="page">{isNew ? 'Cẩm nang mới' : form.title || '…'}</span>
      </nav>

      <div className={styles.header}>
        <h1 className={styles.title}>{isNew ? 'Cẩm nang mới' : form.title || 'Sửa cẩm nang'}</h1>
        {articleId && (
          <div className={styles.localeTabs} role="tablist" aria-label="Ngôn ngữ bản dịch">
            <button
              type="button"
              role="tab"
              aria-selected={form.locale === 'vi'}
              className={`${styles.localeTab} ${form.locale === 'vi' ? styles.localeTabActive : ''}`}
              disabled={form.locale === 'vi'}
              onClick={() => sibling && form.locale !== 'vi' && goToLocale(sibling.id)}
            >
              VI{form.locale !== 'vi' && !sibling && siblingDrafts !== null ? ' (chưa có)' : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={form.locale === 'en'}
              className={`${styles.localeTab} ${form.locale === 'en' ? styles.localeTabActive : ''}`}
              disabled={form.locale === 'en'}
              onClick={() => sibling && form.locale !== 'en' && goToLocale(sibling.id)}
            >
              EN{form.locale !== 'en' && !sibling && siblingDrafts !== null ? ' (chưa có)' : ''}
            </button>
            {siblingDrafts !== null && !sibling && (
              <button type="button" className={`${styles.localeTab} ${styles.localeTabMissing}`} onClick={createTranslation}>
                + Tạo bản {form.locale === 'vi' ? 'EN' : 'VI'}
              </button>
            )}
          </div>
        )}
      </div>

      {conflict && (
        <div className={styles.alert} role="alert">
          <p style={{ fontWeight: 600, margin: 0 }}>Có người khác vừa sửa cẩm nang này</p>
          <p style={{ margin: '0.25rem 0 0' }}>Tải lại trang để lấy bản mới nhất trước khi lưu tiếp.</p>
        </div>
      )}
      {errorMessage && (
        <div className={styles.alert} role="alert">
          <p style={{ margin: 0 }}>{errorMessage}</p>
          {errorDetails && (
            <ul className={styles.alertList}>
              {errorDetails.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.statusRow}>
        <span
          className={`${styles.statusBadge} ${
            saving
              ? styles.statusSaving
              : errorMessage
                ? styles.statusError
                : isDirty
                  ? styles.statusDirty
                  : articleStatus === 'published'
                    ? styles.statusPublished
                    : styles.statusDraft
          }`}
        >
          {saving
            ? 'Đang lưu…'
            : errorMessage
              ? 'Lỗi'
              : isDirty
                ? 'Chưa lưu'
                : !articleId
                  ? 'Chưa lưu'
                  : articleStatus === 'published'
                    ? 'Đã công khai'
                    : 'Đã lưu — bản nháp'}
        </span>
        {contentVersion !== null && <span>content_version={contentVersion}</span>}
      </div>

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <div className={styles.panel}>
            <p className={styles.panelTitle}>Nội dung chính</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tiêu đề</span>
              <input
                type="text"
                className={styles.titleInput}
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
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Slug
                {isNew && <span className={styles.fieldHint}>bắt buộc — tự gợi ý từ tiêu đề, có thể sửa trước khi lưu lần đầu</span>}
              </span>
              <input
                type="text"
                className={styles.input}
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                disabled={!isNew && !!articleId}
                required
              />
              {publicUrl && (
                <p className={styles.urlPreview}>
                  URL công khai dự kiến: <strong>{SITE_URL}{publicUrl}</strong>
                </p>
              )}
            </label>
            {isNew && (
              // Chỉ hiện khi tạo mới — sau khi đã lưu, locale bất biến (như slug) và được thay bằng
              // tab VI/EN ở trên (chuyển SANG bản dịch đã có, không đổi locale của chính bản này).
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Ngôn ngữ</span>
                <select className={styles.select} style={{ width: 'auto' }} value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value as 'vi' | 'en' }))}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Giới thiệu ngắn (tóm tắt — hiển thị riêng với nội dung bài)
                <span className={`${styles.charCount} ${introOver ? styles.charCountOver : ''}`}>
                  {form.intro.length}/{INTRO_MAX_LENGTH}
                </span>
              </span>
              <textarea
                className={styles.textarea}
                value={form.intro}
                onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
                rows={2}
              />
              {introOver && <p className={styles.fieldHint}>Vượt giới hạn {INTRO_MAX_LENGTH} ký tự — lưu sẽ bị từ chối, không tự cắt bớt.</p>}
            </label>
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Các khối nội dung bài viết</p>
            {flagGapNotice && (
              <p role="status" style={{ color: 'var(--ok)', marginBottom: '0.5rem' }}>
                {flagGapNotice}
              </p>
            )}
            {flagGapError && (
              <p role="alert" style={{ color: 'var(--err)', marginBottom: '0.5rem' }}>
                {flagGapError}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
            </div>
            <AddBlockPicker onAdd={addBlock} />
          </div>
        </div>

        <div className={styles.sideCol}>
          <div className={`${styles.panel} ${styles.actionsPanel}`}>
            <p className={styles.panelTitle}>Xuất bản</p>
            <div className={styles.actionsRow}>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || uploadingKeys.size > 0}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {saving ? 'Đang lưu…' : 'Lưu bản nháp'}
              </button>
              <button type="button" className={styles.btn} onClick={() => setPreviewOpen(true)} disabled={!form.title}>
                Xem trước
              </button>
            </div>
            <div className={styles.actionsRow}>
              {articleId && articleStatus === 'draft' && (
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={saving || uploadingKeys.size > 0 || isDirty}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Xuất bản
                </button>
              )}
              {articleId && articleStatus === 'published' && (
                <>
                  <Link href={publicUrl ?? '#'} className={styles.btn} target="_blank">
                    Xem trang công khai →
                  </Link>
                  <button type="button" onClick={() => void handleUnpublish()} disabled={saving} className={`${styles.btn} ${styles.btnDanger}`}>
                    Gỡ công khai
                  </button>
                </>
              )}
            </div>
            {publishBlockedReason && articleStatus !== 'published' && <p className={styles.blockReason}>{publishBlockedReason}</p>}
            {uploadingKeys.size > 0 && (
              <p className={styles.blockReason} role="status">
                Đang tải {uploadingKeys.size > 1 ? `${uploadingKeys.size} ảnh` : 'ảnh'} lên…
              </p>
            )}
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Ảnh đại diện (hero)</p>
            <GuideMediaPicker
              label="Ảnh đại diện (hero)"
              mediaId={form.heroMediaId}
              existingImageUrl={form.heroImageUrl}
              mediaStatus={form.heroMediaStatus}
              onChange={(id) => setForm((f) => ({ ...f, heroMediaId: id, heroImageUrl: null, heroMediaStatus: null }))}
              onUploadingChange={(u) => setPickerUploading('hero', u)}
            />
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Xem trước kết quả tìm kiếm</p>
            <SerpPreview title={form.title} intro={form.intro} slug={form.slug} locale={form.locale} />
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label="Xem trước cẩm nang">
          <div className={styles.previewSheet}>
            <div className={styles.previewBar}>
              <span className={styles.previewBarLabel}>Xem trước — dùng bản chưa lưu, chưa xuất bản, không ai khác thấy được</span>
              <button type="button" className={styles.btn} onClick={() => setPreviewOpen(false)}>
                Đóng
              </button>
            </div>
            <div className={styles.previewBody}>
              <GuideArticleView
                article={{
                  id: articleId ?? 'preview',
                  slug: form.slug,
                  locale: form.locale,
                  title: form.title || '(chưa có tiêu đề)',
                  intro: form.intro || null,
                  heroMediaId: form.heroMediaId || null,
                  heroImageUrl: form.heroImageUrl,
                  status: articleStatus ?? 'draft',
                  contentVersion: contentVersion ?? 0,
                  updatedAt: new Date().toISOString(),
                  publishedAt: null,
                  blocks: form.blocks.map((b, i) => ({
                    id: b.id ?? b.key,
                    position: i,
                    blockType: b.blockType,
                    content: b.content,
                    needsDecision: false,
                    decisionNote: null,
                  })),
                }}
                locale={form.locale}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SerpPreview({ title, intro, slug, locale }: { title: string; intro: string; slug: string; locale: 'vi' | 'en' }) {
  const displayTitle = title ? `${title} · PhuQuocHub` : 'PhuQuocHub';
  const displayDesc = intro || '(chưa có giới thiệu ngắn — Google sẽ tự chọn đoạn trích từ nội dung bài)';
  return (
    <div>
      <div className={styles.serpPreview}>
        <p className={styles.serpUrl}>
          {SITE_URL} › {locale} › guide › {slug || '…'}
        </p>
        <p className={styles.serpTitle}>{displayTitle}</p>
        <p className={styles.serpDesc}>{displayDesc}</p>
      </div>
      <p className={styles.serpNote}>Minh hoạ gần đúng — không đảm bảo giống hệt cách Google hiển thị thật.</p>
    </div>
  );
}

function AddBlockPicker({ onAdd }: { onAdd: (t: GuideBlockType) => void }) {
  const [choice, setChoice] = useState<GuideBlockType>('section_heading');
  return (
    <div className={styles.addBlockRow} style={{ marginTop: '0.85rem' }}>
      <select
        aria-label="Loại khối mới"
        className={styles.select}
        style={{ width: 'auto' }}
        value={choice}
        onChange={(e) => setChoice(e.target.value as GuideBlockType)}
      >
        {(Object.keys(BLOCK_LABEL) as GuideBlockType[]).map((t) => (
          <option key={t} value={t}>
            {BLOCK_LABEL[t]}
          </option>
        ))}
      </select>
      <button type="button" className={styles.btn} onClick={() => onAdd(choice)}>
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
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>
          #{index + 1} — {BLOCK_LABEL[block.blockType]}
        </span>
        <span className={styles.blockTools}>
          <button type="button" className={styles.iconBtn} onClick={() => onMove(-1)} disabled={index === 0} aria-label="Di chuyển lên">
            ↑
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Di chuyển xuống">
            ↓
          </button>
          {onFlagGap && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setFlagFormOpen((v) => !v)}
              title="Đánh dấu thiếu fact"
              aria-expanded={flagFormOpen}
            >
              🚩
            </button>
          )}
          <button type="button" className={styles.iconBtn} onClick={onRemove} aria-label="Xoá khối">
            ✕
          </button>
        </span>
      </div>
      {/* G7 (2026-09-22) — form nội tuyến thay window.prompt: mô tả fact còn thiếu, gửi vào Owner
          Decision Queue. Trạng thái gửi/thành công/lỗi hiện ở component cha (dùng chung cho mọi
          block, tránh một banner riêng lặp lại cho từng khối). */}
      {flagFormOpen && onFlagGap && (
        <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface-2)', borderRadius: 6 }}>
          <label htmlFor={`flag-note-${block.key}`} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
            Mô tả fact còn thiếu / cần xác nhận
          </label>
          <textarea
            id={`flag-note-${block.key}`}
            className={styles.textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ marginBottom: '0.4rem' }}
            disabled={flagging}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className={styles.btn} onClick={submitFlag} disabled={flagging || !note.trim()}>
              {flagging ? 'Đang gửi…' : 'Gửi'}
            </button>
            <button type="button" className={styles.btn} onClick={() => setFlagFormOpen(false)} disabled={flagging}>
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
          className={styles.input}
          placeholder="Tiêu đề mục"
          value={(c.text as string) ?? ''}
          onChange={(e) => onPatch({ text: e.target.value })}
        />
      );
    case 'rich_text': {
      // Khối này lưu MỘT mảng `paragraphs` dùng chung cho cả đoạn văn (type:'p') và danh sách
      // (type:'list') — public renderer (RichTextBlock.tsx) đã hỗ trợ CẢ HAI từ trước, chỉ chưa có
      // ô nhập cho danh sách ở editor. Giữ thứ tự đơn giản: mọi đoạn văn trước, một khối danh sách
      // (nếu có) ở cuối — không phải trình soạn thảo tự do xen kẽ nhiều danh sách, nhưng dùng đúng
      // contract sẵn có, không cần đổi schema/validation/renderer.
      const paragraphs = (c.paragraphs as Array<{ type?: string; text?: string; items?: string[] }>) ?? [];
      const proseText = paragraphs.filter((p) => p.type !== 'list').map((p) => p.text ?? '').join('\n');
      const listBlock = paragraphs.find((p) => p.type === 'list');
      const listText = (listBlock?.items ?? []).join('\n');

      function rebuild(nextProse: string, nextList: string) {
        const proseParas = nextProse
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => ({ type: 'p', text: line }));
        const items = nextList.split('\n').filter((line) => line.trim() !== '');
        onPatch({ paragraphs: items.length > 0 ? [...proseParas, { type: 'list', items }] : proseParas });
      }

      return (
        <>
          <textarea
            className={styles.textarea}
            placeholder="Mỗi dòng là một đoạn văn"
            value={proseText}
            onChange={(e) => rebuild(e.target.value, listText)}
            rows={4}
          />
          <p className={styles.subLabel}>Danh sách (tuỳ chọn — mỗi dòng một mục, hiển thị dạng gạch đầu dòng)</p>
          <textarea
            className={styles.textarea}
            placeholder={'Ví dụ:\nMang giày đi bộ\nMang kem chống nắng'}
            value={listText}
            onChange={(e) => rebuild(proseText, e.target.value)}
            rows={3}
          />
        </>
      );
    }
    case 'place_collection':
      return (
        <>
          <input
            type="text"
            className={styles.input}
            placeholder="Tiêu đề nhóm (vd: Ở đâu)"
            value={(c.heading as string) ?? ''}
            onChange={(e) => onPatch({ heading: e.target.value })}
            style={{ marginBottom: '0.4rem' }}
          />
          <textarea
            className={styles.textarea}
            placeholder="Mỗi dòng một slug địa điểm đã published"
            value={((c.placeSlugs as string[]) ?? []).join('\n')}
            onChange={(e) => onPatch({ placeSlugs: e.target.value.split('\n').filter((s) => s.trim() !== '') })}
            rows={3}
            style={{ marginBottom: '0.4rem' }}
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Thông báo khi không có địa điểm nào"
            value={(c.emptyStateText as string) ?? ''}
            onChange={(e) => onPatch({ emptyStateText: e.target.value })}
          />
        </>
      );
    case 'callout':
      return (
        <>
          <select
            className={styles.select}
            style={{ width: 'auto', marginBottom: '0.4rem' }}
            value={(c.variant as string) ?? 'info'}
            onChange={(e) => onPatch({ variant: e.target.value })}
          >
            <option value="info">Thông tin</option>
            <option value="warning">Cảnh báo</option>
            <option value="tip">Mẹo</option>
          </select>
          <textarea
            className={styles.textarea}
            placeholder="Nội dung lưu ý"
            value={(c.text as string) ?? ''}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={2}
          />
        </>
      );
    case 'faq': {
      const items = (c.items as Array<{ question: string; answer: string }>) ?? [];
      const text = items.map((it) => `${it.question}::${it.answer}`).join('\n');
      return (
        <textarea
          className={styles.textarea}
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
            mediaStatus={(c.mediaStatus as MediaModerationStatus | null) ?? null}
            onChange={(id) => onPatch({ mediaId: id })}
            onUploadingChange={onUploadingChange}
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Chú thích ảnh hiển thị công khai (tuỳ chọn)"
            value={(c.caption as string) ?? ''}
            onChange={(e) => onPatch({ caption: e.target.value })}
            style={{ marginTop: '0.4rem' }}
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Văn bản thay thế (alt) — mô tả ảnh cho người dùng screen reader"
            value={(c.alt as string) ?? ''}
            onChange={(e) => onPatch({ alt: e.target.value })}
            style={{ marginTop: '0.4rem' }}
          />
          {(c.attribution || c.licenseUrl) && (
            <p className={styles.fieldHint} style={{ marginTop: '0.4rem' }}>
              Nguồn: {(c.attribution as string) || '—'}
              {c.licenseUrl ? (
                <>
                  {' · '}
                  <a href={c.licenseUrl as string} target="_blank" rel="noopener noreferrer">
                    Giấy phép
                  </a>
                </>
              ) : null}
            </p>
          )}
          <p className={styles.fieldHint} style={{ marginTop: '0.4rem' }}>
            Nguồn/giấy phép ảnh do người duyệt xác nhận khi duyệt ảnh, không tự nhập ở đây.
          </p>
        </>
      );
  }
}
