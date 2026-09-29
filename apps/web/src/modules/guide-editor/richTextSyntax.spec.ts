import { hasInlineMarkup, lineToParagraph, paragraphToLine, parseInlineRuns, serializeRuns } from './richTextSyntax';

describe('richTextSyntax', () => {
  describe('parseInlineRuns', () => {
    it('returns a single plain run for text with no markup', () => {
      expect(parseInlineRuns('đoạn văn thường')).toEqual([{ text: 'đoạn văn thường' }]);
    });

    it('parses **bold** into a bold run', () => {
      expect(parseInlineRuns('trước **đậm** sau')).toEqual([
        { text: 'trước ' },
        { text: 'đậm', bold: true },
        { text: ' sau' },
      ]);
    });

    it('parses *italic* into an italic run', () => {
      expect(parseInlineRuns('trước *nghiêng* sau')).toEqual([
        { text: 'trước ' },
        { text: 'nghiêng', italic: true },
        { text: ' sau' },
      ]);
    });

    it('parses mixed bold and italic in one line', () => {
      expect(parseInlineRuns('**đậm** và *nghiêng*')).toEqual([
        { text: 'đậm', bold: true },
        { text: ' và ' },
        { text: 'nghiêng', italic: true },
      ]);
    });

    it('handles markup at the very start/end with no surrounding plain text', () => {
      expect(parseInlineRuns('**đậm**')).toEqual([{ text: 'đậm', bold: true }]);
    });
  });

  describe('hasInlineMarkup', () => {
    it('is false for plain text', () => {
      expect(hasInlineMarkup('không có gì đặc biệt')).toBe(false);
    });
    it('is true when ** or * markup is present', () => {
      expect(hasInlineMarkup('có **đậm**')).toBe(true);
      expect(hasInlineMarkup('có *nghiêng*')).toBe(true);
    });
  });

  describe('serializeRuns (round-trip with parseInlineRuns)', () => {
    it('returns text unchanged when runs is absent (old articles)', () => {
      expect(serializeRuns(undefined, 'đoạn văn cũ')).toBe('đoạn văn cũ');
    });
    it('round-trips a bold+italic line back to the same markup', () => {
      const line = '**đậm** và *nghiêng*';
      expect(serializeRuns(parseInlineRuns(line), undefined)).toBe(line);
    });
  });

  describe('lineToParagraph', () => {
    it('plain line -> type p with text (no markup present)', () => {
      expect(lineToParagraph('đoạn văn thường')).toEqual({ type: 'p', text: 'đoạn văn thường' });
    });
    it('"## " prefix -> heading2', () => {
      expect(lineToParagraph('## Tiêu đề cấp 2')).toEqual({ type: 'heading2', text: 'Tiêu đề cấp 2' });
    });
    it('"### " prefix -> heading3', () => {
      expect(lineToParagraph('### Tiêu đề cấp 3')).toEqual({ type: 'heading3', text: 'Tiêu đề cấp 3' });
    });
    it('"> " prefix -> blockquote', () => {
      expect(lineToParagraph('> Một câu trích dẫn')).toEqual({ type: 'blockquote', text: 'Một câu trích dẫn' });
    });
    it('a heading line with inline bold produces runs, not text', () => {
      expect(lineToParagraph('## Tiêu đề **quan trọng**')).toEqual({
        type: 'heading2',
        runs: [{ text: 'Tiêu đề ' }, { text: 'quan trọng', bold: true }],
      });
    });
  });

  describe('paragraphToLine (round-trip with lineToParagraph)', () => {
    it('old-shape paragraph (text, no runs) round-trips through both directions', () => {
      const original = { type: 'p' as const, text: 'đoạn văn cũ' };
      expect(paragraphToLine(original)).toBe('đoạn văn cũ');
      expect(lineToParagraph(paragraphToLine(original))).toEqual(original);
    });

    it('heading2/heading3/blockquote round-trip through both directions', () => {
      for (const p of [
        { type: 'heading2' as const, text: 'H2' },
        { type: 'heading3' as const, text: 'H3' },
        { type: 'blockquote' as const, text: 'Trích dẫn' },
      ]) {
        expect(lineToParagraph(paragraphToLine(p))).toEqual(p);
      }
    });

    it('a paragraph with bold+italic runs round-trips through both directions', () => {
      const original = { type: 'p' as const, runs: [{ text: 'a ' }, { text: 'đậm', bold: true }, { text: ' b' }] };
      const line = paragraphToLine(original);
      expect(line).toBe('a **đậm** b');
      expect(lineToParagraph(line)).toEqual(original);
    });
  });
});
