// Re-export contract types and pure functions for the standalone bundle builder.
// The source files only import 'crypto' (Node built-in) and each other — zero NestJS deps.
// This shim keeps the relative path tidy and documents the dependency boundary.

export {
  MultilingualImportContract,
  MultilingualImportContractRow,
  MultilingualImportContractSummary,
  ACCEPTED_TEXT_FORMATS,
  ACCEPTED_TRANSLATION_METHODS,
  AcceptedTextFormat,
  AcceptedTranslationMethod,
  canonicalJsonContract,
  computeRowHash,
  computeManifestChecksum,
  validateContract,
} from '../../apps/api/src/modules/multilingual-import/multilingual-import.contract';

export { MULTILINGUAL_IMPORT_CONTRACT_VERSION } from '../../apps/api/src/modules/multilingual-import/multilingual-import.enums';
