// Kết quả hành động được audit (data-dictionary §10 `audit_logs.result`).
export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  ALLOW = 'allow',
  DENY = 'deny',
}
