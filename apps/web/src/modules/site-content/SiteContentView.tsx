'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { ApiError } from '@/lib/http';
import { listSiteContent, upsertSiteContent } from './api/site-content.api';
import { GuideMediaPicker } from '@/modules/guide-editor/GuideMediaPicker';
import type { HomeAboutValue, HomeFeaturedValue, HomeHeroValue, SiteContentKey, SiteContentRow, SocialLinksValue } from './types';
import { GLOBAL_LOCALE } from './types';
import placeStyles from '@/modules/places/places.module.css';

type RowKey = `${SiteContentKey}:${string}`;

function rowKey(key: SiteContentKey, locale: string): RowKey {
  return `${key}:${locale}`;
}

const EMPTY_HERO: HomeHeroValue = { eyebrow: '', title: '', lede: '', heroMediaId: undefined };
const EMPTY_ABOUT: HomeAboutValue = { title: '', body: '' };
const EMPTY_FEATURED: HomeFeaturedValue = { placeSlugs: [] };
const EMPTY_SOCIAL: SocialLinksValue = { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null };

/**
 * S1 (launch-readiness pass, 2026-09-22) — trang biên tập nội dung trang chủ owner tự vận hành,
 * không cần sửa code: hero VI/EN (kèm ảnh hero), giới thiệu VI/EN, địa điểm nổi bật (chọn thủ công
 * từ địa điểm THẬT đã xuất bản — KHÔNG bịa thuật toán xếp hạng, xem DiscoverPlaces.tsx's comment;
 * đây là biên tập viên chọn tay, giống một "biên tập viên chọn" trên báo, không phải một hệ thống
 * gợi ý), và kênh liên hệ/mạng xã hội công khai (Facebook/Zalo/Instagram/WhatsApp/điện thoại).
 *
 * KHÔNG đụng `lib/site-identity.ts` (email/tên pháp lý/địa chỉ/luật áp dụng dùng cho trang Chính
 * sách bảo mật/Điều khoản/Liên hệ) — bộ trường đó bị khoá bởi `legal.spec.tsx`, một cổng chặn P0
 * ĐÃ ĐƯỢC GIẢI QUYẾT trong production (2026-08-28, xem memory `legal-trust-blocker`) với BA quyết
 * định của Owner đã ghim chắc làm mặc định trong code (address=null, không hứa mốc 30 ngày, không
 * tuyên bố đã có luật sư rà soát). `legal.spec.tsx` import `operatorContact` như một hằng số ĐỒNG
 * BỘ (không phải async) và ghim đúng các giá trị đó ở CI — biến nó thành nội dung CMS đọc lúc chạy
 * sẽ phá vỡ chính cổng chặn P0 đó. "Liên hệ/mạng xã hội" ở đây vì vậy là kênh MARKETING công khai
 * (Facebook, Zalo…), một khái niệm hoàn toàn khác khoản liên hệ pháp lý GDPR-style ở trang /contact
 * — không tồn tại ở đâu trong code trước tính năng này, nên không có bất biến CI nào để va chạm.
 *
 * Mỗi khối có content_version CAS RIÊNG (một hàng site_content) — lưu một khối không ảnh hưởng
 * khối khác, và một 409 chỉ chặn đúng khối đó (không mất dữ liệu bạn đang nhập ở các khối khác).
 */
