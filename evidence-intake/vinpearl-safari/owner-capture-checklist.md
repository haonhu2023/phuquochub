# Owner capture checklist

For **each** claim you want to support with evidence (one row in `evidence-intake-manifest.csv`
per claim), capture and record all of the following before it goes in `files/`.

## 1. The file itself

- [ ] A real screenshot (full browser window, address bar visible) or a saved PDF of the actual
      page — not a crop, not a re-typed summary.
- [ ] Saved into `files/`, named so it's identifiable later, e.g.
      `2026-09-09-vinwonders-vi-opening-hours.png`.
- [ ] Not empty, not corrupted — open it yourself before adding it to the manifest.

## 2. Source URL

- [ ] The exact URL you captured the page from (the address-bar URL at the moment of capture, not
      a guess or a shortened link).

## 3. Timestamp with timezone

- [ ] The date and time you captured it, with an explicit timezone (e.g.
      `2026-09-09T14:30:00+07:00`, not just "today").

## 4. Page title

- [ ] The `<title>` text of the page as it appeared in the browser tab, or the PDF's title if it
      was saved as a PDF.

## 5. Claim this evidence supports

- [ ] One specific, plain-language statement of what this file proves — e.g. "opening hours are
      09:00-16:00 daily" or "the listed phone number is +84 xxx xxx xxx". Not "general info about
      Safari" — one claim per row.

## 6. SHA-256 of the file itself

- [ ] Computed from the actual file bytes, not typed from memory. On Windows PowerShell:
      `Get-FileHash -Algorithm SHA256 <file>`. On macOS/Linux: `shasum -a 256 <file>` or
      `sha256sum <file>`.
- [ ] `verify-evidence-files.sh` will recompute this independently and flag any mismatch — this is
      a cross-check, not a formality.

## 7. Terms / license / reuse note

- [ ] A short note on whether the source page has visible copyright/terms text, and whether
      reusing a screenshot of it (internally, for verification purposes, not republishing the
      content) raises any concern you're aware of. If unsure, write "unsure" — don't guess.

## 8. Reviewer name

- [ ] Your name (or whoever captured this evidence) — so a question about it later has someone to
      ask.

## Reminders

- Capture the **current** state of the page. A stale screenshot from months ago cannot support a
  claim about the place's *current* opening hours.
- If the page changes between two claims you're capturing (e.g. hours differ by season), capture
  each state separately with its own timestamp — don't merge them into one row.
- This checklist produces raw material for a human evidence-review decision later. Filling it out
  correctly does not itself approve anything — see `owner-approval-form.md`.
