// Gói D — "RichDoc": định dạng JSON dùng chung cho mô tả dài có định dạng (đoạn văn/tiêu đề phụ/
// đậm-nghiêng/danh sách/liên kết/bảng), theo ADR-DELIVERY-002 (docs/delivery/decisions/
// ADR-DELIVERY-002.md). Nguồn sự thật DUY NHẤT cho shape + giới hạn + hàm validate/flatten —
// apps/api validate khi ghi, apps/web dùng CÙNG hàm để preview/soạn thảo, tránh hai cách diễn giải
// lệch nhau (owner yêu cầu rõ ở điểm 3: "Preview, bản đã duyệt, bản nháp và public cùng dùng một
// cách diễn giải RichDoc").
//
// CHỦ Ý KHÔNG đệ quy: không block nào chứa block khác (bảng chứa runs, không chứa block). Đây là
// cách triển khai "giới hạn độ sâu" — schema không đệ quy thì không có "độ sâu" nào vượt quá 1 cấp
// (block → run) để mà giới hạn thêm; không cần đếm độ sâu runtime vì cấu trúc kiểu đã loại trừ khả
// năng lồng sâu ngay từ khi parse JSON.

export const RICH_DOC_VERSION = 1 as const;

export const RICH_DOC_LIMITS = {
  /** Tổng kích thước JSON.stringify(doc), byte (xấp xỉ qua .length của chuỗi UTF-16). */
  MAX_DOC_CHARS: 200_000,
  MAX_BLOCKS: 300,
  MAX_RUNS_PER_BLOCK: 500,
  MAX_RUN_TEXT_LENGTH: 4000,
  MAX_LIST_ITEMS: 200,
  MAX_TABLE_ROWS: 50,
  MAX_TABLE_COLS: 20,
  MAX_TABLE_CELL_RUNS: 50,
  MAX_HREF_LENGTH: 2000,
  MAX_CAPTION_LENGTH: 300,
} as const;

/** Scheme cho phép trên `href` — chặn `javascript:`/`data:`/`vbscript:`/... (nội dung thực thi). */
export const RICH_DOC_ALLOWED_HREF_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:'] as const;

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Chỉ scheme trong RICH_DOC_ALLOWED_HREF_SCHEMES — validate ở validateRichDoc(). */
  href?: string;
}

export interface RichParagraphBlock {
  type: 'p' | 'heading2' | 'heading3' | 'blockquote';
  runs: RichRun[];
}

export interface RichListBlock {
  type: 'list';
  ordered: boolean;
  items: RichRun[][];
}

export interface RichTableBlock {
  type: 'table';
  caption?: string;
  /** true = hàng đầu tiên của `rows` là hàng tiêu đề (render <th>/<thead>). */
  headerRow: boolean;
  /** rows[r][c] = runs của ô (hàng r, cột c). Mọi hàng PHẢI cùng số cột (không răng cưa). */
  rows: RichRun[][][];
}

export type RichBlock = RichParagraphBlock | RichListBlock | RichTableBlock;

export interface RichDoc {
  v: typeof RICH_DOC_VERSION;
  blocks: RichBlock[];
}

export class RichDocValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RichDocValidationError';
  }
}

function fail(msg: string): never {
  throw new RichDocValidationError(msg);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateHref(href: unknown): string {
  if (typeof href !== 'string' || href.length === 0) fail('href phải là chuỗi không rỗng');
  if (href.length > RICH_DOC_LIMITS.MAX_HREF_LENGTH) fail('href quá dài');
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    fail(`href không hợp lệ: "${href}"`);
  }
  if (!(RICH_DOC_ALLOWED_HREF_SCHEMES as readonly string[]).includes(url.protocol)) {
    fail(`href dùng scheme không được phép: "${url.protocol}"`);
  }
  return href;
}

/** Trả về bản runs ĐÃ LÀM SẠCH (chỉ giữ key được phép) — không spread input gốc. */
function validateRuns(input: unknown, maxRuns: number): RichRun[] {
  if (!Array.isArray(input)) fail('runs phải là mảng');
  if (input.length > maxRuns) fail(`quá nhiều đoạn văn bản trong một khối (tối đa ${maxRuns})`);
  return input.map((raw): RichRun => {
    if (!isPlainObject(raw)) fail('run phải là object');
    if (typeof raw.text !== 'string') fail('run.text phải là chuỗi');
    if (raw.text.length > RICH_DOC_LIMITS.MAX_RUN_TEXT_LENGTH) fail('run.text quá dài');
    const run: RichRun = { text: raw.text };
    if (raw.bold !== undefined) {
      if (typeof raw.bold !== 'boolean') fail('run.bold phải là boolean');
      if (raw.bold) run.bold = true;
    }
    if (raw.italic !== undefined) {
      if (typeof raw.italic !== 'boolean') fail('run.italic phải là boolean');
      if (raw.italic) run.italic = true;
    }
    if (raw.href !== undefined) {
      run.href = validateHref(raw.href);
    }
    return run;
  });
}

