import { MigrationInterface, QueryRunner } from 'typeorm';

// Media Orphan Cleanup (2026-08-02, Owner-approved execution plan §13). Không cột nào mới — mọi
// điều kiện đủ điều kiện dọn dẹp (status/place_id/review_id/post_id/business_id/event_id/
// deleted_at/created_at) đã tồn tại sẵn. Index này CHỈ phục vụ hiệu năng cho truy vấn quét theo
// lô (MediaRepository.findOrphanCleanupCandidates) khi khối lượng upload thật tăng lên — tối ưu
// cục bộ, không phải yêu cầu đúng đắn (job vẫn đúng dù không có index này, chỉ chậm hơn ở quy mô
// lớn). Cùng khuôn partial-index đã dùng cho idx_media_uploaded_by/idx_media_uploader_checksum
// (AddMediaUploadFoundation) và idx_places_status_active (AddPlacesStatusPartialIndex).
export class AddMediaOrphanCleanupIndex1720003100000 implements MigrationInterface {
  name = 'AddMediaOrphanCleanupIndex1720003100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_media_orphan_cleanup" ON "media" ("created_at")
      WHERE "status" = 'pending' AND "place_id" IS NULL AND "review_id" IS NULL
        AND "post_id" IS NULL AND "business_id" IS NULL AND "event_id" IS NULL
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_media_orphan_cleanup"`);
  }
}
