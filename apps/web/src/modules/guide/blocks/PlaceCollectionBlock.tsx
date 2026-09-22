import { getPlace } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import placeStyles from '@/modules/places/places.module.css';
import type { PlaceCollectionContent } from '../types';
import type { Locale } from '@/lib/locale';
import styles from '../guide.module.css';

/**
 * Resolves each `placeSlugs` entry via the EXISTING public `getPlace()` API — no new backend
 * surface. `Promise.allSettled` so one deleted/unpublished slug never fails the whole block.
 *
 * If every slug fails to resolve, renders `emptyStateText` instead of an empty grid.
 * The caller owns the section element and heading; this component renders grid + empty state only.
 */
export async function PlaceCollectionBlock({
  content,
  locale,
}: {
  content: PlaceCollectionContent;
  locale: Locale;
}) {
  const settled = await Promise.allSettled(
    content.placeSlugs.map((slug) => getPlace(slug, locale)),
  );
  const places = settled
    .filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getPlace>>> =>
        r.status === 'fulfilled',
    )
    .map((r) => r.value);

  if (places.length === 0) {
    return <p className={styles.emptyState}>{content.emptyStateText}</p>;
  }

  return (
    <div className={placeStyles.grid}>
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} titleAs="h3" locale={locale} />
      ))}
    </div>
  );
}
