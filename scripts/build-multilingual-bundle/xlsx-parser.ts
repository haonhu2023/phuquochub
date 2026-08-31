// Standalone OOXML/XLSX parser — no npm dependencies, no Python, no NestJS.
// Uses only Node.js built-ins: fs, path, zlib, child_process (for unzip).
// Supports: shared strings, multiple sheets by name. Does NOT support merged cells or
// array formulas. Formula cells WITH a cached <v> value use the cached value; formula
// cells without a cached value return XLSX_FORMULA_NO_CACHE so the caller can HOLD the row
// rather than silently treating the cell as empty.

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Sentinel values returned when a cell cannot yield a reliable string value.
// Callers (bundle builder) must treat these as HOLD reasons, not as valid cell text.
export const XLSX_FORMULA_NO_CACHE = '__XLSX_FORMULA_NO_CACHE__';
export const XLSX_FORMULA_ERROR = '__XLSX_FORMULA_ERROR__';

function extractXlsx(xlsxPath: string, outDir: string): void {
  execSync(`unzip -o "${xlsxPath}" -d "${outDir}"`, { stdio: 'pipe' });
}

function readXml(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // Each <si> element may have one or more <t> children; concatenate them.
  const siPattern = /<si>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siPattern.exec(xml)) !== null) {
    const inner = siMatch[1];
    const parts: string[] = [];
    const tPattern = /<t(?:[^>]*)>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tPattern.exec(inner)) !== null) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    strings.push(parts.join(''));
  }
  return strings;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

interface SheetRef {
  name: string;
  rId: string;
  target: string;
}

function parseWorkbook(xml: string): SheetRef[] {
  const sheets: SheetRef[] = [];
  const sheetPattern = /<sheet\s[^/]*?name="([^"]+)"[^/]*?r:id="([^"]+)"[^/]*/g;
  let m: RegExpExecArray | null;
  while ((m = sheetPattern.exec(xml)) !== null) {
    sheets.push({ name: m[1], rId: m[2], target: '' });
  }
  return sheets;
}

function parseWorkbookRels(xml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const relPattern = /<Relationship\s[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*/g;
  let m: RegExpExecArray | null;
  while ((m = relPattern.exec(xml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// Returns { col: "A", rowIndex: 1 } from "A1", "BC42", etc.
function parseRef(ref: string): { col: string; rowIndex: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Invalid cell ref: ${ref}`);
  return { col: m[1], rowIndex: parseInt(m[2], 10) };
}

function colToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n - 1;
}

export type SheetRow = Record<string, string>;

function parseSheet(xml: string, sharedStrings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  let headerRow: string[] | null = null;
  let headerRowIndex: number | null = null;

  const rowPattern = /<row\s[^>]*?r="(\d+)"[^>]*?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const rowIndex = parseInt(rowMatch[1], 10);
    const rowXml = rowMatch[2];

    const cellValues: Record<number, string> = {};

    // Match complete <c .../> self-closing or <c ...>...</c> elements.
    // Group 1: opening-tag attributes; Group 2: cell body (empty for self-closing).
    const cellPattern = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowXml)) !== null) {
      const openAttrs = cellMatch[1] ?? '';
      const cellBody = cellMatch[2] ?? '';

      const rAttr = /r="([^"]+)"/.exec(openAttrs);
      if (!rAttr) continue;
      const ref = rAttr[1];
      const tAttr = /t="([^"]+)"/.exec(openAttrs);
      const cellType = tAttr ? tAttr[1] : '';

      const { col } = parseRef(ref);
      const colIdx = colToIndex(col);

      // Error value cell (OOXML type="e")
      if (cellType === 'e') {
        cellValues[colIdx] = XLSX_FORMULA_ERROR;
        continue;
      }

      // Formula detection: <f ...> present inside cell body
      const hasFormula = /<f[\s/>]/.test(cellBody);
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(cellBody);

      if (hasFormula && !vMatch) {
        // Formula with no cached value — cannot trust as empty; caller must HOLD the row.
        cellValues[colIdx] = XLSX_FORMULA_NO_CACHE;
        continue;
      }

      const rawValue = vMatch ? vMatch[1] : '';
      let cellValue = rawValue;
      if (cellType === 's') {
        // Shared string index
        cellValue = sharedStrings[parseInt(rawValue, 10)] ?? '';
      }
      cellValues[colIdx] = cellValue.trim();
    }

    if (headerRow === null) {
      // First non-empty row is the header
      const maxCol = Math.max(...Object.keys(cellValues).map(Number), -1);
      if (maxCol >= 0) {
        headerRow = [];
        for (let i = 0; i <= maxCol; i++) {
          headerRow.push(cellValues[i] ?? '');
        }
        headerRowIndex = rowIndex;
      }
    } else if (rowIndex !== headerRowIndex) {
      const record: SheetRow = {};
      const maxCol = Math.max(headerRow.length - 1, ...Object.keys(cellValues).map(Number));
      for (let i = 0; i <= maxCol; i++) {
        const header = headerRow[i] ?? `COL_${i}`;
        record[header] = cellValues[i] ?? '';
      }
      rows.push(record);
    }
  }
  return rows;
}

export function parseXlsxSheet(xlsxPath: string, sheetName: string): SheetRow[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phuquochub-xlsx-'));
  try {
    extractXlsx(xlsxPath, tmpDir);

    const sharedStringsPath = path.join(tmpDir, 'xl', 'sharedStrings.xml');
    const sharedStrings = fs.existsSync(sharedStringsPath) ? parseSharedStrings(readXml(sharedStringsPath)) : [];

    const workbookXml = readXml(path.join(tmpDir, 'xl', 'workbook.xml'));
    const relsXml = readXml(path.join(tmpDir, 'xl', '_rels', 'workbook.xml.rels'));

    const sheets = parseWorkbook(workbookXml);
    const rels = parseWorkbookRels(relsXml);

    const sheet = sheets.find(s => s.name === sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found. Available: ${sheets.map(s => s.name).join(', ')}`);
    }

    const target = rels[sheet.rId];
    if (!target) throw new Error(`No relationship found for sheet rId=${sheet.rId}`);
    const sheetFile = target.replace(/^\/xl\//, '').replace(/^xl\//, '');
    const sheetXml = readXml(path.join(tmpDir, 'xl', sheetFile));

    return parseSheet(sheetXml, sharedStrings);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
