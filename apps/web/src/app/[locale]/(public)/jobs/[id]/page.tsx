import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getJobListing } from '@/modules/job-listings/api/job-listings.api';
import { jobListingEmploymentTypeLabel } from '@/modules/job-listings/types';
import { formatSalary } from '@/modules/job-listings/salary';
import { ApiError } from '@/lib/http';
import { localizedHref, type Locale } from '@/lib/locale';
import { SaveButton } from '@/modules/saved-items/SaveButton';
import { ReportButton } from '@/modules/listing-reports/ReportButton';
import { buildJobPostingJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { RichDescriptionRenderer } from '@/modules/rich-doc/RichDescriptionRenderer';
import placesStyles from '@/modules/places/places.module.css';

interface Params {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    // Gói C (17/10/2026) — metadata PHẢI khớp đúng nội dung THỰC SỰ sẽ phục vụ (owner yêu cầu rõ:
    // "Metadata/title trang phải nhất quán với nội dung thực sự được phục vụ") — truyền `locale`
    // xuống API, KHÔNG tự dịch tiêu đề trang riêng ở đây rồi lại khác với body.
    const job = await getJobListing(id, locale);
    return {
      title: `${job.title} · ${job.employer_name} · ${locale === 'en' ? 'Jobs' : 'Tuyển dụng'} · PhuQuocHub`,
      description: job.description ?? undefined,
      alternates: { canonical: localizedHref(locale, `/jobs/${job.id}`) },
    };
  } catch {
    return { title: 'Tuyển dụng · PhuQuocHub' };
  }
}

