import type { FaqContent } from '../types';
import styles from '../guide.module.css';

// Native <details>/<summary> — zero client JS for the toggle interaction, matching the "ít JS"
// performance requirement.
export function FaqBlock({ content }: { content: FaqContent }) {
  return (
    <div>
      {content.items.map((item, i) => (
        <details key={i} className={styles.faqItem}>
          <summary>{item.question}</summary>
          <p className={styles.faqAnswer}>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
