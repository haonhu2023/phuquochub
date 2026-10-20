import { RealEstateListingTranslation } from './entities/real-estate-listing-translation.entity';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { isRealEstateListingTranslationStale, type RealEstateListingTranslationSourceRow } from './real-estate-listing-translation-hash';
import { serveRichDoc } from '../../common/rich-text-field';

// Cùng khuôn job-listing-translations.mapper.ts (xem ghi chú đầy đủ ở đó) — một view duy nhất,
// has_published/is_published_stale/is_stale phân biệt rõ "có bản dịch đã duyệt" khỏi "bản dịch
// khớp phiên bản hiện tại".
export function toRealEstateListingTranslationView(row: RealEstateListingTranslation, parent?: RealEstateListingTranslationSourceRow) {
  const hasPublished = row.publishedTitle != null;
  return {
    id: row.id,
    real_estate_listing_id: row.realEstateListingId,
    locale: row.locale,
    title: row.title,
    description: row.description,
    // Gói D — `serveRichDoc()` chỉ trả rich khi hash còn khớp bản plain NHÁP hiện tại (cơ chế đóng
    // rủi ro rollback, xem apps/api/src/common/rich-text-field.ts). View này LUÔN là vùng NHÁP.
    description_rich: serveRichDoc(row.description, row.descriptionRich, row.descriptionRichHash),
    utilities_note: row.utilitiesNote,
    legal_status_note: row.legalStatusNote,
    status: row.status,
    review_note: row.reviewNote,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    has_published: hasPublished,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    content_version: row.contentVersion,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    is_stale: parent ? isRealEstateListingTranslationStale(row.sourceContentHash, parent) : null,
    is_published_stale:
      parent && hasPublished && row.publishedSourceContentHash
        ? isRealEstateListingTranslationStale(row.publishedSourceContentHash, parent)
        : null,
  };
}

export function toRealEstateListingTranslationModeratorView(
  row: RealEstateListingTranslation,
  parent: RealEstateListingTranslationSourceRow &
    Pick<RealEstateListing, 'descriptionRich' | 'descriptionRichHash' | 'utilitiesNoteRich' | 'utilitiesNoteRichHash' | 'legalStatusNoteRich' | 'legalStatusNoteRichHash'> & {
      title: string;
    },
) {
  return {
    ...toRealEstateListingTranslationView(row, parent),
    source_title: parent.title,
    source_description: parent.description,
    source_description_rich: serveRichDoc(parent.description, parent.descriptionRich, parent.descriptionRichHash),
    source_utilities_note: parent.utilitiesNote,
    source_utilities_note_rich: serveRichDoc(parent.utilitiesNote, parent.utilitiesNoteRich, parent.utilitiesNoteRichHash),
    source_legal_status_note: parent.legalStatusNote,
    source_legal_status_note_rich: serveRichDoc(parent.legalStatusNote, parent.legalStatusNoteRich, parent.legalStatusNoteRichHash),
  };
}
