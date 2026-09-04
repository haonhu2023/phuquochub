// Read-only post-operation validator (release-closure task, 2026-09-04). Checks that a set of
// evidence-manifest + translation-import operations landed exactly as expected — no writes, ever.
// Takes a generic expectations manifest (place slugs + expected evidence business_keys + expected
// translation field/locale targets) rather than hardcoding any specific cohort, so the same tool
// verifies Hòn Thơm's relink, Batch 2, or any future cohort without a rewrite.

export interface ExpectedTranslationTarget {
  field_key: string;
  locale_code: string;
}

export interface ExpectationsManifestEntry {
  place_slug: string;
  expected_evidence_business_keys: string[];
  expected_translation_targets: ExpectedTranslationTarget[];
}

export interface ExpectationsManifest {
  entries: ExpectationsManifestEntry[];
}

export interface ValidatorDbPort {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type ValidatorFindingSeverity = 'error' | 'warning';

export interface ValidatorFinding {
  place_slug: string;
  code: string;
  severity: ValidatorFindingSeverity;
  message: string;
}

export interface ValidatorResult {
  ok: boolean;
  findings: ValidatorFinding[];
  checked: {
    places: number;
    evidence_business_keys: number;
    translation_targets: number;
  };
}

/**
 * Entirely read-only — every query below is a SELECT. Requires the caller to have already verified
 * DB identity (same convention as evidence-manifest-importer.ts / the CLI); this function itself
 * does not re-check `current_database()` since a validator has no destructive potential to guard
 * against — but the CLI wrapper still requires --db-name for consistency and audit-trail clarity.
 */
export async function runPostOperationValidator(
  manifest: ExpectationsManifest,
  db: ValidatorDbPort,
): Promise<ValidatorResult> {
  const findings: ValidatorFinding[] = [];
  let businessKeysChecked = 0;
  let targetsChecked = 0;

  for (const entry of manifest.entries) {
    const push = (code: string, severity: ValidatorFindingSeverity, message: string) =>
      findings.push({ place_slug: entry.place_slug, code, severity, message });

    const placeRows = await db.query<{ id: string }>('SELECT id FROM places WHERE slug = $1', [entry.place_slug]);
    const place = placeRows[0];
    if (!place) {
      push('PLACE_NOT_FOUND', 'error', `no place with slug "${entry.place_slug}"`);
      continue;
    }

    for (const businessKey of entry.expected_evidence_business_keys) {
      businessKeysChecked += 1;
      const rows = await db.query<{ id: string; verification_status: string; source_id: string }>(
        'SELECT id, verification_status, source_id FROM evidence_artifacts WHERE business_key = $1',
        [businessKey],
      );
      if (rows.length === 0) {
        push('EXPECTED_EVIDENCE_MISSING', 'error', `expected evidence_artifacts row with business_key "${businessKey}" not found`);
        continue;
      }
      if (rows.length > 1) {
        push('DUPLICATE_BUSINESS_KEY', 'error', `business_key "${businessKey}" has ${rows.length} rows — should be unique`);
      }
      const evidence = rows[0];
      if (evidence.verification_status === 'VERIFIED' || evidence.verification_status === 'BUSINESS_VERIFIED_AND_REVIEWED') {
        push('UNEXPECTED_VERIFICATION_PROMOTION', 'error', `evidence "${businessKey}" is ${evidence.verification_status} — no automated operation may promote this`);
      }

      const linkRows = await db.query<{ translation_id: string }>(
        'SELECT translation_id FROM place_translation_evidence_links WHERE evidence_id = $1',
        [evidence.id],
      );
      const linkedTranslationIds = new Set(linkRows.map((r) => r.translation_id));

      for (const target of entry.expected_translation_targets) {
        const [translation] = await db.query<{ id: string }>(
          'SELECT id FROM place_translations WHERE place_id = $1 AND field_key = $2 AND locale_code = $3 AND is_current = true',
          [place.id, target.field_key, target.locale_code],
        );
        if (translation && !linkedTranslationIds.has(translation.id)) {
          push(
            'MISSING_LINK',
            'warning',
            `evidence "${businessKey}" is not linked to the current ${target.field_key}/${target.locale_code} translation (${translation.id})`,
          );
        }
      }
    }

    for (const target of entry.expected_translation_targets) {
      targetsChecked += 1;
      const [translation] = await db.query<{
        id: string;
        human_review_status: string;
        is_public: boolean;
        is_production_data: boolean;
        production_eligible: boolean;
      }>(
        `SELECT id, human_review_status, is_public, is_production_data, production_eligible
         FROM place_translations WHERE place_id = $1 AND field_key = $2 AND locale_code = $3 AND is_current = true`,
        [place.id, target.field_key, target.locale_code],
      );
      if (!translation) {
        push('EXPECTED_TRANSLATION_MISSING', 'error', `expected current translation for ${target.field_key}/${target.locale_code} not found`);
        continue;
      }
      if (translation.human_review_status !== 'PENDING' && translation.human_review_status !== 'NEEDS_CHANGES') {
        push(
          'UNEXPECTED_REVIEW_STATUS',
          'error',
          `${target.field_key}/${target.locale_code} has human_review_status="${translation.human_review_status}" — no automated operation should have changed this from PENDING/NEEDS_CHANGES`,
        );
      }
      if (translation.is_public || translation.is_production_data || translation.production_eligible) {
        push(
          'UNEXPECTED_PUBLICATION_FLAG',
          'error',
          `${target.field_key}/${target.locale_code} has is_public=${translation.is_public} is_production_data=${translation.is_production_data} production_eligible=${translation.production_eligible} — all must be false for PENDING content`,
        );
      }
    }
  }

  const ok = !findings.some((f) => f.severity === 'error');
  return { ok, findings, checked: { places: manifest.entries.length, evidence_business_keys: businessKeysChecked, translation_targets: targetsChecked } };
}
