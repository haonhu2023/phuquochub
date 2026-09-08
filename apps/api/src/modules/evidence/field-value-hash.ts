import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';

// Current-value binding for place_field_evidence_links — same idiom as
// place-translations/source-text-hash.ts's `computeSourceTextHash`/`isSourceTextStale` (ADR-020
// §"Decision 2"), because it is structurally the identical problem: "was this evidence captured
// against the value that is still current, or has the value since drifted?" Reuses `canonicalJson()`
// (not raw JSON.stringify) for the same reason source-text-hash does — canonical-json.ts's own
// header names `opening_hours` explicitly as the motivating case for key-order-independent hashing.
//
// Deliberately NOT a revision-id binding: PlacesService.update()/.create() do record a
// wiki-style revision on every scalar write, but that path is bypassed by every bulk-import/
// administrative-backfill/raw-SQL reconciliation flow this codebase actually uses to seed real
// place facts (multilingual-import, administrative-backfill.service.ts, one-off scripts) — a
// revision-id binding would silently under-cover exactly the places this feature exists for. A
// value fingerprint computed from whatever `places.<field>` holds right now works regardless of
// which write path produced it.
export function computeFieldValueHash(value: unknown): string {
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

// Mirrors isSourceTextStale's shape: pure, no DB access — caller supplies the CURRENT field value
// (already read from wherever it actually lives: places.opening_hours today, another table's
// column for a future field).
export function isFieldValueStale(storedFieldValueHash: string, currentValue: unknown): boolean {
  return storedFieldValueHash !== computeFieldValueHash(currentValue);
}
