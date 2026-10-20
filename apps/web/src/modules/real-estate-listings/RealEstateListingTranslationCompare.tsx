import type { RichDoc } from '@phuquochub/shared-types';
import { RichDescriptionRenderer } from '../rich-doc/RichDescriptionRenderer';

interface SourceFields {
  title: string;
  description: string | null;
  descriptionRich: RichDoc | null;
  utilitiesNote: string | null;
  utilitiesNoteRich: RichDoc | null;
  legalStatusNote: string | null;
  legalStatusNoteRich: RichDoc | null;
}

interface TranslatedFields {
  title: string;
  description: string;
  descriptionRich?: RichDoc | null;
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
        {source.description && <RichDescriptionRenderer richDoc={source.descriptionRich} plainFallback={source.description} />}
        {source.utilitiesNote && (
          <div>
            <em>Điện/nước/phí:</em>
            <RichDescriptionRenderer richDoc={source.utilitiesNoteRich} plainFallback={source.utilitiesNote} />
          </div>
        )}
        {source.legalStatusNote && (
          <div>
            <em>Pháp lý:</em>
            <RichDescriptionRenderer richDoc={source.legalStatusNoteRich} plainFallback={source.legalStatusNote} />
          </div>
        )}
      </div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>English (bản dịch)</p>
        <p style={{ fontWeight: 600, color: translation.title ? undefined : 'var(--muted)' }}>
          {translation.title || '(chưa có tiêu đề)'}
        </p>
        {translation.description && (
          <RichDescriptionRenderer richDoc={translation.descriptionRich ?? null} plainFallback={translation.description} />
        )}
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
