import type { RichTextParagraph, RichTextRun } from '../guide/types';

// Rich text formatting (2026-09-29) — the editor's ONLY formatting affordance is a plain textarea
// (one line = one paragraph, same UX the redesign already shipped). Rather than a WYSIWYG toolbar
// or a heavy editor library, a few line-prefix/inline conventions ("## ", "> ", "**bold**",
// "*italic*") are parsed HERE, in the browser, into the closed structured shape
// (RichTextParagraph/RichTextRun — see guide/types.ts) that is the only thing ever sent to the
// API and ever stored. The markup string itself is NEVER persisted and the public renderer
// (RichTextBlock.tsx) never parses anything — it only maps {bold,italic} to <strong>/<em>. This
// keeps "không dùng HTML tự do" true while giving a familiar typing experience.
//
// Backward compatible by construction: `paragraphToLine` falls back to `text` when `runs` is
// absent (every article saved before this feature), and `lineToParagraph` only ever produces the
// new shape for whatever the owner types from now on — old paragraphs are never rewritten unless
// their line is actually edited.

const INLINE_MARKUP_RE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function hasInlineMarkup(raw: string): boolean {
  INLINE_MARKUP_RE.lastIndex = 0;
  return INLINE_MARKUP_RE.test(raw);
}

export function parseInlineRuns(raw: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  let lastIndex = 0;
  INLINE_MARKUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_MARKUP_RE.exec(raw))) {
    if (m.index > lastIndex) runs.push({ text: raw.slice(lastIndex, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) runs.push({ text: m[2], italic: true });
    lastIndex = INLINE_MARKUP_RE.lastIndex;
  }
  if (lastIndex < raw.length) runs.push({ text: raw.slice(lastIndex) });
  return runs.filter((r) => r.text !== '');
}

export function serializeRuns(runs: RichTextRun[] | undefined, text: string | undefined): string {
  if (!runs || runs.length === 0) return text ?? '';
  return runs.map((r) => (r.bold ? `**${r.text}**` : r.italic ? `*${r.text}*` : r.text)).join('');
}

/** One line of the editor's textarea -> one structured paragraph. */
export function lineToParagraph(line: string): RichTextParagraph {
  let type: RichTextParagraph['type'] = 'p';
  let body = line;
  if (line.startsWith('### ')) {
    type = 'heading3';
    body = line.slice(4);
  } else if (line.startsWith('## ')) {
    type = 'heading2';
    body = line.slice(3);
  } else if (line.startsWith('> ')) {
    type = 'blockquote';
    body = line.slice(2);
  }
  return hasInlineMarkup(body) ? { type, runs: parseInlineRuns(body) } : { type, text: body };
}

/** One structured paragraph -> one editable line (reverse of `lineToParagraph`, for loading an
 *  existing article into the textarea). `list` paragraphs are handled separately by the caller
 *  (they live in their own list textarea, unchanged from before this feature). */
export function paragraphToLine(p: RichTextParagraph): string {
  const body = serializeRuns(p.runs, p.text);
  if (p.type === 'heading3') return `### ${body}`;
  if (p.type === 'heading2') return `## ${body}`;
  if (p.type === 'blockquote') return `> ${body}`;
  return body;
}
