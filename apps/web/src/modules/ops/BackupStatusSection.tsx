'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { getBackupStatus } from './api/ops.api';
import type { BackupStatusSummary, BackupTreeStatus } from './types';

type State =
  | { kind: 'hidden' } // chưa đăng nhập, hoặc không có quyền — KHÔNG hiện gì, không phải lỗi 403
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; status: BackupStatusSummary };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatAge(ageHours: number): string {
  if (ageHours < 1) return 'chưa đầy 1 giờ trước';
  if (ageHours < 48) return `${Math.round(ageHours)} giờ trước`;
  return `${Math.round(ageHours / 24)} ngày trước`;
}

// Cron DB thật chạy 02:00 UTC MỖI NGÀY (scripts/backup.sh, xem BACKUP-RESTORE-RUNBOOK.md §1.1) —
// 30 giờ = một chu kỳ 24h đầy đủ + đệm 6h cho lần chạy trễ, trước khi coi là "quá hạn". Owner
// không phải tự nhẩm tính từ con số giờ thô để biết có đang gặp sự cố hay không.
const STALE_THRESHOLD_HOURS = 30;

/**
 * BK1 (launch-readiness pass, 2026-09-22) — khối "Tình trạng sao lưu" trên trang Hướng dẫn (N2),
 * đọc thật `GET /admin/ops/backup-status` (Ops.BackupStatus.View, chỉ content_owner). KHÔNG chạy
 * sao lưu, KHÔNG xoá gì — thuần đọc siêu dữ liệu file mà scripts/backup.sh / backup-media.sh đã
 * ghi ra trên HOST sản xuất, qua bind mount read-only (xem docker-compose.prod.yml's api.volumes).
 *
 * Ẩn hoàn toàn (không hiện khối này) khi tài khoản không có quyền — cùng quy ước "ẩn, không phải
 * 403" mà DashboardNav.tsx đã dùng cho các mục menu khác, KHÔNG hiện thông báo "bạn không có quyền".
 */
export function BackupStatusSection() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const session = readSession();
    let cancelled = false;

    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'hidden' });
      });
      return () => {
        cancelled = true;
      };
    }

    void fetchCapabilities(session.accessToken)
      .then((caps) => {
        if (cancelled) return;
        if (!caps.canViewBackupStatus) {
          setState({ kind: 'hidden' });
          return;
        }
        void getBackupStatus(session.accessToken)
          .then((status) => {
            if (!cancelled) setState({ kind: 'ready', status });
          })
          .catch(() => {
            if (!cancelled) setState({ kind: 'error' });
          });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'hidden' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'hidden') return null;

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>6. Tình trạng sao lưu</h2>
      {state.kind === 'loading' && <p style={{ color: 'var(--muted)' }}>Đang tải...</p>}
      {state.kind === 'error' && (
        <p style={{ color: 'var(--muted)' }}>Không tải được tình trạng sao lưu. Thử tải lại trang.</p>
      )}
      {state.kind === 'ready' && (
        <>
          <p style={{ color: 'var(--muted)' }}>
            Đọc trực tiếp từ file sao lưu trên máy chủ — trang này không tự chạy sao lưu, không xoá gì.
          </p>
          <BackupTreeSummary title="Cơ sở dữ liệu" tree={state.status.database} />
          <BackupTreeSummary title="Ảnh/media" tree={state.status.media} />
        </>
      )}
    </section>
  );
}

function BackupTreeSummary({ title, tree }: { title: string; tree: BackupTreeStatus }) {
  const isStale = tree.configured && tree.count > 0 && !!tree.latest && tree.latest.ageHours > STALE_THRESHOLD_HOURS;
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <strong>{title}:</strong>{' '}
      {!tree.configured && <span>chưa cấu hình trên máy chủ này.</span>}
      {tree.configured && tree.count === 0 && <span>đã cấu hình, nhưng chưa thấy bản sao lưu nào.</span>}
      {tree.configured && tree.count > 0 && tree.latest && (
        <span style={isStale ? { color: 'var(--err, crimson)', fontWeight: 600 } : undefined}>
          {isStale && '⚠ Quá hạn — '}
          {tree.count} bản, gần nhất {formatAge(tree.latest.ageHours)} ({formatBytes(tree.latest.sizeBytes)}
          {tree.latest.hasChecksumSidecar ? ', có checksum' : ''}).
          {isStale && ' Lịch chạy hằng ngày nhưng bản gần nhất đã quá 30 giờ — kiểm tra cron/log sao lưu trên máy chủ.'}
        </span>
      )}
    </div>
  );
}
