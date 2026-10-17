# ADR-DELIVERY-002 — Rich-text storage format for long description fields (Gói D)

- **Status:** Accepted (design decision; implementation not yet started)
- **Date:** 2026-10-17
- **Scope:** Storage/validation/render format for long free-text description fields
  (places, hotels, restaurants, tours, beaches, job_listings, real_estate_listings).
  Does not change the EN-translation CAS/staleness mechanism built in Gói C
  (job_listing_translations, real_estate_listing_translations) — only how the *source*
  text those mechanisms hash is represented.

## Context

Owner's Gói D brief (point 6 of the active instruction) asked for a survey of existing
libraries, then a locked format decision, before any editor work starts, with these
hard constraints:

- paragraphs, sub-headings, bold/italic, lists, links, tables
- preserve the plain-text content and the `\n`-preservation fix already shipped in Gói A
- server-side sanitization via an allowlist
- tables need row/column actions, a caption, and must not overflow at 375px
- price/contact/date/quantity/coordinates stay structured data, never re-entered as text
- translation, hash, preview, and renderer must all understand the *same* format —
  explicitly to avoid converting the same content twice across Gói C and Gói D
- no bulk auto-conversion of existing production content

## Survey findings

A reusable building block already exists: `guide_articles` (`apps/api/src/modules/
guide-articles/`, ~6,100 LOC across ~45 files). Its `rich_text` block stores
`{ paragraphs: RichTextParagraph[] }` where each paragraph is
`{ type: 'p'|'list'|'heading2'|'heading3'|'blockquote', runs?: { text, bold?, italic? }[] }`.

Relevant properties:

- **No raw HTML is ever stored or rendered.** `RichTextBlock.tsx` maps the typed JSON
  straight to JSX (`<h2>`, `<strong>`, `<ul><li>`, …). There is no
  `dangerouslySetInnerHTML` and no HTML sanitizer library anywhere in the repo — safety
  is structural (a closed set of node/run types), not achieved by cleaning markup after
  the fact.
- **No editor library is installed.** Neither `apps/web` nor `apps/api` has tiptap,
  slate, lexical, quill, prosemirror, draft-js, react-markdown, remark/rehype,
  sanitize-html, dompurify, marked, or turndown in `package.json`. The guide-articles
  editor UI is a plain `<textarea>` plus a 70-line hand-rolled shorthand parser
  (`apps/web/src/modules/guide-editor/richTextSyntax.ts`) that turns `## `, `### `,
  `> `, `**bold**`, `*italic*` typed at line-start/inline into the structured JSON
  client-side, before anything is sent to the API. Server-side, `guide-articles.
  service.ts` validates the decoded JSON against the closed type/length rules (not
  Zod/class-validator) — this validation, not an HTML allowlist, is what "sanitize via
  allowlist" means in a structural format.
- **Gap vs. Gói D's requirements:** the existing shape covers paragraphs, headings,
  bold/italic, and bulleted lists (~60% of the ask) but has **no link field on a run**
  and **no table block of any kind** anywhere in the codebase (the closest analogue,
  `MenuEditor.tsx`'s sections/items, is bespoke to pricing and not a generic
  row/column primitive).
- Reusing the *whole* guide-articles machinery (separate `guide_blocks` table, position
  ordering, `needs_decision`/editorial-review flow) for a single description field
  would be overkill — that system is sized for a multi-block CMS article, not one
  field on a listing/place row.

## Decision

Adopt the **same structural-safety principle** as `guide_articles.rich_text` — never
store or render raw HTML — but define a **smaller, standalone JSON shape** scoped to a
single field, extended with the two missing primitives (links, tables). This is a new,
versioned content format, not a reuse of the `guide_blocks` table.

```ts
type RichDoc = { v: 1; blocks: RichBlock[] };

type RichBlock =
  | { type: 'p' | 'heading2' | 'heading3' | 'blockquote'; runs: RichRun[] }
  | { type: 'list'; ordered: boolean; items: RichRun[][] }
  | { type: 'table'; caption?: string; rows: RichRun[][][] }; // rows[r][c] = cell runs

type RichRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
```

- `href` is validated server-side against an allowlist of schemes (`https:`, `http:`,
  `mailto:`, `tel:`) — the same "allowlist, not blocklist" sanitization style the brief
  asked for, applied structurally instead of to markup.
