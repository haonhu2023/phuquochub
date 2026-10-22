import * as Sentry from '@sentry/node';

// Error-tracking gap closed (2026-10-22, production review): before this file, no error-tracking
// existed anywhere in this codebase — a real 500 was invisible to anyone unless they happened to
// read server logs by hand. `initSentry()` is a safe no-op unless SENTRY_DSN is set (same
// "not configured" convention as `backupStatus`/`cacheInvalidation` in configuration.ts), so this
// is safe to deploy before a Sentry project has actually been created.
//
// Reads `process.env` directly, NOT ConfigService -- this must run before Nest's DI container
// exists (main.ts calls it as the very first line, before NestFactory.create()), matching Sentry's
// own "initialize before anything else" requirement so uncaught-exception/unhandled-rejection
// handlers are installed from the start.
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    // PII (same discipline as AuditService.redact(), ADR-016): the SDK does NOT auto-attach
    // IP/user/cookie/header data by default (this version of @sentry/node has no
    // `sendDefaultPii` opt-IN flag to even enable that) -- each capture call controls exactly
    // what context is attached, and this codebase never passes request bodies/headers to
    // Sentry.captureException() (see all-exceptions.filter.ts).
    //
    // Error tracking only, not APM -- the gap this closes is "nobody knows about a real 500",
    // not request-latency tracing. Explicit 0, not the SDK default, so a future version bump
    // can't silently start sampling traces.
    tracesSampleRate: 0,
  });
}

export { Sentry };
