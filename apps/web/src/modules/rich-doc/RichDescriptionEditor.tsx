'use client';

import { useState } from 'react';
import type { RichDoc } from '@phuquochub/shared-types';
import { docToSegments, segmentsToDoc, emptyTableBlock, newSegmentId, type Segment } from './segments';
import { ProseSegmentEditor } from './ProseSegmentEditor';
import { RichTableEditor } from './RichTableEditor';
import styles from './rich-editor.module.css';

interface Props {
  value: RichDoc | null;
  onChange: (doc: RichDoc) => void;
  disabled?: boolean;
}

const EMPTY_DOC: RichDoc = { v: 1, blocks: [] };

// Điểm vào soạn mô tả rich-text (Gói D, luồng đầu tiên: mô tả tuyển dụng). Quản lý state dưới dạng
// danh sách "segment" nối tiếp (xem segments.ts) — mỗi segment văn xuôi là MỘT ProseSegmentEditor
// (Tiptap), mỗi segment bảng là MỘT RichTableEditor, với nút "+ Chèn bảng" giữa các segment để chèn
// bảng vào đúng vị trí mong muốn trong tài liệu (không chỉ nối vào cuối).
export function RichDescriptionEditor({ value, onChange, disabled }: Props) {
  // `segments` khởi tạo MỘT LẦN từ `value` ban đầu — các lần đổi sau tới từ chính editor này (qua
  // setSegments→emit), không đọc lại `value` mỗi render (tránh vòng lặp, mất vị trí con trỏ đang gõ).
  const [segments, setSegments] = useState<Segment[]>(() => docToSegments(value ?? EMPTY_DOC));

  const emit = (next: Segment[]) => {
    setSegments(next);
    onChange(segmentsToDoc(next));
  };

  const insertTableAt = (index: number) => {
    const tableSeg: Segment = { kind: 'table', id: newSegmentId(), block: emptyTableBlock() };
    const proseSeg: Segment = { kind: 'prose', id: newSegmentId(), blocks: [] };
    const next = [...segments];
    next.splice(index, 0, tableSeg, proseSeg);
    emit(next);
  };

  return (
    <div className={styles.root}>
      <InsertTableControl disabled={disabled} onInsert={() => insertTableAt(0)} />
      {segments.map((seg, idx) => (
        <div key={seg.id}>
          {seg.kind === 'prose' ? (
            <ProseSegmentEditor
              blocks={seg.blocks}
              disabled={disabled}
              onChange={(blocks) => {
                const next = segments.map((s) => (s.id === seg.id ? { ...s, blocks } : s));
                emit(next);
              }}
            />
          ) : (
            <RichTableEditor
              table={seg.block}
              disabled={disabled}
              onChange={(block) => {
                const next = segments.map((s) => (s.id === seg.id ? { ...s, block } : s));
                emit(next);
              }}
              onRemove={() => {
                // Xoá segment bảng — nếu segment văn xuôi liền trước/sau đều rỗng và sẽ còn lại hai
                // segment văn xuôi rỗng liền kề, gộp lại để tránh hai Tiptap instance trống chồng nhau.
                const next = segments.filter((s) => s.id !== seg.id);
                emit(next.length ? next : [{ kind: 'prose', id: newSegmentId(), blocks: [] }]);
              }}
            />
          )}
          <InsertTableControl disabled={disabled} onInsert={() => insertTableAt(idx + 1)} />
        </div>
      ))}
    </div>
  );
}

function InsertTableControl({ onInsert, disabled }: { onInsert: () => void; disabled?: boolean }) {
  return (
    <div className={styles.insertRow}>
      <button type="button" className={styles.insertTableBtn} onClick={onInsert} disabled={disabled}>
        + Chèn bảng tại đây
      </button>
    </div>
  );
}
