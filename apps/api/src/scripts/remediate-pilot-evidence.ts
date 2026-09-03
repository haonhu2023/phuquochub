import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { EvidenceArtifact } from '../modules/evidence/entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from '../modules/evidence/entities/place-translation-evidence-link.entity';
import { EvidenceArtifactsRepository } from '../modules/evidence/repositories/evidence-artifacts.repository';
import { EvidenceService } from '../modules/evidence/evidence.service';

// PILOT EVIDENCE REMEDIATION — 2026-09-03 data-SSOT remediation, Phase 3. Same hand-wired-against-a-
// bare-DataSource approach as cancel-multilingual-batch.ts / remediate-pilot-translations.ts (see
// those files for why: booting the full AppModule pulls in unrelated service deps and hangs).
//
// Imports the THREE real evidence rows the workbook (05_Evidence_Archive) has for the two pilots —
// EVD-VIN-OFFICIAL-VI-20260829, EVD-VIN-OFFICIAL-EN-20260829, EVD-SUN-OFFICIAL-20260829 — exactly as
// captured: real content_hash_sha256, real captured_at, and critically, real verification_status =
// "NEEDS_REVIEW" for all three (the workbook's own human reviewer never upgraded these; see the row
// notes: no immutable snapshot, robots/terms not checked). This script does NOT and MUST NOT upgrade
// that status — EvidenceService.ensureEvidenceArtifact() only ever inserts-or-returns-as-is, never
// overwrites an existing row's verificationStatus (tested).
//
// Then links each evidence row to the translations it backs (VI evidence -> vi rows, EN evidence ->
// en rows, per place) and reports each translation's real gate status via
// evaluateTranslationEvidenceGate() — expected result for all 8: HOLD (evidence exists and is
// linked, but is NEEDS_REVIEW, not VERIFIED). This is the honest, correct outcome — reporting PASS
// here would be exactly the overclaim the task explicitly forbids.
//
// Usage: npx ts-node src/scripts/remediate-pilot-evidence.ts

const VINWONDERS_SLUG = 'vinwonders-phu-quoc';
const HONTHOM_SLUG = 'sun-world-hon-thom';

interface EvidenceSpec {
  businessKey: string;
  sourceExternalRef: string;
  evidenceType: string;
  sourceUrl: string;
  capturedAt: string; // ISO, converted from the workbook's Excel serial by hand (see report)
  contentHashSha256: string;
  storageReference: string;
  verificationStatus: string;
  licenseStatus: string;
  metadata: Record<string, unknown>;
}

