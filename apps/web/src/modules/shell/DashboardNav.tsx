'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';

/**
 * N1 (launch-readiness pass, 2026-09-22) — shell điều hướng quản trị 5 mục ĐÚNG như plan §5 đã
 * chốt: Tổng quan / Địa điểm / Bài viết / Nội dung website / Hướng dẫn. Trước tính năng này,
 * `/dashboard/*` không có điều hướng chung nào — mỗi trang chỉ có link "quay lại" rải rác, và
 * trang chủ dashboard (`page.tsx`) là nơi DUY NHẤT liệt kê các lối vào.
 *
 * "Tổng quan"/"Địa điểm"/"Hướng dẫn" LUÔN hiện — mọi tài khoản đã đăng nhập đều dùng được (địa
 * điểm CỦA MÌNH tại `/dashboard/places` không cần quyền đặc biệt nào, xem places.controller.ts).
 * "Bài viết" (`/dashboard/editorial/guides`, cần `Guide.Edit.Any`) và "Nội dung website"
 * (`/dashboard/content`, cần `SiteContent.Edit`) chỉ hiện khi capabilities xác nhận có quyền —
 * ĐÚNG nguyên tắc "không hiện link tới chức năng chưa dùng được" (bấm vào chỉ để nhận 403 là một
 * lỗi UX, không phải một lỗ hổng — backend vẫn là nơi chặn thật, xem capabilities.ts's doc đầu file).
 *
 * `NO_CAPABILITIES` mặc định trong lúc tải — ẩn hai mục đặc quyền cho tới khi BIẾT CHẮC, không bao
 * giờ hiện nhầm rồi ẩn lại (tránh nháy link).
 */
export function DashboardNav() {
  const [caps, setCaps] = useState<UserCapabilities>(NO_CAPABILITIES);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    void fetchCapabilities(session.accessToken).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items: Array<{ href: string; label: string; show: boolean }> = [
    { href: '/dashboard', label: 'Tổng quan', show: true },
    { href: '/dashboard/places', label: 'Địa điểm', show: true },
    { href: '/dashboard/editorial/guides', label: 'Bài viết', show: caps.canEditGuides },
    { href: '/dashboard/content', label: 'Nội dung website', show: caps.canEditSiteContent },
    { href: '/dashboard/help', label: 'Hướng dẫn', show: true },
  ];

  return (
    <nav
      aria-label="Điều hướng quản trị"
      style={{
        display: 'flex',
        gap: '1.25rem',
        flexWrap: 'wrap',
        padding: '0.85rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        marginBottom: '1.5rem',
      }}
    >
      {items
        .filter((item) => item.show)
        .map((item) => (
          <Link key={item.href} href={item.href} style={{ color: 'var(--fg)', textDecoration: 'none', fontSize: '0.95rem' }}>
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