- A table's `rows` is a plain 2-D array (no per-cell colspan/rowspan) so the renderer
  can always lay it out as a horizontally-scrollable `<table>` wrapped in a fixed-width
  container at ≤375px (overflow-x on the wrapper, not the page) — no layout engine
  needed. Row/column add/remove in the editor is an array-splice on `rows`, nothing
  server-specific.
- Server-side validation (closed `type`/`href`-scheme checks, max run/row/column
  counts) lives next to each entity's existing validation, following the
  `guide-articles.service.ts` precedent — no new dependency, no HTML sanitizer library
  added.

### Backward compatibility (no bulk conversion)

Each affected `description`-shaped column stays a plain string column. A new sibling
column (nullable `jsonb`, e.g. `description_rich`) is added by migration, written only
when an owner/editor actively uses the rich editor going forward. Rendering rule,
applied once per entity:

- `description_rich` present → render it as `RichDoc`.
- `description_rich` null → synthesize a one-block `RichDoc` from the legacy plain
  string by splitting on `\n` into separate `p` blocks (this *is* the Gói A
  newline-preservation fix, now expressed as the fallback path, not re-implemented).

No existing row is rewritten. This satisfies "không tự chuyển đổi hàng loạt nội dung
production" directly — legacy content keeps rendering exactly as it does today, forever,
unless an editor opts in by using the new field.

### Translation/hash compatibility (no second migration for Gói C)

`computeJobListingSourceHash` / `computeRealEstateListingSourceHash` (Gói C) hash plain
strings. They are **not changed**. A single helper,
`flattenRichDocToPlainText(doc: RichDoc): string` (join block text in order, `\n`
between blocks, `\n` between list items, `<text> (<href>)` for links, tab-separated
cells for table rows), is called before hashing whenever `description_rich` is present;
when it is null, the existing plain string is hashed exactly as today. Translators,
the stale-check, and the public overlay all keep working against "the current plain
text meaning of the source field," regardless of which column produced it — so Gói C's
CAS/staleness/audit design from this session does not need to change, and does not need
a second data migration when Gói D ships.

### Editor UI

Extend the existing hand-rolled shorthand parser pattern
(`richTextSyntax.ts`), not a WYSIWYG library: add `[text](url)` link syntax and a
`| cell | cell |` row syntax (one row per line, first line = header row) parsed into
the `table` block. This keeps the dependency footprint at zero and matches the UX
editors already use for guide articles, rather than introducing Tiptap/Slate/Lexical
as a new, heavier dependency for what is a supplementary field on otherwise
structured listing/place data.

## Alternatives considered

1. **Store sanitized raw HTML (allowlist via `sanitize-html`/DOMPurify).** Rejected:
   adds a new dependency and a real XSS-adjacent attack surface (allowlist sanitizers
   are a recurring source of bypass CVEs); the structural approach already proven by
   `guide_articles` gives the same editing power with zero sanitizer library and zero
   HTML parsing on render.
2. **Adopt a full WYSIWYG library (Tiptap/ProseMirror) now.** Rejected for this round:
   none is installed, the existing shorthand-textarea pattern already works for owners
   editing guide articles, and pulling in a rich editor framework is a much larger
   footprint than the two missing primitives (links, tables) actually require. Can be
   revisited later without changing the storage format, since `RichDoc` is
   editor-agnostic.
3. **Reuse `guide_blocks`/`guide_articles` tables directly for listing descriptions.**
   Rejected: that schema carries CMS concerns (block position, per-block
   `needs_decision` editorial flag, a dedicated article entity) that don't apply to a
   single field on a listing/place row; would couple unrelated domains for no benefit.
4. **Bulk-convert existing plain-text descriptions to `RichDoc` at migration time.**
   Rejected: explicitly ruled out by the brief ("không tự chuyển đổi hàng loạt nội
   dung production"); the fallback-rendering rule above makes conversion unnecessary.

## Consequences

- Implementation is scoped per entity: add `description_rich jsonb null` column(s),
  wire validation, wire `flattenRichDocToPlainText` into the relevant hash functions,
  extend `richTextSyntax.ts` for links/tables, build one table-aware renderer
  component, extend each public detail page's render path with the fallback rule above.
  Each entity (places/hotels/restaurants/tours/beaches, then job_listings and
  real_estate_listings) can be migrated independently and incrementally — no
  big-bang cutover.
- Nothing in this ADR changes any already-shipped Gói C behavior; it only commits to a
  format so that Gói C's hash/CAS/staleness mechanism will not need to be redesigned
  again when Gói D's editor ships.
