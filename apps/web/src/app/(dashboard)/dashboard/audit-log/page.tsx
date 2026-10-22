import type { Metadata } from 'next';
import { AuditLogView } from '@/modules/ops/AuditLogView';

export const metadata: Metadata = {
  title: 'Nhật ký quản trị · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function AuditLogPage() {
  return <AuditLogView />;
}
