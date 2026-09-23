import {
  planNightMarkets,
  QueryableDataSource,
  ImportBundlePreview,
  VUI_FEST_SLUG,
  GRAND_WORLD_MARKET_SLUG,
  GRAND_WORLD_PARENT_SLUG,
} from './create-current-night-markets';

// Regression test for the 2026-09-06 dry-run-safety defect: the first version of this script ran
// its places / source_attributions / sources INSERTs unconditionally, before the dry-run gate, so
// EVERY invocation (dry-run or not) wrote 3 tables. This test proves planNightMarkets() — the
// function main() always calls, regardless of --execute — issues ONLY SELECTs, by asserting no
// SQL string it passes to dataSource.query() ever contains an INSERT/UPDATE/DELETE, against a fresh
// fixture where neither VUI-Fest nor Grand World Night Market exists yet.
describe('planNightMarkets — dry-run must not write', () => {
  const WRITE_KEYWORDS = /\b(insert|update|delete)\b/i;

  function buildQueryMock(): jest.Mock {
    return jest.fn(async (sql: string, _params?: unknown[]) => {
      const s = sql.trim();

      if (s.includes('ST_X(location::geometry)') && s.includes('WHERE slug = $1')) {
        // Grand World parent lookup — always exists in this fixture.
        return [{ id: 'grand-world-parent-uuid', lon: 103.855, lat: 10.328 }];
      }
      if (s.includes('SELECT id, slug FROM places WHERE slug IN')) {
        // Fresh fixture: neither new place exists yet.
        return [];
      }
      if (s.includes('FROM source_attributions WHERE')) {
        return [];
      }
      if (s.includes("FROM sources WHERE type = 'official_website'")) {
        return [];
      }
      if (s.includes('FROM evidence_artifacts WHERE business_key')) {
        return [];
      }
      if (s.includes('FROM place_translations WHERE place_id')) {
        return [];
      }
      if (s.includes('FROM place_translation_evidence_links WHERE')) {
        return [];
      }
      if (s.includes('SELECT (SELECT count(*) FROM places)')) {
        return [{ places: 49, sources: 25, source_attributions: 147, evidence_artifacts: 26, links: 86, translations: 84 }];
      }
      throw new Error(`Unexpected query in test fixture: ${s}`);
    });
  }

  function buildImportPreviewMock(): ImportBundlePreview {
    return {
      importBundle: jest.fn().mockResolvedValue({ status: 'pending', totalRows: 4, succeeded: 4 }),
    };
  }

  it('issues zero INSERT/UPDATE/DELETE statements against a fresh fixture (PLACES_DELTA=0 etc.)', async () => {
    const queryMock = buildQueryMock();
    const dataSource: QueryableDataSource = { query: queryMock };
    const importPreview = buildImportPreviewMock();

    await planNightMarkets(dataSource, importPreview);

    const allSql: string[] = queryMock.mock.calls.map((c: [string]) => c[0]);
    const writeStatements = allSql.filter((sql) => WRITE_KEYWORDS.test(sql));
    expect(writeStatements).toEqual([]);
  });

  it('reports WOULD_CREATE for both new places against a fresh fixture', async () => {
    const dataSource: QueryableDataSource = { query: buildQueryMock() };
    const importPreview = buildImportPreviewMock();

    const plan = await planNightMarkets(dataSource, importPreview);

    expect(plan.vuiFestPlaceAction).toBe('WOULD_CREATE'); // VUI_FEST_WOULD_CREATE=YES
    expect(plan.grandWorldPlaceAction).toBe('WOULD_CREATE'); // GRAND_WORLD_NIGHT_MARKET_WOULD_CREATE=YES
    expect(plan.vuiFestPlaceId).toBeNull();
    expect(plan.grandWorldPlaceId).toBeNull();
  });

  it('reports the would-create counts for downstream rows (attributions, source, evidence, links)', async () => {
    const dataSource: QueryableDataSource = { query: buildQueryMock() };
    const importPreview = buildImportPreviewMock();

    const plan = await planNightMarkets(dataSource, importPreview);

    expect(plan.attributionsWouldCreate).toBe(4); // province + admin_area x 2 new places
    expect(plan.vuiFestSourceAction).toBe('WOULD_CREATE');
    expect(plan.evidenceArtifactAction).toBe('WOULD_CREATE');
    expect(plan.linksWouldCreate).toBe(4); // the 4 VUI-Fest translations, once created
  });

  it('never calls the import preview with dryRun:false', async () => {
    const dataSource: QueryableDataSource = { query: buildQueryMock() };
    const importPreview = buildImportPreviewMock();

    await planNightMarkets(dataSource, importPreview);

    expect(importPreview.importBundle).toHaveBeenCalledTimes(1);
    const call = (importPreview.importBundle as jest.Mock).mock.calls[0][0];
    expect(call.dryRun).toBe(true);
  });

  it('reports REUSE (not WOULD_CREATE) once both places already exist', async () => {
    const queryMock = jest.fn(async (sql: string) => {
      const s = sql.trim();
      if (s.includes('ST_X(location::geometry)') && s.includes('WHERE slug = $1')) {
        return [{ id: 'grand-world-parent-uuid', lon: 103.855, lat: 10.328 }];
      }
      if (s.includes('SELECT id, slug FROM places WHERE slug IN')) {
        return [
          { id: 'vui-fest-existing-uuid', slug: VUI_FEST_SLUG },
          { id: 'grand-world-market-existing-uuid', slug: GRAND_WORLD_MARKET_SLUG },
        ];
      }
      if (s.includes('FROM source_attributions WHERE')) return [{ id: 'existing-attribution' }];
      if (s.includes("FROM sources WHERE type = 'official_website'")) return [{ id: 'existing-source' }];
      if (s.includes('FROM evidence_artifacts WHERE business_key')) return [{ id: 'existing-evidence' }];
      if (s.includes('FROM place_translations WHERE place_id')) return [{ id: 'existing-translation' }];
      if (s.includes('FROM place_translation_evidence_links WHERE')) return [{ id: 'existing-link' }];
      if (s.includes('SELECT (SELECT count(*) FROM places)')) {
        return [{ places: 51, sources: 26, source_attributions: 151, evidence_artifacts: 27, links: 90, translations: 88 }];
      }
      throw new Error(`Unexpected query in test fixture: ${s}`);
    });
    const dataSource: QueryableDataSource = { query: queryMock };
    const importPreview = buildImportPreviewMock();

    const plan = await planNightMarkets(dataSource, importPreview);

    expect(plan.vuiFestPlaceAction).toBe('REUSE');
    expect(plan.grandWorldPlaceAction).toBe('REUSE');
    expect(plan.attributionsWouldCreate).toBe(0);
    expect(plan.vuiFestSourceAction).toBe('REUSE');
    expect(plan.evidenceArtifactAction).toBe('REUSE');
    expect(plan.linksWouldCreate).toBe(0);

    const allSql: string[] = queryMock.mock.calls.map((c: [string]) => c[0]);
    expect(allSql.filter((sql) => WRITE_KEYWORDS.test(sql))).toEqual([]);
  });

  it('throws rather than guessing a location if the Grand World parent place is missing', async () => {
    const queryMock = jest.fn(async (sql: string) => {
      const s = sql.trim();
      if (s.includes('SELECT (SELECT count(*) FROM places)')) {
        return [{ places: 49, sources: 25, source_attributions: 147, evidence_artifacts: 26, links: 86, translations: 84 }];
      }
      if (s.includes('ST_X(location::geometry)') && s.includes('WHERE slug = $1')) {
        return []; // parent not found
      }
      throw new Error(`Unexpected query in test fixture: ${sql}`);
    });
    const dataSource: QueryableDataSource = { query: queryMock };
    const importPreview = buildImportPreviewMock();

    await expect(planNightMarkets(dataSource, importPreview)).rejects.toThrow(
      new RegExp(`Could not resolve parent place ${GRAND_WORLD_PARENT_SLUG}`),
    );
  });
});
