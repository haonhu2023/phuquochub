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
import { localizedHref, type Locale } from '@/lib/locale';
import { SaveButton } from '@/modules/saved-items/SaveButton';
import { ReportButton } from '@/modules/listing-reports/ReportButton';
import placesStyles from '@/modules/places/places.module.css';

interface Params {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    const listing = await getRealEstateListing(id);
    return {
      title: `${listing.title} · Bất động sản · PhuQuocHub`,
      description: listing.description ?? undefined,
      alternates: { canonical: localizedHref(locale, `/real-estate/${listing.id}`) },
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
    listing = await getRealEstateListing(id);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

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
  };

  return (
    <article>
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
                <dd>{listing.utilities_note}</dd>
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
            <dd>{listing.legal_status_note}</dd>
          </div>
        )}
      </dl>

      {listing.description && (
        <section>
          <h2>{t.description}</h2>
          <p>{listing.description}</p>
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
