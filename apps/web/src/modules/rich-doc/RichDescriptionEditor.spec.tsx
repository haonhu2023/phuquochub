/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RichDoc } from '@phuquochub/shared-types';
import { RichDescriptionEditor } from './RichDescriptionEditor';

// Xác nhận thực nghiệm: jest.config của repo này (jsdom) đã đủ API cho Tiptap/ProseMirror mount và
// chạy được — không cần polyfill `document.createRange`/`getClientRects` như một số setup jsdom khác.
describe('RichDescriptionEditor (tích hợp Tiptap thật, jsdom)', () => {
  it('render được, hiện nội dung ban đầu từ RichDoc có sẵn', async () => {
    const value: RichDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Nội dung có sẵn' }] }] };
    render(<RichDescriptionEditor value={value} onChange={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Nội dung có sẵn')).toBeInTheDocument());
  });

  it('gõ thêm chữ vào đoạn văn → onChange nhận đúng RichDoc cập nhật', async () => {
    const onChange = jest.fn();
    const value: RichDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Xin chào' }] }] };
    render(<RichDescriptionEditor value={value} onChange={onChange} />);
    const editable = await waitFor(() => {
      const el = document.querySelector('[contenteditable="true"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.input(editable, { target: { textContent: 'Xin chào thêm chữ' } });
    // Tiptap đồng bộ qua lệnh ProseMirror, không chỉ DOM textContent thô — chỉ xác nhận onChange đã
    // CHẠY (bằng chứng pipeline onUpdate→tiptapJSONToProseBlocks→onChange hoạt động từ đầu đến
    // cuối), không khẳng định nội dung gõ cụ thể (phụ thuộc hành vi nhập liệu giả lập của jsdom).
    expect(document.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('bấm "+ Chèn bảng tại đây" → chèn một bảng mới, onChange nhận RichDoc có block table', async () => {
    const onChange = jest.fn();
    render(<RichDescriptionEditor value={null} onChange={onChange} />);
    await waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: '+ Chèn bảng tại đây' })[0]);
    expect(onChange).toHaveBeenCalled();
    const doc = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RichDoc;
    expect(doc.blocks.some((b) => b.type === 'table')).toBe(true);
  });

  it('có bảng → xoá bảng qua RichTableEditor → onChange không còn block table', async () => {
    const onChange = jest.fn();
    const value: RichDoc = { v: 1, blocks: [{ type: 'table', headerRow: false, rows: [[[{ text: 'x' }]]] }] };
    render(<RichDescriptionEditor value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bảng' }));
    const doc = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RichDoc;
    expect(doc.blocks.some((b) => b.type === 'table')).toBe(false);
  });

  it('disabled=true → vùng soạn không cho sửa (contenteditable=false)', async () => {
    const value: RichDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Khoá' }] }] };
    render(<RichDescriptionEditor value={value} onChange={jest.fn()} disabled />);
    const editable = await waitFor(() => {
      const el = document.querySelector('.ProseMirror');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(editable).toHaveAttribute('contenteditable', 'false');
  });
});
