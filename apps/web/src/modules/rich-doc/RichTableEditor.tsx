'use client';

import type { RichTableBlock } from '@phuquochub/shared-types';
import styles from './rich-editor.module.css';

interface Props {
  table: RichTableBlock;
  onChange: (table: RichTableBlock) => void;
  onRemove: () => void;
  disabled?: boolean;
}

// Soạn BẢNG bằng một lưới input thuần (KHÔNG qua Tiptap — xem lý do ở tiptap-bridge.ts đầu file).
// Ô bảng CHỦ Ý chỉ nhận văn bản thuần (một RichRun không đậm/nghiêng/link) — bảng ở đây là DỮ LIỆU
// dạng lưới (giá/thông số/so sánh), không phải văn xuôi; nếu một ô cần định dạng, nội dung đó nên
// nằm ở đoạn văn xuôi bên ngoài bảng. Giới hạn này được ghi rõ trong UI (không ẩn, không bất ngờ).
export function RichTableEditor({ table, onChange, onRemove, disabled }: Props) {
  const colCount = table.rows[0]?.length ?? 0;

  const cellText = (r: number, c: number) => table.rows[r]?.[c]?.[0]?.text ?? '';

  const setCell = (r: number, c: number, text: string) => {
    const rows = table.rows.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : [{ text }]))));
    onChange({ ...table, rows });
  };

  const addRow = () => {
    const newRow = Array.from({ length: colCount }, () => [{ text: '' }]);
    onChange({ ...table, rows: [...table.rows, newRow] });
  };

  const removeRow = (r: number) => {
    if (table.rows.length <= 1) return;
    onChange({ ...table, rows: table.rows.filter((_, ri) => ri !== r) });
  };

  const addCol = () => {
    onChange({ ...table, rows: table.rows.map((row) => [...row, [{ text: '' }]]) });
  };

  const removeCol = (c: number) => {
    if (colCount <= 1) return;
    onChange({ ...table, rows: table.rows.map((row) => row.filter((_, ci) => ci !== c)) });
  };

  const setCaption = (caption: string) => onChange({ ...table, caption: caption || undefined });

  const setHeaderRow = (headerRow: boolean) => onChange({ ...table, headerRow });

  return (
    <div className={styles.tableSegment}>
      <div className={styles.toolbar} role="toolbar" aria-label="Soạn bảng">
        <label className={styles.captionLabel}>
          Chú thích bảng:{' '}
          <input
            type="text"
            value={table.caption ?? ''}
            onChange={(e) => setCaption(e.target.value)}
            disabled={disabled}
            maxLength={300}
            placeholder="Không bắt buộc"
          />
        </label>
        <label className={styles.headerRowLabel}>
          <input type="checkbox" checked={table.headerRow} onChange={(e) => setHeaderRow(e.target.checked)} disabled={disabled} />
          Hàng đầu tiên là tiêu đề
        </label>
        <span className={styles.toolbarSpacer} />
        <button type="button" className={styles.toolBtn} onClick={addRow} disabled={disabled}>
          + Hàng
        </button>
        <button type="button" className={styles.toolBtn} onClick={addCol} disabled={disabled}>
          + Cột
        </button>
        <button type="button" className={styles.toolBtnDanger} onClick={onRemove} disabled={disabled}>
          Xoá bảng
        </button>
      </div>
      <p className={styles.tableHint}>Ô bảng chỉ nhận văn bản thuần (không đậm/nghiêng/liên kết trong ô).</p>
      <div className={styles.tableScroll}>
        <table className={styles.editableTable}>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((_, c) => (
                  <td key={c}>
                    <input
                      type="text"
                      value={cellText(r, c)}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      disabled={disabled}
                      aria-label={`Hàng ${r + 1}, cột ${c + 1}`}
                      className={table.headerRow && r === 0 ? styles.headerCellInput : undefined}
                    />
                  </td>
                ))}
                <td className={styles.rowActions}>
                  <button type="button" className={styles.toolBtnSmall} onClick={() => removeRow(r)} disabled={disabled || table.rows.length <= 1} title="Xoá hàng này">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {Array.from({ length: colCount }, (_, c) => (
                <td key={c} className={styles.colActions}>
                  <button type="button" className={styles.toolBtnSmall} onClick={() => removeCol(c)} disabled={disabled || colCount <= 1} title="Xoá cột này">
                    ✕
                  </button>
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
