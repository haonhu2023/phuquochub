/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { RichDoc } from '@phuquochub/shared-types';
import { RichDescriptionRenderer } from './RichDescriptionRenderer';

describe('RichDescriptionRenderer', () => {
  it('richDoc=null, có plainFallback → render Y HỆT hành vi plain-text cũ (một <p>, pre-wrap qua class dùng chung)', () => {
    render(<RichDescriptionRenderer richDoc={null} plainFallback={'Đoạn một.\n\nĐoạn hai.'} />);
    const p = screen.getByText(/Đoạn một/);
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe('Đoạn một.\n\nĐoạn hai.');
  });

  it('richDoc=null, plainFallback=null → không render gì', () => {
    const { container } = render(<RichDescriptionRenderer richDoc={null} plainFallback={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('richDoc có blocks rỗng → không render gì (kể cả khi plainFallback có giá trị — richDoc có mặt là authoritative)', () => {
    const { container } = render(<RichDescriptionRenderer richDoc={{ v: 1, blocks: [] }} plainFallback={'cũ'} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('render đúng heading2/heading3/blockquote/p với đậm/nghiêng', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'heading2', runs: [{ text: 'Tiêu đề lớn' }] },
        { type: 'heading3', runs: [{ text: 'Tiêu đề nhỏ' }] },
        { type: 'blockquote', runs: [{ text: 'Trích dẫn' }] },
        { type: 'p', runs: [{ text: 'chữ ' }, { text: 'đậm', bold: true }, { text: ' và ' }, { text: 'nghiêng', italic: true }] },
      ],
    };
    render(<RichDescriptionRenderer richDoc={doc} plainFallback={null} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tiêu đề lớn' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Tiêu đề nhỏ' })).toBeInTheDocument();
    expect(screen.getByText('Trích dẫn').closest('blockquote')).not.toBeNull();
    expect(screen.getByText('đậm').tagName).toBe('STRONG');
    expect(screen.getByText('nghiêng').tagName).toBe('EM');
  });

  it('render link với rel/target an toàn (noopener/noreferrer, mở tab mới)', () => {
    const doc: RichDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Xem thêm', href: 'https://example.com' }] }] };
    render(<RichDescriptionRenderer richDoc={doc} plainFallback={null} />);
    const link = screen.getByRole('link', { name: 'Xem thêm' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('render danh sách không số/có số đúng thẻ ul/ol', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'list', ordered: false, items: [[{ text: 'Một' }], [{ text: 'Hai' }]] },
        { type: 'list', ordered: true, items: [[{ text: 'Bước 1' }]] },
      ],
    };
    const { container } = render(<RichDescriptionRenderer richDoc={doc} plainFallback={null} />);
    expect(container.querySelector('ul')).not.toBeNull();
    expect(container.querySelector('ol')).not.toBeNull();
    expect(screen.getByText('Một').closest('li')).not.toBeNull();
  });

  it('render bảng: caption, hàng tiêu đề thành <th scope="col"> trong <thead>, dữ liệu trong <tbody>, cuộn trong khung riêng', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        {
          type: 'table',
          headerRow: true,
          caption: 'Bảng giá phòng',
          rows: [
            [[{ text: 'Loại phòng' }], [{ text: 'Giá' }]],
            [[{ text: 'Phòng đơn' }], [{ text: '200.000' }]],
          ],
        },
      ],
    };
    const { container } = render(<RichDescriptionRenderer richDoc={doc} plainFallback={null} />);
    expect(screen.getByText('Bảng giá phòng').tagName).toBe('CAPTION');
    const th = screen.getByRole('columnheader', { name: 'Loại phòng' });
    expect(th).toHaveAttribute('scope', 'col');
    expect(th.closest('thead')).not.toBeNull();
    expect(screen.getByText('Phòng đơn').closest('tbody')).not.toBeNull();
    // Khung cuộn ngang bọc NGOÀI bảng (overflow-x:auto qua CSS Module) — mock CSS Module của repo
    // này không giữ được tên class thật qua default-interop (xem ghi chú tương tự ở
    // jobs/[id]/page.spec.tsx), nên chỉ kiểm CẤU TRÚC: một phần tử bọc ring NGOÀI <table>, không
    // phải chính <table> hay document.body trực tiếp — đủ để xác nhận có khung riêng, không tràn
    // thẳng ra ngoài.
    const table = container.querySelector('table');
    expect(table?.parentElement).not.toBeNull();
    expect(table?.parentElement?.tagName).toBe('DIV');
    expect(table?.parentElement).not.toBe(container);
  });

  it('bảng KHÔNG có hàng tiêu đề → không có <thead>, mọi hàng nằm trong <tbody>', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [{ type: 'table', headerRow: false, rows: [[[{ text: 'a' }], [{ text: 'b' }]]] }],
    };
    const { container } = render(<RichDescriptionRenderer richDoc={doc} plainFallback={null} />);
    expect(container.querySelector('thead')).toBeNull();
    expect(screen.getByText('a').closest('tbody')).not.toBeNull();
  });
});
