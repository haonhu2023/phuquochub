import { computeFieldValueHash, isFieldValueStale } from './field-value-hash';

describe('computeFieldValueHash (current-value binding — canonical JSON/digest stability)', () => {
  it('is deterministic for the same value', () => {
    const value = { timezone: 'Asia/Ho_Chi_Minh', is_24h: false };
    expect(computeFieldValueHash(value)).toBe(computeFieldValueHash(value));
  });

  it('produces a 64-char lowercase hex string (sha256)', () => {
    expect(computeFieldValueHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is identical regardless of object key order — Postgres jsonb read-back reorders keys, so a naive hash would flag every read as "changed"', () => {
    const writtenOrder = { timezone: 'Asia/Ho_Chi_Minh', is_24h: false, regular: { mon: ['09:00-17:00'] } };
    const readBackOrder = { is_24h: false, regular: { mon: ['09:00-17:00'] }, timezone: 'Asia/Ho_Chi_Minh' };
    expect(computeFieldValueHash(writtenOrder)).toBe(computeFieldValueHash(readBackOrder));
  });

  it('preserves array order — a schedule with days swapped is a genuinely different value', () => {
    const mondayThenTuesday = { regular: { mon: ['09:00-17:00'], tue: ['09:00-17:00'] } };
    const differentHours = { regular: { mon: ['10:00-18:00'], tue: ['09:00-17:00'] } };
    expect(computeFieldValueHash(mondayThenTuesday)).not.toBe(computeFieldValueHash(differentHours));
  });

  it('differs when the value differs', () => {
    expect(computeFieldValueHash({ regular: { mon: ['09:00-17:00'] } })).not.toBe(computeFieldValueHash({ regular: { mon: ['10:00-18:00'] } }));
  });

  it('is deterministic and defined for null (a field with no value yet)', () => {
    expect(computeFieldValueHash(null)).toBe(computeFieldValueHash(null));
    expect(computeFieldValueHash(null)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('isFieldValueStale', () => {
  it('is NOT stale when the current field value still matches the stored hash', () => {
    const value = { regular: { mon: ['09:00-17:00'] } };
    const hash = computeFieldValueHash(value);
    expect(isFieldValueStale(hash, value)).toBe(false);
  });

  it('IS stale once the field value has changed — this is the exact T1/T2 scenario the review raised', () => {
    const hash = computeFieldValueHash({ regular: { mon: ['09:00-17:00'] } });
    expect(isFieldValueStale(hash, { regular: { mon: ['10:00-18:00'] } })).toBe(true);
  });

  it('is NOT stale across a key-reordered read-back of the same value', () => {
    const hash = computeFieldValueHash({ timezone: 'Asia/Ho_Chi_Minh', is_24h: false });
    expect(isFieldValueStale(hash, { is_24h: false, timezone: 'Asia/Ho_Chi_Minh' })).toBe(false);
  });
});
