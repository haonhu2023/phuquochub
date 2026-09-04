import { resolveProductionIdentity } from './identity-resolver';
import type { ProductionPlaceCandidate, ManualIdentityMapping } from './content-promotion.types';

function candidate(overrides: Partial<ProductionPlaceCandidate> = {}): ProductionPlaceCandidate {
  return { id: 'prod-1', slug: 'vinwonders-phu-quoc', name: 'VinWonders Phú Quốc', location: { lat: 10.33, lng: 103.85 }, external_identifiers: {}, ...overrides };
}

describe('resolveProductionIdentity', () => {
  it('exact unique slug match -> EXACT_MATCH via UNIQUE_SLUG', () => {
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'vinwonders-phu-quoc', external_identifiers: {} }, [candidate()]);
    expect(result.status).toBe('EXACT_MATCH');
    expect(result.method).toBe('UNIQUE_SLUG');
    expect(result.production_place_id).toBe('prod-1');
  });

  it('external identifier match takes priority over slug', () => {
    const candidates = [
      candidate({ id: 'prod-1', slug: 'some-other-slug', external_identifiers: { GOOGLE_PLACES: 'ChIJabc' } }),
    ];
    const result = resolveProductionIdentity(
      { staging_place_id: 's1', slug: 'vinwonders-phu-quoc', external_identifiers: { GOOGLE_PLACES: 'ChIJabc' } },
      candidates,
    );
    expect(result.status).toBe('EXACT_MATCH');
    expect(result.method).toBe('EXTERNAL_IDENTIFIER');
    expect(result.production_place_id).toBe('prod-1');
  });

  it('two production places sharing the same external identifier -> CONFLICT, never an automatic pick', () => {
    const candidates = [
      candidate({ id: 'prod-1', external_identifiers: { GOOGLE_PLACES: 'ChIJabc' } }),
      candidate({ id: 'prod-2', slug: 'other', external_identifiers: { GOOGLE_PLACES: 'ChIJabc' } }),
    ];
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'vinwonders-phu-quoc', external_identifiers: { GOOGLE_PLACES: 'ChIJabc' } }, candidates);
    expect(result.status).toBe('CONFLICT');
    expect(result.production_place_id).toBeNull();
  });

  it('two production places sharing the same slug -> CONFLICT (data integrity problem), never picked automatically', () => {
    const candidates = [candidate({ id: 'prod-1' }), candidate({ id: 'prod-2' })];
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'vinwonders-phu-quoc', external_identifiers: {} }, candidates);
    expect(result.status).toBe('CONFLICT');
    expect(result.production_place_id).toBeNull();
  });

  it('no external identifier, no slug match, no manual mapping -> NO_MATCH, never a fuzzy accept', () => {
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'does-not-exist-slug', external_identifiers: {} }, [candidate()]);
    expect(result.status).toBe('NO_MATCH');
    expect(result.production_place_id).toBeNull();
  });

  it('an explicit manual mapping is honored even without a slug/external match', () => {
    const mapping: ManualIdentityMapping = { staging_place_id: 's1', production_place_id: 'prod-1', mapped_by: 'owner', mapped_at: '2026-09-04', reason: 'renamed slug' };
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'a-completely-different-slug', external_identifiers: {} }, [candidate()], [mapping]);
    expect(result.status).toBe('MANUAL_MAPPING');
    expect(result.production_place_id).toBe('prod-1');
  });

  it('a manual mapping pointing at a nonexistent production place -> CONFLICT, not a silent pass', () => {
    const mapping: ManualIdentityMapping = { staging_place_id: 's1', production_place_id: 'prod-does-not-exist', mapped_by: 'owner', mapped_at: '2026-09-04', reason: 'x' };
    const result = resolveProductionIdentity({ staging_place_id: 's1', slug: 'x', external_identifiers: {} }, [candidate()], [mapping]);
    expect(result.status).toBe('CONFLICT');
  });

  it('coordinates/name alone are never consulted for an automatic decision — only external id, manual mapping, or exact slug', () => {
    // A "near miss" candidate with a totally different slug and no external id/manual mapping,
    // even though its coordinates happen to be identical, must resolve to NO_MATCH, not AMBIGUOUS
    // treated as acceptable, and never EXACT_MATCH.
    const result = resolveProductionIdentity(
      { staging_place_id: 's1', slug: 'different-slug', external_identifiers: {} },
      [candidate({ location: { lat: 10.33, lng: 103.85 } })],
    );
    expect(result.status).not.toBe('EXACT_MATCH');
    expect(result.status).not.toBe('MANUAL_MAPPING');
  });
});
