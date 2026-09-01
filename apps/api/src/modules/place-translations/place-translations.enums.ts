// Enum cluster `place_translations`/`place_translation_routes`/`place_translation_seo`
// (ADR-020 §"Decision 2-4"). `translation_status`/`human_review_status`/`quality_gate` are
// deliberately NOT enums here — ADR-020 stores them as varchar(40) and explicitly defers their
// controlled vocabulary to the future importer/queue-consumption job (out of scope for this
// foundation PR); enumerating them now would be scope creep the ADR itself declined.

export enum TextFormat {
  PLAIN_TEXT = 'plain_text',
  MARKDOWN = 'markdown',
}

// original: locale_code === source_locale_code — the source-language row itself (vi), unifying the
// read path so a place's content for any locale, source included, comes from one table (ADR-020
// §"Decision 2").
export enum TranslationMethod {
  ORIGINAL = 'original',
  HUMAN = 'human',
  AI_PLUS_HUMAN = 'ai_plus_human',
  OFFICIAL_OR_HUMAN = 'official_or_human',
}
