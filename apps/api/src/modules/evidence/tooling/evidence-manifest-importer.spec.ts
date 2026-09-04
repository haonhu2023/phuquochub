import {
  runEvidenceManifestImport,
  type EvidenceManifestDbPort,
  type EvidenceManifestImportPorts,
} from './evidence-manifest-importer';
import type { EvidenceManifest } from './evidence-manifest.types';

function baseManifest(): EvidenceManifest {
  return {
    manifest_version: '1.0',
    generated_by: 'test',
    generated_at: '2026-09-04T00:00:00.000Z',
    entries: [
      {
        place_slug: 'bai-sao',
        source: {
          external_ref: 'https://example.gov.vn/bai-sao',
          type: 'government',
          kind: 'url',
          url: 'https://example.gov.vn/bai-sao',
          retrieved_at: '2026-09-04T00:00:00.000Z',
        },
        evidence: {
          business_key: 'EVD-BAISAO-VI-20260904',
          evidence_type: 'official_page_capture',
          captured_at: '2026-09-04T00:00:00.000Z',
          verification_status: 'NEEDS_REVIEW',
        },
        claims: [{ field: 'name', value: 'Bãi Sao', support: 'verified_live' }],
        links: [{ field_key: 'short_description', locale_code: 'vi' }],
      },
    ],
  };
}

/** Fake DB: places table + place_translations table, both keyed the way the real schema is. */
function fakeDb(opts: {
  places?: Record<string, string>; // slug -> id
  translations?: Record<string, string>; // `${placeId}:${field}:${locale}` -> translationId
  currentDatabase?: string;
} = {}) {
  const places = opts.places ?? { 'bai-sao': 'place-1' };
  const translations = opts.translations ?? { 'place-1:short_description:vi': 'trans-1' };
  const currentDatabase = opts.currentDatabase ?? 'phuquochub_dev';
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    calls.push({ sql, params });
    if (sql.includes('current_database()')) return [{ current_database: currentDatabase }];
    if (sql.includes('FROM places')) {
      const id = places[params[0] as string];
      return id ? [{ id }] : [];
    }
    if (sql.includes('FROM place_translations')) {
      const key = `${params[0]}:${params[1]}:${params[2]}`;
      const id = translations[key];
      return id ? [{ id }] : [];
    }
    throw new Error(`fakeDb: unexpected query ${sql}`);
  });
  return { calls, query: query as unknown as EvidenceManifestDbPort['query'] };
}

function fakePorts(db: ReturnType<typeof fakeDb>, opts: { existingSource?: { id: string } | null } = {}): {
  ports: EvidenceManifestImportPorts;
  ensureEvidenceArtifact: jest.Mock;
  linkEvidenceToTranslation: jest.Mock;
  createSource: jest.Mock;
  findByTypeAndExternalRef: jest.Mock;
} {
  const findByTypeAndExternalRef = jest.fn(async () => opts.existingSource ?? null);
  const createSource = jest.fn(async () => ({ id: 'source-new' }));
  const ensureEvidenceArtifact = jest.fn(async (input: { businessKey: string }) => ({
    id: `evidence-${input.businessKey}`,
    businessKey: input.businessKey,
  }));
  const linkEvidenceToTranslation = jest.fn(async () => ({ id: 'link-1' }));

  return {
    ports: {
      db,
      sources: { findByTypeAndExternalRef, createSource },
      artifacts: { ensureEvidenceArtifact, linkEvidenceToTranslation },
    },
    ensureEvidenceArtifact,
    linkEvidenceToTranslation,
    createSource,
    findByTypeAndExternalRef,
  };
}

