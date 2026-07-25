import type { NextFunction, Request, Response } from 'express';

// PLACE-041: found missing by the production configuration audit — no `helmet` package and no
// manual equivalent existed anywhere in the API. Implemented directly (no new dependency) since
// this API is JSON-only and needs a small, fixed header set, not helmet's full configurable
// surface (CSP directives etc. matter far more for an HTML-serving app like apps/web).
//
// Strict-Transport-Security is deliberately NOT set here: it belongs at the reverse-proxy layer
// (Caddy, once real HTTPS is live) — setting it from an app that also runs over plain HTTP in
// dev/local-verification risks a browser caching an HSTS policy against a host that isn't
// actually always HTTPS.
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}
