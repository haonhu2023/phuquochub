# Vinpearl Safari evidence intake package

Local, offline staging area for evidence the **owner** captures by hand (screenshots, saved PDFs)
for the Vinpearl Safari place record, and a validator that checks those files WITHOUT touching any
database.

## Why this exists

`vinwonders.com` blocks automated fetching (`robots.txt` disallows this crawler), so no code here
may fetch it. The only path to real evidence for Vinpearl Safari's opening hours, phone, and other
disputed fields is a **human** visiting the site (or another primary source) and capturing what
they see, by hand, with enough context to be checked later.

This package is intake tooling only. It does not import anything into the database, does not
change `verification_status`, and does not run migrations. See `../SAFARI-DECISIONS.md` for the
open decisions (D1-D5) this evidence would eventually support, and their current HOLD/UNRESOLVED
status.

## Place identity — read this before touching anything

- **Production** Vinpearl Safari place id: `7ab06900-8d98-4222-8cfd-794526e65667` (slug
  `vinpearl-safari`).
- **Staging** Vinpearl Safari place id starts `8381328d-` — a **different** place row in a
  **different** database.
- These ids are **never interchangeable**. Every manifest row and every filename in this package
  must be tagged with which environment it is for. Do not copy a staging id into a
  production-bound file or vice versa.

## Workflow

1. Owner captures evidence by hand, following `owner-capture-checklist.md` for each fact they are
   supporting (opening hours, phone, etc.).
2. Owner (or whoever is helping them) drops the raw files into `files/` and fills one row per file
   into `evidence-intake-manifest.csv`.
3. Owner fills out `owner-approval-form.md` — this is the explicit human sign-off gate; nothing in
   `files/` is usable evidence without it.
4. Run `./verify-evidence-files.sh` (or `sh verify-evidence-files.sh` on a shell without exec bits)
   from this directory. It reads local files only, computes real SHA-256 hashes, cross-checks them
   against the manifest, and writes a PASS/HOLD/FAIL report. It does not connect to anything.
5. Hand the PASS/HOLD/FAIL report and the manifest to whoever is authorized to make the eventual
   evidence-review and `verification_status` decision. **That decision is out of scope for this
   package** — this package only proves the files are real, complete, and hash-matched; it does not
   decide whether they are sufficient to act on.

## What this package will never do

- Fetch `vinwonders.com` or any other URL automatically.
- Write to any database, staging or production.
- Change `verification_status`, `opening_hours`, `price_range`, or any other place field.
- Decide FOR the owner whether a piece of evidence is good enough — see `owner-approval-form.md`.
