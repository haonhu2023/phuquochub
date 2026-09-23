import type { Metadata } from 'next';
import Link from 'next/link';
import { listEvents, type EventSummary } from '@/modules/events/api/events.api';
import { getHomeCopy } from '@/modules/home/home.copy';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placeStyles from '@/modules/places/places.module.css';

// Không đặt canonical theo query string: cùng quy ước /attractions, /beaches, /hotels,
// /restaurants và /tours — canonical luôn trỏ về /{locale}/events.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'events');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/events'),
  };
}

const STATUS_LABEL: Record<EventSummary['time_status'], string> = {
  upcoming: 'Sắp diễn ra',
  ongoing: 'Đang diễn ra',
  ended: 'Đã kết thúc',
};

const EMPTY_COPY: Record<Locale, { title: string; body: string; browseLede: string }> = {
  vi: {
    title: 'Chưa có sự kiện nào được công khai',
    body: 'PhuQuocHub chưa xác nhận sự kiện nào sắp diễn ra. Trong lúc chờ, bạn có thể khám phá các nhóm đã có nhiều dữ liệu:',
    browseLede: 'Khám phá thay vào đó:',
  },
  en: {
    title: 'No published events yet',
    body: "PhuQuocHub hasn't confirmed any upcoming events yet. In the meantime, you can explore categories that already have real content:",
    browseLede: 'Explore instead:',
  },
};

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Server Component: danh sách sự kiện (peer entity). Lỗi API → danh sách rỗng.
 *
 * Empty state hữu ích (2026-09-17, real-data pass): production hiện có 0 sự kiện đã publish
 * (`GET /events` → `meta.total: 0`, xác nhận trực tiếp, không suy đoán) — trang này gần như CHẮC
 * CHẮN sẽ rỗng với dữ liệu hôm nay. Trước đây rỗng chỉ hiện "Chưa có sự kiện." rồi dừng — một
 * ngõ cụt thật sự. Giờ hướng thẳng sang `home.copy.ts`'s `categories` (CÙNG 5 lối vào ĐÃ XÁC NHẬN
 * có dữ liệu thật ở trang chủ — không lặp lại logic/route riêng cho trang này).
 */
export default async function EventsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let events: EventSummary[] = [];
  try {
    events = await listEvents();
  } catch {
    events = [];
  }

  const copy = getHubPageCopy(locale, 'events');
  const empty = EMPTY_COPY[locale];
  const browseCategories = getHomeCopy(locale).categories;

  return (
    <section>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>{copy.h1}</h1>
        <p className={placeStyles.pageLede}>{copy.description}</p>
      </header>

      {events.length === 0 ? (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>{empty.title}</p>
          <p>{empty.body}</p>
          <p style={{ marginTop: '1rem', fontWeight: 600 }}>{empty.browseLede}</p>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', listStyle: 'none', padding: 0 }}>
            {browseCategories.map((c) => (
              <li key={c.href}>
                <Link href={localizedHref(locale, c.href)} className={placeStyles.btn}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {events.map((e) => (
            <li key={e.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
              <Link href={localizedHref(locale, `/events/${e.slug}`)} style={{ fontWeight: 600 }}>
                {e.title}
              </Link>
              <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 14 }}>
                {new Date(e.start_at).toLocaleString('vi-VN')} · {STATUS_LABEL[e.time_status]}
                {e.event_category ? ` · ${e.event_category}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
