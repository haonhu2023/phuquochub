import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { LocaleDirection, LocaleRole, LocaleStatus } from '../locales.enums';

// Bảng `supported_locales` (ADR-020 §"Decision 1"). Locale set điều khiển bằng dữ liệu — thêm một
// ngôn ngữ mới là một INSERT, không phải migration (owner decision #3). PK là chính mã locale
// (BCP-47, ví dụ 'vi', 'en', 'zh-Hans') vì mã này vừa là khoá tra cứu vừa là giá trị hiển thị-ổn
// định duy nhất; không cần uuid surrogate cho một bảng cấu hình nhỏ, hiếm ghi.
@Entity('supported_locales')
@Index('idx_locale_status', ['status'])
export class SupportedLocale {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  localeCode!: string;

  @Column({ type: 'varchar', length: 100 })
  languageNameEn!: string;

  @Column({ type: 'varchar', length: 100 })
  nativeName!: string;

  @Column({ type: 'enum', enum: LocaleDirection, enumName: 'locale_direction', default: LocaleDirection.LTR })
  direction!: LocaleDirection;

  @Column({ type: 'enum', enum: LocaleRole, enumName: 'locale_role' })
  role!: LocaleRole;

  @Column({ type: 'enum', enum: LocaleStatus, enumName: 'locale_status', default: LocaleStatus.PLANNED })
  status!: LocaleStatus;

  // Đúng một locale có is_default=true, thực thi bằng partial unique index (migration) —
  // uq_locale_default. Đây là locale nguồn (owner decision #2), không phải "locale ưu tiên hiển
  // thị."
  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ type: 'boolean', default: false })
  isProductionData!: boolean;

  // Không FK object (self-referential trên PK varchar, không phải uuid places-style) — giữ tham
  // chiếu ở mức cột string, khớp migration REFERENCES supported_locales(locale_code).
  @Column({ type: 'varchar', length: 35, nullable: true })
  fallbackLocaleCode!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  effectiveFrom!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  effectiveTo!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
