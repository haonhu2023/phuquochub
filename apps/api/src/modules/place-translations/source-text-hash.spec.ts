import { computeSourceTextHash, isSourceTextStale } from './source-text-hash';

describe('computeSourceTextHash (ADR-020 source_text_hash — canonical JSON/digest stability)', () => {
  it('is deterministic for the same input', () => {
    const text = 'Bãi biển Sao đẹp nhất Phú Quốc';
    expect(computeSourceTextHash(text)).toBe(computeSourceTextHash(text));
  });

  it('produces a 64-char lowercase hex string (sha256)', () => {
    expect(computeSourceTextHash('abc')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when the source text differs', () => {
    expect(computeSourceTextHash('Bãi biển Sao')).not.toBe(computeSourceTextHash('Bãi biển Sao đẹp'));
  });

  it('does not collide plain string concatenation ambiguity (canonicalJson-serialized, not raw concat)', () => {
    // Without JSON-level serialization, 'ab' + 'c' and 'a' + 'bc' could be hashed identically by a
    // naive implementation; computeSourceTextHash canonical-serializes each string independently.
    expect(computeSourceTextHash('abc')).not.toBe(computeSourceTextHash('ab' + String.fromCharCode(0) + 'c'));
  });
});

describe('isSourceTextStale', () => {
  it('is NOT stale when the current source text still matches the stored hash', () => {
    const hash = computeSourceTextHash('Bãi Sao');
    expect(isSourceTextStale(hash, 'Bãi Sao')).toBe(false);
  });

  it('IS stale once the underlying Vietnamese source text has changed', () => {
    const hash = computeSourceTextHash('Bãi Sao');
    expect(isSourceTextStale(hash, 'Bãi Sao (đã cập nhật)')).toBe(true);
  });
});
