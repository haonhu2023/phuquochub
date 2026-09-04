'use client';

import { useState } from 'react';
import { TranslationReviewDecisionForm } from './TranslationReviewDecisionForm';
import { FIELD_KEY_LABELS, HUMAN_REVIEW_STATUS_LABELS, LOCALE_LABELS, TRANSLATION_METHOD_LABELS, formatDateTime, labelOf } from './labels';
import type { TranslationReviewQueueItem } from './types';
import modStyles from '../moderation/moderation.module.css';
import placeStyles from '@/modules/places/places.module.css';

interface Props {
  item: TranslationReviewQueueItem;
  onDecided: () => void;
}

// Một dòng trong hàng chờ, tự quản lý trạng thái mở/thu gọn (accordion) — quy mô hàng chờ hiện tại
// (8, sẽ lên tới hàng trăm) chưa cần một route chi tiết riêng (tránh thêm GET /:id ở BE — xem
// comment listReviewQueue() ở BE giải thích vì sao MỘT response đã đủ). Thu gọn: chỉ metadata.
// Mở: nội dung đang công khai (nếu có) vs nội dung đề xuất, nguồn, và form quyết định.
export function TranslationReviewCard({ item, onDecided }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={modStyles.row} style={{ cursor: 'default' }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          all: 'unset',
          display: 'block',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        <div className={modStyles.rowTop}>
          <span className={modStyles.rowTitle}>{item.place_name}</span>
          <div className={modStyles.rowBadges}>
            <StatusBadge status={item.human_review_status} />
          </div>
        </div>
        <div className={modStyles.rowMeta}>
          <span className={modStyles.metaItem}>{labelOf(FIELD_KEY_LABELS, item.field_key)}</span>
          <span className={modStyles.metaItem}>{labelOf(LOCALE_LABELS, item.locale_code)}</span>
          <span className={modStyles.metaItem}>{formatDateTime(item.created_at)}</span>
          <span className={modStyles.metaItem}>{expanded ? '▲ Thu gọn' : '▼ Xem chi tiết & duyệt'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ marginTop: '0.9rem' }}>
          <dl className={placeStyles.infoGrid}>
            <Info label="Phương thức" value={labelOf(TRANSLATION_METHOD_LABELS, item.translation_method)} />
            <Info label="Phiên bản nội dung" value={item.revision_id} />
            <Info label="Cổng chất lượng" value={item.quality_gate} />
          </dl>

          <ComparisonBlock item={item} />
          <SourceBlock item={item} />

          <div className={placeStyles.section} style={{ marginTop: '1rem' }}>
            <h3 className={placeStyles.sectionTitle}>Quyết định</h3>
            <TranslationReviewDecisionForm item={item} onDecided={onDecided} />
          </div>
        </div>
      )}
    </div>
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

function ComparisonBlock({ item }: { item: TranslationReviewQueueItem }) {
  return (
    <div className={placeStyles.section}>
      <h3 className={placeStyles.sectionTitle}>Đang công khai (hiện tại)</h3>
      <div className={modStyles.previewBox}>
        {item.current_public_text ? (
          <blockquote className={modStyles.reviewQuote}>{item.current_public_text}</blockquote>
        ) : (
          <p className={modStyles.previewEmpty}>Chưa có nội dung nào được công khai cho vị trí này.</p>
        )}
      </div>

      <h3 className={placeStyles.sectionTitle} style={{ marginTop: '0.75rem' }}>
        Đề xuất (đang chờ duyệt)
      </h3>
      <div className={modStyles.previewBox}>
        <blockquote className={modStyles.reviewQuote}>{item.translated_text}</blockquote>
      </div>
    </div>
  );
}

// Chỉ render link khi URL thật sự là http/https — không bao giờ render javascript:/data: hay chuỗi
// dị dạng làm href (Phase 9). Nguồn luôn mở tab mới, rel="noopener noreferrer" (không lộ
// window.opener, không gửi Referer nội bộ).
function SourceBlock({ item }: { item: TranslationReviewQueueItem }) {
  const safeUrl = isSafeHttpUrl(item.source_url) ? item.source_url : null;
  return (
    <div className={placeStyles.section}>
      <h3 className={placeStyles.sectionTitle}>Nguồn</h3>
      {!item.source_id ? (
        <p className={modStyles.previewEmpty}>Không có nguồn được gắn cho bản dịch này.</p>
      ) : (
        <dl className={placeStyles.infoGrid}>
          {item.source_title && <Info label="Tiêu đề" value={item.source_title} />}
          {item.source_type && <Info label="Loại nguồn" value={item.source_type} />}
          {item.source_reliability !== null && (
            <Info label="Độ tin cậy" value={`${item.source_reliability}/5`} />
          )}
          <div className={placeStyles.infoItem}>
            <dt className={placeStyles.infoLabel}>Liên kết</dt>
            <dd className={placeStyles.infoValue}>
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                  {safeUrl}
                </a>
              ) : (
                <span className={modStyles.previewEmpty}>
                  {item.source_url ? 'URL nguồn không hợp lệ, không hiển thị liên kết.' : 'Không có URL.'}
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'PENDING' ? 'var(--muted)' : status === 'NEEDS_CHANGES' ? '#f59e0b' : 'var(--accent)';
  return (
    <span className={modStyles.badge} style={{ color: tone }}>
      {labelOf(HUMAN_REVIEW_STATUS_LABELS, status)}
    </span>
  );
}
