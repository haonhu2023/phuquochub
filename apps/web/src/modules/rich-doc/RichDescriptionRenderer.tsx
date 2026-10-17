import { Fragment, type ReactNode } from 'react';
import type { RichBlock, RichDoc, RichRun } from '@phuquochub/shared-types';
import placesStyles from '@/modules/places/places.module.css';
import styles from './rich-doc-render.module.css';

interface Props {
  /** RichDoc đã duyệt/đang xem — null = chưa dùng rich text, dùng `plainFallback`. */
  richDoc: RichDoc | null;
  /** Bản plain text (cột `description` cũ) — LUÔN đồng bộ với richDoc khi richDoc có (xem
   * JobListingsService.applyDescription()), nên dùng được làm fallback an toàn khi richDoc null. */
  plainFallback: string | null;
}

function runNode(run: RichRun, key: string): ReactNode {
  let node: ReactNode = run.text;
  if (run.bold) node = <strong>{node}</strong>;
  if (run.italic) node = <em>{node}</em>;
  if (run.href) {
    node = (
      <a href={run.href} target="_blank" rel="noopener noreferrer nofollow">
        {node}
      </a>
    );
  }
  return <Fragment key={key}>{node}</Fragment>;
}

function renderRuns(runs: RichRun[], keyPrefix: string): ReactNode {
  return runs.map((run, i) => runNode(run, `${keyPrefix}-${i}`));
}

function renderBlock(block: RichBlock, key: string): ReactNode {
  if (block.type === 'p') return <p key={key}>{renderRuns(block.runs, key)}</p>;
  if (block.type === 'heading2') return <h2 key={key}>{renderRuns(block.runs, key)}</h2>;
  if (block.type === 'heading3') return <h3 key={key}>{renderRuns(block.runs, key)}</h3>;
  if (block.type === 'blockquote') return <blockquote key={key}>{renderRuns(block.runs, key)}</blockquote>;
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag key={key}>
        {block.items.map((item, i) => (
          <li key={`${key}-${i}`}>{renderRuns(item, `${key}-${i}`)}</li>
        ))}
      </Tag>
    );
  }
  // TS không tự thu hẹp RichBlock chỉ bằng phủ định 4 literal 'p'/'heading2'/'heading3'/'blockquote'
  // cùng thuộc RichParagraphBlock qua các `if` rời nhau — kiểm dương tường minh ở đây (xem lý do
  // tương tự trong tiptap-bridge.ts's blockToTiptap()).
  if (block.type !== 'table') {
    throw new Error(`loại khối không được hỗ trợ: ${(block as { type: string }).type}`);
  }
  // table — cuộn NGANG trong khung riêng (không làm tràn cả trang ở 375px), semantics đúng
  // <caption>/<thead>/<th scope="col"> khi có hàng tiêu đề.
  const [headRow, ...bodyRows] = block.headerRow ? [block.rows[0], ...block.rows.slice(1)] : [null, ...block.rows];
  return (
    <div key={key} className={styles.tableWrap}>
      <table className={styles.table}>
        {block.caption && <caption>{block.caption}</caption>}
        {headRow && (
          <thead>
            <tr>
              {headRow.map((cell, c) => (
                <th key={`${key}-h-${c}`} scope="col">
                  {renderRuns(cell, `${key}-h-${c}`)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, r) => (
            <tr key={`${key}-r-${r}`}>
              {row.map((cell, c) => (
                <td key={`${key}-r-${r}-${c}`}>{renderRuns(cell, `${key}-r-${r}-${c}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Diễn giải DUY NHẤT của RichDoc dùng CHUNG cho xem trước (editor), bản đã duyệt (moderator
 * compare), và trang công khai — owner yêu cầu rõ "cùng một cách diễn giải" (Gói D điểm 3). Khi
 * `richDoc` null, render Y HỆT hành vi plain-text đã có từ Gói A (`<p className="longText">`,
 * pre-wrap) — không có bước chuyển đổi/migrate nào, dữ liệu cũ hiển thị đúng như trước khi có tính
 * năng này.
 */
export function RichDescriptionRenderer({ richDoc, plainFallback }: Props) {
  if (!richDoc) {
    if (!plainFallback) return null;
    return <p className={placesStyles.longText}>{plainFallback}</p>;
  }
  if (richDoc.blocks.length === 0) return null;
  return <div className={styles.root}>{richDoc.blocks.map((block, i) => renderBlock(block, `b${i}`))}</div>;
}
