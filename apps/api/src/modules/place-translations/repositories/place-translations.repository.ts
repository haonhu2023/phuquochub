import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlaceTranslation } from '../entities/place-translation.entity';

// Owner review queue — one enriched row per pending/needs-changes translation (human-translation-
// review, 2026-09-04). A single query (place + base/current-public comparison text + source) so the
// frontend never has to N+1 for place name/slug or source URL/title per item.
export interface ReviewQueueFilter {
  placeId?: string;
  placeSlug?: string;
  localeCode?: string;
  fieldKey?: string;
  // Defaults to ['PENDING', 'NEEDS_CHANGES'] — the two states genuinely awaiting a decision.
  humanReviewStatus?: string[];
  // Capped to [1, 200] regardless of what's requested — prevents an unbounded fetch as the
  // candidate pool grows past the current 8 rows; not full keyset pagination yet (see ADR-021 follow-up).
  limit?: number;
}

// snake_case fields, matching openapi.yaml's response convention (same pattern as
// RevisionsRepository.RevisionListRow) — this raw-SQL row shape IS the wire shape the controller
// returns; no separate mapper needed.
export interface ReviewQueueRow {
  id: string;
  place_id: string;
  place_name: string;
  place_slug: string;
  field_key: string;
  locale_code: string;
  source_locale_code: string;
  translated_text: string;
  // The text currently live (is_current && is_public && is_production_data) for this exact
  // (place, field, locale) — null when nothing has ever been published for this slot yet.
  current_public_text: string | null;
  translation_method: string;
  translation_status: string;
  human_review_status: string;
  quality_gate: string;
  revision_id: string;
  created_at: Date;
  source_id: string | null;
  source_url: string | null;
  source_title: string | null;
  source_type: string | null;
  source_reliability: number | null;
}

// Mọi phương thức nhận `manager?: EntityManager` tuỳ chọn — khi được truyền (từ
// `dataSource.transaction(...)` ở service), thao tác chạy TRONG giao dịch đó thay vì repository
// mặc định của module; cùng quy ước với admin-data (verified-facts-ingestion.service.ts).
@Injectable()
export class PlaceTranslationsRepository {
  constructor(
    @InjectRepository(PlaceTranslation)
    private readonly repo: Repository<PlaceTranslation>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceTranslation> {
    return manager ? manager.getRepository(PlaceTranslation) : this.repo;
  }

  findCurrent(
    placeId: string,
    fieldKey: string,
    localeCode: string,
    manager?: EntityManager,
  ): Promise<PlaceTranslation | null> {
    return this.target(manager).findOne({ where: { placeId, fieldKey, localeCode, isCurrent: true } });
  }

  findById(id: string, manager?: EntityManager): Promise<PlaceTranslation | null> {
    return this.target(manager).findOne({ where: { id } });
  }

  // Public Place i18n Read Path — the ONLY query the public read surface may use. Unlike
  // findCurrent() (write-path idempotency check, deliberately ignores publish flags so the
  // importer can compare against its own not-yet-public draft), this ALSO requires isPublic AND
  // isProductionData: a row that is merely "current" can still be an internal/non-approved
  // revision. Never returns a draft/private/non-production translation to a public caller.
  findCurrentPublic(
    placeId: string,
    fieldKey: string,
    localeCode: string,
    manager?: EntityManager,
  ): Promise<PlaceTranslation | null> {
    return this.target(manager).findOne({
      where: { placeId, fieldKey, localeCode, isCurrent: true, isPublic: true, isProductionData: true },
    });
  }

  async insert(row: PlaceTranslation, manager?: EntityManager): Promise<PlaceTranslation> {
    return this.target(manager).save(row);
  }

  async markNotCurrent(id: string, manager?: EntityManager): Promise<void> {
    await this.target(manager).update({ id }, { isCurrent: false });
  }

  listCurrentByPlace(placeId: string, manager?: EntityManager): Promise<PlaceTranslation[]> {
    return this.target(manager).find({ where: { placeId, isCurrent: true } });
  }

  // Owner review queue (human-translation-review, 2026-09-04). One SQL query, enriched — place
  // name/slug, the currently-LIVE text for the same (place, field, locale) slot for side-by-side
  // comparison, and the backing source's url/title — so the frontend renders the whole queue from
  // one response, never N+1 per row. All filter values are bound parameters (never interpolated).
  async listReviewQueue(filter: ReviewQueueFilter, manager?: EntityManager): Promise<ReviewQueueRow[]> {
    const executor: Pick<EntityManager, 'query'> = manager ?? this.repo.manager;
    const statuses = filter.humanReviewStatus?.length ? filter.humanReviewStatus : ['PENDING', 'NEEDS_CHANGES'];
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 200);

    const conditions = ['pt.is_current = true', 'pt.human_review_status = ANY($1)'];
    const params: unknown[] = [statuses];

    if (filter.placeId) {
      params.push(filter.placeId);
      conditions.push(`pt.place_id = $${params.length}`);
    }
    if (filter.placeSlug) {
      params.push(filter.placeSlug);
      conditions.push(`p.slug = $${params.length}`);
    }
    if (filter.localeCode) {
      params.push(filter.localeCode);
      conditions.push(`pt.locale_code = $${params.length}`);
    }
    if (filter.fieldKey) {
      params.push(filter.fieldKey);
      conditions.push(`pt.field_key = $${params.length}`);
    }
    params.push(limit);

    return executor.query(
      `SELECT
         pt.id, pt.place_id, p.name AS place_name, p.slug AS place_slug,
         pt.field_key, pt.locale_code, pt.source_locale_code,
         pt.translated_text, base.translated_text AS current_public_text,
         pt.translation_method, pt.translation_status,
         pt.human_review_status, pt.quality_gate,
         pt.revision_id, pt.created_at,
         s.id AS source_id, s.url AS source_url, s.title AS source_title,
         s.type AS source_type, s.reliability AS source_reliability
       FROM place_translations pt
       JOIN places p ON p.id = pt.place_id
       LEFT JOIN place_translations base
         ON base.place_id = pt.place_id AND base.field_key = pt.field_key AND base.locale_code = pt.locale_code
         AND base.is_current = true AND base.is_public = true AND base.is_production_data = true
         AND base.id <> pt.id
       LEFT JOIN sources s ON s.id = pt.source_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pt.created_at ASC, pt.id ASC
       LIMIT $${params.length}`,
      params,
    );
  }

  // Written ONLY by TranslationReviewService.reviewTranslation() — the sole caller trusted to set
  // these five governance columns after a real human review decision (human-translation-review,
  // 2026-09-04). Never call this from an importer/bundle path.
  //
  // CONCURRENCY (2026-09-04): the UPDATE is conditioned on the row STILL being current AND STILL
  // carrying the exact humanReviewStatus the caller observed when it decided to review — an
  // atomic optimistic-concurrency guard, not just a pre-check. Two concurrent review requests for
  // the same translation (double-click, two tabs, or a genuine race between two reviewers) can both
  // pass an earlier `findById` check, but only the FIRST of their UPDATEs can match this WHERE
  // clause; the second affects 0 rows. Returns false in that case so the caller can respond 409
  // instead of silently reporting success for a write that never happened.
  async updateReviewState(
    id: string,
    expectedPriorHumanReviewStatus: string,
    state: {
      humanReviewStatus: string;
      translationStatus: string;
      isPublic: boolean;
      isProductionData: boolean;
      productionEligible: boolean;
    },
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.target(manager).update(
      { id, isCurrent: true, humanReviewStatus: expectedPriorHumanReviewStatus },
      state,
    );
    return (result.affected ?? 0) > 0;
  }
}
