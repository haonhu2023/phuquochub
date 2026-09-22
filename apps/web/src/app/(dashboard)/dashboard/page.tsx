'use client';

// Trang bảng điều khiển tối thiểu — minh chứng phiên đăng nhập + route guard hoạt động.
// Nội dung tính năng dashboard đầy đủ thuộc các Sprint sau (ngoài phạm vi Sprint 1).
//
// Ba liên kết đầu hiện cho MỌI người dùng đã đăng nhập: GET /places/mine, POST /business-claims và
// GET /business-claims/mine đều mở cho mọi tài khoản (Business.Claim là permission nền mọi `member`
// có — xem SeedRbac1720000300000; GET /business-claims/mine không khai permission nào, chỉ cần đã
// xác thực) nên không có rủi ro mời gọi một thao tác sẽ bị 403.
//
// Hai liên kết đặc quyền (Biên tập nội dung, Hàng chờ kiểm duyệt) thì CÓ ĐIỀU KIỆN — Operator
// Bootstrap & Editorial Place Content (2026-08-12). Trước milestone này liên kết kiểm duyệt bị ẩn
// hoàn toàn vì phiên FE không biết người dùng giữ quyền gì, buộc kiểm duyệt viên phải tự gõ URL.
// Nay `GET /users/me` (đã trả `roles` từ trước) được đọc để suy ra đúng hai cờ hiển thị — xem
// modules/auth/capabilities.ts. Đây THUẦN TUÝ là UX: backend vẫn cưỡng chế bằng PermissionsGuard,
// nên cờ bị giả mạo chỉ dẫn tới một trang trả 403.
//
// UI pass (2026-09-22): trình bày đổi từ danh sách <p><Link> sang lưới thẻ (dashboard-home.module.css)
// — logic hiển thị/quyền (caps.*) và hành vi đăng xuất giữ NGUYÊN, không đổi.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import styles from './dashboard-home.module.css';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Operator Bootstrap (2026-08-12): hai lối vào đặc quyền dưới đây trước đây bị ẩn HOÀN TOÀN vì
  // phiên FE không biết người dùng có quyền gì — kiểm duyệt viên phải tự gõ URL. Nay đọc `roles`
  // từ `GET /users/me` (trường đã có sẵn) để hiện đúng lối vào cho đúng người. Thuần UX: backend
  // vẫn chặn thật, và mặc định là KHÔNG hiện gì cho tới khi biết chắc.
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

  async function onLogout() {
    setBusy(true);
    await logout();
    router.replace('/login');
  }

  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: '/dashboard/places', label: 'Địa điểm của tôi', show: true },
    { href: '/dashboard/business-claims/new', label: 'Yêu cầu xác nhận quyền quản lý', show: true },
    { href: '/dashboard/business-claims', label: 'Trạng thái yêu cầu của tôi', show: true },
    { href: '/dashboard/editorial/places', label: 'Biên tập nội dung địa điểm', show: caps.canEditorial },
    { href: '/dashboard/moderation', label: 'Hàng chờ kiểm duyệt', show: caps.canModerate },
    { href: '/dashboard/translations/review', label: 'Duyệt bản dịch', show: caps.canReviewTranslations },
    { href: '/dashboard/editorial/guides', label: 'Biên tập cẩm nang', show: caps.canEditGuides },
    { href: '/dashboard/content', label: 'Nội dung website', show: caps.canEditSiteContent },
  ];

  return (
    <main>
      <h1>Bảng điều khiển</h1>
      <p className={styles.greeting}>
        Xin chào, <strong className={styles.greetingName}>{user?.displayName}</strong> ({user?.email})
      </p>
      <div className={styles.grid}>
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.href} href={l.href} className={styles.card}>
              <div className={styles.cardTitle}>{l.label}</div>
              <span className={styles.cardArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ))}
      </div>
      <button type="button" onClick={onLogout} disabled={busy} className={styles.logoutBtn}>
        {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </button>
    </main>
  );
}
