/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RichTextBlock } from './RichTextBlock';
import type { RichTextContent } from '../types';

// 2026-09-29 — H2/H3/blockquote/bold/italic via structured `runs`, backward compatible with old
// articles that only ever had `{type:'p'|'list', text/items}` (no `runs`).
describe('RichTextBlock', () => {
  it('renders an old-shape paragraph (text only, no runs) as plain <p>', () => {
    const content: RichTextContent = { paragraphs: [{ type: 'p', text: 'Đoạn văn cũ.' }] };
    render(<RichTextBlock content={content} />);
    const p = screen.getByText('Đoạn văn cũ.');
    expect(p.tagName).toBe('P');
  });

  it('renders an old-shape list unchanged', () => {
    const content: RichTextContent = { paragraphs: [{ type: 'list', items: ['Mục 1', 'Mục 2'] }] };
    render(<RichTextBlock content={content} />);
    expect(screen.getByText('Mục 1').tagName).toBe('LI');
    expect(screen.getByText('Mục 2').tagName).toBe('LI');
  });

  it('renders heading2/heading3 as real <h2>/<h3> tags', () => {
    const content: RichTextContent = {
      paragraphs: [
        { type: 'heading2', text: 'Tiêu đề cấp 2' },
        { type: 'heading3', text: 'Tiêu đề cấp 3' },
      ],
    };
    render(<RichTextBlock content={content} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tiêu đề cấp 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Tiêu đề cấp 3' })).toBeInTheDocument();
  });

  it('renders blockquote as a real <blockquote>', () => {
    const content: RichTextContent = { paragraphs: [{ type: 'blockquote', text: 'Một câu trích dẫn.' }] };
    render(<RichTextBlock content={content} />);
    const quote = screen.getByText('Một câu trích dẫn.');
    expect(quote.closest('blockquote')).not.toBeNull();
  });

  it('renders bold/italic runs as real <strong>/<em>, ignoring `text` when runs is present', () => {
    const content: RichTextContent = {
      paragraphs: [
        {
          type: 'p',
          text: 'sẽ bị bỏ qua vì có runs',
          runs: [{ text: 'Bình thường, ' }, { text: 'đậm', bold: true }, { text: ' và ' }, { text: 'nghiêng', italic: true }],
        },
      ],
    };
    render(<RichTextBlock content={content} />);
    expect(screen.queryByText('sẽ bị bỏ qua vì có runs')).not.toBeInTheDocument();
    expect(screen.getByText('đậm').tagName).toBe('STRONG');
    expect(screen.getByText('nghiêng').tagName).toBe('EM');
    expect(screen.getByText('Bình thường,', { exact: false })).toBeInTheDocument();
  });

  it('renders a run that is both bold and italic as nested <strong><em>', () => {
    const content: RichTextContent = { paragraphs: [{ type: 'p', runs: [{ text: 'cả hai', bold: true, italic: true }] }] };
    render(<RichTextBlock content={content} />);
    const em = screen.getByText('cả hai');
    expect(em.tagName).toBe('EM');
    expect(em.parentElement?.tagName).toBe('STRONG');
  });
});