export function SiteContentView() {
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'forbidden' | 'ready' | 'error'>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Map<RowKey, SiteContentRow>>(new Map());

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
      if (!caps.canEditSiteContent) {
        setStatus('forbidden');
        return;
      }
      setAccessToken(session.accessToken);
      void listSiteContent(session.accessToken)
        .then((list) => {
          if (cancelled) return;
          setRows(new Map(list.map((r) => [rowKey(r.key, r.locale), r])));
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function applySaved(row: SiteContentRow) {
    setRows((prev) => {
      const next = new Map(prev);
      next.set(rowKey(row.key, row.locale), row);
      return next;
    });
  }

  if (status === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải…</p>;
  if (status === 'signed-out') return <p>Bạn cần đăng nhập để xem trang này.</p>;
  if (status === 'forbidden') return <p>Bạn không có quyền biên tập nội dung website.</p>;
  if (status === 'error') return <p role="alert">Không tải được nội dung website. Vui lòng thử lại.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: 720 }}>
      <HeroSection locale="vi" row={rows.get(rowKey('home_hero', 'vi'))} accessToken={accessToken!} onSaved={applySaved} />
      <HeroSection locale="en" row={rows.get(rowKey('home_hero', 'en'))} accessToken={accessToken!} onSaved={applySaved} />
      <AboutSection locale="vi" row={rows.get(rowKey('home_about', 'vi'))} accessToken={accessToken!} onSaved={applySaved} />
      <AboutSection locale="en" row={rows.get(rowKey('home_about', 'en'))} accessToken={accessToken!} onSaved={applySaved} />
      <FeaturedSection row={rows.get(rowKey('home_featured', GLOBAL_LOCALE))} accessToken={accessToken!} onSaved={applySaved} />
      <SocialSection row={rows.get(rowKey('social_links', GLOBAL_LOCALE))} accessToken={accessToken!} onSaved={applySaved} />
    </div>
  );
}

function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isConflict) {
      return 'Nội dung này vừa được người khác lưu. Tải lại trang để lấy bản mới nhất, rồi nhập lại thay đổi của bạn.';
    }
    if (err.status === 403) return 'Bạn không có quyền sửa nội dung này.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu được. Vui lòng thử lại.';
}

function SectionShell({
  title,
  saving,
  error,
  saved,
  onSave,
  children,
}: {
  title: string;
  saving: boolean;
  error: string | null;
  saved: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <section style={{ border: '1px solid #1e293b', borderRadius: 8, padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" onClick={onSave} disabled={saving} className={placeStyles.submitBtn}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        {saved && !error && <span style={{ color: 'var(--ok, green)' }}>Đã lưu.</span>}
        {error && <span role="alert" style={{ color: 'var(--err, red)' }}>{error}</span>}
      </div>
    </section>
  );
}

function HeroSection({
  locale,
  row,
  accessToken,
  onSaved,
}: {
  locale: 'vi' | 'en';
  row: SiteContentRow | undefined;
  accessToken: string;
  onSaved: (row: SiteContentRow) => void;
}) {
  const initial = (row?.value as HomeHeroValue | undefined) ?? EMPTY_HERO;
  const [value, setValue] = useState<HomeHeroValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const savedRow = await upsertSiteContent(
        { key: 'home_hero', locale, value: value as unknown as Record<string, unknown>, expectedContentVersion: row?.contentVersion ?? 0 },
        accessToken,
      );
      onSaved(savedRow);
      setSaved(true);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title={`Hero trang chủ — ${locale === 'vi' ? 'Tiếng Việt' : 'English'}`} saving={saving} error={error} saved={saved} onSave={onSave}>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Eyebrow
        <input
          type="text"
          value={value.eyebrow}
          onChange={(e) => setValue((v) => ({ ...v, eyebrow: e.target.value }))}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Tiêu đề
        <input
          type="text"
          value={value.title}
          onChange={(e) => setValue((v) => ({ ...v, title: e.target.value }))}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Mô tả ngắn (lede)
        <textarea
          value={value.lede}
          onChange={(e) => setValue((v) => ({ ...v, lede: e.target.value }))}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <GuideMediaPicker
        mediaId={value.heroMediaId ?? ''}
        existingImageUrl={locale === 'vi' ? null : null}
        onChange={(mediaId) => setValue((v) => ({ ...v, heroMediaId: mediaId || undefined }))}
        label="Ảnh hero (tuỳ chọn)"
      />
    </SectionShell>
  );
}

function AboutSection({
  locale,
  row,
  accessToken,
  onSaved,
}: {
  locale: 'vi' | 'en';
  row: SiteContentRow | undefined;
  accessToken: string;
  onSaved: (row: SiteContentRow) => void;
}) {
  const initial = (row?.value as HomeAboutValue | undefined) ?? EMPTY_ABOUT;
  const [value, setValue] = useState<HomeAboutValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const savedRow = await upsertSiteContent(
        { key: 'home_about', locale, value: value as unknown as Record<string, unknown>, expectedContentVersion: row?.contentVersion ?? 0 },
        accessToken,
      );
      onSaved(savedRow);
      setSaved(true);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title={`Giới thiệu — ${locale === 'vi' ? 'Tiếng Việt' : 'English'}`} saving={saving} error={error} saved={saved} onSave={onSave}>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Tiêu đề
        <input
          type="text"
          value={value.title}
          onChange={(e) => setValue((v) => ({ ...v, title: e.target.value }))}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        Nội dung
        <textarea
          value={value.body}
          onChange={(e) => setValue((v) => ({ ...v, body: e.target.value }))}
          rows={4}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
    </SectionShell>
  );
}

