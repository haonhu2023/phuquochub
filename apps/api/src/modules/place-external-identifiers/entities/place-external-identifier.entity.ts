import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PlaceExternalIdentifierProvider } from '../place-external-identifiers.enums';

// Bảng `place_external_identifiers` (2026-09-02 data-SSOT remediation, Phase 5). Google Place ID —
// và bất kỳ provider identifier nào khác sau này — KHÔNG BAO GIỜ là khóa chính của `places`: danh
// tính của một place trong CSDL này là `places.id`; một provider identifier là metadata bên ngoài,
// có thể đổi/thu hồi/gán lại mà không đụng khóa chính đó. `(provider, external_id)` UNIQUE ở
// migration là ràng buộc thật sự biến đây thành sổ đăng ký danh tính, không phải nhãn tự do.
@Entity('place_external_identifiers')
@Index('idx_place_ext_id_place', ['placeId'])
@Index('idx_place_ext_id_provider', ['provider'])
export class PlaceExternalIdentifier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'enum', enum: PlaceExternalIdentifierProvider, enumName: 'place_external_identifier_provider' })
  provider!: PlaceExternalIdentifierProvider;

  @Column({ type: 'varchar', length: 200 })
  externalId!: string;

  @Column({ type: 'boolean', default: true })
  isPrimary!: boolean;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  // Cùng ranh giới với place_translations.evidenceId (xem entity đó): chưa có bảng evidence trong
  // schema hiện tại — giữ uuid rời, không FK, cho tới khi một evidence producer thật tồn tại.
  @Column({ type: 'uuid', nullable: true })
  evidenceId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
