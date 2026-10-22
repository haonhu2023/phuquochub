import * as Sentry from '@sentry/nextjs';

// Error-tracking gap closed (2026-10-22, production review) — browser-side half of
// instrumentation.ts's server-side init. Next.js loads this file automatically on the client
// (stable convention on this Next version, no config wiring needed) before the app renders.
//
// `NEXT_PUBLIC_` prefix is REQUIRED here (this code ships in the browser bundle) — unlike
// `cacheInvalidation.sharedSecret`/`REVALIDATE_INTERNAL_SECRET` elsewhere in this codebase, a
// Sentry DSN is NOT a secret: it is designed to be publicly visible (every error report sent from
// every user's browser necessarily includes it), and Sentry's own abuse protection is per-project
// rate limiting, not DSN secrecy. Do not read this pattern as license to expose anything else.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'production',
    // Error tracking only, not APM — explicit 0, not the SDK default.
    tracesSampleRate: 0,
    // Session Replay off by default — it records real user sessions (potential PII exposure),
    // and nobody has decided whether that trade-off is wanted yet. Error capture alone already
    // closes the gap this change targets.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Required by Next.js when a custom instrumentation-client.ts exists, so App Router navigation
// errors are captured the same way route-level error.tsx boundaries are — see
// components/ui/ErrorRetryState.tsx's useLogError() for that half.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
