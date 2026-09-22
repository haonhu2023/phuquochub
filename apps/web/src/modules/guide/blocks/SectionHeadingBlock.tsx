import type { SectionHeadingContent } from '../types';
import styles from '../guide.module.css';

export function SectionHeadingBlock({ content }: { content: SectionHeadingContent }) {
  return <h2 className={styles.sectionHeading}>{content.text}</h2>;
}
