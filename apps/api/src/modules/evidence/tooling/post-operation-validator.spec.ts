import { runPostOperationValidator, type ExpectationsManifest, type ValidatorDbPort } from './post-operation-validator';

function manifest(): ExpectationsManifest {
  return {
    entries: [
      {
        place_slug: 'sun-world-hon-thom',
        expected_evidence_business_keys: ['EVD-SUN-OFFICIAL-20260829'],
        expected_translation_targets: [
          { field_key: 'short_description', locale_code: 'en' },
          { field_key: 'short_description', locale_code: 'vi' },
        ],
      },
    ],
  };
}

interface FakeState {
  places?: Record<string, string>;
  evidence?: Record<string, { id: string; verification_status: string; source_id: string }>;
  links?: Record<string, string[]>; // evidenceId -> translationIds
  translations?: Record<string, { id: string; human_review_status: string; is_public: boolean; is_production_data: boolean; production_eligible: boolean }>;
}

function fakeDb(state: FakeState = {}): ValidatorDbPort {
  const places = state.places ?? { 'sun-world-hon-thom': 'place-1' };
  const evidence = state.evidence ?? { 'EVD-SUN-OFFICIAL-20260829': { id: 'evidence-1', verification_status: 'NEEDS_REVIEW', source_id: 'source-1' } };
  const links = state.links ?? { 'evidence-1': ['trans-en', 'trans-vi'] };
  const translations = state.translations ?? {
    'place-1:short_description:en': { id: 'trans-en', human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false },
    'place-1:short_description:vi': { id: 'trans-vi', human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false },
  };

  return {
    query: (async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
      if (sql.includes('FROM places')) {
        const id = places[params[0] as string];
        return id ? [{ id }] : [];
      }
      if (sql.includes('FROM evidence_artifacts')) {
        const e = evidence[params[0] as string];
        return e ? [e] : [];
      }
      if (sql.includes('FROM place_translation_evidence_links')) {
        const ids = links[params[0] as string] ?? [];
        return ids.map((translation_id) => ({ translation_id }));
      }
      if (sql.includes('FROM place_translations')) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        const t = translations[key];
        return t ? [t] : [];
      }
      throw new Error(`fakeDb: unexpected query ${sql}`);
    }) as ValidatorDbPort['query'],
  };
}

describe('runPostOperationValidator', () => {
  it('a fully correct post-operation state passes with zero findings', async () => {
    const result = await runPostOperationValidator(manifest(), fakeDb());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.checked).toEqual({ places: 1, evidence_business_keys: 1, translation_targets: 2 });
  });

  it('reports PLACE_NOT_FOUND and skips further checks for that entry', async () => {
    const result = await runPostOperationValidator(manifest(), fakeDb({ places: {} }));
    expect(result.ok).toBe(false);
    expect(result.findings[0].code).toBe('PLACE_NOT_FOUND');
  });

  it('reports EXPECTED_EVIDENCE_MISSING when the business_key does not exist', async () => {
    const result = await runPostOperationValidator(manifest(), fakeDb({ evidence: {} }));
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'EXPECTED_EVIDENCE_MISSING')).toBe(true);
  });

  it('reports UNEXPECTED_VERIFICATION_PROMOTION if evidence somehow became VERIFIED', async () => {
    const result = await runPostOperationValidator(
      manifest(),
      fakeDb({ evidence: { 'EVD-SUN-OFFICIAL-20260829': { id: 'evidence-1', verification_status: 'VERIFIED', source_id: 'source-1' } } }),
    );
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'UNEXPECTED_VERIFICATION_PROMOTION')).toBe(true);
  });

  it('reports MISSING_LINK (warning, not error) when a translation exists but is not linked', async () => {
    const result = await runPostOperationValidator(manifest(), fakeDb({ links: { 'evidence-1': ['trans-en'] } }));
    const finding = result.findings.find((f) => f.code === 'MISSING_LINK');
    expect(finding?.severity).toBe('warning');
    expect(result.ok).toBe(true); // warnings don't fail the gate
  });

  it('reports EXPECTED_TRANSLATION_MISSING when a target translation does not exist at all', async () => {
    const result = await runPostOperationValidator(manifest(), fakeDb({ translations: {} }));
    expect(result.ok).toBe(false);
    expect(result.findings.filter((f) => f.code === 'EXPECTED_TRANSLATION_MISSING')).toHaveLength(2);
  });

  it('reports UNEXPECTED_REVIEW_STATUS if a translation somehow became APPROVED without a real review', async () => {
    const result = await runPostOperationValidator(
      manifest(),
      fakeDb({
        translations: {
          'place-1:short_description:en': { id: 'trans-en', human_review_status: 'APPROVED', is_public: false, is_production_data: false, production_eligible: false },
          'place-1:short_description:vi': { id: 'trans-vi', human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false },
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'UNEXPECTED_REVIEW_STATUS')).toBe(true);
  });

  it('reports UNEXPECTED_PUBLICATION_FLAG if is_public/is_production_data/production_eligible leaked true', async () => {
    const result = await runPostOperationValidator(
      manifest(),
      fakeDb({
        translations: {
          'place-1:short_description:en': { id: 'trans-en', human_review_status: 'PENDING', is_public: true, is_production_data: false, production_eligible: false },
          'place-1:short_description:vi': { id: 'trans-vi', human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false },
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'UNEXPECTED_PUBLICATION_FLAG')).toBe(true);
  });

  it('never calls any write-shaped query — only SELECT statements', async () => {
    const db = fakeDb();
    const spy = jest.fn(db.query);
    await runPostOperationValidator(manifest(), { query: spy as ValidatorDbPort['query'] });
    for (const call of spy.mock.calls) {
      expect((call[0] as string).trim().toUpperCase().startsWith('SELECT')).toBe(true);
    }
  });
});