function validateBlock(raw: unknown): RichBlock {
  if (!isPlainObject(raw)) fail('block phải là object');
  const type = raw.type;
  if (type === 'p' || type === 'heading2' || type === 'heading3' || type === 'blockquote') {
    return { type, runs: validateRuns(raw.runs, RICH_DOC_LIMITS.MAX_RUNS_PER_BLOCK) };
  }
  if (type === 'list') {
    if (typeof raw.ordered !== 'boolean') fail('list.ordered phải là boolean');
    if (!Array.isArray(raw.items)) fail('list.items phải là mảng');
    if (raw.items.length > RICH_DOC_LIMITS.MAX_LIST_ITEMS) fail('danh sách có quá nhiều mục');
    const items = raw.items.map((item) => validateRuns(item, RICH_DOC_LIMITS.MAX_RUNS_PER_BLOCK));
    return { type: 'list', ordered: raw.ordered, items };
  }
  if (type === 'table') {
    if (typeof raw.headerRow !== 'boolean') fail('table.headerRow phải là boolean');
    if (!Array.isArray(raw.rows)) fail('table.rows phải là mảng');
    if (raw.rows.length > RICH_DOC_LIMITS.MAX_TABLE_ROWS) fail('bảng có quá nhiều hàng');
    let caption: string | undefined;
    if (raw.caption !== undefined) {
      if (typeof raw.caption !== 'string') fail('table.caption phải là chuỗi');
      if (raw.caption.length > RICH_DOC_LIMITS.MAX_CAPTION_LENGTH) fail('chú thích bảng quá dài');
      caption = raw.caption;
    }
    let colCount: number | null = null;
    const rows = raw.rows.map((rowRaw): RichRun[][] => {
      if (!Array.isArray(rowRaw)) fail('một hàng của bảng phải là mảng ô');
      if (colCount === null) colCount = rowRaw.length;
      else if (rowRaw.length !== colCount) fail('các hàng trong bảng phải có cùng số cột (không răng cưa)');
      if (rowRaw.length > RICH_DOC_LIMITS.MAX_TABLE_COLS) fail('bảng có quá nhiều cột');
      return rowRaw.map((cellRaw) => validateRuns(cellRaw, RICH_DOC_LIMITS.MAX_TABLE_CELL_RUNS));
    });
    return { type: 'table', ...(caption !== undefined ? { caption } : {}), headerRow: raw.headerRow, rows };
  }
  fail(`loại khối không được hỗ trợ: "${String(type)}"`);
}

/**
 * Validate + làm sạch (allowlist) một payload bất kỳ thành RichDoc hợp lệ, hoặc throw
 * RichDocValidationError. KHÔNG spread input gốc ở bất kỳ cấp nào — object trả về CHỈ chứa field
 * đã được khai báo và kiểm đúng kiểu, nên một key lạ (vd cố nhét "html"/"__proto__") không bao giờ
 * lọt qua được.
 */
export function validateRichDoc(input: unknown): RichDoc {
  const serialized = JSON.stringify(input) ?? '';
  if (serialized.length > RICH_DOC_LIMITS.MAX_DOC_CHARS) fail('nội dung quá lớn');
  if (!isPlainObject(input)) fail('RichDoc phải là object');
  if (input.v !== RICH_DOC_VERSION) fail(`phiên bản RichDoc không được hỗ trợ: ${String(input.v)}`);
  if (!Array.isArray(input.blocks)) fail('RichDoc.blocks phải là mảng');
  if (input.blocks.length > RICH_DOC_LIMITS.MAX_BLOCKS) fail('tài liệu có quá nhiều khối nội dung');
  const blocks = input.blocks.map(validateBlock);
  return { v: RICH_DOC_VERSION, blocks };
}

function runsToPlainText(runs: RichRun[]): string {
  return runs.map((r) => (r.href ? `${r.text} (${r.href})` : r.text)).join('');
}

/**
 * Diễn giải RichDoc thành văn bản thuần — dùng cho: (a) hash/staleness (đậm/nghiêng KHÔNG ảnh
 * hưởng kết quả — chỉ text/href/ô bảng mới đổi hash, đúng yêu cầu "đổi đậm/nghiêng đơn thuần không
 * nên làm bản dịch lỗi thời"), (b) metadata/JSON-LD/trích đoạn — KHÔNG lộ markup/JSON, chỉ chữ.
 * CHỦ Ý bỏ qua `ordered`/`headerRow` (không ảnh hưởng ý nghĩa nội dung đủ để tính là "thay đổi
 * đáng kể" cho mục đích hash — chỉ ảnh hưởng cách trình bày).
 */
export function flattenRichDocToPlainText(doc: RichDoc): string {
  return doc.blocks
    .map((block) => {
      if (block.type === 'list') {
        return block.items.map((item) => runsToPlainText(item)).join('\n');
      }
      if (block.type === 'table') {
        const captionLine = block.caption ? `${block.caption}\n` : '';
        const rowLines = block.rows.map((row) => row.map((cell) => runsToPlainText(cell)).join('\t'));
        return captionLine + rowLines.join('\n');
      }
      return runsToPlainText(block.runs);
    })
    .join('\n\n')
    .trim();
}
