# Evidence Policy

Every claim recorded in the delivery framework must be **traceable to evidence** or
explicitly marked as unproven. This directory holds evidence records produced by tasks.

## Accepted evidence types

- repository file paths (ideally `path:line`)
- code references (function/route/migration identifiers)
- captured **test** output
- captured **lint** output
- captured **type-check** output
- captured **migration** output
- generated API documentation (OpenAPI)
- deployment logs
- health-check output
- production telemetry
- approval records (who approved what, when)

## Forbidden claims without evidence

Do **not** write any of the following unless a linked artifact proves it:

```
deployed successfully
production stabilized
backfill completed
all consumers migrated
legacy path unused
hypercare passed
tests passed
build green
```

When proof is absent, use one of: `unknown`, `not_started`, `not_verified`, `blocked`.

## Environment note (current)

In this environment, verification commands cannot run:

- **No Node.js runtime** on PATH (`node`/`npm`/`npx` not found).
- **FAT-family volume (`F:`)** — npm cannot create workspace symlinks, so
  `node_modules/@phuquochub/*` is empty and any file importing `@phuquochub/*` will not
  resolve.

Therefore lint / typecheck / build / unit / e2e are recorded as `NOT EXECUTED` with this
cause until the repository is on **NTFS** with **Node ≥ 20** installed. The CI reference
for how these *should* run is `.github/workflows/ci.yml`.

## Evidence record naming

Create one file per task run, e.g. `PLACE-001-baseline.md`, containing:

- the task id and run timestamp;
- each claim with its `path:line` or captured output;
- every command attempted, its exit status or `NOT EXECUTED` + cause;
- explicit `unknown` / `not_verified` markers where proof is unavailable.
