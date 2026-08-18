import { MigrationInterface, QueryRunner } from 'typeorm';

// Place Information Foundation (2026-08-18) — NĂM cột cộng thêm, KHÔNG backfill, KHÔNG đổi cột nào
// đang có. Ba cột quyền sử dụng ảnh trên `media`, hai cột đơn vị hành chính trên `places`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// VÌ SAO CHỈ NĂM CỘT — những gì KHÔNG thêm và đã có sẵn ở đâu
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bản audit ban đầu đề xuất thêm cả `media.source_url`, `places.last_verified_at`,
// `places.verification_source`. Đọc kỹ repo thì BA thứ đó đã tồn tại, thêm nữa là nhân bản:
//
//  • `media.source_url` → ĐÃ CÓ `source_attributions` (InitSources): quy chiếu nguồn đa hình, và
//    `media` NẰM SẴN trong SOURCE_ATTRIBUTION_ENTITY_TYPES. URL nguồn sống ở `sources.url`.
//  • `places.last_verified_at` → ĐÃ CÓ `places.verified_at` (InitPlaces) + `verifications.
//    valid_from`/`expires_at` cho vòng đời đầy đủ.
//  • `places.verification_source` → ĐÃ CÓ `verifications.source_id` (FK → `sources`) và
//    `verification_events.source_id` (lịch sử append-only, kèm `method`).
//
// VÌ SAO giấy phép ảnh thì KHÔNG nhân bản `sources.license`: `sources` tự mô tả mình là "danh mục
// nguồn TÁI SỬ DỤNG" — một dòng `sources` dùng lại cho nhiều thực thể. Nhưng giấy phép là thuộc
// tính của TỪNG TỆP: hai ảnh cùng lấy từ Wikimedia Commons có thể là CC BY-SA 2.0 và CC0. Nếu
// giấy phép chỉ sống ở `sources`, biểu diễn đúng hai ảnh đó buộc phải tạo hai dòng `sources` riêng
// cho cùng một nguồn — phá đúng mục đích danh mục dùng lại. Nên: nguồn ở `sources`, quyền ở
// `media`. Không chồng lấn.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// KHÔNG BACKFILL — cố ý
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Cả năm cột vào ở trạng thái NULL cho mọi dòng đang có. Không có DEFAULT, không có UPDATE.
//
//  • `province`/`admin_area`: 49 place hiện tại có toạ độ nằm trong đảo Phú Quốc, nên VỀ MẶT ĐỊA
//    LÝ suy ra 'An Giang'/'Đặc khu Phú Quốc' là hợp lý. Vẫn KHÔNG ghi: 8 place chưa có `address`
//    nào và 1 place (Grand World) có `address` lẫn cả định dạng cũ lẫn mới — chúng cần người xem
//    lại chứ không phải một câu UPDATE. Một migration ghi thầm dữ liệu địa giới "gần đúng" là
//    đúng thứ tạo ra thông tin sai mà không ai truy được nguồn.
//  • `license_type`: KHÔNG mặc định `'unknown'`. NULL = "chưa ai xét"; `'unknown'` = "đã xét và
//    không xác định được nguồn gốc" — hai trạng thái khác nhau, và gán sẵn `'unknown'` cho dòng
//    cũ là nói dối rằng đã có người kiểm tra.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CHECK `chk_media_open_license_credit` — vì sao CÓ ràng buộc này mà không có ràng buộc khác
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Giấy phép CC BY/BY-SA buộc ghi công tác giả VÀ dẫn link giấy phép. Đó là nghĩa vụ pháp lý
// KHÔNG thể quên, nên nó thuộc về CSDL chứ không phải một lời nhắc trong code review: không thể
// lưu `open_license` mà thiếu `attribution` + `license_url`.
//
// Cố ý KHÔNG ràng buộc các nhánh còn lại: `public_domain` theo định nghĩa không đòi ghi công;
// `stock_license` đòi GIỮ hợp đồng chứ thường không đòi hiển thị credit công khai;
// `owner_provided`/`user_submitted` đi theo luồng đồng ý riêng. Ràng buộc chúng như nhau sẽ ép
// người nhập bịa ra một dòng credit không tồn tại — tệ hơn là để trống.
//
// Cũng cố ý KHÔNG có CHECK kiểu "published thì phải có license_type": nó ràng buộc một CỘT ĐANG
// CÓ (`status`) nên có thể làm dòng lịch sử thành vi phạm ngay lúc migrate. Quy tắc "không xuất
// bản ảnh chưa rõ quyền" thuộc luồng duyệt/seed, không phải bước migrate này.
export class StrengthenPlaceInformationModel1720004500000 implements MigrationInterface {
  name = 'StrengthenPlaceInformationModel1720004500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- media: cơ sở pháp lý để hiển thị một tệp ----
    // Enum CSDL thật (không phải varchar + enum ứng dụng) — đúng tiền lệ `media_moderation_reason_code`
    // (AddModerationReasonCode) và `business_claim_reason_code` (InitBusinessClaims): giá trị lạ bị
    // CSDL từ chối kể cả khi một đường ghi tương lai quên validate.
    await queryRunner.query(
      `CREATE TYPE "media_license_type" AS ENUM ('owner_provided','user_submitted','open_license','public_domain','stock_license','unknown')`,
    );

