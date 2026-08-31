# ADR-020 — Place Translation Model (i18n Foundation: vi/en, extensible)

## Status

Proposed.

## Context

PhuQuocHub's `places` table (ADR-001/002/003) and every satellite table (`place_seo`, `place_faqs`,
`place_ai_summary`, …) are single-locale today — implicitly Vietnamese, with no `language_code`
anywhere in the schema. `docs/data/modules/places.md:203` records this as an open, never-answered
question since the project's early design phase: *"Đa ngôn ngữ: dịch name/description sang tiếng
Anh → cần bảng `place_translations (place_id, language, ...)` hay giữ đơn ngữ giai đoạn đầu?"*
`docs/architecture/seo.md:41` marks `hreflang` as `*(khung)*` — an outline, never implemented. Zero
of the 46 existing migrations touch translation, locale, slug-per-language, SEO-per-language, or
hreflang. No ADR addresses i18n. This ADR closes that gap.

**Owner-approved architectural decisions (this round), binding on this ADR:**

1. Normalized, locale-scoped tables — **no** `name_vi`/`name_en`/`description_vi`/`description_en`
   columns on `places`.
2. Vietnamese (`vi`) is the source/default locale. English (`en`) is the second active locale.
3. Future locales are controlled by data/config in a locale table, never hardcoded to "only vi/en"
   anywhere in the schema or code.
4. The i18n importer (a *future* piece of work, not built in this PR) must reuse Slice 0.5's
   approval-digest / canonical-JSON / evidence / source-attribution / revision / publish-manifest /
   dry-run / idempotency / transaction architecture — not a parallel pipeline.
5. No import pipeline parallel to `admin-data`/Slice 0.5.
6. Translations must have immutable revisions and data-level rollback. No hard overwrite of a
   published translation.
7. Google Sheets is a reviewed contract/queue source, never the database of record.
8. The two local XLSX exports are read-only references, never edited.

**Contract read directly from the two local XLSX files** (`03_Import_Queue.xlsx`,
`11_Multilingual_Content.xlsx`; see the Final Report for full sheet-by-sheet detail). The material
facts that shape this ADR:

- `11_LANGUAGES`: `vi` = `role=SOURCE_DEFAULT`, `is_default=YES`; `en` = `role=TARGET_PRIMARY`,
  `fallback_language_code=vi`; both `status=ACTIVE`. Seven future locales (`fr`, `de`, `ru`, `ko`,
  `ja`, `zh-Hans`, `th`) are `status=PLANNED`, `is_public=NO`, `is_production_data=NO` — real BCP-47
  codes, not placeholders, sitting in data rows, not code.
- `11_TRANSLATABLE_FIELDS`: 25 real field definitions (`FIELD-I18N-001..025`) across `PLACE`,
  `CATEGORY`, `FACET`, `FACET_VALUE`, `AREA`, `EVENT`, `FAQ`, `PAGE`. For `PLACE`: `display_name`,
  `short_description`, `long_description`, `trust_note`, `traveler_tip`, `best_time_to_visit`,
  `editorial_warning`, `opening_hours_note`, `price_note`, `accessibility_note`,
  `health_safety_note`, `security_note` — 12 fields. `PAGE` carries `seo_title`, `seo_description`,
  `route_slug`.
- `11_CONTENT_TRANSLATIONS` (49 columns), `11_ROUTE_SLUGS` (25 columns), `11_SEO_METADATA`
  (34 columns), `11_TRANSLATION_REVIEW` (33 columns) — every column referenced below is a real
  column in a real sheet, not invented.
- `11_FALLBACK_RULES`: `en` missing → `SHOW_SOURCE_WITH_BADGE` (show `vi` with a visible badge,
  never silently); `vi` missing → `NO_FALLBACK` → `SHOW_MISSING_STATE` (vi is the source; a missing
  vi record is a data-quality issue, not something to paper over). **`seo_fallback_allowed = NO`
  for both rules** — English SEO must never silently reuse Vietnamese metadata.
