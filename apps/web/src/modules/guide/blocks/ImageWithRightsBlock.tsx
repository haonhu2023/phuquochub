import type { ImageWithRightsContent } from '../types';
import styles from '../guide.module.css';

// Plain <img>, not next/image: same reason PlaceCard.tsx uses one (see its own eslint-disable
// comment) — the media host is resolved at runtime per environment (MediaUrlService.fileUrl()),
// and next/image's remotePatterns needs a fixed hostname known at build time. lazy-loading is
// still real via the native `loading="lazy"` attribute.
//
// `attribution`/`licenseUrl` are ALWAYS rendered when present — this is the literal mechanism that
// makes "không sao chép ảnh Klook" true by construction: every image on this page carries visible,
// checkable provenance, never an uncredited lift.
export function ImageWithRightsBlock({ content }: { content: ImageWithRightsContent }) {
  if (!content.imageUrl) return null;
  return (
    <figure className={styles.imageBlock}>
      {/* eslint-disable-next-line @next/next/no-img-element -- runtime-resolved external media host, same precedent as PlaceCard.tsx */}
      <img src={content.imageUrl} alt={content.caption ?? ''} loading="lazy" />
      {(content.caption || content.attribution) && (
        <figcaption className={styles.imageCaption}>
          {content.caption}
          {content.caption && content.attribution ? ' — ' : ''}
          {content.attribution &&
            (content.licenseUrl ? (
              <a href={content.licenseUrl} target="_blank" rel="noopener noreferrer">
                {content.attribution}
              </a>
            ) : (
              content.attribution
            ))}
        </figcaption>
      )}
    </figure>
  );
}