    // ADD COLUMN nullable, không DEFAULT → metadata-only trên PG 11+, không viết lại dòng nào.
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "license_type" "media_license_type"`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "license_url" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "attribution" varchar(300)`);

    // `IS DISTINCT FROM` (không phải `<>`): với `license_type` NULL thì `<>` trả NULL và CHECK
    // "không thất bại" một cách tình cờ. Ở đây ý định là tường minh — NULL đi qua vì chưa ai xét
    // quyền, chỉ đúng nhánh `open_license` mới bị siết.
    await queryRunner.query(`
      ALTER TABLE "media" ADD CONSTRAINT "chk_media_open_license_credit" CHECK (
        "license_type" IS DISTINCT FROM 'open_license'
        OR ("attribution" IS NOT NULL AND "license_url" IS NOT NULL)
      )
    `);

    // ---- places: đơn vị hành chính, tách khỏi `ward` ----
    // `ward` KHÔNG đổi tên và KHÔNG đổi dữ liệu: nó nằm trong hợp đồng công khai (PlaceCard/
    // PlaceDetail, bộ lọc `?ward=`, ô lọc trên bản đồ/tìm kiếm). Giá trị nó đang giữ (Dương Đông,
    // An Thới, …) vẫn là địa danh CÓ THẬT và vẫn hữu ích để khách định vị + để lọc; thứ đã thay
    // đổi là chúng KHÔNG CÒN là đơn vị hành chính kể từ 01/7/2025 (Nghị quyết 1654/NQ-UBTVQH15:
    // 2 phường + 6 xã của Phú Quốc nhập thành MỘT "đặc khu Phú Quốc", tỉnh An Giang).
    //
    // Nên `ward` giữ đúng vai trò nó đang thực sự làm — NHÃN KHU VỰC — và đơn vị hành chính có
    // cột riêng. Đây chính là cách chặn hai lỗi mà mô hình cũ để ngỏ: nhét đơn vị hành chính vào
    // trường khu vực, và hard-code địa danh hành chính trong tầng SEO.
    await queryRunner.query(`ALTER TABLE "places" ADD COLUMN "province" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "places" ADD COLUMN "admin_area" varchar(120)`);

    // KHÔNG index cả hai: chúng chưa phải vị từ lọc ở bất kỳ truy vấn nào (bộ lọc công khai đi qua
    // `category`/`ward`/`price_range`). Thêm index cho một cột chưa ai lọc chỉ tốn ghi.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MR-5 (tiền lệ AddModerationReasonCode.down()/AddMediaUploadFoundation.down()): KHÔNG âm thầm
    // huỷ dữ liệu không dựng lại được. `attribution`/`license_url`/`license_type` là BẰNG CHỨNG
    // tuân thủ giấy phép — mất chúng thì ảnh vẫn hiển thị nhưng không còn gì chứng minh được là
    // được phép hiển thị, và không suy ngược lại được từ bất kỳ cột nào khác. Rỗng thì revert vô
    // hại; có dữ liệu thì dừng và nói rõ.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "media"
        WHERE "license_type" IS NOT NULL OR "license_url" IS NOT NULL OR "attribution" IS NOT NULL`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `StrengthenPlaceInformationModel1720004500000.down() refused: ${count} media row(s) carry ` +
          `licence metadata (attribution / licence type / licence URL). That metadata is the ` +
          `evidence PhuQuocHub is permitted to display those files — dropping the columns destroys ` +
          `it permanently and it cannot be reconstructed from any other column. Resolve manually ` +
          `before reverting this migration.`,
      );
    }

    // `province`/`admin_area` KHÔNG cần chốt chặn tương tự: chúng suy lại được từ toạ độ + văn bản
    // pháp luật, không như bằng chứng giấy phép.
    await queryRunner.query(`ALTER TABLE "places" DROP COLUMN "admin_area"`);
    await queryRunner.query(`ALTER TABLE "places" DROP COLUMN "province"`);

    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "chk_media_open_license_credit"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "attribution"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "license_url"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "license_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_license_type"`);
  }
}
