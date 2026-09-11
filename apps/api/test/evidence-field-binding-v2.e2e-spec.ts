import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { EvidenceService } from '../src/modules/evidence/evidence.service';
import { PlacesRepository } from '../src/modules/places/repositories/places.repository';
import { computeFieldValueHash } from '../src/modules/evidence/field-value-hash';

// Evidence Field-Binding V2 (ADR-022 "Known limitation — evidence-to-link binding" follow-up) —
// live Postgres. Proves, against a real database (not mocked rows), that the two structural gaps
// ADR-022 itself documented are actually closed:
//
//   H1: a VERIFIED evidence artifact reviewed for one (place, field, value) tuple can no longer be
//       re-linked to a DIFFERENT place or a DIFFERENT current value and clear the operational gate
//       without a fresh, bound human review — the link-write guard (EvidenceService.
//       linkEvidenceToPlaceField) refuses the write, and even a link created out-of-band (bypassing
//       that guard, simulating pre-V2 data) is still excluded by the read gate.
//   H2: an eligible APPROVE followed by a newer REJECT/NEEDS_CHANGES for the SAME exact tuple
//       immediately stops that tuple from clearing the gate — proven here even though
//       evidence_artifacts.verification_status/verification_expires_at (the V1 denormalized
//       mirror) are untouched by the REJECT and still say VERIFIED/unexpired.
//
// Runs the full REQUIRED REGRESSION SEQUENCE end to end through the real service + repository +
// SQL (the LATERAL join in PlacesRepository.getVerifiedOpeningHoursHashes), not a mocked query.
describe('Evidence Field-Binding V2 (ADR-022 follow-up, live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let evidenceService: EvidenceService;
  let placesRepo: PlacesRepository;
  let categoryId: string;

  const placeIds: string[] = [];
  const sourceIds: string[] = [];
  const evidenceArtifactIds: string[] = [];

  function receipt(label: string): string {
    return createHash('sha256').update(`e2e-field-binding-receipt-${label}-${randomUUID()}`).digest('hex');
  }
  function contentDigest(label: string): string {
    return createHash('sha256').update(`e2e-field-binding-content-${label}`).digest('hex');
  }

  async function mkPlace(label: string, openingHours: Record<string, unknown>): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, opening_hours)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published', $4::jsonb)
       RETURNING id`,
      [
        `E2E FieldBinding ${label}`,
        `e2e-fieldbinding-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
        JSON.stringify(openingHours),
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkOfficialSource(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO sources (type, kind, reliability) VALUES ('official_website', 'url', 90) RETURNING id`,
    );
    sourceIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkEvidenceArtifact(sourceId: string, label: string, capturedAt: Date, contentHashSha256: string): Promise<string> {
    const artifact = await evidenceService.ensureEvidenceArtifact({
      sourceId,
      businessKey: `E2E-FIELD-BINDING-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      evidenceType: 'OFFICIAL_WEBPAGE',
      sourceUrl: 'https://example.com/opening-hours',
      capturedAt,
      contentHashSha256,
      verificationStatus: 'NEEDS_REVIEW',
    });
    evidenceArtifactIds.push(artifact.id);
    return artifact.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    evidenceService = app.get(EvidenceService);
    placesRepo = app.get(PlacesRepository);

    const [{ id }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = id;
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // FK order: evidence_reviews (RESTRICT on both evidence_artifact_id and the new place_id)
        // -> place_field_evidence_links (RESTRICT on evidence_artifact_id) -> evidence_artifacts
        // (RESTRICT on source_id) -> places -> sources.
        if (evidenceArtifactIds.length || placeIds.length) {
          await ds.query(`DELETE FROM evidence_reviews WHERE evidence_artifact_id = ANY($1) OR place_id = ANY($2)`, [
            evidenceArtifactIds,
            placeIds,
          ]);
        }
        if (placeIds.length || evidenceArtifactIds.length) {
          await ds.query(`DELETE FROM place_field_evidence_links WHERE place_id = ANY($1) OR evidence_artifact_id = ANY($2)`, [
            placeIds,
            evidenceArtifactIds,
          ]);
        }
        if (evidenceArtifactIds.length) await ds.query(`DELETE FROM evidence_artifacts WHERE id = ANY($1)`, [evidenceArtifactIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it(
    'REQUIRED REGRESSION SEQUENCE: field-bound APPROVE for value A clears the gate; a re-link attempt for ' +
      'changed value B without a new bound review fails closed (H1); a fresh V2 APPROVE for B clears it ' +
      'again; a later REJECT for the SAME exact tuple immediately stops it (H2)',
    async () => {
      const valueA = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '08:00', close: '22:00' }] } };
      const valueB = { timezone: 'Asia/Ho_Chi_Minh', regular: { mon: [{ open: '09:00', close: '21:00' }] } };
      const hashA = computeFieldValueHash(valueA);
      const hashB = computeFieldValueHash(valueB);

      const sourceId = await mkOfficialSource();
      const placeId = await mkPlace('sequence', valueA);
      const capturedAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — well inside the 168h gate
      const content = contentDigest('sequence');
      const artifactId = await mkEvidenceArtifact(sourceId, 'sequence', capturedAt, content);

      // A: review bound to hash(A) + link -> PASS.
      const reviewA = await evidenceService.reviewEvidenceArtifact({
        evidenceArtifactId: artifactId,
        decision: 'APPROVE',
        reviewerName: 'E2E Reviewer',
        approvalArtifactSha256: receipt('a'),
        claimType: 'opening_hours',
        scheduleStability: 'STABLE',
        evidenceContentSha256: content,
        placeId,
        fieldName: 'opening_hours',
        fieldValueHash: hashA,
      });
      expect(reviewA.evaluation.eligible).toBe(true);
      expect(reviewA.evidenceVerified).toBe(true);
      await evidenceService.linkEvidenceToPlaceField(placeId, 'opening_hours', artifactId);
      await expect(placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, valueA)).resolves.toBe(true);

      // B: opening_hours changes on the place. Old review/link retained, but the gate stops
      // qualifying for the new current value (public detail suppresses hours; the same shared gate
      // also governs Right Now / Trusted Nearby).
      await ds.query(`UPDATE places SET opening_hours = $2::jsonb WHERE id = $1`, [placeId, JSON.stringify(valueB)]);
      await expect(placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, valueB)).resolves.toBe(false);

      // H1: reusing the SAME already-VERIFIED artifact for the place's NEW current value, without a
      // fresh field-bound review for hash(B), must fail CLOSED at the link-write guard — this is
      // exactly the gap ADR-022's own "Known limitation" section named as unresolved before this change.
      await expect(evidenceService.linkEvidenceToPlaceField(placeId, 'opening_hours', artifactId)).rejects.toThrow();

      // C: a fresh V2 APPROVE bound to hash(B) + link -> PASS again.
      const reviewB = await evidenceService.reviewEvidenceArtifact({
        evidenceArtifactId: artifactId,
        decision: 'APPROVE',
        reviewerName: 'E2E Reviewer',
        approvalArtifactSha256: receipt('b'),
        claimType: 'opening_hours',
        scheduleStability: 'STABLE',
        evidenceContentSha256: content,
        placeId,
        fieldName: 'opening_hours',
        fieldValueHash: hashB,
      });
      expect(reviewB.evaluation.eligible).toBe(true);
      await evidenceService.linkEvidenceToPlaceField(placeId, 'opening_hours', artifactId);
      await expect(placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, valueB)).resolves.toBe(true);

      // H2: a newer REJECT for the SAME exact (artifact, place, field, hashB) tuple immediately stops
      // clearing the gate — even though evidence_artifacts.verification_status/verification_expires_at
      // (the V1 denormalized mirror EvidenceService also still maintains) remain VERIFIED/unexpired,
      // untouched by a non-APPROVE decision. The gate must be reading the LATEST per-tuple review from
      // evidence_reviews itself, not that legacy mirror.
      const rejectB = await evidenceService.reviewEvidenceArtifact({
        evidenceArtifactId: artifactId,
        decision: 'REJECT',
        reviewerName: 'E2E Reviewer Two',
        approvalArtifactSha256: receipt('reject-b'),
        claimType: 'opening_hours',
        scheduleStability: 'STABLE',
        evidenceContentSha256: content,
        placeId,
        fieldName: 'opening_hours',
        fieldValueHash: hashB,
      });
      expect(rejectB.evidenceVerified).toBe(false);
      const [{ verification_status: statusAfterReject, verification_expires_at: expiryAfterReject }] = await ds.query(
        `SELECT verification_status, verification_expires_at FROM evidence_artifacts WHERE id = $1`,
        [artifactId],
      );
      expect(statusAfterReject).toBe('VERIFIED'); // V1 mirror untouched by the REJECT — proves the read gate isn't using it
      expect(new Date(expiryAfterReject).getTime()).toBeGreaterThan(Date.now());

      await expect(placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, valueB)).resolves.toBe(false);
    },
    30_000,
  );

  it('a legacy V1 (unbound) review never clears the V2 field-bound gate, even when VERIFIED and unexpired', async () => {
    const value = { timezone: 'Asia/Ho_Chi_Minh', is_24h: true };
    const hash = computeFieldValueHash(value);
    const sourceId = await mkOfficialSource();
    const placeId = await mkPlace('legacy', value);
    const capturedAt = new Date(Date.now() - 60 * 60 * 1000);
    const content = contentDigest('legacy');
    const artifactId = await mkEvidenceArtifact(sourceId, 'legacy', capturedAt, content);

    // A V1 unbound review — no placeId/fieldName/fieldValueHash — preserves exact V1 semantics.
    const v1Review = await evidenceService.reviewEvidenceArtifact({
      evidenceArtifactId: artifactId,
      decision: 'APPROVE',
      reviewerName: 'E2E Reviewer',
      approvalArtifactSha256: receipt('legacy'),
      claimType: 'opening_hours',
      scheduleStability: 'STABLE',
      evidenceContentSha256: content,
    });
    expect(v1Review.evidenceVerified).toBe(true);

    // Insert the field-evidence link directly (bypassing the V2 link-write guard) — simulates a row
    // that could only have existed before this change shipped, to prove the READ gate itself fails
    // closed for an unbound review even when a link is already sitting there.
    await ds.query(
      `INSERT INTO place_field_evidence_links (place_id, field_name, evidence_artifact_id, field_value_hash)
       VALUES ($1, 'opening_hours', $2, $3)`,
      [placeId, artifactId, hash],
    );

    await expect(placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, value)).resolves.toBe(false);
  });

  it('linkEvidenceToPlaceField refuses a NEW opening_hours link outright when no qualifying V2 review exists at all', async () => {
    const value = { timezone: 'Asia/Ho_Chi_Minh', is_24h: false, regular: { tue: [{ open: '07:00', close: '20:00' }] } };
    const sourceId = await mkOfficialSource();
    const placeId = await mkPlace('no-review', value);
    const capturedAt = new Date(Date.now() - 60 * 60 * 1000);
    const content = contentDigest('no-review');
    const artifactId = await mkEvidenceArtifact(sourceId, 'no-review', capturedAt, content);

    await expect(evidenceService.linkEvidenceToPlaceField(placeId, 'opening_hours', artifactId)).rejects.toThrow();

    const links = await ds.query(`SELECT 1 FROM place_field_evidence_links WHERE place_id = $1`, [placeId]);
    expect(links).toEqual([]);
  });

  it('DETERMINISM: two reviews for the exact same tuple tied on reviewed_at AND created_at resolve via a stable id DESC tiebreak, never arbitrarily', async () => {
    const value = { timezone: 'Asia/Ho_Chi_Minh', regular: { wed: [{ open: '08:00', close: '17:00' }] } };
    const hash = computeFieldValueHash(value);
    const sourceId = await mkOfficialSource();
    const placeId = await mkPlace('tie', value);
    const capturedAt = new Date(Date.now() - 60 * 60 * 1000);
    const content = contentDigest('tie');
    const artifactId = await mkEvidenceArtifact(sourceId, 'tie', capturedAt, content);
    const tiedTimestamp = new Date();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Both rows are inserted directly (bypassing EvidenceService — this test is about the SQL
    // ORDER BY's own tie-break stability, not the service's write path) with the SAME reviewed_at
    // AND the SAME created_at, so `reviewed_at DESC, created_at DESC` alone cannot resolve a winner
    // — only the trailing `id DESC` tiebreak can.
    const [{ id: approveId }]: Array<{ id: string }> = await ds.query(
      `INSERT INTO evidence_reviews
         (evidence_artifact_id, decision, reviewer_name, reviewed_at, approval_artifact_sha256, claim_type,
          policy_key, policy_version, evidence_content_sha256, verification_expires_at, place_id, field_name,
          field_value_hash, created_at)
       VALUES ($1, 'APPROVE', 'Tie Reviewer A', $2, $3, 'opening_hours', 'OPENING_HOURS_FIELD_BOUND_V2', '2', $4, $5, $6, 'opening_hours', $7, $2)
       RETURNING id`,
      [artifactId, tiedTimestamp, receipt('tie-approve'), content, expiresAt, placeId, hash],
    );
    const [{ id: rejectId }]: Array<{ id: string }> = await ds.query(
      `INSERT INTO evidence_reviews
         (evidence_artifact_id, decision, reviewer_name, reviewed_at, approval_artifact_sha256, claim_type,
          policy_key, policy_version, evidence_content_sha256, verification_expires_at, place_id, field_name,
          field_value_hash, created_at)
       VALUES ($1, 'REJECT', 'Tie Reviewer B', $2, $3, 'opening_hours', 'OPENING_HOURS_FIELD_BOUND_V2', '2', $4, NULL, $5, 'opening_hours', $6, $2)
       RETURNING id`,
      [artifactId, tiedTimestamp, receipt('tie-reject'), content, placeId, hash],
    );
    await ds.query(
      `INSERT INTO place_field_evidence_links (place_id, field_name, evidence_artifact_id, field_value_hash) VALUES ($1, 'opening_hours', $2, $3)`,
      [placeId, artifactId, hash],
    );

    // Postgres UUID ordering matches JS string comparison of the canonical lowercase-hex-with-
    // hyphens form (hyphens sit at identical fixed positions in every UUID), so this predicts
    // exactly what `id DESC` will pick without needing to special-case either outcome.
    const approveWinsById = approveId > rejectId;

    const results: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await placesRepo.hasCurrentQualifiedOpeningHoursEvidence(placeId, value));
    }
    expect(new Set(results).size).toBe(1); // stable across repeated calls, never flip-flops
    expect(results[0]).toBe(approveWinsById);
  });
});
