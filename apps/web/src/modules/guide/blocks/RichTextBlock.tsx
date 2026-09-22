import type { RichTextContent } from '../types';
import styles from '../guide.module.css';

// Renders STRUCTURED paragraph/list segments directly to JSX — never a markup string, never
// `dangerouslySetInnerHTML`. There is nothing to sanitize because nothing is ever stored as HTML;
// this is the literal enforcement of "không dùng HTML tự do" at the render layer.
export function RichTextBlock({ content }: { content: RichTextContent }) {
  return (
    <>
      {content.paragraphs.map((p, i) =>
        p.type === 'list' ? (
          <ul key={i} className={styles.list}>
            {(p.items ?? []).map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={styles.paragraph}>
            {p.text}
          </p>
        ),
      )}
    </>
  );
}