- `11_TRANSLATION_RULES`: 15 named rules (`RULE-LANG-001..015`), each `severity` ∈
  {BLOCKER, HIGH, MEDIUM}. Confirms, as explicit BLOCKER rules: `RULE-LANG-003` (AI translation
  requires human review before publish), `RULE-LANG-004` (stale source hash blocks), `RULE-LANG-009`
  (slug collision blocks), `RULE-LANG-012` (administrative/legal names are never overwritten by a
  translation), `RULE-LANG-014` (a new version must point at the old one via `change_id` —
  supersession, never in-place overwrite), `RULE-LANG-015` (production gate: APPROVED + VERIFIED +
  current + public + production, all four, before anything ships).
- `03_TRANSLATION_QUEUE`: exactly **64 columns**, naming all 15 quality gates
  (`language_coverage_status` … `policy_status`) individually plus `quality_gates_passed`/
  `quality_gates_total`. **Exactly one row exists, and it is the template/HOLD/BLOCKED sample row**
  (`TRNQ-TEMPLATE-001`, notes: *"DÒNG MẪU — HOLD/BLOCKED; không được nhập"*) — the sheet's own
  summary block reads `TỔNG BUNDLE=1, SẴN SÀNG NHẬP=0, ĐANG BỊ CHẶN=1`. There is currently **zero**
  real, importable translation bundle. `11_CONTENT_TRANSLATIONS` likewise has exactly 2 rows, both
  the `ENTITY-TEMPLATE` sample pair.
- `03_FIELD_MAPPING`, `MAP-028`–`MAP-034` — the mappings this ADR's schema must satisfy exactly:
  - **MAP-028**: `place_translations(entity_type, entity_id, field_key, language_code)` from
    `11_CONTENT_TRANSLATIONS` columns B:C:D:F, filtered to `is_current=YES ∧ is_public=YES ∧
    is_production_data=YES ∧ quality_gate=APPROVED_FOR_PUBLISH`.
  - **MAP-029**: `place_translations.translated_text` from `translated_text` (col J), required
    `APPROVED_FOR_PUBLISH`; *"Không nhập bản AI chưa có human review APPROVED"*.
  - **MAP-030**: `place_translations.source_text_hash` from col I; *"Hash lệch nghĩa là bản dịch
    STALE; phải dịch/duyệt lại"*.
  - **MAP-031**: target table **`place_translation_routes`** — `(localized_slug, full_path,
    canonical_url)` from `11_ROUTE_SLUGS` D:F:G:H; *"Slug duy nhất theo locale; giữ redirect khi
    thay đổi"*.
  - **MAP-032**: target table **`place_translation_seo`** — `(seo_title, seo_description,
    canonical_url, hreflang_group_id)` from `11_SEO_METADATA` D:F:G:N:O; *"Không fallback SEO tiếng
    Anh sang tiếng Việt"*.
  - **MAP-033**: `03_TRANSLATION_QUEUE.required_language_codes` derived from `11_LANGUAGES`
    B:J:K:M:N, default `vi|en`; *"Ngôn ngữ PLANNED không được coi là bắt buộc hoặc production"*.
  - **MAP-034**: `translation_bundle_id`/`payload_digest_sha256` — *"Một bundle cho một entity và
    tập ngôn ngữ; idempotency bắt buộc"*.

  **These three mapping-target names — `place_translations`, `place_translation_routes`,
  `place_translation_seo` — are what this ADR uses**, not the more generic names floated before the
  contract was read (`place_route_slugs`, `place_seo_metadata`): the contract is the tie-breaker per
  owner decision #7, and a future importer built against `03_FIELD_MAPPING` should not have to
  rename its own mapping targets.
- `11_CONTRACT_MAPPING` holds a **separate** `MAP-I18N-001..016` series (sheets 01–10 → sheet 11),
  unrelated to `MAP-028..034`. No conflict — two complementary mapping tables, not competing ones.
  Notably `MAP-I18N-011`: `08_Place_Master.display_name_vi` is source; *"VI là source; EN lưu tại
  11"* — the upstream data-collection workbook (sheets 01–10, not this repository's database) is
  itself already vi-source / en-in-11 shaped, consistent with owner decision #2.
