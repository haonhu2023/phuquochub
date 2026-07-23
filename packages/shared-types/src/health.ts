// Kiểu dữ liệu cho endpoint health-check (Sprint 0).

export type HealthStatus = 'ok' | 'error';

export interface HealthIndicator {
  status: 'up' | 'down';
  message?: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  info: Record<string, HealthIndicator>;
  error: Record<string, HealthIndicator>;
  uptimeSeconds: number;
  version: string;
}
