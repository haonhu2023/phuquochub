import { MigrationInterface, QueryRunner } from 'typeorm';

// Production Backup/Restore Hardening (2026-08-12) — sửa `immutable_unaccent` để một bản restore
// SẠCH không còn phụ thuộc vào `search_path`.
//
// SỰ CỐ THẬT (diễn tập restore trên production, 2026-08-12): restore vào một CSDL trống dừng ở
//   ERROR: function unaccent(unknown, text) does not exist
// khi tạo `idx_events_fts`.
//
// NGUYÊN NHÂN GỐC: thân hàm do `InitPlaces1720000400000` tạo ra là
//   SELECT unaccent('unaccent', $1)
// — CẢ tên hàm LẪN literal từ điển đều KHÔNG ghi rõ schema. `pg_dump` cố tình restore với
// `search_path` RỖNG (`SELECT pg_catalog.set_config('search_path','',false)`) vì lý do an toàn,
// nên không có gì phân giải được `unaccent`. Thân hàm SQL không được phân giải lúc CREATE FUNCTION
// (pg_dump đặt `check_function_bodies=false`) mà tới lúc ĐƯỢC GỌI LẦN ĐẦU — chính là lúc
// `CREATE INDEX` phải tính giá trị hàm để dựng index. Vì vậy lỗi chỉ nổ ra ở bước tạo index, và chỉ
// khi restore, không bao giờ khi chạy bình thường (lúc đó `search_path` có `public`).
//
// CÁCH SỬA: ghi rõ schema cho CẢ HAI vế —
//   SELECT public.unaccent('public.unaccent'::regdictionary, $1)
// Literal `regdictionary` cũng phải kèm schema: `'unaccent'::regdictionary` tự nó cũng cần
// `search_path` để phân giải, nên bỏ qua chi tiết đó là sửa nửa vời.
//
// VÌ SAO KHÔNG SỬA MIGRATION CŨ: `InitPlaces1720000400000` là migration thứ 4/44 và đã chạy trên
// production (42 migration đã áp dụng). Quy ước repo là forward-only, cộng thêm — sửa lịch sử đã
// áp dụng sẽ khiến CSDL production và mã nguồn nói hai chuyện khác nhau.
//
// VÌ SAO KHÔNG CẦN REINDEX: hai thân hàm cho ra kết quả GIỐNG HỆT nhau (cùng từ điển `unaccent`,
// chỉ khác cách phân giải tên). Đã kiểm chứng trên dữ liệu thật: 251 giá trị (toàn bộ
// name/description của `places` + các ca biên tiếng Việt/rỗng/NULL) → 0 khác biệt. Nội dung
// `idx_places_fts`/`idx_events_fts` vì vậy vẫn đúng, không cần dựng lại. Có test hồi quy đi kèm.
export class FixImmutableUnaccentSearchPath1720004400000 implements MigrationInterface {
  name = 'FixImmutableUnaccentSearchPath1720004400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `CREATE OR REPLACE` giữ NGUYÊN OID của hàm, nên mọi index/phụ thuộc đang trỏ tới nó không bị
    // đụng tới — khác hẳn DROP + CREATE (sẽ đòi DROP CASCADE cả hai index FTS rồi dựng lại).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
      $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục ĐÚNG thân hàm cũ (InitPlaces). CẢNH BÁO vận hành: revert migration này đưa lỗi
    // KHÔNG-RESTORE-ĐƯỢC quay lại — bản dump tạo ra sau đó vẫn dump được, nhưng restore vào CSDL
    // sạch sẽ hỏng ở bước tạo index FTS. Chỉ revert khi đang lùi toàn bộ schema về trước milestone
    // này, không bao giờ revert riêng lẻ.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
      $$ SELECT unaccent('unaccent', $1) $$
    `);
  }
}
