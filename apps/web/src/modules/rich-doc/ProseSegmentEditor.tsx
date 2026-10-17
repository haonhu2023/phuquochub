'use client';

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { proseBlocksToTiptapJSON, tiptapJSONToProseBlocks, type ProseBlock } from './tiptap-bridge';
import styles from './rich-editor.module.css';

interface Props {
  blocks: ProseBlock[];
  onChange: (blocks: ProseBlock[]) => void;
  disabled?: boolean;
}

// Soạn văn xuôi (đoạn/tiêu đề phụ/trích dẫn/danh sách/đậm/nghiêng/liên kết) bằng THAO TÁC TRỰC TIẾP
// (nút bấm) — KHÔNG yêu cầu gõ cú pháp Markdown/JSON (owner yêu cầu rõ ở Gói D điểm 2). Schema Tiptap
// bị GIỚI HẠN đúng bằng tập node/mark mà RichDoc hỗ trợ (tắt strike/code/codeBlock/horizontalRule/
// underline) — người dùng không thể tạo ra thứ mà tiptap-bridge.ts không biết chuyển đổi. Bảng KHÔNG
// nằm trong editor này (xem segments.ts/RichTableEditor.tsx).
export function ProseSegmentEditor({ blocks, onChange, disabled }: Props) {
  // So sánh NÔNG bằng JSON để biết một thay đổi content có thực sự ĐẾN TỪ onUpdate của chính editor
  // này hay không — tránh vòng lặp setContent↔onUpdate khi parent re-render với cùng dữ liệu.
  const lastEmitted = useRef<string>(JSON.stringify(blocks));

  const editor = useEditor({
    editable: !disabled,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
        heading: { levels: [2, 3] },
        link: false, // cấu hình riêng bên dưới (allowlist scheme + không tự mở link khi click trong lúc soạn)
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
    ],
    content: proseBlocksToTiptapJSON(blocks),
    onUpdate: ({ editor: ed }) => {
      const next = tiptapJSONToProseBlocks(ed.getJSON());
      lastEmitted.current = JSON.stringify(next);
      onChange(next);
    },
  });

  // Đồng bộ MỘT CHIỀU khi `blocks` đổi từ BÊN NGOÀI (vd chuyển bản nháp khác) — không phải do chính
  // editor này vừa phát ra (so với lastEmitted để tránh set lại chính nó, làm mất vị trí con trỏ).
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(blocks);
    if (incoming === lastEmitted.current) return;
    lastEmitted.current = incoming;
    editor.commands.setContent(proseBlocksToTiptapJSON(blocks) as JSONContent);
  }, [blocks, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const setLink = () => {
    const current = editor.getAttributes('link').href as string | undefined;
    // Chủ ý dùng window.prompt — thao tác trực tiếp đơn giản, không cần state/modal riêng cho v1
    // (eslint repo này không bật no-alert nên không cần disable-comment).
    const url = window.prompt('Địa chỉ liên kết (để trống để xoá liên kết):', current ?? 'https://');
    if (url === null) return; // bấm Cancel
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const unsetLink = () => editor.chain().focus().unsetLink().run();

  const btn = (active: boolean) => (active ? `${styles.toolBtn} ${styles.toolBtnActive}` : styles.toolBtn);

  return (
    <div className={styles.proseSegment}>
      <div className={styles.toolbar} role="toolbar" aria-label="Định dạng văn bản">
        <select
          aria-label="Kiểu đoạn"
          className={styles.toolSelect}
          disabled={disabled}
          value={editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('blockquote') ? 'quote' : 'p'}
          onChange={(e) => {
            const v = e.target.value;
            const chain = editor.chain().focus();
            if (v === 'h2') chain.setHeading({ level: 2 }).run();
            else if (v === 'h3') chain.setHeading({ level: 3 }).run();
            else if (v === 'quote') chain.setBlockquote().run();
            else chain.setParagraph().run();
          }}
        >
          <option value="p">Đoạn văn</option>
          <option value="h2">Tiêu đề phụ lớn</option>
          <option value="h3">Tiêu đề phụ nhỏ</option>
          <option value="quote">Trích dẫn</option>
        </select>
        <button type="button" className={btn(editor.isActive('bold'))} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive('bold')} title="Đậm">
          <strong>B</strong>
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive('italic')} title="Nghiêng">
          <em>I</em>
        </button>
        <button type="button" className={btn(editor.isActive('bulletList'))} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-pressed={editor.isActive('bulletList')} title="Danh sách không số">
          • Danh sách
        </button>
        <button type="button" className={btn(editor.isActive('orderedList'))} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-pressed={editor.isActive('orderedList')} title="Danh sách có số">
          1. Danh sách
        </button>
        <button type="button" className={btn(editor.isActive('link'))} disabled={disabled} onClick={setLink} title="Chèn/sửa liên kết">
          Liên kết
        </button>
        {editor.isActive('link') && (
          <button type="button" className={styles.toolBtn} disabled={disabled} onClick={unsetLink} title="Xoá liên kết">
            Xoá liên kết
          </button>
        )}
        <span className={styles.toolbarSpacer} />
        <button type="button" className={styles.toolBtn} disabled={disabled || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Hoàn tác">
          ↶ Hoàn tác
        </button>
        <button type="button" className={styles.toolBtn} disabled={disabled || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Làm lại">
          ↷ Làm lại
        </button>
      </div>
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}
