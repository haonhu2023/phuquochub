import { ImageResponse } from 'next/og';
import { getHomeCopy } from '@/modules/home/home.copy';
import type { Locale } from '@/lib/locale';

// Phase 24 (OG/social) — ảnh chia sẻ mạng xã hội DỰNG SERVER-SIDE, không dùng ảnh chụp có bản
// quyền nào. Next.js tự nhận diện quy ước file `opengraph-image.tsx` trong route segment và tự
// gắn `og:image`/`twitter:image` cho MỌI trang dùng chung layout này — không cần khai `openGraph.
// images` thủ công ở `generateMetadata`. Ảnh nhận đúng `params.locale` như một route thật nên
// tiêu đề trên ảnh khớp locale đang chia sẻ, không hiển thị tiếng Việt cho một liên kết `/en`.
export const alt = 'PhuQuocHub';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function OpengraphImage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHomeCopy(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0b1120',
          backgroundImage:
            'radial-gradient(circle at 15% 15%, rgba(251,146,60,0.35), transparent 55%), radial-gradient(circle at 85% 85%, rgba(56,189,248,0.35), transparent 55%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: '#38bdf8',
            }}
          />
          <span style={{ color: '#38bdf8', fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
            PhuQuocHub
          </span>
        </div>
        <div style={{ display: 'flex', color: '#e2e8f0', fontSize: 62, fontWeight: 800, lineHeight: 1.15, maxWidth: 980 }}>
          {copy.title}
        </div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: 30, marginTop: 24, maxWidth: 900 }}>
          {copy.lede}
        </div>
      </div>
    ),
    { ...size },
  );
}
