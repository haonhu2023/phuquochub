import { Fragment, type ReactNode } from 'react';
import type { RichTextContent, RichTextRun } from '../types';
import styles from '../guide.module.css';

// Renders STRUCTURED paragraph/run segments directly to JSX — never a markup string, never
// `dangerouslySetInnerHTML`. There is nothing to sanitize because nothing is ever stored as HTML;
// this is the literal enforcement of "không dùng HTML tự do" at the render layer. `runs` (2026-09-
// 29, H2/H3/bold/italic/blockquote) follows the same rule: it is an array of {text,bold?,italic?},
// not a markup string — this component only maps those two booleans to <strong>/<em>.
function RunsText({ runs, text }: { runs?: RichTextRun[]; text?: string }): ReactNode {
  if (runs && runs.length > 0) {
    return (
      <>
        {runs.map((r, i) => {
          let node: ReactNode = r.text;
          if (r.italic) node = <em>{node}</em>;
          if (r.bold) node = <strong>{node}</strong>;
          return <Fragment key={i}>{node}</Fragment>;
        })}
      </>
    );
  }
  // Old articles (pre-2026-09-29): every paragraph has `text`, never `runs` — falls through here.
  return <>{text}</>;
}

export function RichTextBlock({ content }: { content: RichTextContent }) {
  return (
    <>
      {content.paragraphs.map((p, i) => {
        switch (p.type) {
          case 'list':
            return (
              <ul key={i} className={styles.list}>
                {(p.items ?? []).map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case 'heading2':
            return (
              <h2 key={i} className={styles.richHeading2}>
                <RunsText runs={p.runs} text={p.text} />
              </h2>
            );
          case 'heading3':
            return (
              <h3 key={i} className={styles.richHeading3}>
                <RunsText runs={p.runs} text={p.text} />
              </h3>
            );
          case 'blockquote':
            return (
              <blockquote key={i} className={styles.blockquote}>
                <RunsText runs={p.runs} text={p.text} />
              </blockquote>
            );
          default:
            return (
              <p key={i} className={styles.paragraph}>
                <RunsText runs={p.runs} text={p.text} />
              </p>
            );
        }
      })}
    </>
  );
}
