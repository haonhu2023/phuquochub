// Enum cluster `multilingual_import_batches` / `multilingual_import_rows`.
// Controlled vocabulary for the import pipeline audit tables (ADR-020 follow-up,
// contract version phuquochub.multilingual-import.v1).

export const MULTILINGUAL_IMPORT_CONTRACT_VERSION = 'phuquochub.multilingual-import.v1' as const;

// Lifecycle of a batch run — once SUCCEEDED or FAILED the record is immutable;
// rollback is expressed as a new SUCCEEDED batch, not a mutation of history.
//
// CANCELLED/SUPERSEDED (2026-09-02 data-SSOT remediation, Phase 3.6) are the one deliberate
// exception to "never mutate a batch's status": they apply ONLY to a batch that is still PENDING
// (never started running, nothing written) — there is no history to preserve for an abandoned
// intent. MultilingualImportBatchRepository.cancelPending()/supersedePending() are the only code
// paths allowed to write these, and both refuse unless the row's current status is PENDING.
export enum MultilingualImportBatchStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  // A later batch explicitly rolled back the content of this one (via new insertions).
  ROLLED_BACK = 'rolled_back',
  // A pending batch that was deliberately abandoned before it ever ran.
  CANCELLED = 'cancelled',
  // A pending batch that a newer, corrected batch replaces before either ever ran.
  SUPERSEDED = 'superseded',
}

// Per-row outcome written to multilingual_import_rows after the transaction commits or rolls back.
export enum MultilingualImportRowOutcome {
  // New place_translations row inserted and marked is_current.
  INSERTED = 'inserted',
  // Canonical JSON of incoming payload matched the current row exactly — no write performed.
  ALREADY_CURRENT = 'already_current',
  // Row failed a quality gate (duplicate_status, validation_status, error_count, etc.).
  HELD = 'held',
  // Unexpected error during this row's processing; the batch failed and rolled back.
  FAILED = 'failed',
}

// Values for translation_status stored in place_translations (varchar(40), data-driven).
// Controlled by the importer; the foundation schema deferred their definition to here (ADR-020).
export enum TranslationApprovalStatus {
  APPROVED = 'APPROVED',
  HOLD = 'HOLD',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
}

// Values for human_review_status in place_translations.
export enum HumanReviewStatus {
  APPROVED = 'APPROVED',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
}

// Values for quality_gate in place_translations.
export enum QualityGateStatus {
  PASS = 'PASS',
  WARN = 'WARN',
  FAIL = 'FAIL',
}

// Gate values checked before a row is eligible for import.
export enum DuplicateStatus {
  CLEAR = 'CLEAR',
  DUPLICATE = 'DUPLICATE',
}

export enum ForeignKeyStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export enum ValidationStatus {
  PASS = 'PASS',
  WARN = 'WARN',
  FAIL = 'FAIL',
}
