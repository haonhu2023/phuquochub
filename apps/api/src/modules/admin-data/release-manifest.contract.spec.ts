import {
  SUPPORTED_RELEASE_MANIFEST_VERSIONS,
  computeReleaseManifestChecksum,
  validateReleaseManifest,
  assertNonDryRunAllowed,
  type ReleaseManifestPayloadV1,
  type ReleaseManifestV1,
  type ReleaseSubBatchRef,
} from './release-manifest.contract';

function buildSubBatch(overrides: Partial<ReleaseSubBatchRef> = {}): ReleaseSubBatchRef {
  return {
    kind: 'translation',
    idempotencyKey: 'release-vinwonders-phu-quoc:translation:v1',
    payloadDigest: 'a'.repeat(64),
    ...overrides,
  };
}

function buildPayload(overrides: Partial<ReleaseManifestPayloadV1> = {}): ReleaseManifestPayloadV1 {
  return {
    releaseManifestVersion: 1,
    releaseItemId: 'release-2026-09-03-vinwonders',
    canonicalKey: 'place:vinwonders-phu-quoc',
    slug: 'vinwonders-phu-quoc',
    targetEnvironment: 'local_staging',
    identityResolutionStatus: 'MATCHED',
    policyStatus: 'PASS',
    preflightStatus: 'PASS',
    evidenceDigest: 'b'.repeat(64),
    approval: {
      approvedBy: 'nhuhao2023@gmail.com',
      approvedAt: '2026-09-03T00:00:00.000Z',
      reason: 'Data-SSOT remediation pilot release.',
    },
    subBatches: [buildSubBatch()],
    ...overrides,
  };
}

function buildManifest(payloadOverrides: Partial<ReleaseManifestPayloadV1> = {}): ReleaseManifestV1 {
  const payload = buildPayload(payloadOverrides);
  return { payload, checksum: computeReleaseManifestChecksum(payload) };
}

