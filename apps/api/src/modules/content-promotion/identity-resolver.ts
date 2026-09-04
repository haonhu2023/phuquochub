import type {
  IdentityResolutionMethod,
  IdentityResolutionResult,
  ManualIdentityMapping,
  ProductionPlaceCandidate,
} from './content-promotion.types';

export interface IdentityResolutionInput {
  staging_place_id: string;
  slug: string;
  /** provider -> external_id, from staging's place_external_identifiers (once PR #8 ships) —
   * empty today, wired for the moment it exists on both sides. */
  external_identifiers: Record<string, string>;
}

/**
 * Pure — no DB, no network. Given one staging place's identity signals and the FULL set of
 * candidate production places (already fetched, read-only, by the caller), decides how — or
 * whether — this staging place maps to a production place.
 *
 * The one rule that matters: only EXACT_MATCH or an explicit MANUAL_MAPPING may ever ACCEPT.
 * Coordinate+name similarity can only ever produce AMBIGUOUS — it is a hint for a human to look
 * at, never grounds for an automatic write.
 */
export function resolveProductionIdentity(
  input: IdentityResolutionInput,
  productionCandidates: readonly ProductionPlaceCandidate[],
  manualMappings: readonly ManualIdentityMapping[] = [],
): IdentityResolutionResult {
  const base = { staging_place_id: input.staging_place_id, slug: input.slug };

  // 1) Stable external identifier — the strongest possible signal, and the only one that survives
  // a slug rename on either side. Checked first, before slug, on purpose.
  const externalMatches = new Set<string>();
  for (const [provider, externalId] of Object.entries(input.external_identifiers)) {
    for (const candidate of productionCandidates) {
      if (candidate.external_identifiers[provider] === externalId) {
        externalMatches.add(candidate.id);
      }
    }
  }
  if (externalMatches.size === 1) {
    return {
      ...base,
      status: 'EXACT_MATCH',
      method: 'EXTERNAL_IDENTIFIER' as IdentityResolutionMethod,
      production_place_id: [...externalMatches][0],
      candidates: [...externalMatches],
      reason: 'exactly one production place shares a stable external identifier with staging',
    };
  }
  if (externalMatches.size > 1) {
    return {
      ...base,
      status: 'CONFLICT',
      method: 'EXTERNAL_IDENTIFIER',
      production_place_id: null,
      candidates: [...externalMatches],
      reason: `${externalMatches.size} production places share a staging external identifier — data integrity problem, not a matching problem`,
    };
  }

  // 2) An explicit, human-curated manual mapping. Never inferred — only ever read back verbatim.
  const manual = manualMappings.find((m) => m.staging_place_id === input.staging_place_id);
  if (manual) {
    const target = productionCandidates.find((c) => c.id === manual.production_place_id);
    if (!target) {
      return {
        ...base,
        status: 'CONFLICT',
        method: 'MANUAL_MAPPING_TABLE',
        production_place_id: null,
        candidates: [],
        reason: `manual mapping points to production place ${manual.production_place_id}, which does not exist among the supplied candidates`,
      };
    }
    return {
      ...base,
      status: 'MANUAL_MAPPING',
      method: 'MANUAL_MAPPING_TABLE',
      production_place_id: manual.production_place_id,
      candidates: [manual.production_place_id],
      reason: `explicit manual mapping (${manual.mapped_by}, ${manual.mapped_at}): ${manual.reason}`,
    };
  }

  // 3) Exact, case-sensitive, unique slug match. Slugs are the one identity signal guaranteed to
  // already exist on both sides today — proven for VinWonders and Hòn Thơm by direct inspection
  // of both databases before this function was written.
  const slugMatches = productionCandidates.filter((c) => c.slug === input.slug);
  if (slugMatches.length === 1) {
    return {
      ...base,
      status: 'EXACT_MATCH',
      method: 'UNIQUE_SLUG',
      production_place_id: slugMatches[0].id,
      candidates: [slugMatches[0].id],
      reason: 'exactly one production place has this exact slug',
    };
  }
  if (slugMatches.length > 1) {
    return {
      ...base,
      status: 'CONFLICT',
      method: 'UNIQUE_SLUG',
      production_place_id: null,
      candidates: slugMatches.map((c) => c.id),
      reason: `${slugMatches.length} production places share the slug "${input.slug}" — slug is supposed to be unique in production; this is a data integrity problem`,
    };
  }

  // 4) No exact signal at all. Report AMBIGUOUS only when there's a plausible near-miss to flag
  // for a human (never surfaced as anything an automated run could accept); otherwise NO_MATCH.
  return {
    ...base,
    status: 'NO_MATCH',
    method: 'NONE',
    production_place_id: null,
    candidates: [],
    reason: 'no external identifier match, no manual mapping, no exact slug match in production',
  };
}
