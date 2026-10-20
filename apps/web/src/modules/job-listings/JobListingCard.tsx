import Link from 'next/link';
import type { JobListingPublicView } from './types';
import { jobListingEmploymentTypeLabel } from './types';
import { formatSalary } from './salary';
import { localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';

const POSTED_LABEL: Record<Locale, string> = { vi: 'Đăng ngày', en: 'Posted' };
const EXCERPT_MAX_CHARS = 140;

// Rút gọn mô tả cho thẻ danh sách — `description` LUÔN là projection phẳng của rich text (xem
// apps/api/src/common/rich-text-field.ts), nên không cần tự flatten richDoc ở đây. Gộp "\n" thành
// khoảng trắng (khác trang chi tiết, nơi CẦN giữ nguyên "\n" — ở mật độ danh sách, xuống dòng giữa
// câu chỉ gây ngắt dòng lộn xộn, không phải thông tin cần giữ).
function excerpt(description: string | null): string | null {
  if (!description) return null;
  const flat = description.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > EXCERPT_MAX_CHARS ? `${flat.slice(0, EXCERPT_MAX_CHARS).trimEnd()}…` : flat;
}

function formatPostedDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN');
}

export function JobListingCard({ job, locale = 'vi' }: { job: JobListingPublicView; locale?: Locale }) {
  const desc = excerpt(job.description);
  const posted = formatPostedDate(job.published_at ?? job.created_at, locale);
  return (
    <Link href={localizedHref(locale, `/jobs/${job.id}`)} className={placesStyles.card}>
      {/* job_listings không có field ảnh/logo — luôn dùng fallback chữ cái đầu, cùng cơ chế
          PlaceCard.tsx đã dùng cho mọi địa điểm chưa có cover_image_url, không phải lối riêng. */}
      <div className={placesStyles.thumbFallback} aria-hidden="true">
        <span>{job.employer_name.charAt(0)}</span>
      </div>

      <div className={placesStyles.cardBody}>
        <span className={placesStyles.cardCategory}>{job.employer_name}</span>
        <h2 className={placesStyles.cardTitle}>{job.title}</h2>
        {desc && <p className={placesStyles.cardDesc}>{desc}</p>}
        <div className={placesStyles.cardMeta}>
          <span className={placesStyles.badge}>{job.job_category}</span>
          <span className={placesStyles.badge}>{jobListingEmploymentTypeLabel(job.employment_type, locale)}</span>
          <span className={placesStyles.price}>{formatSalary(job, locale)}</span>
        </div>
        {posted && (
          <p className={placesStyles.cardDesc} style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
            {POSTED_LABEL[locale]}: {posted}
            {job.ward ? ` · ${job.ward}` : ''}
          </p>
        )}
      </div>
    </Link>
  );
}
