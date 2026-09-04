import { createHash } from 'crypto';
import { runContentPromotion, type PromotionDbPort } from './promotion-importer';
import type { PromotionManifest, PromotionManifestEntry } from './content-promotion.types';

const DEFAULT_TEXT = 'Explore the largest theme park in Vietnam.';

function entry(overrides: Partial<PromotionManifestEntry> = {}): PromotionManifestEntry {
  return {
    translation_id: 'staging-trans-1', staging_place_id: 'staging-place-1', slug: 'vinwonders-phu-quoc',
    field_key: 'short_description', locale_code: 'en', source_locale_code: 'vi',
    translated_text: DEFAULT_TEXT, translation_method: 'ai_plus_human',
    human_review_status: 'APPROVED', revision_id: 'staging-rev-1', reviewed_by: 'reviewer-1', reviewed_at: '2026-09-04T00:00:00.000Z',
    content_hash_sha256: createHash('sha256').update(DEFAULT_TEXT, 'utf8').digest('hex'),
    source_id: null, evidence_business_keys: [],
    ...overrides,
  };
}

function manifest(entries: PromotionManifestEntry[]): PromotionManifest {
  return { schema_version: '1.0', source_environment: 'staging', generated_at: '2026-09-04T00:00:00.000Z', entries };
}

interface FakeState {
  places?: Array<{ id: string; slug: string; name: string; lat: number | null; lng: number | null }>;
  externalIdentifiersTableExists?: boolean;
  currentTranslation?: { id: string; translated_text: string } | null;
  currentDatabase?: string;
}

function fakeDb(state: FakeState = {}) {
  const places = state.places ?? [{ id: 'prod-place-1', slug: 'vinwonders-phu-quoc', name: 'VinWonders Phú Quốc', lat: 10.33, lng: 103.85 }];
  const extTableExists = state.externalIdentifiersTableExists ?? false;
  const currentDatabase = state.currentDatabase ?? 'phuquochub_prod_like';
  let currentTranslation = state.currentTranslation !== undefined ? state.currentTranslation : null;
  const inserted: unknown[][] = [];
  const updated: unknown[][] = [];

  const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    if (sql.includes('current_database()')) return [{ current_database: currentDatabase }];
    if (sql.startsWith('SELECT id, slug, name')) return places;
    if (sql.includes('FROM place_external_identifiers')) {
      if (!extTableExists) throw new Error('relation "place_external_identifiers" does not exist');
      return [];
    }
    if (sql.startsWith('SELECT id, translated_text FROM place_translations')) {
      return currentTranslation ? [currentTranslation] : [];
    }
    if (sql.startsWith('UPDATE place_translations SET is_current')) {
      updated.push(params);
      return [];
    }
    if (sql.startsWith('INSERT INTO wiki_revisions')) {
      return [{ id: 'new-prod-revision-1' }];
    }
    if (sql.startsWith('INSERT INTO place_translations')) {
      inserted.push(params);
      currentTranslation = { id: params[0] as string, translated_text: params[5] as string };
      return [];
    }
    throw new Error(`fakeDb: unexpected query: ${sql}`);
  });

  return { query: query as unknown as PromotionDbPort['query'], inserted, updated, get currentTranslation() { return currentTranslation; } };
}

