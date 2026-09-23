import { SourceFirstPublishEvaluator, CandidateInput, CandidateSourceObservation } from './source-first-publish-evaluator.service';
import { SourceType } from '../sources/sources.enums';

const businessOwner = (field: string, value: unknown, url = 'https://owner.example.com'): CandidateSourceObservation => ({
  field,
  observedValue: value,
  sourceType: SourceType.BUSINESS_OWNER,
  sourceUrl: url,
  publisher: 'Business Owner',
  retrievedAt: new Date('2026-09-01'),
  confidence: 85,
  isPrimary: true,
});

const official = (field: string, value: unknown, url = 'https://official.com'): CandidateSourceObservation => ({
  field,
  observedValue: value,
  sourceType: SourceType.OFFICIAL_WEBSITE,
  sourceUrl: url,
  publisher: 'Official',
  retrievedAt: new Date('2026-09-01'),
  confidence: 90,
  isPrimary: true,
});

const google = (field: string, value: unknown, url = 'https://maps.google.com/?cid=abc'): CandidateSourceObservation => ({
  field,
  observedValue: value,
  sourceType: SourceType.GOOGLE_MAPS,
  sourceUrl: url,
  publisher: 'Google Maps',
  retrievedAt: new Date('2026-09-02'),
  confidence: 70,
});

const osm = (field: string, value: unknown, url = 'https://osm.org/node/1'): CandidateSourceObservation => ({
  field,
  observedValue: value,
  sourceType: SourceType.OPENSTREETMAP,
  sourceUrl: url,
  publisher: 'OpenStreetMap',
  retrievedAt: new Date('2026-09-01'),
  confidence: 75,
});

const baseCandidate = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
  candidateKey: 'test-place-001',
  name: 'Test Place',
  categorySlug: 'beach',
  lat: 10.05,
  lng: 104.0,
  address: '123 Test St, Phú Quốc',
  observations: [official('name', 'Test Place')],
  ...overrides,
});

