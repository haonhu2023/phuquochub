'use client';

import { useEffect, useState } from 'react';
import { getPlace } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import placeStyles from '@/modules/places/places.module.css';
import type { PlaceCollectionContent } from '../types';
import type { Locale } from '@/lib/locale';
import styles from '../guide.module.css';

/**
 * Client-side twin of `PlaceCollectionBlock` for the editor's preview overlay. The public block is
 * an async server component, which React cannot render inside a client tree (it throws
 * "Objects are not valid as a React child (found: [object Promise])" and takes the whole editor
 * down). Same data path — `getPlace()` per slug, `allSettled`, empty-state fallback — but resolved
 * in an effect so it is safe to mount from a client component.
 */
export function PlaceCollectionPreview({ content, locale }: { content: PlaceCollectionContent; locale: Locale }) {
  const slugKey = content.placeSlugs.join('\u0000');
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getPlace>>[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const slugs = slugKey ? slugKey.split('\u0000') : [];
    void Promise.allSettled(slugs.map((slug) => getPlace(slug, locale))).then((settled) => {
      if (cancelled) return;
      setPlaces(
        settled
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getPlace>>> => r.status === 'fulfilled')
          .map((r) => r.value),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [slugKey, locale]);

  if (places === null) return null;
  if (places.length === 0) return <p className={styles.emptyState}>{content.emptyStateText}</p>;

  return (
    <div className={placeStyles.grid}>
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} titleAs="h3" locale={locale} />
      ))}
    </div>
  );
}
