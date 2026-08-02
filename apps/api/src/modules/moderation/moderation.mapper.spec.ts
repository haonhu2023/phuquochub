import {
  toModerationCaseDetail,
  toModerationCaseSummary,
  toModerationReportSummary,
  toModerationTargetPreview,
} from './moderation.mapper';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
  ReportReason,
  ReportStatus,
} from './moderation.enums';
import type { ModerationTargetPreview } from './moderation-target-preview';
import { MediaStatus, MediaType } from '../media/media.enums';
import { ReviewStatus } from '../reviews/review.enums';

function makeCase(overrides: Partial<ModerationCase> = {}): ModerationCase {
  const c = new ModerationCase();
  c.id = 'c1';
  c.targetType = ModerationTargetType.MEDIA;
  c.targetId = 'm1';
  c.status = ModerationCaseStatus.OPEN;
  c.source = ModerationCaseSource.NEW_CONTENT;
  c.severity = ModerationCaseSeverity.LOW;
  c.priority = 0;
  c.reportCount = 0;
  c.assignedTo = null;
  c.claimedAt = null;
  c.decision = null;
  c.reason = null;
  c.resolvedBy = null;
  c.resolvedAt = null;
  c.aiScore = '0.900';
  c.aiLabels = { nsfw: true };
  c.createdAt = new Date('2026-08-02T00:00:00Z');
  c.updatedAt = new Date('2026-08-02T00:00:00Z');
  return Object.assign(c, overrides);
}

describe('toModerationCaseSummary', () => {
  it('map đúng field, snake_case, ISO string cho ngày giờ', () => {
    const summary = toModerationCaseSummary(makeCase());
    expect(summary).toEqual({
      id: 'c1',
      target_type: 'media',
      target_id: 'm1',
      status: 'open',
      source: 'new_content',
      severity: 'low',
      priority: 0,
      report_count: 0,
      assigned_to: null,
      claimed_at: null,
      decision: null,
      reason: null,
      resolved_by: null,
      resolved_at: null,
      created_at: '2026-08-02T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
    });
  });

  it('KHÔNG lộ ai_score/ai_labels — ngoài phạm vi AI của M2 dù entity có cột này (ADR-009)', () => {
    const summary = toModerationCaseSummary(makeCase());
    expect(summary).not.toHaveProperty('ai_score');
    expect(summary).not.toHaveProperty('ai_labels');
  });

  it('claimed_at/resolved_at có giá trị -> chuyển ISO string đúng', () => {
    const summary = toModerationCaseSummary(
      makeCase({
        claimedAt: new Date('2026-08-02T01:00:00Z'),
        resolvedAt: new Date('2026-08-02T02:00:00Z'),
        decision: 'approve' as ModerationCase['decision'],
        resolvedBy: 'mod-1',
        reason: 'ổn',
      }),
    );
    expect(summary.claimed_at).toBe('2026-08-02T01:00:00.000Z');
    expect(summary.resolved_at).toBe('2026-08-02T02:00:00.000Z');
    expect(summary.decision).toBe('approve');
    expect(summary.resolved_by).toBe('mod-1');
    expect(summary.reason).toBe('ổn');
  });
});

describe('toModerationReportSummary', () => {
  it('có reporter_id (moderator-only view, đúng thiết kế §12) — KHÔNG có tên/email người báo cáo', () => {
    const r = new Report();
    r.id = 'rep1';
    r.caseId = 'c1';
    r.targetType = ModerationTargetType.MEDIA;
    r.targetId = 'm1';
    r.reporterId = 'u1';
    r.reason = ReportReason.SPAM;
    r.description = 'spam quảng cáo';
    r.status = ReportStatus.OPEN;
    r.createdAt = new Date('2026-08-02T00:00:00Z');

    const summary = toModerationReportSummary(r);
    expect(summary).toEqual({
      id: 'rep1',
      reporter_id: 'u1',
      reason: 'spam',
      description: 'spam quảng cáo',
      status: 'open',
      created_at: '2026-08-02T00:00:00.000Z',
    });
    expect(Object.keys(summary)).not.toContain('reporter_email');
    expect(Object.keys(summary)).not.toContain('reporter_name');
  });
});

describe('toModerationTargetPreview', () => {
  it('media found -> có media_type/status/uploaded_by, KHÔNG có object_key/url', () => {
    const preview: ModerationTargetPreview = {
      found: true,
      targetType: ModerationTargetType.MEDIA,
      targetId: 'm1',
      mediaType: MediaType.IMAGE,
      status: MediaStatus.PENDING,
      uploadedBy: 'u1',
      createdAt: new Date('2026-08-02T00:00:00Z'),
    };
    const result = toModerationTargetPreview(preview);
    expect(result).toEqual({
      found: true,
      target_type: 'media',
      target_id: 'm1',
      media_type: 'image',
      status: 'pending',
      uploaded_by: 'u1',
      created_at: '2026-08-02T00:00:00.000Z',
    });
    expect(Object.keys(result)).not.toContain('object_key');
    expect(Object.keys(result)).not.toContain('url');
    expect(Object.keys(result)).not.toContain('bucket');
  });

  it('review found -> có content (cần cho quyết định kiểm duyệt), KHÔNG có media_type', () => {
    const preview: ModerationTargetPreview = {
      found: true,
      targetType: ModerationTargetType.REVIEW,
      targetId: 'r1',
      status: ReviewStatus.PUBLISHED,
      rating: 5,
      content: 'Rất tốt',
      placeId: 'p1',
      userId: 'u1',
      createdAt: new Date('2026-08-02T00:00:00Z'),
    };
    const result = toModerationTargetPreview(preview);
    expect(result).toEqual({
      found: true,
      target_type: 'review',
      target_id: 'r1',
      status: 'published',
      rating: 5,
      content: 'Rất tốt',
      place_id: 'p1',
      user_id: 'u1',
      created_at: '2026-08-02T00:00:00.000Z',
    });
    expect(Object.keys(result)).not.toContain('media_type');
  });

  it('not found -> chỉ target_type/target_id, không field nào khác', () => {
    const preview: ModerationTargetPreview = {
      found: false,
      targetType: ModerationTargetType.PLACE,
      targetId: 'pl1',
    };
    expect(toModerationTargetPreview(preview)).toEqual({
      found: false,
      target_type: 'place',
      target_id: 'pl1',
    });
  });
});

describe('toModerationCaseDetail', () => {
  it('gộp case + reports[] + target_preview', () => {
    const c = makeCase();
    const r = new Report();
    r.id = 'rep1';
    r.caseId = 'c1';
    r.targetType = ModerationTargetType.MEDIA;
    r.targetId = 'm1';
    r.reporterId = 'u1';
    r.reason = ReportReason.SPAM;
    r.description = null;
    r.status = ReportStatus.OPEN;
    r.createdAt = new Date('2026-08-02T00:00:00Z');

    const preview: ModerationTargetPreview = { found: false, targetType: ModerationTargetType.MEDIA, targetId: 'm1' };

    const detail = toModerationCaseDetail(c, [r], preview);
    expect(detail.id).toBe('c1');
    expect(detail.reports).toHaveLength(1);
    expect(detail.reports[0].id).toBe('rep1');
    expect(detail.target_preview).toEqual({ found: false, target_type: 'media', target_id: 'm1' });
  });

  it('không report nào -> reports: []', () => {
    const detail = toModerationCaseDetail(makeCase(), [], {
      found: false,
      targetType: ModerationTargetType.MEDIA,
      targetId: 'm1',
    });
    expect(detail.reports).toEqual([]);
  });
});
