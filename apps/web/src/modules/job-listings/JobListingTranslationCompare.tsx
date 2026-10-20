import type { RichDoc } from '@phuquochub/shared-types';
import { RichDescriptionRenderer } from '../rich-doc/RichDescriptionRenderer';

interface SourceFields {
  title: string;
  description: string | null;
  description_rich: RichDoc | null;
  requirements: string | null;
  requirements_rich: RichDoc | null;
  benefits: string | null;
  benefits_rich: RichDoc | null;
}

interface TranslatedFields {
  title: string;
  description: string;
  description_rich?: RichDoc | null;
  requirements: string;
  benefits: string;
}

interface Props {
  source: SourceFields;
  translation: TranslatedFields;
}

// Đối chiếu VI/EN cạnh nhau — DÙNG CHUNG cho owner (xem trước trước khi gửi duyệt,
// JobListingTranslationEditor) VÀ moderator (JobListingTranslationModerationQueueView) — một bố
// cục, không xây hai lần cho cùng một việc (owner: "theo bố cục dễ đối chiếu"). `auto-fit` +
// `minmax(260px, 1fr)` tự xếp 1 cột khi viewport hẹp (~<550px, bao gồm 375px) — không cần media
// query riêng.
export function JobListingTranslationCompare({ source, translation }: Props) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}
    >
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Tiếng Việt (đang dùng)</p>
        <p style={{ fontWeight: 600 }}>{source.title}</p>
        {source.description && <RichDescriptionRenderer richDoc={source.description_rich} plainFallback={source.description} />}
        {source.requirements && (
          <div>
            <em>Yêu cầu:</em>
            <RichDescriptionRenderer richDoc={source.requirements_rich} plainFallback={source.requirements} />
          </div>
        )}
        {source.benefits && (
          <div>
            <em>Quyền lợi:</em>
            <RichDescriptionRenderer richDoc={source.benefits_rich} plainFallback={source.benefits} />
          </div>
        )}
      </div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>English (bản dịch)</p>
        <p style={{ fontWeight: 600, color: translation.title ? undefined : 'var(--muted)' }}>
          {translation.title || '(chưa có tiêu đề)'}
        </p>
        {translation.description && (
          <RichDescriptionRenderer richDoc={translation.description_rich ?? null} plainFallback={translation.description} />
        )}
        {translation.requirements && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Requirements:</em> {translation.requirements}
          </p>
        )}
        {translation.benefits && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Benefits:</em> {translation.benefits}
          </p>
        )}
      </div>
    </div>
  );
}
