import { buildApiUrl } from '@/lib/api';

interface HealthProbe {
  reachable: boolean;
  httpStatus?: number;
  detail: string;
}

// Gọi /health của API (server-side) để hiển thị trạng thái kết nối FE↔BE.
async function probeApi(): Promise<HealthProbe> {
  try {
    const res = await fetch(buildApiUrl('/health'), { cache: 'no-store' });
    return {
      reachable: res.ok,
      httpStatus: res.status,
      detail: res.ok ? 'API phản hồi bình thường' : `API trả HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      reachable: false,
      detail: `Không kết nối được API: ${(err as Error).message}`,
    };
  }
}

export default async function HomePage() {
  const probe = await probeApi();
  const color = probe.reachable ? 'var(--ok)' : 'var(--err)';

  return (
    <main>
      <h1>PhuQuocHub</h1>
      <p style={{ color: 'var(--muted)' }}>
        Wikipedia + Reddit + Google Maps cho Phú Quốc — <em>Sprint 0 (Foundation)</em>
      </p>

      <section
        style={{
          marginTop: '2rem',
          padding: '1.25rem 1.5rem',
          border: '1px solid #1e293b',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Trạng thái hệ thống</h2>
        <p>
          <strong>API health:</strong>{' '}
          <span style={{ color }}>{probe.reachable ? '● UP' : '● DOWN'}</span>
        </p>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{probe.detail}</p>
      </section>
    </main>
  );
}
