import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RichDoc, RichDocValidationError, flattenRichDocToPlainText } from '@phuquochub/shared-types';
import { parseRichDoc } from './rich-doc';

// Gói D — logic DÙNG CHUNG cho MỌI trường "mô tả dài" có rich-text (job_listings.description/
// requirements/benefits, job_listing_translations.description, real_estate_listings.description/
// utilities_note/legal_status_note, real_estate_listing_translations.description, places.description
// — che phủ hotels/restaurants/tours/beaches vì tất cả dùng chung `places`). MỘT cách triển khai duy
// nhất, không viết lại cho từng field (xem JobListingsService.applyDescription() bản ĐẦU TIÊN, nay
// thay bằng applyRichTextField() ở đây — hành vi giữ NGUYÊN, chỉ gom lại thành hàm dùng chung).

export function hashPlainTextForRichDoc(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Cơ chế đóng rủi ro rollback (owner yêu cầu điểm 3, 18/10/2026) — "có cơ chế nhận biết plain/rich
 * lệch để bản mới không phục vụ RichDoc lỗi thời", KHÔNG chỉ "cẩn thận":
 *
 * Mỗi trường rich-text lưu THÊM một cột hash (`<field>_rich_hash` = sha256 của bản PLAIN tại đúng
 * thời điểm `<field>_rich` được ghi có thẩm quyền — xem applyRichTextField()). Khi PHỤC VỤ (đọc),
 * LUÔN so hash đã lưu với hash của cột plain HIỆN TẠI trước khi trả `*_rich` — khớp mới phục vụ,
 * LỆCH thì coi như CHƯA TỪNG có rich text (trả null, fallback plain) — không cần ai "cẩn thận" hay
 * nhớ chặn ghi trong lúc rollback, cơ chế tự động áp dụng cho MỌI lần đọc, mãi mãi.
 *
 * Giải quyết ĐÚNG chuỗi rủi ro đã test: app mới tạo RichDoc (ghi hash khớp) → rollback về app cũ
 * (app cũ không biết `*_rich`/`*_rich_hash`, SỬA MỘT MÌNH cột plain) → hash lưu KHÔNG còn khớp cột
 * plain mới → nâng cấp lại app mới → đọc thấy lệch → TỰ ĐỘNG bỏ qua rich cũ, phục vụ ĐÚNG plain mới
 * — không cần thao tác thủ công nào ở bước nâng cấp lại.
 */
export function isRichDocCurrent(currentPlainText: string | null, storedHash: string | null): boolean {
  if (storedHash == null) return false;
  if (currentPlainText == null) return false;
  return hashPlainTextForRichDoc(currentPlainText) === storedHash;
}

/** Phía ĐỌC: trả `rich` nếu hash còn khớp bản plain hiện tại, ngược lại null (coi như chưa có). */
export function serveRichDoc(currentPlainText: string | null, rich: RichDoc | null, storedHash: string | null): RichDoc | null {
  if (rich == null) return null;
  return isRichDocCurrent(currentPlainText, storedHash) ? rich : null;
}

/** Cặp getter/setter cho MỘT trường rich-text trên một entity cụ thể — dùng con trỏ thuộc tính trực
 * tiếp (không reflection) để applyRichTextField() generic được mà vẫn an toàn kiểu. */
export interface RichTextFieldAccessors<E> {
  setPlain(entity: E, value: string | null): void;
  getRich(entity: E): RichDoc | null;
  setRich(entity: E, value: RichDoc | null): void;
  setRichHash(entity: E, value: string | null): void;
}

/**
 * Áp dụng quy tắc nguồn-sự-thật MỘT CHIỀU cho một trường rich-text khi ghi (xem ghi chú đầy đủ gốc
 * ở JobListingsService — hành vi giữ nguyên, chỉ tổng quát hoá):
 *  1. `dtoRich` CÓ MẶT (object hoặc null tường minh) → authoritative. object: validate (400 nếu
 *     sai), ghi `plain` = flatten(rich), ghi `richHash` = hash(plain). null: xoá CẢ BA (rich/hash/
 *     plain).
 *  2. `dtoRich` VẮNG MẶT: nếu plain MỚI khác bản flatten của rich ĐANG LƯU → demote (xoá rich+hash).
 *     Khớp → giữ nguyên rich+hash (round-trip không đổi).
 *
 * `maxPlainLength` (phát hiện qua rà bảo mật 20/10/2026) — `validateRichDoc()` chỉ giới hạn kích
 * thước CHUNG của toàn bộ RichDoc (200k ký tự, xem packages/shared-types/src/rich-doc.ts), KHÔNG
 * biết giới hạn RIÊNG của từng cột plain (vd `description` varchar(4000), `requirements` varchar
 * (2000)) — một RichDoc hợp lệ (dưới 200k) vẫn có thể flatten ra chuỗi DÀI HƠN cột plain cho phép,
 * vượt qua mọi kiểm tra tầng ứng dụng rồi vỡ ở Postgres thành lỗi driver thô (500, không phải 400
 * sạch) khi INSERT/UPDATE. Truyền đúng @MaxLength của cột plain tương ứng (caller đã biết, vì DTO
 * đã khai @MaxLength cho property plain cùng tên) để chặn SỚM, trả đúng 400 có thông điệp rõ ràng
 * thay vì để lộ lỗi DB thô ra client.
 */
export function applyRichTextField<E>(
  entity: E,
  accessors: RichTextFieldAccessors<E>,
  dtoRich: RichDoc | null | undefined,
  dtoPlain: string | null | undefined,
  fieldNameForError: string,
  maxPlainLength: number,
): void {
  if (dtoRich !== undefined) {
    if (dtoRich === null) {
      accessors.setRich(entity, null);
      accessors.setRichHash(entity, null);
      accessors.setPlain(entity, null);
      return;
    }
    let doc: RichDoc;
    try {
      doc = parseRichDoc(dtoRich);
    } catch (err) {
      if (err instanceof RichDocValidationError) throw new BadRequestException(`${fieldNameForError}: ${err.message}`);
      throw err;
    }
    const plain = flattenRichDocToPlainText(doc) || null;
    if (plain != null && plain.length > maxPlainLength) {
      throw new BadRequestException(
        `${fieldNameForError}: nội dung rút gọn thành văn bản thuần dài ${plain.length} ký tự, vượt quá giới hạn ${maxPlainLength} ký tự của trường này.`,
      );
    }
    accessors.setRich(entity, doc);
    accessors.setPlain(entity, plain);
    accessors.setRichHash(entity, plain != null ? hashPlainTextForRichDoc(plain) : null);
    return;
  }
  const newPlain = dtoPlain ?? null;
  const existingRich = accessors.getRich(entity) ?? null;
  if (existingRich != null) {
    const currentFlatten = flattenRichDocToPlainText(existingRich) || null;
    if (newPlain !== currentFlatten) {
      accessors.setRich(entity, null);
      accessors.setRichHash(entity, null);
    }
  } else {
    accessors.setRich(entity, null);
    accessors.setRichHash(entity, null);
  }
  accessors.setPlain(entity, newPlain);
}