- `98_I18N_CONTRACT_TEST`: three fixture rows, `test_result=PASS` for all three, matching exactly
  the three cases this task's own test brief names: full vi/en coverage → `YES/PASS`
  (`I18N-CONTRACT-001`), one gate `FAIL` → `NO/PASS` (`I18N-CONTRACT-002`), missing a required
  language → `NO/PASS`, only `vi` present (`I18N-CONTRACT-003`).
- `99_DANH_MUC`: closed enum dictionary, VI/EN label pairs kept separate from the machine
  `enum_value` — confirms `language_code` values are literal BCP-47 strings (`vi`, `en`, …), not a
  bespoke internal enum requiring translation to change.

**Existing reusable architecture, read from code, not assumed:**

- **`wiki_revisions`** (`apps/api/src/modules/revisions/`) — polymorphic
  (`entity_type`/`entity_id`), append-only, immutable (`@Entity` has no `updated_at`, no soft
  delete, `onDelete: 'NO ACTION'`), `jsonb` `snapshot`/`diff`, self-referencing `parent_revision_id`
  chain, `revision_number` with a unique `(entity_type, entity_id, revision_number)` index, and a
  `status` lifecycle (`pending`/`approved`/`rejected`/`reverted`). The entity's own header comment:
  *"entity_type: giai đoạn đầu chỉ `place`; mở rộng `topic, area, business…` = THÊM giá trị enum
  (ADR-014) — không đổi schema."* This is designed to be extended exactly this way, not redesigned.
  `RevisionsService.recordPlaceRevision()` is a thin `PLACE`-specific wrapper over a generic
  `revisionsRepo.record({entityType, entityId, …})` call — the underlying mechanism is already
  entity-type-agnostic.