describe('runContentPromotion', () => {
  it('the staging-identity guard aborts BEFORE any write when the target DB is wrong', async () => {
    const db = fakeDb({ currentDatabase: 'some_other_db' });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true, requiredTargetDatabaseName: 'phuquochub_prod_like' });
    expect(result.aborted).toBe(true);
    expect(result.abort_reason).toContain('DATABASE_IDENTITY_MISMATCH');
    expect(db.inserted).toHaveLength(0);
  });

  it('refuses to promote a manifest entry that is not APPROVED, even in apply mode (defense in depth)', async () => {
    const db = fakeDb();
    const result = await runContentPromotion(manifest([entry({ human_review_status: 'PENDING' })]), db, { apply: true });
    expect(result.results[0].status).toBe('BLOCKED_IDENTITY');
    expect(result.errors).toBe(1);
    expect(db.inserted).toHaveLength(0);
  });

  it('exact unique slug match, no existing production row, dry-run -> WOULD_INSERT, zero writes', async () => {
    const db = fakeDb();
    const result = await runContentPromotion(manifest([entry()]), db);
    expect(result.results[0].status).toBe('WOULD_INSERT');
    expect(db.inserted).toHaveLength(0);
  });

  it('exact unique slug match, no existing production row, apply -> INSERTED, exactly one insert, correct governance flags', async () => {
    const db = fakeDb();
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.results[0].status).toBe('INSERTED');
    expect(db.inserted).toHaveLength(1);
    const insertedParams = db.inserted[0] as unknown[];
    // params order: id, place_id, field_key, locale_code, source_locale_code, translated_text,
    // source_text_hash, translation_method, revision_id
    expect(insertedParams[1]).toBe('prod-place-1');
    expect(insertedParams[5]).toBe(entry().translated_text);
  });

  it('idempotency: applying the identical manifest twice inserts once, then reports UNCHANGED', async () => {
    const db = fakeDb();
    const first = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(first.results[0].status).toBe('INSERTED');
    const second = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(second.results[0].status).toBe('UNCHANGED');
    expect(db.inserted).toHaveLength(1);
  });

  it('a changed approved revision (different content_hash) updates: supersedes old row, inserts new one, in that order', async () => {
    const db = fakeDb({ currentTranslation: { id: 'existing-prod-trans-1', translated_text: 'Old text' } });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.results[0].status).toBe('UPDATED');
    expect(db.updated).toHaveLength(1);
    expect(db.updated[0]).toEqual(['existing-prod-trans-1']);
    expect(db.inserted).toHaveLength(1);
    // order: the mock records calls in invocation order via the query mock itself
    const calls = (db.query as unknown as jest.Mock).mock.calls;
    const updateIdx = calls.findIndex((c) => (c[0] as string).startsWith('UPDATE place_translations'));
    const insertIdx = calls.findIndex((c) => (c[0] as string).startsWith('INSERT INTO place_translations'));
    expect(updateIdx).toBeLessThan(insertIdx);
  });

  it('unchanged content (identical hash to existing production row) -> UNCHANGED, zero writes', async () => {
    const text = entry().translated_text;
    const db = fakeDb({ currentTranslation: { id: 'existing-prod-trans-1', translated_text: text } });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.results[0].status).toBe('UNCHANGED');
    expect(db.inserted).toHaveLength(0);
    expect(db.updated).toHaveLength(0);
  });

  it('no slug match and no external identifier table -> BLOCKED_IDENTITY, never guesses', async () => {
    const db = fakeDb({ places: [{ id: 'prod-x', slug: 'totally-different-slug', name: 'X', lat: null, lng: null }] });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.results[0].status).toBe('BLOCKED_IDENTITY');
    expect(db.inserted).toHaveLength(0);
  });

  it('two production places sharing the manifest slug -> BLOCKED_CONFLICT, never picks one automatically', async () => {
    const db = fakeDb({
      places: [
        { id: 'prod-1', slug: 'vinwonders-phu-quoc', name: 'A', lat: null, lng: null },
        { id: 'prod-2', slug: 'vinwonders-phu-quoc', name: 'B', lat: null, lng: null },
      ],
    });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.results[0].status).toBe('BLOCKED_CONFLICT');
    expect(db.inserted).toHaveLength(0);
  });

  it('gracefully degrades when place_external_identifiers does not exist on the target yet (pre-PR8 target)', async () => {
    const db = fakeDb({ externalIdentifiersTableExists: false });
    const result = await runContentPromotion(manifest([entry()]), db, { apply: true });
    expect(result.aborted).toBe(false);
    expect(result.results[0].status).toBe('INSERTED'); // still resolves via unique slug
  });

  it('a manifest entry whose is_public/is_production_data claim was stripped is still rejected purely on human_review_status', async () => {
    // Defense in depth is keyed on human_review_status alone in the manifest (the boolean flags
    // aren't even part of PromotionManifestEntry) — REJECTED/NEEDS_CHANGES must never slip through.
    const db = fakeDb();
    const result = await runContentPromotion(manifest([entry({ human_review_status: 'NEEDS_CHANGES' })]), db, { apply: true });
    expect(result.results[0].status).toBe('BLOCKED_IDENTITY');
    expect(db.inserted).toHaveLength(0);
  });
});
