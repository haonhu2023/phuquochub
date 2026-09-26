import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Read-only snapshot. A source link is NOT proof that the current value is verified.
// Dates come from source_attributions, not updated_at. No invented field-level SLA.
export const OWNER_DASHBOARD_SQL = `
WITH records AS (
 SELECT p.id, p.name, p.status, p.verification_status, c.slug AS category,
   p.location IS NOT NULL AS has_location,
   NULLIF(btrim(p.description), '') IS NOT NULL AS has_description,
   p.cover_image_id IS NOT NULL AS has_cover,
   s.source_count, s.next_review_at, s.conflict,
   CASE WHEN s.overdue THEN 'overdue'
        WHEN s.next_review_at <= CURRENT_DATE + 7 THEN 'due_soon'
        WHEN s.source_count > 0 AND s.undated = 0 THEN 'fresh'
        ELSE 'unknown' END AS freshness
 FROM places p LEFT JOIN categories c ON c.id = p.category_id
 LEFT JOIN LATERAL (
   SELECT count(*)::int AS source_count, min(recheck_date) AS next_review_at,
     count(*) FILTER (WHERE recheck_date IS NULL)::int AS undated,
     coalesce(bool_or(recheck_date < CURRENT_DATE OR staleness_state = 'stale'), false) AS overdue,
     coalesce(bool_or(conflict_state = 'flagged'), false) AS conflict
   FROM source_attributions a JOIN sources src ON src.id = a.source_id AND src.deleted_at IS NULL WHERE a.entity_id = p.id AND a.entity_type IN ('place', 'place_field')
 ) s ON true
 WHERE p.deleted_at IS NULL
), scored AS (
 SELECT *, round(100.0 * (has_location::int + has_description::int + has_cover::int) / 3)::int AS completeness,
 CASE WHEN status = 'published' AND (NOT has_location OR conflict) THEN 0
      WHEN status = 'published' AND (freshness = 'overdue' OR source_count = 0) THEN 1
      WHEN NOT has_description OR NOT has_cover OR freshness IN ('due_soon','unknown') THEN 2
      ELSE 3 END AS priority
 FROM records
)
SELECT jsonb_build_object(
 'migrations_applied', (SELECT count(*) FROM migrations),
 'total', count(*),
 'published', count(*) FILTER (WHERE status = 'published'),
 'verified', count(*) FILTER (WHERE status = 'published' AND verification_status IN ('official','verified','community_verified')),
 'completeness', round(avg(completeness)),
 'critical', count(*) FILTER (WHERE priority = 0),
 'freshness', jsonb_build_object(
   'fresh', count(*) FILTER (WHERE freshness = 'fresh'),
   'due_soon', count(*) FILTER (WHERE freshness = 'due_soon'),
   'overdue', count(*) FILTER (WHERE freshness = 'overdue'),
   'unknown', count(*) FILTER (WHERE freshness = 'unknown')),
 'workflow', jsonb_build_object(
   'draft', count(*) FILTER (WHERE status = 'draft'),
   'pending', count(*) FILTER (WHERE status = 'pending'),
   'published', count(*) FILTER (WHERE status = 'published'),
   'archived', count(*) FILTER (WHERE status = 'archived')),
 'pending_decisions', (SELECT count(*) FROM owner_decision_queue WHERE status = 'pending'),
 'pending_proposals', (SELECT count(*) FROM place_edit_proposals WHERE status = 'pending'),
 'guides', (SELECT count(*) FROM guide_articles),
 'records', coalesce((SELECT jsonb_agg(r) FROM (
   SELECT paged.*, coalesce((SELECT jsonb_agg(e) FROM (
     SELECT a.field, a.verified_at, a.recheck_date, a.confidence, a.conflict_state,
       src.title, src.publisher, src.url
     FROM source_attributions a JOIN sources src ON src.id = a.source_id AND src.deleted_at IS NULL
     WHERE a.entity_id = paged.id AND a.entity_type IN ('place','place_field')
     ORDER BY a.recheck_date NULLS LAST, a.id LIMIT 10
   ) e), '[]'::jsonb) AS sources
   FROM (SELECT * FROM scored ORDER BY priority, next_review_at NULLS LAST, name, id LIMIT 25 OFFSET $1) paged
   ORDER BY priority, next_review_at NULLS LAST, name, id
 ) r), '[]'::jsonb)
) AS snapshot FROM scored`;

// Strict projection: no IP, user agent, arbitrary before/after/context or credentials.
// Only scalar status/version transitions are exposed in this initial audit reader.
export const OWNER_AUDIT_SQL = `SELECT id, created_at, event, actor_id, actor_role,
 entity_type, entity_id, result,
 CASE WHEN jsonb_typeof("before"->'status') = 'string' THEN "before"->>'status' END AS before_status,
 CASE WHEN jsonb_typeof("after"->'status') = 'string' THEN "after"->>'status' END AS after_status
 FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 20`;

@Injectable()
export class OwnerDashboardService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async read(page: number) {
    // Same snapshot for counters, task page and audit; bounded statement time.
    return this.ds.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await manager.query("SET LOCAL statement_timeout = '5s'");
      const [row] = await manager.query(OWNER_DASHBOARD_SQL, [(page - 1) * 25]);
      const audit = await manager.query(OWNER_AUDIT_SQL);
      const revision = process.env.APP_REVISION;
      // scripts/deploy.sh tags releases with a short (7-char) git SHA, not the full 40-char form —
      // see release-tag-governance notes (e.g. `4ed9af7`). Accept both.
      return { api_revision: revision && /^[a-f0-9]{7,40}$/i.test(revision) ? revision : null, generated_at: new Date().toISOString(), page, page_size: 25, ...row.snapshot, audit };
    });
  }
}
