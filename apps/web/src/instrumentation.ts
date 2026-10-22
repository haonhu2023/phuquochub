import * as Sentry from '@sentry/nextjs';

// Error-tracking gap closed (2026-10-22, production review): before this file, a server-side
// error (Server Component render, Route Handler, generateMetadata) was invisible to anyone unless
// they read server logs by hand. Safe no-op unless SENTRY_DSN_WEB is set (same "not configured"
// convention used throughout apps/api/src/core/config/configuration.ts).
//
// This is the stable Next.js instrumentation hook (no `experimental.instrumentationHook` flag
// needed on this Next version) — `register()` runs once per runtime (nodejs and edge each call it
// separately) before the app starts serving requests. Deliberately NOT wrapping next.config.mjs
// with `withSentryConfig` — that's for build-time source-map upload, which needs a
// SENTRY_AUTH_TOKEN this deployment does not have; stack traces still show real function/line
// info from the compiled output without it, just not mapped back to original source lines.
export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN_WEB?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    // Error tracking only, not APM — explicit 0, not the SDK default, so a future version bump
    // can't silently start sampling traces.
    tracesSampleRate: 0,
  });
}

// Next.js's own hook for errors during request handling (Server Components, Route Handlers) that
// never reach a client-side error.tsx boundary — see components/ui/ErrorRetryState.tsx's
// useLogError() for the client-side half of this same gap.
export const onRequestError = Sentry.captureRequestError;
