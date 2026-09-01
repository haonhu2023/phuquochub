import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';

// ADR-020 §"Decision 2": `place_translations.source_text_hash` = sha256 hex của văn bản NGUỒN đã
// canonical-serialize — tức nội dung tiếng Việt TẠI THỜI ĐIỂM dịch, không phải chính bản dịch.
// Dùng `canonicalJson()` (không phải JSON.stringify thô) để nhất quán với mọi digest khác trong
// Slice 0.5 (approval-evidence.contract.ts, publish-manifest.contract.ts). Cùng idiom
// Buffer.from(..., 'utf8') tường minh, không dựa vào encoding ngầm của Hash.update(string).
export function computeSourceTextHash(sourceText: string): string {
  const bytes = Buffer.from(canonicalJson(sourceText), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

// Phát hiện bản dịch "stale": nội dung tiếng Việt của field này đã đổi SAU KHI bản dịch được viết
// (RULE-LANG family — tái kiểm khi nguồn thay đổi). Hàm THUẦN, không tự đọc DB — caller truyền vào
// nội dung nguồn hiện tại (đọc từ chính place_translations, locale_code = source_locale_code).
export function isSourceTextStale(storedSourceTextHash: string, currentSourceText: string): boolean {
  return storedSourceTextHash !== computeSourceTextHash(currentSourceText);
}
