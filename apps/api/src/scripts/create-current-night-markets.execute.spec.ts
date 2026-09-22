import {
  executePlacesAndAttributions,
  ensureVuiFestSource,
  ensureVuiFestEvidenceAndLinks,
  QueryableDataSource,
  SourcesRepoLike,
  VUI_FEST_SLUG,
  GRAND_WORLD_MARKET_SLUG,
  VUI_FEST_EVIDENCE_BUSINESS_KEY,
} from './create-current-night-markets';

// Unit-level idempotency proof for the WRITE half of the script (executeNightMarkets() and its
// three composed steps). This repo has no transaction-backed disposable Postgres fixture (checked:
// no testcontainers/pg-mem usage anywhere in apps/api), and its established convention for these
// standalone scripts is mock-based unit tests against fake repositories/query runners (see
// backfill-administrative-data.spec.ts, migrations/__tests__/*.spec.ts) rather than a live DB in
// Jest. This suite follows that convention: each fake tracks its own in-memory "table" across two
// calls of the SAME function with the SAME inputs, standing in for "fresh fixture -> execute ->
// execute again", and asserts the row is created exactly once.
//
// The multilingual-import half of executeNightMarkets() (place_translations) is NOT re-verified
// here — that is real production code (MultilingualPlaceImportService) already exercised by
// remediate-pilot-translations.ts's own idempotency proof, and was additionally proven live, twice,
// against the actual staging Postgres during the dry-run-safety remediation task (places/sources/
// evidence_artifacts/links/translations counts identical before and after a full second run:
// 51/26/151/27/90/88 both times). This suite covers the specific tables the ORIGINAL dry-run defect
// touched: places, source_attributions, sources, evidence_artifacts, place_translation_evidence_links.

describe('executePlacesAndAttributions — idempotent on repeat', () => {
  function buildFakeDataSource() {
    const places = new Map<string, { id: string; slug: string }>();
    const attributions = new Set<string>(); // key = `${entityId}:${field}`
    const calls: string[] = [];
    let nextId = 1;

    const dataSource: QueryableDataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push(sql);
        const s = sql.trim();

        if (s.startsWith('INSERT INTO places')) {
          const [name, slug] = params as string[];
          if (!places.has(slug)) {
            places.set(slug, { id: `place-${nextId++}`, slug });
          }
          return [];
        }
        if (s.startsWith('SELECT id, slug FROM places WHERE slug IN')) {
          return [...places.values()].filter((p) => p.slug === VUI_FEST_SLUG || p.slug === GRAND_WORLD_MARKET_SLUG);
        }
        if (s.startsWith('SELECT id FROM source_attributions WHERE')) {
          const [entityId, field] = params as string[];
          return attributions.has(`${entityId}:${field}`) ? [{ id: 'existing' }] : [];
        }
        if (s.startsWith('INSERT INTO source_attributions')) {
          const [, entityId, field] = params as string[];
          attributions.add(`${entityId}:${field}`);
          return [];
        }
        throw new Error(`Unexpected query in fake fixture: ${s}`);
      }),
    };
    return { dataSource, places, attributions, calls };
  }

  it('creates exactly 2 places and 4 attributions on the first call', async () => {
    const { dataSource, places, attributions } = buildFakeDataSource();

    const result = await executePlacesAndAttributions(dataSource, 103.855, 10.328);

    expect(places.size).toBe(2);
    expect(attributions.size).toBe(4); // province + admin_area x 2 places
    expect(result.vuiFestId).toBeDefined();
    expect(result.grandWorldMarketId).toBeDefined();
  });

  it('creates zero additional rows when run a second time with the same inputs (DUPLICATES_ON_REPEAT=0)', async () => {
    const { dataSource, places, attributions } = buildFakeDataSource();

    const first = await executePlacesAndAttributions(dataSource, 103.855, 10.328);
    const placesCountAfterFirst = places.size;
    const attributionsCountAfterFirst = attributions.size;

    const second = await executePlacesAndAttributions(dataSource, 103.855, 10.328);

    expect(places.size).toBe(placesCountAfterFirst); // 2, unchanged
    expect(attributions.size).toBe(attributionsCountAfterFirst); // 4, unchanged
    expect(second.vuiFestId).toBe(first.vuiFestId); // same row reused, not a new one
    expect(second.grandWorldMarketId).toBe(first.grandWorldMarketId);
  });
});

