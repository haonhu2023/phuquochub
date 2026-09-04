import { computeClaimsHash, validateManifestStatic } from './evidence-manifest-validator';
import type { EvidenceManifest, EvidenceManifestEntry } from './evidence-manifest.types';

function entry(overrides: Partial<EvidenceManifestEntry> = {}): EvidenceManifestEntry {
  return {
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
    ...overrides,
  };
}

function manifest(entries: EvidenceManifestEntry[]): EvidenceManifest {
  return { manifest_version: '1.0', generated_by: 'test', generated_at: '2026-09-04T00:00:00.000Z', entries };
}

describe('validateManifestStatic', () => {
  it('accepts a well-formed manifest with zero issues', () => {
    const result = validateManifestStatic(manifest([entry()]));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('is deterministic — identical input produces byte-identical output across repeated calls', () => {
    const m = manifest([entry(), entry({ place_slug: 'bai-dai', evidence: { ...entry().evidence, business_key: 'EVD-BAIDAI-VI-20260904' } })]);
    const first = validateManifestStatic(m);
    const second = validateManifestStatic(structuredClone(m));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('rejects an unsupported manifest_version', () => {
    const m = { ...manifest([entry()]), manifest_version: '2.0' as '1.0' };
    const result = validateManifestStatic(m);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('UNSUPPORTED_MANIFEST_VERSION');
  });

  it('rejects an empty entries array', () => {
    const result = validateManifestStatic(manifest([]));
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('EMPTY_MANIFEST');
  });

  it('detects duplicate business_key within one manifest', () => {
    const m = manifest([entry(), entry({ place_slug: 'bai-dai' })]); // same default business_key
    const result = validateManifestStatic(m);
    expect(result.valid).toBe(false);
    expect(result.businessKeyDuplicates).toEqual(['EVD-BAISAO-VI-20260904']);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_BUSINESS_KEY')).toBe(true);
  });

  it('rejects a non-http(s) source URL', () => {
    const m = manifest([entry({ source: { ...entry().source, url: 'ftp://example.com' } })]);
    const result = validateManifestStatic(m);
    expect(result.issues.map((i) => i.code)).toContain('INVALID_SOURCE_URL');
  });

  it('rejects an unknown source.type / source.kind', () => {
    const m = manifest([entry({ source: { ...entry().source, type: 'not_a_real_type', kind: 'not_a_real_kind' } })]);
    const result = validateManifestStatic(m);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('INVALID_SOURCE_TYPE');
    expect(codes).toContain('INVALID_SOURCE_KIND');
  });

  it('rejects a malformed checksum', () => {
    const m = manifest([entry({ evidence: { ...entry().evidence, content_hash_sha256: 'not-a-hash' } })]);
    const result = validateManifestStatic(m);
    expect(result.issues.map((i) => i.code)).toContain('INVALID_CHECKSUM');
  });

  it('accepts a valid 64-char hex checksum', () => {
    const m = manifest([entry({ evidence: { ...entry().evidence, content_hash_sha256: 'a'.repeat(64) } })]);
    const result = validateManifestStatic(m);
    expect(result.valid).toBe(true);
  });

  // The core governance guardrail this tool exists to enforce.
  it.each(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED'])(
    'rejects a manifest that claims verification_status=%s (automated tooling may never assert this)',
    (status) => {
      const m = manifest([entry({ evidence: { ...entry().evidence, verification_status: status } })]);
      const result = validateManifestStatic(m);
      expect(result.valid).toBe(false);
      expect(result.issues.map((i) => i.code)).toContain('UNAUTHORIZED_VERIFICATION_STATUS');
    },
  );

  it('accepts NEEDS_REVIEW and other non-gate-passing verification_status values', () => {
    const m = manifest([entry({ evidence: { ...entry().evidence, verification_status: 'CAPTURED' } })]);
    expect(validateManifestStatic(m).valid).toBe(true);
  });

  it('warns (does not error) when an entry has no links', () => {
    const m = manifest([entry({ links: [] })]);
    const result = validateManifestStatic(m);
    expect(result.valid).toBe(true);
    const issue = result.issues.find((i) => i.code === 'NO_LINKS');
    expect(issue?.severity).toBe('warning');
  });

  it('rejects a link missing field_key or locale_code', () => {
    const m = manifest([entry({ links: [{ field_key: '', locale_code: '' }] })]);
    const result = validateManifestStatic(m);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_LINK_FIELD_KEY');
    expect(codes).toContain('MISSING_LINK_LOCALE_CODE');
  });

  it('rejects reliability outside [0, 100]', () => {
    const m = manifest([entry({ source: { ...entry().source, reliability: 150 } })]);
    expect(validateManifestStatic(m).issues.map((i) => i.code)).toContain('INVALID_RELIABILITY');
  });
});

describe('computeClaimsHash', () => {
  it('is deterministic and order-independent (claim array order does not change the hash)', () => {
    const a = [
      { field: 'name', value: 'Bãi Sao', support: 'verified_live' as const },
      { field: 'phone', value: null, support: 'not_applicable' as const },
    ];
    const b = [...a].reverse();
    expect(computeClaimsHash(a)).toBe(computeClaimsHash(b));
  });

  it('changes when claim content changes', () => {
    const a = [{ field: 'name', value: 'Bãi Sao', support: 'verified_live' as const }];
    const b = [{ field: 'name', value: 'Bai Sao', support: 'verified_live' as const }];
    expect(computeClaimsHash(a)).not.toBe(computeClaimsHash(b));
  });

  it('produces a 64-char lowercase hex string', () => {
    expect(computeClaimsHash([])).toMatch(/^[0-9a-f]{64}$/);
  });
});
