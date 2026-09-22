import type { GuideArticleDetail, GuideBlock as GuideBlockData } from './types';
import type { Locale } from '@/lib/locale';
import { SectionHeadingBlock } from './blocks/SectionHeadingBlock';
import { RichTextBlock } from './blocks/RichTextBlock';
import { PlaceCollectionBlock } from './blocks/PlaceCollectionBlock';
import { CalloutBlock } from './blocks/CalloutBlock';
import { FaqBlock } from './blocks/FaqBlock';
import { ImageWithRightsBlock } from './blocks/ImageWithRightsBlock';
import styles from './guide.module.css';

const UPDATED_LABEL: Record<Locale, string> = {
  vi: 'Cập nhật lần cuối',
  en: 'Last updated',
};

/**
 * Dispatches each block to its presentational component by `blockType`. No block type ever
 * renders via `dangerouslySetInnerHTML` — rich_text stores structured paragraphs, not markup, so
 * there is nothing to sanitize and nothing unsafe to inject.
 */
export function GuideArticleView({ article, locale }: { article: GuideArticleDetail; locale: Locale }) {
  return (
    <article>
      <header className={styles.hero}>
        {article.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- runtime-resolved media host, same precedent as PlaceCard.tsx
          <img
            className={styles.heroImage}
            src={article.heroImageUrl}
            alt={article.title}
            fetchPriority="high"
          />
        )}
        <h1 className={styles.title}>{article.title}</h1>
        {article.intro && <p className={styles.intro}>{article.intro}</p>}
        <p className={styles.updated}>
          {UPDATED_LABEL[locale]}: {new Date(article.updatedAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
        </p>
      </header>

      {article.blocks.map((block) => (
        <GuideBlockRenderer key={block.id} block={block} locale={locale} />
      ))}
    </article>
  );
}

function GuideBlockRenderer({ block, locale }: { block: GuideBlockData; locale: Locale }) {
  switch (block.blockType) {
    case 'section_heading':
      return <SectionHeadingBlock content={block.content as never} />;
    case 'rich_text':
      return <RichTextBlock content={block.content as never} />;
    case 'place_collection':
      return <PlaceCollectionBlock content={block.content as never} locale={locale} />;
    case 'callout':
      return <CalloutBlock content={block.content as never} />;
    case 'faq':
      return <FaqBlock content={block.content as never} />;
    case 'image_with_rights':
      return <ImageWithRightsBlock content={block.content as never} />;
    default:
      return null;
  }
}