const EVIDENCE_SPECS: EvidenceSpec[] = [
  {
    businessKey: 'EVD-VIN-OFFICIAL-VI-20260829',
    sourceExternalRef: 'vinwonders.com/vi/vinwonders-phu-quoc/',
    evidenceType: 'OFFICIAL_WEBPAGE',
    sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
    capturedAt: '2026-08-31T09:01:24.000Z',
    contentHashSha256: 'f7f39e28a5a8cbf211e913d7778554ef52b6299ed7a20de7fb0bdd15e7721bf3',
    storageReference: 'https://drive.google.com/file/d/1oZMFSI4SLoZ0K81_8XBAlUs_HvN4zXdP/view?usp=drivesdk',
    verificationStatus: 'NEEDS_REVIEW',
    licenseStatus: 'UNKNOWN',
    metadata: {
      workbookSheet: '05_EVIDENCE_ARCHIVE',
      evidenceTitle: 'VinWonders Phú Quốc — trang chính thức VI',
      contentLanguage: 'vi',
      identityMatchStatus: 'PASS',
      freshnessStatus: 'FRESH',
      chainOfCustodyStatus: 'COMPLETE',
      notes:
        'Xác minh lại 31/08/2026 trên trang VI chính thức. Chỉ capture văn bản; chưa có immutable snapshot, robots/terms vẫn NOT_CHECKED; giữ NEEDS_REVIEW.',
    },
  },
  {
    businessKey: 'EVD-VIN-OFFICIAL-EN-20260829',
    sourceExternalRef: 'vinwonders.com/en/vinwonders-phu-quoc/',
    evidenceType: 'OFFICIAL_WEBPAGE',
    sourceUrl: 'https://vinwonders.com/en/vinwonders-phu-quoc/',
    capturedAt: '2026-08-31T09:01:24.000Z',
    contentHashSha256: '1074cfb16851a959477018a1e09d96e1c8ea505754bcd940d6147d8731e6667e',
    storageReference: 'https://drive.google.com/file/d/1oZMFSI4SLoZ0K81_8XBAlUs_HvN4zXdP/view?usp=drivesdk',
    verificationStatus: 'NEEDS_REVIEW',
    licenseStatus: 'UNKNOWN',
    metadata: {
      workbookSheet: '05_EVIDENCE_ARCHIVE',
      evidenceTitle: 'VinWonders Phu Quoc — official EN',
      contentLanguage: 'en',
      identityMatchStatus: 'PASS',
      freshnessStatus: 'FRESH',
      chainOfCustodyStatus: 'COMPLETE',
      notes: 'Reverified 31/08/2026 on the official English page. Text only; no immutable snapshot; keep NEEDS_REVIEW.',
    },
  },
  {
    businessKey: 'EVD-SUN-OFFICIAL-20260829',
    sourceExternalRef: 'sunworld.vn/en/hon-thom',
    evidenceType: 'OFFICIAL_WEBPAGE',
    sourceUrl: 'https://sunworld.vn/en/hon-thom',
    capturedAt: '2026-09-01T05:25:47.000Z',
    contentHashSha256: '78489cde13528d0835bcfb4c2392ac81414619962b3f3ef407fec69cf548490e',
    storageReference: 'https://drive.google.com/file/d/1kFAAoNdCNdtXLNvgN-JntBBGYRJlvfIb/view?usp=drivesdk',
    verificationStatus: 'NEEDS_REVIEW',
    licenseStatus: 'UNKNOWN',
    metadata: {
      workbookSheet: '05_EVIDENCE_ARCHIVE',
      evidenceTitle: 'Sun World Hon Thom — official destination',
      contentLanguage: 'en',
      identityMatchStatus: 'PASS',
      freshnessStatus: 'FRESH',
      chainOfCustodyStatus: 'COMPLETE',
      notes:
        'Xác minh 31/08/2026, recapture 01/09/2026. Chỉ capture văn bản; chưa có immutable snapshot; robots/terms NOT_CHECKED; giữ NEEDS_REVIEW.',
    },
  },
];

