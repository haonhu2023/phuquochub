import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TextFormat, TranslationMethod } from '../place-translations.enums';

// Bảng `place_translations` (ADR-020 §"Decision 2", MAP-028/029/030). Một hàng = một field/locale
// TẠI MỘT REVISION — lịch sử đầy đủ được giữ lại (không overwrite, owner decision #6); chỉ đúng một
// hàng cho mỗi (place_id, field_key, locale_code) được đánh dấu is_current=true tại một thời điểm
// (partial unique index tạo ở migration, không phải composite unique thường).
//
// Hàng có locale_code === source_locale_code là NỘI DUNG TIẾNG VIỆT GỐC (translation_method =
// 'original') — bảng này cũng là nơi lưu "bản dịch" vi, để một truy vấn duy nhất lắp ráp nội dung
// theo bất kỳ locale nào, kể cả locale nguồn, không cần case đặc biệt cho vi.
@Entity('place_translations')
@Index('idx_place_trans_revision', ['revisionId'])
export class PlaceTranslation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  // 11_TRANSLATABLE_FIELDS.field_key, ví dụ 'short_description'. Không FK — danh mục field hợp lệ
  // là dữ liệu hợp đồng (11_TRANSLATABLE_FIELDS), không phải một bảng trong schema này.
  @Column({ type: 'varchar', length: 60 })
  fieldKey!: string;

  @Column({ type: 'varchar', length: 35 })
  localeCode!: string;

  @Column({ type: 'varchar', length: 35 })
  sourceLocaleCode!: string;

  @Column({ type: 'text' })
  translatedText!: string;

  @Column({ type: 'enum', enum: TextFormat, enumName: 'text_format', default: TextFormat.PLAIN_TEXT })
  textFormat!: TextFormat;

  // sha256 hex (64 ký tự) của văn bản nguồn đã canonical-serialize — dùng để phát hiện bản dịch bị
  // "stale" khi nguồn tiếng Việt thay đổi sau khi đã dịch (canonicalJson() + sha256, cùng cơ chế
  // digest với Slice 0.5).
  @Column({ type: 'char', length: 64 })
  sourceTextHash!: string;

  @Column({ type: 'enum', enum: TranslationMethod, enumName: 'translation_method' })
  translationMethod!: TranslationMethod;

  // Từ vựng có kiểm soát của ba cột dưới đây do importer/queue-consumption job (chưa xây) định
  // nghĩa — ADR-020 cố tình để varchar(40), không enum, xem ADR "Consequences/Negative".
  @Column({ type: 'varchar', length: 40 })
  translationStatus!: string;

  @Column({ type: 'varchar', length: 40 })
  humanReviewStatus!: string;

  @Column({ type: 'varchar', length: 40 })
  qualityGate!: string;

  @Column({ type: 'uuid' })
  revisionId!: string;

  @Column({ type: 'uuid', nullable: true })
  supersedesTranslationId!: string | null;

  @Column({ type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ type: 'boolean', default: false })
  isProductionData!: boolean;

  @Column({ type: 'boolean', default: false })
  productionEligible!: boolean;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  // Chưa có bảng evidence trong schema hiện tại — giữ uuid rời, không FK, cho tới khi Slice 0.5D3
  // (evidence producer) tồn tại (ADR-020 "Consequences/Negative").
  @Column({ type: 'uuid', nullable: true })
  evidenceId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  importBatchId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
