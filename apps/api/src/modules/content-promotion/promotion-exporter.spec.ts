import { exportPromotionManifest, type ExportDbPort } from './promotion-exporter';

interface Row {
  id: string; place_id: string; slug: string; field_key: string; locale_code: string;
  source_locale_code: string; translated_text: string; translation_method: string;
  human_review_status: string; is_public: boolean; is_production_data: boolean; production_eligible: boolean;
  revision_id: string; reviewed_by: string | null; reviewed_at: string | null; source_id: string | null;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'trans-1', place_id: 'place-1', slug: 'vinwonders-phu-quoc', field_key: 'short_description', locale_code: 'en',
    source_locale_code: 'vi', translated_text: 'Explore the largest theme park in Vietnam.', translation_method: 'ai_plus_human',
    human_review_status: 'APPROVED', is_public: true, is_production_data: true, production_eligible: true,
    revision_id: 'rev-1', reviewed_by: 'user-1', reviewed_at: '2026-09-04T00:00:00.000Z', source_id: 'source-1',
    ...overrides,
  };
}

function fakeDb(rows: Row[]): ExportDbPort {
  return {
    query: (async (sql: string) => {
      if (sql.includes('FROM place_translations')) return rows;
      throw new Error(`fakeDb: unexpected query ${sql}`);
    }) as ExportDbPort['query'],
  };
}

describe('exportPromotionManifest', () => {
  it('exports only READY (APPROVED + all flags true) rows', async () => {
    const rows = [
      row({ id: 'ready-1' }),
      row({ id: 'pending-1', human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false }),
      row({ id: 'rejected-1', human_review_status: 'REJECTED', is_public: false, is_production_data: false, production_eligible: false }),
    ];
    const { manifest, summary } = await exportPromotionManifest(fakeDb(rows), 'staging');
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].translation_id).toBe('ready-1');
    expect(summary).toEqual({ scanned: 3, ready: 1, blocked_pending: 1, blocked_review: 1, blocked_not_eligible: 0 });
  });

  it('computes a deterministic sha256 content hash', async () => {
    const { manifest } = await exportPromotionManifest(fakeDb([row()]), 'staging');
    expect(manifest.entries[0].content_hash_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries reviewed_by/reviewed_at through for audit', async () => {
    const { manifest } = await exportPromotionManifest(fakeDb([row()]), 'staging');
    expect(manifest.entries[0].reviewed_by).toBe('user-1');
    expect(manifest.entries[0].reviewed_at).toBe('2026-09-04T00:00:00.000Z');
  });

  it('defaults evidence_business_keys to empty array when no evidence lookup is supplied', async () => {
    const { manifest } = await exportPromotionManifest(fakeDb([row()]), 'staging');
    expect(manifest.entries[0].evidence_business_keys).toEqual([]);
  });

  it('uses the supplied evidence lookup when provided (optional PR #8 dependency)', async () => {
    const { manifest } = await exportPromotionManifest(fakeDb([row()]), 'staging', {}, async () => ['EVD-VIN-OFFICIAL-EN-20260829']);
    expect(manifest.entries[0].evidence_business_keys).toEqual(['EVD-VIN-OFFICIAL-EN-20260829']);
  });

  it('the manifest never contains anything but READY rows, even mixed with many blocked ones', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: `pending-${i}`, human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false }));
    const { manifest } = await exportPromotionManifest(fakeDb(rows), 'staging');
    expect(manifest.entries).toHaveLength(0);
  });
});
