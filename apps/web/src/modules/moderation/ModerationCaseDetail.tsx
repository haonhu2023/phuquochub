import Link from 'next/link';
import type { ReactNode } from 'react';
import modStyles from './moderation.module.css';
import placeStyles from '@/modules/places/places.module.css';
import { CaseStatusBadge, SeverityBadge } from './badges';
import { formatDateTime } from './ModerationQueueRow';
import {
  DECISION_LABELS,
  MEDIA_STATUS_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_LABELS,
  TARGET_TYPE_LABELS,
  labelOf,
} from './labels';
import type { ModerationCaseDetail as CaseDetail, ModerationTargetPreview } from './types';

// Trình bày chi tiết case (presentational). KHÔNG hiện dữ liệu riêng tư người báo cáo (bỏ qua
// reporter_id), KHÔNG dựng lại URL storage, KHÔNG hiện field ngoài response. `decisionSlot` là form
// quyết định (client) do view cha truyền vào.
export function ModerationCaseDetail({
  detail,
  decisionSlot,
}: {
  detail: CaseDetail;
  decisionSlot: ReactNode;
}) {
  return (
    <article>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard/moderation">← Hàng chờ kiểm duyệt</Link>
      </nav>

      <h1 className={placeStyles.detailTitle}>
        Case kiểm duyệt — {labelOf(TARGET_TYPE_LABELS, detail.target_type)}
      </h1>
      <div className={modStyles.detailBadges}>
        <CaseStatusBadge status={detail.status} />
        <SeverityBadge severity={detail.severity} />
      </div>

      <section className={placeStyles.section}>
        <h2 className={placeStyles.sectionTitle}>Thông tin case</h2>
        <dl className={placeStyles.infoGrid}>
          <Info label="Nguồn" value={labelOf(SOURCE_LABELS, detail.source)} />
          <Info label="Ưu tiên" value={String(detail.priority)} />
          <Info label="Số báo cáo" value={String(detail.report_count)} />
          <Info label="Nhận xử lý" value={detail.assigned_to ? 'Đã có người xử lý' : 'Chưa ai nhận'} />
          <Info label="Tạo lúc" value={formatDateTime(detail.created_at)} />
          <Info label="Cập nhật" value={formatDateTime(detail.updated_at)} />
          {detail.decision && (
            <Info label="Quyết định" value={labelOf(DECISION_LABELS, detail.decision)} />
          )}
          {detail.reason && <Info label="Lý do" value={detail.reason} />}
          {detail.resolved_at && (
            <Info label="Xử lý lúc" value={formatDateTime(detail.resolved_at)} />
          )}
        </dl>
      </section>

      <section className={placeStyles.section}>
        <h2 className={placeStyles.sectionTitle}>Nội dung bị kiểm duyệt</h2>
        <TargetPreview preview={detail.target_preview} />
      </section>

      <section className={placeStyles.section}>
        <h2 className={placeStyles.sectionTitle}>Báo cáo ({detail.reports.length})</h2>
        {detail.reports.length === 0 ? (
          <p className={modStyles.previewEmpty}>Chưa có báo cáo nào cho case này.</p>
        ) : (
          <ul className={modStyles.reports}>
            {detail.reports.map((r) => (
              <li key={r.id} className={modStyles.report}>
                <div className={modStyles.reportTop}>
                  <span className={modStyles.reportReason}>
                    {labelOf(REPORT_REASON_LABELS, r.reason)}
                  </span>
                  <span className={modStyles.reportTime}>
                    {labelOf(REPORT_STATUS_LABELS, r.status)} · {formatDateTime(r.created_at)}
                  </span>
                </div>
                {r.description && <p className={modStyles.reportDesc}>{r.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={placeStyles.section}>
        <h2 className={placeStyles.sectionTitle}>Quyết định</h2>
        {decisionSlot}
      </section>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className={placeStyles.infoItem}>
      <dt className={placeStyles.infoLabel}>{label}</dt>
      <dd className={placeStyles.infoValue}>{value}</dd>
    </div>
  );
}

function TargetPreview({ preview }: { preview: ModerationTargetPreview }) {
  if (!preview.found) {
    return (
      <div className={modStyles.previewBox}>
        <p className={modStyles.previewEmpty}>Nội dung không còn tồn tại (có thể đã bị xoá).</p>
      </div>
    );
  }

  if (preview.target_type === 'media') {
    return (
      <div className={modStyles.previewBox}>
        <dl className={placeStyles.infoGrid}>
          <Info label="Loại" value={preview.media_type === 'video' ? 'Video' : 'Hình ảnh'} />
          <Info label="Trạng thái" value={labelOf(MEDIA_STATUS_LABELS, preview.status)} />
          <Info label="Tạo lúc" value={formatDateTime(preview.created_at)} />
          {preview.place_name && <Info label="Cơ sở" value={preview.place_name} />}
        </dl>
        {/* Ảnh xem trước đi qua `/media/{id}/moderation-file` (gác `Media.Moderate`) — kênh này
            phân giải ảnh ở MỌI trạng thái, nên kiểm duyệt viên thấy được ảnh CHỜ DUYỆT. Endpoint
            công khai `/media/{id}/file` không hề bị nới lỏng. */}
        {preview.preview_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh phục vụ qua redirect có ký; next/image cần remotePatterns (ngoài phạm vi).
          <img
            className={modStyles.previewImage}
            src={preview.preview_url}
            alt="Ảnh đang chờ kiểm duyệt"
            loading="lazy"
          />
        ) : (
          <p className={modStyles.previewEmpty}>Không có ảnh xem trước.</p>
        )}
      </div>
    );
  }

  // review
  return (
    <div className={modStyles.previewBox}>
      <dl className={placeStyles.infoGrid}>
        <Info label="Điểm đánh giá" value={`★ ${preview.rating}/5`} />
        <Info label="Trạng thái" value={labelOf(REVIEW_STATUS_LABELS, preview.status)} />
        <Info label="Tạo lúc" value={formatDateTime(preview.created_at)} />
      </dl>
      {preview.content ? (
        <blockquote className={modStyles.reviewQuote}>{preview.content}</blockquote>
      ) : (
        <p className={modStyles.previewEmpty}>(Đánh giá không có nội dung văn bản.)</p>
      )}
    </div>
  );
}