describe('runEvidenceManifestImport', () => {
  it('aborts before any DB call when static validation fails', async () => {
    const db = fakeDb();
    const { ports, ensureEvidenceArtifact } = fakePorts(db);
    const manifest = baseManifest();
    manifest.entries[0].evidence.verification_status = 'VERIFIED'; // structurally forbidden

    const result = await runEvidenceManifestImport(manifest, ports, { execute: true });

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toBe('STATIC_VALIDATION_FAILED');
    expect(db.query).not.toHaveBeenCalled();
    expect(ensureEvidenceArtifact).not.toHaveBeenCalled();
  });

  it('dry-run (execute omitted) never calls source/artifact write ports', async () => {
    const db = fakeDb();
    const { ports, ensureEvidenceArtifact, createSource, linkEvidenceToTranslation } = fakePorts(db);

    const result = await runEvidenceManifestImport(baseManifest(), ports);

    expect(result.aborted).toBe(false);
    expect(result.results[0].status).toBe('WOULD_IMPORT');
    expect(result.results[0].links_created).toBe(1); // resolvable target counted, not yet written
    expect(ensureEvidenceArtifact).not.toHaveBeenCalled();
    expect(createSource).not.toHaveBeenCalled();
    expect(linkEvidenceToTranslation).not.toHaveBeenCalled();
  });

  it('the staging-identity guard aborts BEFORE any write, in both dry-run and execute', async () => {
    const db = fakeDb({ currentDatabase: 'some_other_db' });
    const { ports, ensureEvidenceArtifact } = fakePorts(db);

    const result = await runEvidenceManifestImport(baseManifest(), ports, {
      execute: true,
      requiredDatabaseName: 'phuquochub_staging',
    });

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain('DATABASE_IDENTITY_MISMATCH');
    expect(ensureEvidenceArtifact).not.toHaveBeenCalled();
  });

  it('execute happy path: creates one source, one artifact, one link — FORCES verification_status to NEEDS_REVIEW', async () => {
    const db = fakeDb();
    const { ports, ensureEvidenceArtifact, linkEvidenceToTranslation, createSource } = fakePorts(db);

    const result = await runEvidenceManifestImport(baseManifest(), ports, { execute: true });

    expect(result.results[0].status).toBe('IMPORTED');
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(ensureEvidenceArtifact).toHaveBeenCalledTimes(1);
    expect(ensureEvidenceArtifact.mock.calls[0][0].verificationStatus).toBe('NEEDS_REVIEW');
    expect(linkEvidenceToTranslation).toHaveBeenCalledTimes(1);
    expect(linkEvidenceToTranslation).toHaveBeenCalledWith('trans-1', 'evidence-EVD-BAISAO-VI-20260904', 'SUPPORTS');
  });

  it('idempotency: an existing source is reused, not recreated', async () => {
    const db = fakeDb();
    const { ports, createSource } = fakePorts(db, { existingSource: { id: 'source-existing' } });

    await runEvidenceManifestImport(baseManifest(), ports, { execute: true });

    expect(createSource).not.toHaveBeenCalled();
  });

  it('a place not found in staging skips that entry with PLACE_NOT_FOUND, does not throw', async () => {
    const db = fakeDb({ places: {} });
    const { ports, ensureEvidenceArtifact } = fakePorts(db);

    const result = await runEvidenceManifestImport(baseManifest(), ports, { execute: true });

    expect(result.results[0].status).toBe('SKIPPED_ERROR');
    expect(result.results[0].issues[0].code).toBe('PLACE_NOT_FOUND');
    expect(ensureEvidenceArtifact).not.toHaveBeenCalled();
  });

  it('a missing translation target still creates the evidence artifact, just skips that link (warning, not error)', async () => {
    const db = fakeDb({ translations: {} }); // no current translation exists
    const { ports, ensureEvidenceArtifact, linkEvidenceToTranslation } = fakePorts(db);

    const result = await runEvidenceManifestImport(baseManifest(), ports, { execute: true });

    expect(result.results[0].status).toBe('IMPORTED');
    expect(ensureEvidenceArtifact).toHaveBeenCalledTimes(1);
    expect(linkEvidenceToTranslation).not.toHaveBeenCalled();
    expect(result.results[0].links_created).toBe(0);
    expect(result.results[0].links_skipped_missing_target).toBe(1);
    expect(result.results[0].issues.some((i) => i.code === 'TRANSLATION_TARGET_NOT_FOUND')).toBe(true);
  });

  it('computes a claims-derived checksum when content_hash_sha256 is omitted, deterministically', async () => {
    const db = fakeDb();
    const { ports, ensureEvidenceArtifact } = fakePorts(db);

    await runEvidenceManifestImport(baseManifest(), ports, { execute: true });
    const firstHash = ensureEvidenceArtifact.mock.calls[0][0].contentHashSha256;
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);

    const db2 = fakeDb();
    const { ports: ports2, ensureEvidenceArtifact: ensure2 } = fakePorts(db2);
    await runEvidenceManifestImport(baseManifest(), ports2, { execute: true });
    expect(ensure2.mock.calls[0][0].contentHashSha256).toBe(firstHash);
  });
});
