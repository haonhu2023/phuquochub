'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGetAuth, apiGet, ApiError } from '@/lib/http';
import { readSession } from '@/modules/auth/session';
import styles from './owner-command-center.module.css';

type Freshness = 'fresh' | 'due_soon' | 'overdue' | 'unknown';
export interface QualityRecord {
  id: string; name: string; category: string; status: string; verification_status: string;
  has_location: boolean; has_description: boolean; has_cover: boolean;
  source_count: number; next_review_at: string | null; conflict: boolean;
  sources?: {field: string | null; verified_at: string | null; recheck_date: string | null;
    confidence: number | null; conflict_state: string; title: string | null; publisher: string | null; url: string | null}[];
  freshness: Freshness; completeness: number; priority: number;
}
export interface DashboardSnapshot {
  api_revision?: string | null; migrations_applied?: number; generated_at: string; page: number; page_size: number; total: number; published: number;
  verified: number; completeness: number | null; critical: number; guides: number;
  pending_decisions: number; pending_proposals: number;
  workflow: Record<string, number>; freshness: Record<Freshness, number>; records: QualityRecord[];
  audit: { id: string; created_at: string; event: string; actor_id: string | null;
    actor_role: string | null; entity_type: string; entity_id: string | null; result: string;
    before_status: string | null; after_status: string | null }[];
}
const freshnessLabels = { fresh: 'Trong hạn', due_soon: 'Đến hạn trong 7 ngày', overdue: 'Quá hạn', unknown: 'Chưa đủ lịch kiểm tra' };
const priorities = ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'];
const workflowLabels: Record<string, string> = { draft: 'Nháp', pending: 'Chờ duyệt', published: 'Công khai', archived: 'Lưu trữ' };
export function recordIssues(r: QualityRecord): string[] {
  return [!r.has_location && 'Thiếu tọa độ', r.conflict && 'Nguồn đang có xung đột',
    r.freshness === 'overdue' && 'Nguồn quá hạn kiểm tra', !r.source_count && 'Chưa có liên kết nguồn',
    !r.has_description && 'Thiếu mô tả', !r.has_cover && 'Chưa đặt ảnh bìa',
    r.freshness === 'unknown' && 'Chưa đủ lịch kiểm tra', r.freshness === 'due_soon' && 'Sắp đến hạn kiểm tra',
  ].filter((v): v is string => typeof v === 'string');
}
function safeSourceUrl(url: string | null): string | null {
  if (!url) return null;
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; }
}
export function OwnerCommandCenter() {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<'loading'|'ok'|'unknown'>('loading');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const session = readSession();
      if (!session) throw new ApiError('Phiên đăng nhập đã hết.', 401);
      return apiGetAuth<DashboardSnapshot>(`/admin/ops/dashboard?page=${page}`, session.accessToken, { cache: 'no-store' });
    }
    void load()
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError && e.status === 401 ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.' : e instanceof ApiError && e.status === 403
        ? 'Tài khoản chưa có quyền xem tổng quan vận hành.' : 'Không tải được tổng quan. Chưa thể kết luận hệ thống ổn định.'); });
    void apiGet<{status: string}>('/health', { cache: 'no-store' })
      .then(h => { if (!cancelled) setHealth(h.status === 'ok' ? 'ok' : 'unknown'); })
      .catch(() => { if (!cancelled) setHealth('unknown'); });
    return () => { cancelled = true; };
  }, [page, refresh]);
  function reload(nextPage: number) {
    setData(null); setError(''); setHealth('loading'); setPage(nextPage); setRefresh(n => n + 1);
  }
  return <section className={styles.root} aria-labelledby="command-title">
    <header className={styles.header}><div><h2 id="command-title">Tổng quan và việc cần làm</h2>
      <p>Số liệu từ hệ thống nội dung; ưu tiên việc ảnh hưởng đến địa điểm đang công khai.</p></div>
      <button onClick={() => reload(page)}>Làm mới</button></header>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Đang tải tổng quan…</p> : <>
      <p>Mã nguồn API: {data.api_revision ?? 'Chưa có thông tin từ bản build'} · Migration đã áp dụng: {data.migrations_applied ?? 'Chưa có dữ liệu'}</p>
      <p>Cập nhật: {new Date(data.generated_at).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})} (giờ Việt Nam).</p>
      <dl className={styles.metrics}>
        <div><dt>Địa điểm công khai</dt><dd>{data.published} / {data.total}</dd></div>
        <div><dt>Công khai có trạng thái xác minh</dt><dd>{data.verified}</dd></div>
        <div><dt>Độ đầy đủ cơ bản</dt><dd>{data.completeness == null ? 'Chưa có dữ liệu' : `${data.completeness}%`}</dd></div>
        <div><dt>Địa điểm cần xử lý khẩn cấp</dt><dd>{data.critical}</dd></div>
      </dl>
      <nav className={styles.actions} aria-label="Hàng chờ xử lý">
        <Link href="/dashboard/todo">{data.pending_decisions} câu hỏi chờ xử lý →</Link>
        <Link href="/dashboard/edit-proposals">{data.pending_proposals} đề xuất chờ duyệt →</Link>
        <Link href="/dashboard/editorial/guides">{data.guides} bản cẩm nang (tính riêng từng ngôn ngữ) →</Link>
      </nav>
      <h3>Luồng nội dung địa điểm</h3><p>{Object.entries(data.workflow).map(([s,n]) => `${workflowLabels[s] ?? s}: ${n}`).join(' · ')}</p>
      <h3>Hạn kiểm tra nguồn</h3>
      <p>{Object.entries(data.freshness).map(([s,n]) => `${freshnessLabels[s as Freshness]}: ${n}`).join(' · ')}</p>
      <p>Đếm theo địa điểm. Có ít nhất một nguồn quá hạn thì địa điểm được đánh dấu quá hạn; thiếu ngày kiểm tra không được tính là còn mới.</p>
      <h3>Chất lượng dữ liệu — xử lý theo thứ tự ưu tiên</h3>
      <details><summary>Cách tính và xếp ưu tiên</summary><p>Độ đầy đủ = trung bình ba tiêu chí có tọa độ, có mô tả và đã đặt ảnh bìa, mỗi tiêu chí trọng số bằng nhau. Không phải điểm đúng/sai hay chất lượng ảnh. Không chấm thiếu điện thoại hoặc giờ mở cửa cho bãi biển.</p>
        <p>Khẩn cấp: địa điểm công khai thiếu tọa độ hoặc nguồn có xung đột. Cao: công khai và nguồn quá hạn hoặc chưa có nguồn. Trung bình: thiếu mô tả/ảnh bìa hoặc lịch kiểm tra. Các mục còn lại: thấp. Liên kết nguồn không chứng minh giá trị hiện tại đã được xác minh.</p></details>
      {!data.total && <p>Chưa có địa điểm. Bạn có thể thêm nội dung bằng tài khoản quản trị.</p>}
      <ul className={styles.records}>{data.records.map(r => <li key={r.id}>
        <div><strong>{r.name}</strong> <span className={styles.badge}>Ưu tiên: {priorities[r.priority]}</span></div>
        <p>{r.category} · {workflowLabels[r.status] ?? r.status} · Đầy đủ: {r.completeness}/100 · Xác minh: {r.verification_status}</p>
        <p>{recordIssues(r).join(' · ') || 'Không phát hiện thiếu sót trong các tiêu chí đang kiểm tra.'}</p>
        <p>{r.source_count} liên kết nguồn · {freshnessLabels[r.freshness]}{r.next_review_at ? ` · Hạn gần nhất: ${r.next_review_at.slice(0,10)}` : ''}</p>
        {!!r.sources?.length && <details><summary>Xem nguồn theo trường (tối đa 10 liên kết có hạn gần nhất)</summary>
          <ul>{r.sources.map((s,i) => <li key={i}>
            <strong>{s.field ?? 'Nguồn chung'}</strong> · {s.title ?? s.publisher ?? 'Chưa có tên nguồn'}
            <p>Đã kiểm tra: {s.verified_at?.slice(0,10) ?? 'Chưa ghi nhận'} · Kiểm tra lại: {s.recheck_date ?? 'Chưa đặt lịch'} · Confidence đã ghi nhận: {s.confidence ?? 'Chưa có'}</p>
            {safeSourceUrl(s.url) && <a href={safeSourceUrl(s.url)!} target="_blank" rel="noopener noreferrer">Mở nguồn đối chiếu</a>}
          </li>)}</ul>
          <p>Sửa nội dung không tự gia hạn nguồn hoặc đổi trạng thái xác minh. Cần thực hiện qua luồng xác minh có thẩm quyền.</p>
        </details>}
        <Link href={`/dashboard/places/${r.id}/edit`}>Mở đúng địa điểm để xử lý →</Link>
        {!r.has_cover && <> · <Link href={`/dashboard/places/${r.id}/photos`}>Quản lý ảnh →</Link></>}
      </li>)}</ul>
      <div className={styles.actions}><button disabled={page <= 1} onClick={() => reload(page-1)}>Trang trước</button>
        <span>Trang {page} / {Math.max(1, Math.ceil(data.total / data.page_size))}</span>
        <button disabled={page * data.page_size >= data.total} onClick={() => reload(page+1)}>Trang sau</button></div>
      <h3>Nhật ký quản trị gần nhất</h3><p>20 sự kiện mới nhất. Chỉ hiển thị định danh người thao tác và thay đổi trạng thái; không hiển thị mật khẩu, IP hoặc nội dung riêng tư.</p>
      {!data.audit.length && <p>Chưa có sự kiện.</p>}
      <ul className={styles.records}>{data.audit.map(a => <li key={a.id}>
        <strong>{a.event}</strong> · {a.result}<br />
        {new Date(a.created_at).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} · {a.actor_role ?? 'Không rõ vai trò'} · {a.actor_id ?? 'Không ghi nhận người thao tác'}<br />
        Đối tượng: {a.entity_type} / {a.entity_id ?? 'Không có định danh'}
        {(a.before_status || a.after_status) && <p>{a.before_status ?? 'Chưa ghi nhận'} → {a.after_status ?? 'Chưa ghi nhận'}</p>}
      </li>)}</ul>
    </>}
    <h3>Tình trạng hệ thống</h3>
    <p role="status">{health === 'loading' ? 'Đang kiểm tra API…' : health === 'ok'
      ? 'API, PostgreSQL, Redis: kiểm tra sức khỏe vừa thành công.'
      : 'Chưa xác nhận được sức khỏe API/PostgreSQL/Redis. Cần kiểm tra kết nối hoặc dịch vụ.'}</p>
    <p>Đây là kiểm tra tại thời điểm tải, không phải tỷ lệ uptime. Web công khai và MinIO chưa có phép đo trong khối này.</p>
    <Link href="/dashboard/help">Xem tình trạng sao lưu và hướng dẫn vận hành →</Link>
    <details><summary>Các số liệu chưa kết nối</summary><p>Digest container production, phiên bản Web, CPU/RAM, API p95, tỷ lệ lỗi, LCP/INP/CLS thực tế, GA4 và Search Console: chưa có nguồn đo tại dashboard. Không sử dụng số liệu mẫu.</p></details>
  </section>;
}