describe('ensureVuiFestSource — idempotent on repeat', () => {
  function buildFakeSourcesRepo(): { repo: SourcesRepoLike; savedCount: () => number } {
    let saved: { id: string; externalRef: string } | null = null;
    let saveCalls = 0;
    const repo: SourcesRepoLike = {
      findByTypeAndExternalRef: jest.fn(async (_type, externalRef) => (saved && saved.externalRef === externalRef ? (saved as never) : null)),
      create: jest.fn((data) => data as never),
      save: jest.fn(async (data) => {
        saveCalls += 1;
        saved = { id: 'source-1', externalRef: (data as { externalRef: string }).externalRef };
        return saved as never;
      }),
    };
    return { repo, savedCount: () => saveCalls };
  }

  it('saves exactly once across two calls with the same repo state (DUPLICATES_ON_REPEAT=0)', async () => {
    const { repo, savedCount } = buildFakeSourcesRepo();

    const first = await ensureVuiFestSource(repo);
    expect(savedCount()).toBe(1);

    const second = await ensureVuiFestSource(repo);
    expect(savedCount()).toBe(1); // still 1 — second call found the existing row and reused it
    expect(second.id).toBe(first.id);
  });
});

describe('ensureVuiFestEvidenceAndLinks — idempotent on repeat', () => {
  function buildFakeDataSource(currentTranslationIds: string[]) {
    const evidenceRows: Array<{ id: string; business_key: string }> = [];
    const links = new Set<string>(); // key = `${translationId}:${evidenceId}`
    let nextEvidenceId = 1;

    const dataSource: QueryableDataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        const s = sql.trim();
        if (s.startsWith('SELECT id FROM evidence_artifacts WHERE business_key')) {
          const [businessKey] = params as string[];
          return evidenceRows.filter((r) => r.business_key === businessKey);
        }
        if (s.startsWith('INSERT INTO evidence_artifacts')) {
          const businessKey = (params as string[])[1]; // matches the positional $2 in the real INSERT
          const row = { id: `evidence-${nextEvidenceId++}`, business_key: businessKey };
          evidenceRows.push(row);
          return [{ id: row.id }];
        }
        if (s.startsWith('SELECT id FROM place_translations WHERE place_id')) {
          return currentTranslationIds.map((id) => ({ id }));
        }
        if (s.startsWith('SELECT id FROM place_translation_evidence_links WHERE')) {
          const [translationId, evidenceId] = params as string[];
          return links.has(`${translationId}:${evidenceId}`) ? [{ id: 'existing-link' }] : [];
        }
        if (s.startsWith('INSERT INTO place_translation_evidence_links')) {
          const [translationId, evidenceId] = params as string[];
          links.add(`${translationId}:${evidenceId}`);
          return [];
        }
        throw new Error(`Unexpected query in fake fixture: ${s}`);
      }),
    };
    return { dataSource, evidenceRows, links };
  }

  const TRANSLATION_IDS = ['t1', 't2', 't3', 't4'];

  it('creates exactly 1 evidence artifact and 4 links on the first call', async () => {
    const { dataSource, evidenceRows, links } = buildFakeDataSource(TRANSLATION_IDS);

    const result = await ensureVuiFestEvidenceAndLinks(dataSource, 'vui-fest-place-id', 'source-1');

    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0].business_key).toBe(VUI_FEST_EVIDENCE_BUSINESS_KEY);
    expect(links.size).toBe(4);
    expect(result.linksCreated).toBe(4);
  });

  it('creates zero additional evidence artifacts or links on a second call (DUPLICATES_ON_REPEAT=0)', async () => {
    const { dataSource, evidenceRows, links } = buildFakeDataSource(TRANSLATION_IDS);

    const first = await ensureVuiFestEvidenceAndLinks(dataSource, 'vui-fest-place-id', 'source-1');
    const second = await ensureVuiFestEvidenceAndLinks(dataSource, 'vui-fest-place-id', 'source-1');

    expect(evidenceRows).toHaveLength(1); // still just 1 — reused, not duplicated
    expect(links.size).toBe(4); // still just 4 — reused, not duplicated
    expect(second.evidenceId).toBe(first.evidenceId);
    expect(second.linksCreated).toBe(0); // nothing NEW created the second time
  });
});