function FeaturedSection({
  row,
  accessToken,
  onSaved,
}: {
  row: SiteContentRow | undefined;
  accessToken: string;
  onSaved: (row: SiteContentRow) => void;
}) {
  const initial = (row?.value as HomeFeaturedValue | undefined) ?? EMPTY_FEATURED;
  const [slugsText, setSlugsText] = useState(initial.placeSlugs.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const placeSlugs = slugsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      const savedRow = await upsertSiteContent(
        {
          key: 'home_featured',
          locale: GLOBAL_LOCALE,
          value: { placeSlugs },
          expectedContentVersion: row?.contentVersion ?? 0,
        },
        accessToken,
      );
      onSaved(savedRow);
      setSaved(true);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title="Địa điểm nổi bật" saving={saving} error={error} saved={saved} onSave={onSave}>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Mỗi dòng một slug địa điểm đã xuất bản (ví dụ <code>bai-sao</code>). Để trống để trang chủ tự
        hiển thị địa điểm đánh giá cao nhất như mặc định. Tối đa 12 địa điểm.
      </p>
      <textarea
        value={slugsText}
        onChange={(e) => setSlugsText(e.target.value)}
        rows={5}
        style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
      />
    </SectionShell>
  );
}

function SocialSection({
  row,
  accessToken,
  onSaved,
}: {
  row: SiteContentRow | undefined;
  accessToken: string;
  onSaved: (row: SiteContentRow) => void;
}) {
  const initial = (row?.value as SocialLinksValue | undefined) ?? EMPTY_SOCIAL;
  const [value, setValue] = useState<SocialLinksValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const savedRow = await upsertSiteContent(
        { key: 'social_links', locale: GLOBAL_LOCALE, value: value as unknown as Record<string, unknown>, expectedContentVersion: row?.contentVersion ?? 0 },
        accessToken,
      );
      onSaved(savedRow);
      setSaved(true);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ key: keyof SocialLinksValue; label: string; placeholder: string }> = [
    { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
    { key: 'zalo', label: 'Zalo', placeholder: 'https://zalo.me/…' },
    { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
    { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/…' },
    { key: 'phone', label: 'Điện thoại', placeholder: '+84…' },
  ];

  return (
    <SectionShell title="Liên hệ / mạng xã hội" saving={saving} error={error} saved={saved} onSave={onSave}>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Kênh công khai hiển thị ở chân trang — để trống một trường để ẩn kênh đó.
      </p>
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'block', marginBottom: '0.5rem' }}>
          {f.label}
          <input
            type="text"
            value={value[f.key] ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => setValue((v) => ({ ...v, [f.key]: e.target.value || null }))}
            style={{ display: 'block', width: '100%' }}
          />
        </label>
      ))}
    </SectionShell>
  );
}
