import Link from 'next/link';
import type { RealEstateListingPublicView } from './types';
import { realEstatePropertyTypeLabel, realEstateTransactionTypeLabel } from './types';
import { formatRealEstatePrice } from './price';
import { localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';

export function RealEstateListingCard({ listing, locale = 'vi' }: { listing: RealEstateListingPublicView; locale?: Locale }) {
  return (
    <Link href={localizedHref(locale, `/real-estate/${listing.id}`)} className={placesStyles.card}>
      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{listing.title}</h2>
        <p className={placesStyles.cardDesc}>
          {realEstatePropertyTypeLabel(listing.property_type, locale)}
          {listing.ward ? ` · ${listing.ward}` : ''}
          {listing.area_sqm != null ? ` · ${listing.area_sqm} m²` : ''}
        </p>
        <div className={placesStyles.cardMeta}>
          <span className={placesStyles.badge}>{realEstateTransactionTypeLabel(listing.transaction_type, locale)}</span>
          <span className={placesStyles.price}>{formatRealEstatePrice(listing, locale)}</span>
        </div>
      </div>
    </Link>
  );
}
