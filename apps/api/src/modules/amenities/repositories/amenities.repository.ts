import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// `amenities`/`place_amenities` (InitHotel1720001000000) — dict DÙNG CHUNG, FK là place_id, không
// phải hotel-specific (xem ghi chú migration gốc: "dict dùng chung"). Module này là nơi ĐỌC/GHI
// generic đầu tiên cho bảng này (trước đây chỉ HotelsRepository.listAmenities đọc, không có nơi
// ghi nào) — mở khoá cho MỌI category (nhà hàng "gia đình/đoàn", khách sạn, …) mà không lặp lại
// logic SQL 5 lần.
@Injectable()
export class AmenitiesRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listAll(group?: string) {
    if (group) {
      return this.ds.query(
        `SELECT id, code, label_vi, label_en, icon, "group" FROM amenities WHERE "group" = $1 ORDER BY code`,
        [group],
      );
    }
    return this.ds.query(`SELECT id, code, label_vi, label_en, icon, "group" FROM amenities ORDER BY "group", code`);
  }

  listForPlace(placeId: string) {
    return this.ds.query(
      `SELECT a.id, a.code, a.label_vi, a.label_en, a.icon, a."group"
       FROM place_amenities pa JOIN amenities a ON a.id = pa.amenity_id
       WHERE pa.place_id = $1 ORDER BY a."group", a.code`,
      [placeId],
    );
  }

  /**
   * Thay TOÀN BỘ gán tiện ích theo mã. Mã không tồn tại trong `amenities` bị từ chối (trả về danh
   * sách mã không hợp lệ, không âm thầm bỏ qua) — cùng chủ trương RestaurantsRepository.
   * replaceCuisinesWithManager.
   *
   * CAS thật (2026-09-30) — cùng khuôn HotelsRepository.upsertDetails: `UPDATE places SET
   * content_version = content_version + 1 WHERE id = $1 AND content_version = $2` chạy TRƯỚC TIÊN
   * trong transaction, không khớp → 'conflict' ngay, không đụng `place_amenities`. Mã không hợp lệ
   * được kiểm TRƯỚC khi mở transaction (đọc-only, không cần CAS) để không burn version bump cho một
   * request sẽ bị từ chối 400 — khác `cuisine_codes` (phải nằm trong transaction vì đi CHUNG một
   * lần ghi với is_local_specialty/dietary); ở đây `setForPlace` là request ĐỘC LẬP, tách được an
   * toàn.
   */
  async setForPlace(placeId: string, codes: string[], expectedVersion: number): Promise<{ invalidCodes: string[]; conflict: boolean; newVersion?: number }> {
    let found: Array<{ id: string; code: string }> = [];
    if (codes.length > 0) {
      found = await this.ds.query(`SELECT id, code FROM amenities WHERE code = ANY($1)`, [codes]);
      const foundCodes = new Set(found.map((f) => f.code));
      const invalidCodes = codes.filter((c) => !foundCodes.has(c));
      if (invalidCodes.length > 0) {
        return { invalidCodes, conflict: false };
      }
    }
    return this.ds.transaction(async (m) => {
      // BUG THẬT (2026-09-30) — xem HotelsRepository.upsertDetails's ghi chú đầy đủ: `UPDATE ...
      // RETURNING` trả về TUPLE `[rows, affectedCount]`, phải destructure `[casRows]`.
      const [casRows]: [Array<{ content_version: number }>, number] = await m.query(
        `UPDATE places SET content_version = content_version + 1
           WHERE id = $1 AND content_version = $2
           RETURNING content_version`,
        [placeId, expectedVersion],
      );
      if (casRows.length === 0) {
        return { invalidCodes: [], conflict: true };
      }
      await m.query(`DELETE FROM place_amenities WHERE place_id = $1`, [placeId]);
      for (const f of found) {
        await m.query(`INSERT INTO place_amenities (place_id, amenity_id) VALUES ($1, $2)`, [placeId, f.id]);
      }
      return { invalidCodes: [], conflict: false, newVersion: casRows[0].content_version };
    });
  }
}