- **Slice 0.5 contracts** (`apps/api/src/modules/admin-data/`) — `approval-evidence.contract.ts`
  (SHA-256 digest over `canonicalJson()`, pure, no DB/I/O), `approval-policy.contract.ts` (pure
  offline evaluator), `approval-review-record.contract.ts` (normalized reviewer record + digest),
  `publish-manifest.contract.ts` (immutable checksummed manifest for "a future production-writing
  job, Slice 0.5E, **not yet built**"). `PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md`
  (untracked design report already in this repo) independently concludes: no data-level rollback
  exists anywhere yet — the only rollback mechanism today is a full-database restore
  (`scripts/backup.sh`/`restore.sh`). This ADR's revision mechanism is what gives translations a
  real per-row rollback, which the place-facts side of Slice 0.5 still lacks.
- **`canonicalJson()`** (`apps/api/src/common/canonical-json.ts`) — key-order-independent JSON
  serialization, already the digest basis for both `verified-facts-ingestion.service.ts` and
  `publish-manifest.contract.ts`. Reused here for `payload_digest_sha256`/`bundle_digest_sha256`
  rather than re-implemented.
- **`place_seo`** (`apps/api/src/modules/places/entities/place-seo.entity.ts`) — an existing,
  single-locale, `place_id`-keyed SEO table (`@OneToOne` with `Place`), already in production use.
  It is **not touched by this ADR** (see Decision, "Coexistence with `place_seo`").

## Problem

Design and (this PR) implement the minimal, correct, extensible database foundation for storing
place translations, per-locale route slugs, per-locale SEO/hreflang metadata, and immutable
translation revisions — satisfying `03_FIELD_MAPPING` MAP-028..034 exactly, integrating with the
existing `wiki_revisions`/Slice-0.5 architecture rather than duplicating it, without touching
`places` or any other existing table, and without building the importer or writing any data.

## Decision

We will add **four new tables** plus **one extension to an existing enum**, all additive:

### 1. `supported_locales`

One row per locale (`vi`, `en`, and future `PLANNED` locales), config-driven — nothing in code
hardcodes "only vi and en."

```
locale_code            varchar(35) PK   -- BCP 47 (e.g. 'vi', 'en', 'zh-Hans')
language_name_en       varchar(100)
native_name            varchar(100)
direction              enum('ltr','rtl')          default 'ltr'
role                   enum('source_default','target_primary','target_future')
status                 enum('active','planned','inactive')
is_default             boolean          default false
is_public              boolean          default false
is_production_data     boolean          default false
fallback_locale_code   varchar(35) NULL REFERENCES supported_locales(locale_code)
effective_from         timestamptz NULL
effective_to           timestamptz NULL
created_at             timestamptz
updated_at             timestamptz
```

Constraints: exactly one row with `is_default = true` (partial unique index
`WHERE is_default`); `fallback_locale_code` must differ from `locale_code` (CHECK); a `PLANNED`
locale must have `is_public = false AND is_production_data = false` (CHECK) — the database itself
enforces MAP-033's rule, not just application code. Seeded (via migration seed, not app code) with
exactly `vi` (`source_default`, `is_default`, `ACTIVE`) and `en` (`target_primary`, fallback `vi`,
`ACTIVE`) as `is_public = is_production_data = true`; the seven `PLANNED` locales are **not**
seeded in this PR (no evidence any of them needs to exist yet; adding a locale row later is exactly
"data, not a migration" per owner decision #3).

### 2. `place_translations`

```
id                       uuid PK
place_id                 uuid NOT NULL REFERENCES places(id)
field_key                varchar(60) NOT NULL          -- e.g. 'short_description' (11_TRANSLATABLE_FIELDS.field_key)
locale_code               varchar(35) NOT NULL REFERENCES supported_locales(locale_code)
source_locale_code        varchar(35) NOT NULL REFERENCES supported_locales(locale_code)
translated_text          text NOT NULL
text_format               enum('plain_text','markdown')
source_text_hash          char(64) NOT NULL             -- sha256 hex, canonical-serialized source text
translation_method        enum('original','human','ai_plus_human','official_or_human')
translation_status        varchar(40) NOT NULL          -- mirrors 11_CONTENT_TRANSLATIONS.translation_status
human_review_status       varchar(40) NOT NULL          -- mirrors review_status; gates publish (RULE-LANG-003)
quality_gate              varchar(40) NOT NULL          -- e.g. 'APPROVED_FOR_PUBLISH' (MAP-028/029 filter value)
revision_id                uuid NOT NULL REFERENCES wiki_revisions(id)
supersedes_translation_id  uuid NULL REFERENCES place_translations(id)   -- RULE-LANG-014 chain
is_current                boolean NOT NULL default false
is_public                 boolean NOT NULL default false
is_production_data        boolean NOT NULL default false
production_eligible       boolean NOT NULL default false
source_id                 uuid NULL REFERENCES sources(id)               -- provenance (Slice 0.5 pattern)
evidence_id                uuid NULL                                     -- future FK once an evidence table exists
import_batch_id            uuid NULL                                     -- which queue run wrote this row
created_at                 timestamptz
updated_at                 timestamptz
```

**Uniqueness is scoped to the current row, not the composite key overall**: a partial unique index
`(place_id, field_key, locale_code) WHERE is_current` — exactly what MAP-028's "unique per
entity/field/language" means once full revision history is kept (the composite key repeats once
per revision by design; only one revision may be `is_current` at a time). Additional index on
`(place_id, locale_code)` for the read path.

`translated_text` for `locale_code = source_locale_code` represents the **original Vietnamese
content** — this table is also where `vi` "translations" (i.e., the source text itself, tagged
`translation_method = 'original'`) live, so a single query can assemble a place's content for any
locale, source included, without special-casing `vi`. This matches `11_CONTENT_TRANSLATIONS`,
whose own template row has `source_language_code = vi, language_code = vi` for the Vietnamese
"translation."

### 3. `place_translation_routes`

```
id                     uuid PK
place_id               uuid NOT NULL REFERENCES places(id)
locale_code             varchar(35) NOT NULL REFERENCES supported_locales(locale_code)
localized_slug          varchar(220) NOT NULL
full_path               varchar(300) NOT NULL
canonical_url           varchar(300) NOT NULL
is_canonical            boolean NOT NULL default true
redirect_from_slug      varchar(220) NULL
is_redirect             boolean NOT NULL default false
revision_id             uuid NOT NULL REFERENCES wiki_revisions(id)
is_current              boolean NOT NULL default false
is_public               boolean NOT NULL default false
is_production_data      boolean NOT NULL default false
created_at              timestamptz
updated_at              timestamptz
```

Partial unique index `(locale_code, localized_slug) WHERE is_current` — slug uniqueness is **scoped
per locale** (MAP-031: *"Slug duy nhất theo locale"*), so `vi` and `en` may legitimately reuse the
same slug string without colliding with each other. A slug retired by a rename becomes a row with
`is_redirect = true, redirect_from_slug = <old slug>, is_current = false` — old URLs keep resolving
(MAP-031: *"giữ redirect khi thay đổi"*) via a lookup that includes non-current redirect rows,
never a delete.

### 4. `place_translation_seo`

```
id                     uuid PK
place_id               uuid NOT NULL REFERENCES places(id)
locale_code             varchar(35) NOT NULL REFERENCES supported_locales(locale_code)
seo_title               varchar(160) NULL
seo_description         varchar(320) NULL
canonical_url           varchar(300) NOT NULL
hreflang_group_id       uuid NOT NULL       -- groups the vi/en (/future) rows that are alternates of ONE logical page
robots_index            boolean NOT NULL default false
robots_follow           boolean NOT NULL default true
og_title                varchar(160) NULL
og_description          varchar(320) NULL
translation_id_title    uuid NULL REFERENCES place_translations(id)   -- provenance: which translation the title came from
translation_id_description uuid NULL REFERENCES place_translations(id)
revision_id             uuid NOT NULL REFERENCES wiki_revisions(id)
is_current              boolean NOT NULL default false
is_public               boolean NOT NULL default false
is_production_data      boolean NOT NULL default false
created_at              timestamptz
updated_at              timestamptz
```

Partial unique index `(place_id, locale_code) WHERE is_current`. **`robots_index` defaults
`false`** and a CHECK requires `translation_id_title IS NOT NULL` whenever `robots_index = true` for
any locale other than the row's own place's default-locale content — this is the schema-level form
of MAP-032's *"Không fallback SEO tiếng Anh sang tiếng Việt"*: an English SEO row can only be
indexable once it is backed by an actual approved English translation, never by falling through to
Vietnamese text. `hreflang_group_id` is the same UUID across every locale's row for one logical
page, so the hreflang set (`vi`, `en`, future) and the `x-default` target are computed by grouping
on it — no separate hreflang table needed for two locales; revisit if hreflang logic grows more
elaborate than "list the group."

### 5. Revision reuse: extend `RevisionEntityType`, do not add a new revisions table

Add one enum value, additive (`ALTER TYPE revision_entity_type ADD VALUE`), no schema redesign:

```ts
export enum RevisionEntityType {
  PLACE = 'place',
  PLACE_TRANSLATION = 'place_translation', // NEW
}
```

`entityId` for a `PLACE_TRANSLATION` revision is the `place_translations.id` (or
`place_translation_routes.id` / `place_translation_seo.id` — one `wiki_revisions` row per changed
record, same pattern as today's `PLACE` rows, not one row per bundle). `origin` reuses the existing
`RevisionOrigin.IMPORT` value (no new value needed — *how* a translation was authored is tracked in
`place_translations.translation_method`, which is a separate concern from *how the DB write
happened*, matching how `VerifiedFactsIngestionService` already separates `source_attributions`
authorship from `wiki_revisions.origin`). A new thin service method,
`RevisionsService.recordPlaceTranslationRevision()`, mirrors `recordPlaceRevision()` exactly —
**`recordPlaceRevision()` itself is untouched.**

Rollback is: read the target `wiki_revisions.snapshot` for the record's prior current revision,
insert a **new** `place_translations`/`route`/`seo` row from that snapshot marked `is_current`, flip
the previous current row's `is_current` to `false`, record a new `wiki_revisions` row
(`origin = IMPORT`, referencing the reverted-to revision in `change_note`). This is a per-row,
transactional, forward-only "revert is itself a new revision" — never a destructive `UPDATE`/
`DELETE` on history, and never a full-database restore.

### Coexistence with `place_seo`

`place_seo` (existing, single-locale, `place_id`-keyed) is **not modified, migrated, or read by
anything added in this PR**. It continues to serve whatever currently reads it. Deciding whether/
when the application's read path moves from `place_seo` to `place_translation_seo` (locale = the
request's resolved locale) is explicitly **out of scope** here — that is an application/API-layer
decision for the future production-write job, not a schema-foundation decision, and touching an
existing table's consumers is exactly the kind of change owner decision constraints and this task's
own stop conditions ask to avoid in a foundation PR.

### Locale extensibility (adding a third language later)

1. Insert one `supported_locales` row (`status='planned'` while work is in progress).
2. Populate `place_translations`/`place_translation_routes`/`place_translation_seo` rows for that
   `locale_code` through the same importer path once it exists.
3. Flip `status='active'`, `is_public=true`, `is_production_data=true` on the locale row once
   coverage/review/SEO gates pass for it.

No code path in this ADR's schema, entities, or repository layer enumerates `vi`/`en` literally
except the two seed rows and the two migration-time CHECK constraints that reference
`supported_locales` generically (never a literal locale list).

## Alternatives Considered

- **`name_vi`/`name_en` columns on `places`** — rejected outright by owner decision #1. Does not
  scale past two locales, cannot represent per-field review/approval/hash state, and cannot express
  "no English translation exists yet" versus "English translation is empty" (whereas an absent
  `place_translations` row is unambiguous).
- **JSONB blob column on `places` keyed by locale** (`places.translations jsonb`) — rejected: no
  per-row FK to `wiki_revisions`, no partial-unique-index-enforced "exactly one current version,"
  no way to independently gate/approve/rollback one locale's one field without touching the whole
  blob, and it reintroduces exactly the "in-place overwrite" problem RULE-LANG-014/owner decision
  #6 forbid.
- **A dedicated `translation_revisions` table, separate from `wiki_revisions`** — rejected per this
  task's own instruction to prefer extending existing revisions, and because `wiki_revisions` was
  *designed* for this extension (its own header comment says so) with no missing capability
  identified. Building a parallel revision table would itself violate owner decision #5's spirit
  (no parallel pipeline) even though decision #5 is phrased about the *importer*.
- **A dedicated `translation_reviews` table mirroring `11_TRANSLATION_REVIEW`'s 33 columns
  1:1** — rejected for this PR: `place_translations.human_review_status` +
  `wiki_revisions.status`/`reviewed_by`/`reviewed_at` already capture what publish-gating needs
  (RULE-LANG-003/015). The richer per-round review detail (`accuracy_score`, `proper_name_check`,
  `linguistics_score`, …) is real and valuable, but is *reviewer tooling* data, not something the
  publish decision itself depends on beyond a pass/fail status this ADR already stores. Deferred
  until a reviewer UI is actually being built (evidence-based, not speculative).
- **Single `place_translation_metadata` table combining routes + SEO** — rejected: `03_FIELD_MAPPING`
  names them as two separate mapping targets (`MAP-031` vs `MAP-032`) with different uniqueness
  scopes (slug uniqueness is a routing concern; `hreflang_group_id` is an SEO concern), and slugs
  need redirect history that SEO rows do not.
- **`hreflang` as its own table** — rejected for two locales: `hreflang_group_id` grouping on
  `place_translation_seo` already answers "what are the alternates of this page" with a single
  `WHERE hreflang_group_id = ?` query. Revisit only if hreflang needs to model relationships more
  complex than "these locale-rows are the same logical page" (e.g., region-variant hreflang like
  `en-US` vs `en-GB`), which is not in the current contract.

## Consequences

### Positive

- Satisfies `03_FIELD_MAPPING` MAP-028..034 with matching table/column names — a future importer
  built directly against the contract needs no renaming shim.
- Zero changes to `places` or any existing table/entity — no migration risk to current production
  data, no compatibility break.
- Revision/rollback reuses a mechanism already proven in production use by `PLACE` revisions;
  translations get real per-row rollback that the place-facts side of Slice 0.5 still lacks
  (per `PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md`'s own finding).
- Locale set is fully data-driven; a third locale is a data change, not a schema change, matching
  owner decision #3 and the `PLANNED`-locale pattern already sitting in `11_LANGUAGES`.
- `canonicalJson()`/digest patterns, `sources` provenance, and Slice 0.5's approval/evidence
  contracts are reused, not reinvented — a future importer's dry-run/preflight/transaction
  boundaries can be written against the same primitives `VerifiedFactsIngestionService` already
  uses.

### Negative

- Four new tables (plus one enum value) is real schema surface; a place's full localized content
  now requires joining across `place_translations`/`place_translation_routes`/
  `place_translation_seo` rather than reading flat columns — acceptable cost for the flexibility
  gained, and consistent with how `place_seo`/`place_faqs`/`place_ai_summary` already satellite off
  `places` rather than living on it.
- `place_seo` and `place_translation_seo` coexist with no defined cutover yet — a follow-up ADR (or
  amendment to this one) is needed before the API/web read path can safely move to the new table
  for any locale, `vi` included. Left as an explicit open item rather than decided speculatively.
- `evidence_id` has no FK target yet (no evidence table exists in this schema today) — stored as a
  bare nullable `uuid` for forward compatibility, matching how `publish-manifest.contract.ts`
  already treats evidence as an artifact-level concept ahead of any DB table for it. Revisit once
  Slice 0.5D3 (the evidence producer) lands.
- This ADR does **not** design the importer, the queue-consumption job, or how `quality_gate`/
  `human_review_status` values get written — only the tables they write into. That is deliberately
  deferred (owner: "chưa xây production-write job").

## Related Documents

- `docs/data/modules/places.md` §"Câu hỏi mở" (the original unanswered question this ADR resolves).
- `docs/architecture/seo.md` §16/§41 (hreflang outline this ADR implements the schema for).
- `docs/delivery/reports/PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md` (Slice 0.5 design;
  rollback-gap finding this ADR's revision mechanism addresses for translations specifically).
- `docs/delivery/reports/APPROVAL-AUDIT-EVIDENCE-DESIGN-2026-08-25.md` (approval-evidence contract
  this ADR's future importer is expected to reuse).
- `03_Import_Queue.xlsx` (`03_TRANSLATION_QUEUE`, `03_FIELD_MAPPING`, `98_I18N_CONTRACT_TEST`),
  `11_Multilingual_Content.xlsx` (all `11_*` sheets, `99_DANH_MUC`) — read-only contract sources for
  this ADR; not modified.

## Related ADR

- ADR-001 (Place is core), ADR-002 (Place extension pattern) — `place_translations`/
  `place_translation_routes`/`place_translation_seo` follow the same "satellite table off `places`"
  shape as `place_seo`/`place_faqs`.
- ADR-003 (No polymorphic FKs) — `place_translations.place_id` is a real FK to `places(id)`, not
  polymorphic; only the *revision* linkage (`wiki_revisions.entity_id`) is polymorphic, consistent
  with ADR-014's existing exception for that one table.
- ADR-005 (Contact entity), ADR-009 (Media model) — same satellite-table precedent.
- ADR-014 (Revision model) — this ADR extends `RevisionEntityType`, does not amend ADR-014's design.
- ADR-016 (Audit log model) — `place_translations`/routes/SEO carry their own `created_at`/
  `updated_at`+revision linkage rather than duplicating the general audit-log table; consistent
  with how `PLACE` revisions already relate to `audit_logs` (orthogonal, not overlapping).

## Notes

- Proposed 2026-08-29, this session. Not yet reviewed or accepted by the owner.
- Open follow-up (explicitly not decided here): `place_seo` → `place_translation_seo` read-path
  cutover timing and mechanism.
- Open follow-up: `evidence_id` FK target, once an evidence table exists.
- Open follow-up: whether `place_translations.translation_status`/`human_review_status` should
  become real Postgres enums (matching `99_DANH_MUC`'s closed-enum values) rather than `varchar` —
  left as `varchar` in this PR pending confirmation of the *complete* value set from `99_DANH_MUC`
  beyond the `LANGUAGE_CODE` group already read; tightening this later is additive
  (`varchar` → `enum` migration), loosening would not be, so the conservative choice today is the
  wider type.
- This ADR is **not committed** in this session (owner instruction: "Không commit ADR").