describe('release-manifest.contract', () => {
  it('valid manifest → ok:true', () => {
    expect(validateReleaseManifest(buildManifest()).ok).toBe(true);
  });

  it('key order does not affect the checksum', () => {
    const p1 = buildPayload();
    const reordered: ReleaseManifestPayloadV1 = {
      subBatches: p1.subBatches,
      approval: p1.approval,
      evidenceDigest: p1.evidenceDigest,
      preflightStatus: p1.preflightStatus,
      policyStatus: p1.policyStatus,
      identityResolutionStatus: p1.identityResolutionStatus,
      targetEnvironment: p1.targetEnvironment,
      slug: p1.slug,
      canonicalKey: p1.canonicalKey,
      releaseItemId: p1.releaseItemId,
      releaseManifestVersion: p1.releaseManifestVersion,
    };
    expect(computeReleaseManifestChecksum(p1)).toBe(computeReleaseManifestChecksum(reordered));
  });

  it('changing one byte in subBatches changes the checksum', () => {
    const p1 = buildPayload();
    const p2 = buildPayload({ subBatches: [buildSubBatch({ payloadDigest: 'c'.repeat(64) })] });
    expect(computeReleaseManifestChecksum(p1)).not.toBe(computeReleaseManifestChecksum(p2));
  });

  it('changing approval.approvedBy changes the checksum (approval is inside the hashed content)', () => {
    const p1 = buildPayload();
    const p2 = buildPayload({ approval: { ...p1.approval, approvedBy: 'someone-else@example.com' } });
    expect(computeReleaseManifestChecksum(p1)).not.toBe(computeReleaseManifestChecksum(p2));
  });

  it('rejects a manifest whose checksum does not match its payload', () => {
    const manifest = buildManifest();
    const tampered: ReleaseManifestV1 = { ...manifest, payload: { ...manifest.payload, slug: 'tampered-slug' } };
    const result = validateReleaseManifest(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('checksum không khớp'))).toBe(true);
  });

  it('rejects an unsupported releaseManifestVersion', () => {
    const result = validateReleaseManifest(buildManifest({ releaseManifestVersion: 2 as 1 }));
    expect(result.ok).toBe(false);
  });

  it('rejects a placeholder approvedBy ("owner")', () => {
    const payload = buildPayload({ approval: { approvedBy: 'owner', approvedAt: '2026-09-03T00:00:00.000Z', reason: 'x' } });
    const manifest: ReleaseManifestV1 = { payload, checksum: computeReleaseManifestChecksum(payload) };
    const result = validateReleaseManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('placeholder'))).toBe(true);
  });

  it('rejects an empty approval.reason', () => {
    const result = validateReleaseManifest(buildManifest({ approval: { approvedBy: 'x@example.com', approvedAt: '2026-09-03T00:00:00.000Z', reason: '' } }));
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid approvedAt (non-canonical timestamp)', () => {
    const result = validateReleaseManifest(buildManifest({ approval: { approvedBy: 'x@example.com', approvedAt: '2026-13-99', reason: 'x' } }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty subBatches array', () => {
    const result = validateReleaseManifest(buildManifest({ subBatches: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate sub-batch kinds within one release', () => {
    const result = validateReleaseManifest(buildManifest({ subBatches: [buildSubBatch(), buildSubBatch()] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('bị trùng'))).toBe(true);
  });

  it('rejects a sub-batch missing idempotencyKey', () => {
    const result = validateReleaseManifest(buildManifest({ subBatches: [buildSubBatch({ idempotencyKey: '' })] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a sub-batch with a malformed payloadDigest', () => {
    const result = validateReleaseManifest(buildManifest({ subBatches: [buildSubBatch({ payloadDigest: 'not-hex' })] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid identityResolutionStatus', () => {
    const result = validateReleaseManifest(buildManifest({ identityResolutionStatus: 'UNKNOWN' as 'MATCHED' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a manifest containing a secret-like key', () => {
    const payload = { ...buildPayload(), apiSecretToken: 'xxxx' } as unknown as ReleaseManifestPayloadV1;
    const manifest: ReleaseManifestV1 = { payload, checksum: computeReleaseManifestChecksum(payload) };
    const result = validateReleaseManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('secret'))).toBe(true);
  });

  it('rejects a manifest containing an accessKey-shaped field', () => {
    const payload = { ...buildPayload(), accessKey: 'AKIA...' } as unknown as ReleaseManifestPayloadV1;
    const manifest: ReleaseManifestV1 = { payload, checksum: computeReleaseManifestChecksum(payload) };
    const result = validateReleaseManifest(manifest);
    expect(result.ok).toBe(false);
  });

  // Regression: the secret scanner must not flag this contract's OWN legitimate vocabulary —
  // canonicalKey/idempotencyKey are structural identifiers, not credential holders. A naive bare
  // "key" substring match (the bug this test guards against) would reject every valid manifest.
  it('does NOT flag canonicalKey/idempotencyKey as secret-like — a valid manifest passes cleanly', () => {
    const result = validateReleaseManifest(buildManifest());
    expect(result.ok).toBe(true);
  });

  it('reports multiple errors at once, not just the first', () => {
    const result = validateReleaseManifest(buildManifest({ slug: '', canonicalKey: '', evidenceDigest: 'not-hex' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('SUPPORTED_RELEASE_MANIFEST_VERSIONS is exactly [1]', () => {
    expect(SUPPORTED_RELEASE_MANIFEST_VERSIONS).toEqual([1]);
  });

  describe('assertNonDryRunAllowed', () => {
    it('allows a fully-gated manifest', () => {
      const result = assertNonDryRunAllowed(buildManifest(), 'translation');
      expect(result.allowed).toBe(true);
    });

    it('blocks when identityResolutionStatus is not MATCHED', () => {
      const result = assertNonDryRunAllowed(buildManifest({ identityResolutionStatus: 'HOLD_IDENTITY_CONFLICT' }), 'translation');
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasons.some((r) => r.includes('identityResolutionStatus'))).toBe(true);
    });

    it('blocks when policyStatus is not PASS', () => {
      const result = assertNonDryRunAllowed(buildManifest({ policyStatus: 'FAIL' }), 'translation');
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasons.some((r) => r.includes('policyStatus'))).toBe(true);
    });

    it('blocks when preflightStatus is not PASS', () => {
      const result = assertNonDryRunAllowed(buildManifest({ preflightStatus: 'NOT_RUN' }), 'translation');
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasons.some((r) => r.includes('preflightStatus'))).toBe(true);
    });

    it('blocks when no sub-batch of the requested kind exists', () => {
      const result = assertNonDryRunAllowed(buildManifest({ subBatches: [buildSubBatch({ kind: 'facts' })] }), 'translation');
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasons.some((r) => r.includes('No sub-batch'))).toBe(true);
    });

    it('reports every blocking reason at once', () => {
      const result = assertNonDryRunAllowed(
        buildManifest({ identityResolutionStatus: 'HOLD_IDENTITY_CONFLICT', policyStatus: 'FAIL', preflightStatus: 'FAIL' }),
        'translation',
      );
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });
  });
});
