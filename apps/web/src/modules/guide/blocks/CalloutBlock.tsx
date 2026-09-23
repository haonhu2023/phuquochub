import type { CalloutContent } from '../types';
import styles from '../guide.module.css';

const VARIANT_CLASS: Record<CalloutContent['variant'], string> = {
  info: styles.calloutInfo,
  warning: styles.calloutWarning,
  tip: styles.calloutTip,
};

export function CalloutBlock({ content }: { content: CalloutContent }) {
  return (
    <div className={`${styles.callout} ${VARIANT_CLASS[content.variant]}`} role="note">
      <p>{content.text}</p>
    </div>
  );
}
