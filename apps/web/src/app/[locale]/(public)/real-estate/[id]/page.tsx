import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRealEstateListing } from '@/modules/real-estate-listings/api/real-estate-listings.api';
import {
  REAL_ESTATE_FURNITURE_STATUS_LABELS,
  realEstatePosterRoleLabel,
  realEstatePropertyTypeLabel,
  realEstateTransactionTypeLabel,
} from '@/modules/real-estate-listings/types';
import { formatRealEstatePrice } from '@/modules/real-estate-listings/price';
import { ApiError } from '@/lib/http';
import type { Locale } from '@/lib/locale';
import { buildRouteAlternates, NOINDEX_FOLLOW } from '@/lib/seo';
import { SaveButton } from '@/modules/saved-items/SaveButton';
import { ReportButton } from '@/modules/listing-reports/ReportButton';
import { RealEstateListingPhotoGallery } from '@/modules/real-estate-listing-photos/RealEstateListingPhotoGallery';
import { buildRealEstateListingJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { RichDescriptionRenderer } from '@/modules/rich-doc/RichDescriptionRenderer';
import placesStyles from '@/modules/places/places.module.css';

interface Params {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    // Gói C (17/10/2026) — truyền `locale` để metadata khớp đúng nội dung thực sự phục vụ (cùng
    // lý do jobs/[id]/page.tsx — xem ghi chú ở đó).
    const listing = await getRealEstateListing(id, locale);
    // Rà SEO 20/10/2026, sửa lại cho ĐÚNG + ĐỦ — cùng lý do jobs/[id]/page.tsx (xem ghi chú đầy đủ ở đó).
    const enEligible =
      locale === 'en' ? listing.locale === 'en' : await getRealEstateListing(id, 'en').then((r) => r.locale === 'en').catch(() => false);
    const { canonical, languages: fullLanguages } = buildRouteAlternates(locale, `/real-estate/${listing.id}`);
    const languages = enEligible ? fullLanguages : { vi: fullLanguages.vi, 'x-default': fullLanguages.vi };
    return {
      title: `${listing.title} · ${locale === 'en' ? 'Real Estate' : 'Bất động sản'} · PhuQuocHub`,
      description: listing.description ?? undefined,
      alternates: { canonical, languages },
      ...(locale === 'en' && !enEligible ? { robots: NOINDEX_FOLLOW } : {}),
    };
  } catch {
    return { title: 'Bất động sản · PhuQuocHub' };
  }
}