async function main(): Promise<void> {
  const logger = new Logger('RemediatePilotEvidence');

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    const evidenceRepo = new EvidenceArtifactsRepository(
      dataSource.getRepository(EvidenceArtifact),
      dataSource.getRepository(PlaceTranslationEvidenceLink),
    );
    const evidenceService = new EvidenceService(evidenceRepo);

    // Resolve the 3 real sources already ensured by remediate-pilot-translations.ts (idempotent —
    // fails loudly if they are missing rather than silently creating a placeholder).
    const sourceByExternalRef = new Map<string, string>();
    for (const spec of EVIDENCE_SPECS) {
      if (sourceByExternalRef.has(spec.sourceExternalRef)) continue;
      const rows: Array<{ id: string }> = await dataSource.query(
        `SELECT id FROM sources WHERE external_ref = $1 AND type = 'official_website'`,
        [spec.sourceExternalRef],
      );
      if (rows.length === 0) {
        throw new Error(`Source with external_ref="${spec.sourceExternalRef}" not found — run remediate-pilot-translations.ts first.`);
      }
      sourceByExternalRef.set(spec.sourceExternalRef, rows[0].id);
    }

    // Import (idempotent) the 3 evidence rows.
    const evidenceIdByBusinessKey = new Map<string, string>();
    for (const spec of EVIDENCE_SPECS) {
      const sourceId = sourceByExternalRef.get(spec.sourceExternalRef)!;
      const artifact = await evidenceService.ensureEvidenceArtifact({
        sourceId,
        businessKey: spec.businessKey,
        evidenceType: spec.evidenceType,
        sourceUrl: spec.sourceUrl,
        capturedAt: new Date(spec.capturedAt),
        contentHashSha256: spec.contentHashSha256,
        storageReference: spec.storageReference,
        verificationStatus: spec.verificationStatus,
        licenseStatus: spec.licenseStatus,
        metadata: spec.metadata,
      });
      evidenceIdByBusinessKey.set(spec.businessKey, artifact.id);
      logger.log(`Evidence ensured: ${spec.businessKey} -> id=${artifact.id} verificationStatus=${artifact.verificationStatus}`);
    }

    // Resolve the 8 translations and link each to its evidence: vi -> VI evidence (or the single
    // Sun World evidence for both locales, since only one was captured for that place), en -> EN
    // evidence (VinWonders) / the same single Sun World evidence (en source_url IS the Sun World one).
    const translations: Array<{ id: string; slug: string; field_key: string; locale_code: string }> = await dataSource.query(
      `SELECT pt.id, p.slug, pt.field_key, pt.locale_code
       FROM place_translations pt JOIN places p ON p.id = pt.place_id
       WHERE p.slug IN ($1, $2) ORDER BY p.slug, pt.field_key, pt.locale_code`,
      [VINWONDERS_SLUG, HONTHOM_SLUG],
    );
    if (translations.length !== 8) {
      throw new Error(`Expected exactly 8 translations for the two pilots, found ${translations.length}.`);
    }

    for (const t of translations) {
      const businessKey =
        t.slug === VINWONDERS_SLUG
          ? t.locale_code === 'vi'
            ? 'EVD-VIN-OFFICIAL-VI-20260829'
            : 'EVD-VIN-OFFICIAL-EN-20260829'
          : 'EVD-SUN-OFFICIAL-20260829'; // Sun World has only one captured evidence row, used for both locales
      const evidenceId = evidenceIdByBusinessKey.get(businessKey)!;
      await evidenceService.linkEvidenceToTranslation(t.id, evidenceId, 'SUPPORTS');
      const gate = await evidenceService.evaluateTranslationEvidenceGate(t.id);
      logger.log(
        `Linked ${t.slug}/${t.field_key}/${t.locale_code} -> ${businessKey} | gate=${gate.status} (linked=${gate.linkedEvidenceCount} needsReview=${gate.needsReviewCount})`,
      );
    }

    // Idempotency proof: re-run every ensure/link call with identical input — must produce zero new
    // rows.
    logger.log('--- IDEMPOTENCY RE-RUN (identical business keys and translation/evidence pairs) ---');
    for (const spec of EVIDENCE_SPECS) {
      const sourceId = sourceByExternalRef.get(spec.sourceExternalRef)!;
      await evidenceService.ensureEvidenceArtifact({
        sourceId,
        businessKey: spec.businessKey,
        evidenceType: spec.evidenceType,
        sourceUrl: spec.sourceUrl,
        capturedAt: new Date(spec.capturedAt),
        contentHashSha256: spec.contentHashSha256,
        storageReference: spec.storageReference,
        verificationStatus: 'VERIFIED', // deliberately wrong on purpose — proves no silent upgrade
        licenseStatus: spec.licenseStatus,
        metadata: spec.metadata,
      });
    }
    for (const t of translations) {
      const businessKey =
        t.slug === VINWONDERS_SLUG
          ? t.locale_code === 'vi'
            ? 'EVD-VIN-OFFICIAL-VI-20260829'
            : 'EVD-VIN-OFFICIAL-EN-20260829'
          : 'EVD-SUN-OFFICIAL-20260829';
      await evidenceService.linkEvidenceToTranslation(t.id, evidenceIdByBusinessKey.get(businessKey)!, 'SUPPORTS');
    }

    const [{ evidence_count: evidenceCount }] = await dataSource.query(`SELECT count(*)::int AS evidence_count FROM evidence_artifacts`);
    const [{ link_count: linkCount }] = await dataSource.query(`SELECT count(*)::int AS link_count FROM place_translation_evidence_links`);
    const [{ needs_review_count: needsReviewCount }] = await dataSource.query(
      `SELECT count(*)::int AS needs_review_count FROM evidence_artifacts WHERE verification_status = 'NEEDS_REVIEW'`,
    );
    logger.log(
      `DB proof after re-run: evidence_artifacts=${evidenceCount} (expected 3), links=${linkCount} (expected 8), NEEDS_REVIEW count=${needsReviewCount} (expected 3, confirms no silent upgrade)`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error in remediate-pilot-evidence:', err);
  process.exitCode = 1;
});
