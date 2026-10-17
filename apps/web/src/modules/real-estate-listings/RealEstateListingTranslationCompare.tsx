interface SourceFields {
  title: string;
  description: string | null;
  utilitiesNote: string | null;
  legalStatusNote: string | null;
}

interface TranslatedFields {
  title: string;
  description: string;
  utilitiesNote: string;
  legalStatusNote: string;
}

interface Props {
  source: SourceFields;
  translation: TranslatedFields;
}

// Đối chiếu VI/EN cạnh nhau cho tin BĐS — field RIÊNG (title/description/utilities_note/
// legal_status_note), KHÔNG dùng chung component với JobListingTranslationCompare (owner: "Không
// sao chép máy móc schema tuyển dụng" — hai schema khác nhau thật, ép chung một component sẽ phải
// dùng field name chung chung/optional, kém rõ ràng hơn). Cùng bố cục: `auto-fit minmax(260px,1fr)`
// tự xếp 1 cột dưới ~550px, dùng CHUNG cho owner (xem trước) và moderator (hàng chờ duyệt).
export function RealEstateListingTranslationCompare({ source, translation }: Props) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}
    >
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Tiếng Việt (đang dùng)</p>
        <p style={{ fontWeight: 600 }}>{source.title}</p>
        {source.description && <p style={{ whiteSpace: 'pre-wrap' }}>{source.description}</p>}
        {source.utilitiesNote && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Điện/nước/phí:</em> {source.utilitiesNote}
          </p>
        )}
        {source.legalStatusNote && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Pháp lý:</em> {source.legalStatusNote}
          </p>
        )}
      </div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>English (bản dịch)</p>
        <p style={{ fontWeight: 600, color: translation.title ? undefined : 'var(--muted)' }}>
          {translation.title || '(chưa có tiêu đề)'}
        </p>
        {translation.description && <p style={{ whiteSpace: 'pre-wrap' }}>{translation.description}</p>}
        {translation.utilitiesNote && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Utilities:</em> {translation.utilitiesNote}
          </p>
        )}
        {translation.legalStatusNote && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <em>Legal status:</em> {translation.legalStatusNote}
          </p>
        )}
      </div>
    </div>
  );
}