describe('SourceFirstPublishEvaluator', () => {
  let evaluator: SourceFirstPublishEvaluator;

  beforeEach(() => {
    evaluator = new SourceFirstPublishEvaluator();
  });

  // ── PUBLISH cases ──────────────────────────────────────────────────────────────────────────

  describe('PUBLISH', () => {
    it('single authoritative source with address', () => {
      const result = evaluator.evaluate(baseCandidate());
      expect(result.verdict).toBe('PUBLISH');
      expect(result.holdReasons).toHaveLength(0);
    });

    it('single authoritative source with coordinates only (no address)', () => {
      const result = evaluator.evaluate(
        baseCandidate({ address: undefined, observations: [official('name', 'Test Place')] }),
      );
      expect(result.verdict).toBe('PUBLISH');
    });

    it('two authoritative sources, same observed value — no conflict', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [
            official('name', 'Test Place'),
            osm('name', 'Test Place', 'https://osm.org/node/2'),
          ],
        }),
      );
      expect(result.verdict).toBe('PUBLISH');
      expect(result.holdReasons).toHaveLength(0);
    });

    it('authoritative source + non-authoritative (google) source — no conflict triggers on non-auth', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [official('name', 'Test Place'), google('name', 'Different Name')],
        }),
      );
      // google_maps reliability < 75, so not counted as authoritative conflict
      expect(result.verdict).toBe('PUBLISH');
    });

    it('returns primarySourceUrl from authoritative observation', () => {
      const result = evaluator.evaluate(baseCandidate());
      expect(result.primarySourceUrl).toBe('https://official.com');
    });
  });

  // ── HOLD cases ─────────────────────────────────────────────────────────────────────────────

  describe('HOLD', () => {
    it('identity_conflict — two authoritative sources disagree on name', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [
            official('name', 'Test Place A'),
            osm('name', 'Test Place B', 'https://osm.org/node/3'),
          ],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'identity_conflict')).toBe(true);
    });

    it('address_conflict — two authoritative sources disagree on address', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [
            official('name', 'Place'),
            official('address', '1 Main St', 'https://official.com/addr'),
            osm('address', '2 Other Rd', 'https://osm.org/node/4'),
          ],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'address_conflict')).toBe(true);
    });

    // POLICY 2026-09-19: opening_hours is an always-hold field.
    // An hours conflict goes to auditNotes (non-blocking) — verdict stays PUBLISH if no other holds.
    it('hours_conflict — opening_hours conflict is auditNote only, does NOT block verdict', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [
            official('name', 'Place'),
            official('opening_hours', '09:00-21:00', 'https://official.com/hours'),
            osm('opening_hours', '08:30-22:00', 'https://osm.org/node/5'),
          ],
        }),
      );
      expect(result.verdict).toBe('PUBLISH');
      expect(result.holdReasons.some((r) => r.type === 'hours_conflict')).toBe(false);
      expect(result.auditNotes.some((n) => n.type === 'hours_conflict' && n.field === 'opening_hours')).toBe(true);
    });

    it('contact_conflict — two authoritative sources disagree on phone', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [
            official('name', 'Place'),
            official('phone', '+84-297-111', 'https://official.com/phone'),
            osm('phone', '+84-297-222', 'https://osm.org/node/6'),
          ],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'contact_conflict')).toBe(true);
    });

    it('OSM-only source — cannot alone satisfy publish gate → HOLD insufficient_sources', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [osm('name', 'Test Place')],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'insufficient_sources')).toBe(true);
    });

    it('insufficient_sources — only google_maps (non-authoritative) for name', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [google('name', 'Test Place')],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'insufficient_sources')).toBe(true);
    });

    it('missing location — no lat/lng and no address', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          lat: undefined,
          lng: undefined,
          address: undefined,
          observations: [official('name', 'Test Place')],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'insufficient_sources')).toBe(true);
    });

    // POLICY 2026-09-19: business_owner alone no longer satisfies the official/government gate.
    it('business_owner alone — HOLD insufficient_sources (not official/government)', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          observations: [businessOwner('name', 'Test Place')],
        }),
      );
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'insufficient_sources')).toBe(true);
    });

    it('stale identity source — HOLD when name source exceeds recheck threshold', () => {
      // A name source from 400+ days ago exceeds the 365-day threshold
      const staleObs: CandidateSourceObservation = {
        field: 'name',
        observedValue: 'Stale Place',
        sourceType: SourceType.OFFICIAL_WEBSITE,
        sourceUrl: 'https://official.com/old',
        publisher: 'Official',
        retrievedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
        confidence: 90,
        isPrimary: true,
      };
      const result = evaluator.evaluate(baseCandidate({ observations: [staleObs] }));
      expect(result.verdict).toBe('HOLD');
      expect(result.holdReasons.some((r) => r.type === 'insufficient_sources' && r.field === 'name')).toBe(true);
    });
  });

  // ── Field gating ────────────────────────────────────────────────────────────────────────────

  describe('field gating', () => {
    it('autoPublishFields contains safe fields when verdict is PUBLISH', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          website: 'https://official.com',
          phones: [{ value: '+84-123' }],
          observations: [official('name', 'Test Place')],
        }),
      );
      expect(result.verdict).toBe('PUBLISH');
      expect(result.autoPublishFields).toContain('name');
      expect(result.autoPublishFields).toContain('category');
      expect(result.autoPublishFields).toContain('coordinates');
      expect(result.autoPublishFields).toContain('address');
      expect(result.autoPublishFields).toContain('website');
      expect(result.autoPublishFields).toContain('phone');
    });

    it('opening_hours goes to heldFields even with clean official source', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          openingHours: { monday: '09:00-21:00' },
          observations: [
            official('name', 'Test Place'),
            official('opening_hours', '09:00-21:00'),
          ],
        }),
      );
      expect(result.heldFields).toContain('opening_hours');
      expect(result.autoPublishFields).not.toContain('opening_hours');
    });

    it('opening_hours data with no conflict → auditNote (not hours_conflict type)', () => {
      const result = evaluator.evaluate(
        baseCandidate({
          openingHours: { monday: '09:00-21:00' },
          observations: [
            official('name', 'Test Place'),
            official('opening_hours', '09:00-21:00'),
          ],
        }),
      );
      expect(result.auditNotes.some((n) => n.field === 'opening_hours')).toBe(true);
      expect(result.holdReasons.some((r) => r.field === 'opening_hours')).toBe(false);
    });
  });
});