// Chi tiết tin bất động sản công khai. KHÔNG có nút "Liên hệ qua hệ thống" — người xem liên hệ
// TRỰC TIẾP qua contact_method/contact_value, đúng phạm vi MVP (§13u, không thu cọc/trung gian
// thanh toán/hợp đồng điện tử). address_text/lat/lng chỉ có trong response khi address_precision
// ='exact' (API tự ẩn — xem real-estate-listings.mapper.ts — trang này chỉ hiển thị những gì nhận
// được, không tự suy luận hay yêu cầu thêm).
export default async function RealEstateListingDetailPage({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let listing;
  try {
    listing = await getRealEstateListing(id, locale);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  // Gói C (17/10/2026) — cùng lý do jobs/[id]/page.tsx (xem ghi chú đầy đủ ở đó): `listing.locale`
  // là nội dung THỰC SỰ phục vụ, có thể khác locale của route.
  // Gói D điểm 4 (18/10/2026) — cùng nhánh thứ ba jobs/[id]/page.tsx vừa thêm: `locale==='vi'` trên
  // route `/en` có thể là "có bản dịch nhưng vừa bị ẩn vì dữ kiện quan trọng đã đổi", không chỉ
  // "chưa từng dịch" — hai thông báo khác nhau, không gộp.
  const showCriticalMismatchNotice = locale === 'en' && listing.translation_hidden_reason === 'critical_fact_mismatch';
  const showViFallbackNotice = locale === 'en' && listing.locale === 'vi' && !showCriticalMismatchNotice;
  const showStaleNotice = listing.locale === 'en' && listing.is_translation_stale;

  const t = {
    location: locale === 'en' ? 'Location' : 'Khu vực',
    propertyType: locale === 'en' ? 'Property type' : 'Loại hình',
    transactionType: locale === 'en' ? 'Transaction' : 'Giao dịch',
    price: locale === 'en' ? 'Price' : 'Giá',
    area: locale === 'en' ? 'Area' : 'Diện tích',
    postedBy: locale === 'en' ? 'Posted by' : 'Người đăng',
    deposit: locale === 'en' ? 'Deposit' : 'Tiền cọc',
    utilities: locale === 'en' ? 'Utilities' : 'Điện/nước/phí',
    furniture: locale === 'en' ? 'Furniture' : 'Nội thất',
    moveIn: locale === 'en' ? 'Move-in date' : 'Ngày vào ở',
    leaseTerm: locale === 'en' ? 'Lease term' : 'Thời hạn thuê',
    legalStatus: locale === 'en' ? 'Legal status (as declared by poster)' : 'Tình trạng pháp lý (do người đăng khai)',
    description: locale === 'en' ? 'Description' : 'Mô tả',
    contact: locale === 'en' ? 'Contact' : 'Liên hệ',
    address: locale === 'en' ? 'Address' : 'Địa chỉ',
    months: locale === 'en' ? 'months' : 'tháng',
    postedOn: locale === 'en' ? 'Posted on' : 'Đăng ngày',
    updatedOn: locale === 'en' ? 'Updated on' : 'Cập nhật',
    deadline: locale === 'en' ? 'Available until' : 'Hạn đăng',
  };
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale);
  // Bug thiếu đã sửa (2026-10-11): ngày đăng/cập nhật/hết hạn đã có trong response từ trước
  // (created_at/updated_at/published_at/expires_at) nhưng chưa từng render ở trang công khai.
  // `deal_status` KHÔNG render ở đây — endpoint này CHỈ trả tin `dealStatus=available` (xem
  // RealEstateListingsRepository.publicQuery()), nên giá trị đó luôn hằng định trên trang này,
  // không mang thêm thông tin nào cho người xem (khác hẳn job_category/expires_at, vốn thay đổi
  // theo từng tin).
  const postedAt = listing.published_at ?? listing.created_at;
  const updatedDiffersFromPosted = listing.updated_at !== postedAt;

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildRealEstateListingJsonLd(listing)) }}
      />
      {showCriticalMismatchNotice && (
        <p className={placesStyles.state} role="note">
          An English version of this listing exists but has been temporarily hidden: important details (location, price, or
          deal terms) changed after it was approved, and the translation has not been re-approved against the new facts yet.
          Showing the original Vietnamese listing below.
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
        <h1 className={placesStyles.pageTitle}>{listing.title}</h1>
        <p className={placesStyles.pageLede}>
          {realEstateTransactionTypeLabel(listing.transaction_type, locale)} ·{' '}
          {realEstatePropertyTypeLabel(listing.property_type, locale)}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <SaveButton targetType="real_estate_listing" targetId={listing.id} locale={locale} />
          <ReportButton targetType="real_estate_listing" targetId={listing.id} />
        </div>
      </header>

      <RealEstateListingPhotoGallery listingId={listing.id} />

      <dl>
        <div className={placesStyles.infoItem}>
          <dt>{t.location}</dt>
          <dd>
            {listing.ward ?? (locale === 'en' ? 'Not specified' : 'Chưa rõ')}
            {listing.address_text ? ` — ${listing.address_text}` : ''}
          </dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{t.price}</dt>
          <dd>{formatRealEstatePrice(listing, locale)}</dd>
        </div>
        {listing.area_sqm != null && (
          <div className={placesStyles.infoItem}>
            <dt>{t.area}</dt>
            <dd>{listing.area_sqm} m²</dd>
          </div>
        )}
        <div className={placesStyles.infoItem}>
          <dt>{t.postedBy}</dt>
          <dd>{realEstatePosterRoleLabel(listing.poster_role, locale)}</dd>
        </div>

        {listing.transaction_type === 'rent' && (
          <>
            {listing.deposit_amount != null && (
              <div className={placesStyles.infoItem}>
                <dt>{t.deposit}</dt>
                <dd>
                  {listing.deposit_amount.toLocaleString('vi-VN')} {listing.price_currency ?? ''}
                </dd>
              </div>
            )}
            {listing.utilities_note && (
              <div className={placesStyles.infoItem}>
                <dt>{t.utilities}</dt>
                <dd>
                  <RichDescriptionRenderer richDoc={listing.utilities_note_rich} plainFallback={listing.utilities_note} />
                </dd>
              </div>
            )}
            {listing.furniture_status && (
              <div className={placesStyles.infoItem}>
                <dt>{t.furniture}</dt>
                <dd>{REAL_ESTATE_FURNITURE_STATUS_LABELS[listing.furniture_status]}</dd>
              </div>
            )}
            {listing.move_in_date && (
              <div className={placesStyles.infoItem}>
                <dt>{t.moveIn}</dt>
                <dd>{listing.move_in_date}</dd>
              </div>
            )}
            {listing.lease_term_months != null && (
              <div className={placesStyles.infoItem}>
                <dt>{t.leaseTerm}</dt>
                <dd>
                  {listing.lease_term_months} {t.months}
                </dd>
              </div>
            )}
          </>
        )}

        {listing.transaction_type === 'sale' && listing.legal_status_note && (
          <div className={placesStyles.infoItem}>
            <dt>{t.legalStatus}</dt>
            <dd>
              <RichDescriptionRenderer richDoc={listing.legal_status_note_rich} plainFallback={listing.legal_status_note} />
            </dd>
          </div>
        )}

        <div className={placesStyles.infoItem}>
          <dt>{t.postedOn}</dt>
          <dd>{formatDate(postedAt)}</dd>
        </div>
        {updatedDiffersFromPosted && (
          <div className={placesStyles.infoItem}>
            <dt>{t.updatedOn}</dt>
            <dd>{formatDate(listing.updated_at)}</dd>
          </div>
        )}
        {listing.expires_at && (
          <div className={placesStyles.infoItem}>
            <dt>{t.deadline}</dt>
            <dd>{formatDate(listing.expires_at)}</dd>
          </div>
        )}
      </dl>

      {listing.description && (
        <section>
          <h2>{t.description}</h2>
          <RichDescriptionRenderer richDoc={listing.description_rich} plainFallback={listing.description} />
        </section>
      )}

      <section className={placesStyles.state}>
        <p className={placesStyles.stateTitle}>{t.contact}</p>
        <p>
          {listing.contact_method}: <strong>{listing.contact_value}</strong>
        </p>
      </section>
    </article>
  );
}
