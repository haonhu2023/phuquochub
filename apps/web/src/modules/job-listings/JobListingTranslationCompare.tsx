interface SourceFields {
  title: string;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
}

interface TranslatedFields {
  title: string;
  description: string;
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
        {source.description && <p style={{ whiteSpace: 'pre-wrap' }}>{source.description}</p>}
        {source.requirements && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Yêu cầu:</em> {source.requirements}
          </p>
        )}
        {source.benefits && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Quyền lợi:</em> {source.benefits}
          </p>
        )}
      </div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>English (bản dịch)</p>
        <p style={{ fontWeight: 600, color: translation.title ? undefined : 'var(--muted)' }}>
          {translation.title || '(chưa có tiêu đề)'}
        </p>
        {translation.description && <p style={{ whiteSpace: 'pre-wrap' }}>{translation.description}</p>}
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