// Chi tiết tin tuyển dụng công khai — 404 đồng nhất "không tồn tại" và "chưa/không còn công khai"
// (API cố tình không phân biệt, xem JobListingsService.getPublicById()'s comment). Không có nút
// "Ứng tuyển" gửi qua hệ thống — người tìm việc liên hệ TRỰC TIẾP qua contact_method/contact_value,
// đúng phạm vi MVP đã chốt (§13r: không xây luồng nộp hồ sơ nào cho đợt này).
export default async function JobListingDetailPage({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let job;
  try {
    job = await getJobListing(id, locale);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  // Gói C (17/10/2026) — `job.locale` là nội dung THỰC SỰ phục vụ, có thể khác locale của route
  // (owner yêu cầu rõ: "Nếu fallback VI, giao diện ghi rõ... không chỉ trả locale trong JSON rồi
  // coi như đã giải quyết"). Hai ghi chú KHÁC nhau, không gộp: (1) route /en nhưng chưa có bản dịch
  // → fallback về cột gốc (`locale:'vi'` nghĩa là "cột gốc", KHÔNG phải xác nhận cột đó thực sự viết
  // bằng tiếng Việt — hệ thống không lưu/biết ngôn ngữ gốc người đăng đã dùng, xem addendum Gói C
  // 17/10/2026 §1b). Banner CỐ Ý không nói "shown in Vietnamese" (claim không có căn cứ nếu chủ tin
  // gốc viết tiếng Anh) — chỉ nói "as originally posted". (2) có bản dịch nhưng dữ kiện gốc đã đổi
  // sau khi duyệt → vẫn hiện bản dịch cũ kèm cảnh báo, KHÔNG tự rớt về cột gốc (khác hẳn case 1).
  // Gói D điểm 4 (18/10/2026) — phân biệt THÊM một nhánh thứ ba: `job.locale==='vi'` trên route
  // `/en` không còn chỉ có nghĩa "chưa từng dịch" — có thể là "CÓ bản dịch, nhưng vừa bị ẩn vì dữ
  // kiện quan trọng (lương/ca làm/địa điểm/điều kiện giao dịch) đã đổi sau khi duyệt". Hai tình
  // huống khác nhau, cần hai thông báo khác nhau — gộp chung sẽ khiến người đọc hiểu nhầm
  // "chưa ai dịch" trong khi thực ra có bản dịch đang chờ duyệt lại.
  const showCriticalMismatchNotice = locale === 'en' && job.translation_hidden_reason === 'critical_fact_mismatch';
  const showViFallbackNotice = locale === 'en' && job.locale === 'vi' && !showCriticalMismatchNotice;
  const showStaleNotice = job.locale === 'en' && job.is_translation_stale;

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJobPostingJsonLd(job)) }} />
      {showCriticalMismatchNotice && (
        <p className={placesStyles.state} role="note">
          An English version of this listing exists but has been temporarily hidden: important details (salary, shift, location, or
          deal terms) changed after it was approved, and the translation has not been re-approved against the new facts yet. Showing
          the original Vietnamese listing below.
        </p>
      )}
      {showViFallbackNotice && (
        <p className={placesStyles.state} role="note">
          This listing has not been translated into English yet. The details below are shown exactly as originally posted by the lister (the original language is not tracked by this system).
        </p>
      )}
      {showStaleNotice && (
        <p className={placesStyles.state} role="note">
          {locale === 'en'
            ? 'This English listing may not reflect the latest details — some information was updated after translation.'
            : 'Phiên bản tiếng Anh của tin này có thể chưa phản ánh thông tin mới nhất — một số dữ kiện đã thay đổi sau khi dịch.'}
        </p>
      )}
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{job.title}</h1>
        <p className={placesStyles.pageLede}>
          {job.employer_name}
          {job.employer_role ? ` · ${job.employer_role}` : ''}
        </p>
        {/* Bug thiếu đã sửa (2026-10-11): "place tùy chọn" (mục V đợt 3) đã ghi được từ lâu nhưng
            chưa từng hiện công khai — chỉ một liên kết tham khảo, KHÔNG suy ra tin này do địa điểm
            đó đăng hay địa điểm đó xác nhận gì về tin. */}
        {job.place && (
          <p className={placesStyles.pageLede}>
            {locale === 'en' ? 'At: ' : 'Tại: '}
            <Link href={localizedHref(locale, `/places/${job.place.slug}`)}>{job.place.name}</Link>
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <SaveButton targetType="job_listing" targetId={job.id} locale={locale} />
          <ReportButton targetType="job_listing" targetId={job.id} />
        </div>
      </header>

      <dl>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Job category' : 'Ngành nghề'}</dt>
          <dd>{job.job_category}</dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Location' : 'Nơi làm việc'}</dt>
          <dd>
            {job.work_location}
            {job.ward ? ` (${job.ward})` : ''}
          </dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Employment type' : 'Hình thức'}</dt>
          <dd>{jobListingEmploymentTypeLabel(job.employment_type, locale)}</dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Salary' : 'Mức lương'}</dt>
          <dd>{formatSalary(job, locale)}</dd>
        </div>
        {job.shift_info && (
          <div className={placesStyles.infoItem}>
            <dt>{locale === 'en' ? 'Shift' : 'Ca làm việc'}</dt>
            <dd>{job.shift_info}</dd>
          </div>
        )}
        {/* Bug thiếu đã sửa (2026-10-11): job_category/expires_at đã có trong DTO/form từ trước
            (chủ tin đã nhập được qua form), nhưng chưa từng được render ở trang công khai. Backend
            đã lọc tin hết hạn khỏi danh sách công khai (xem JobListingsRepository) — nếu tin này
            đang hiện ở đây thì expires_at (nếu có) CHẮC CHẮN chưa qua, không cần nhãn "còn hạn". */}
        {job.expires_at && (
          <div className={placesStyles.infoItem}>
            <dt>{locale === 'en' ? 'Application deadline' : 'Hạn tuyển'}</dt>
            <dd>{new Date(job.expires_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')}</dd>
          </div>
        )}
      </dl>

      {job.description && (
        <section>
          <h2>{locale === 'en' ? 'Description' : 'Mô tả công việc'}</h2>
          <RichDescriptionRenderer richDoc={job.description_rich} plainFallback={job.description} />
        </section>
      )}
      {job.requirements && (
        <section>
          <h2>{locale === 'en' ? 'Requirements' : 'Yêu cầu'}</h2>
          <RichDescriptionRenderer richDoc={job.requirements_rich} plainFallback={job.requirements} />
        </section>
      )}
      {job.benefits && (
        <section>
          <h2>{locale === 'en' ? 'Benefits' : 'Quyền lợi'}</h2>
          <RichDescriptionRenderer richDoc={job.benefits_rich} plainFallback={job.benefits} />
        </section>
      )}

      <section className={placesStyles.state}>
        <p className={placesStyles.stateTitle}>{locale === 'en' ? 'Contact' : 'Liên hệ'}</p>
        <p>
          {job.contact_method}: <strong>{job.contact_value}</strong>
        </p>
      </section>
    </article>
  );
}
