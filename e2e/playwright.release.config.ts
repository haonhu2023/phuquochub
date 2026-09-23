import path from 'node:path';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// T1 follow-up (2026-09-22) — release gate mode. Every cold-compile timeout hit while building T1
// (guide-article.spec.ts timing out on the FIRST hit to a never-before-compiled dev route after a
// server restart — Turbopack compiles each `next dev` route on demand, and that compile can take
// well past this suite's already-generous 90s timeout under load) was a `next dev` artifact, not a
// real bug. `next build` output has NO per-route on-demand compilation — every route is already
// built — so running the SAME suite against `next start` removes that entire failure class rather
// than papering over it with more retries.
//
// Playwright's own `webServer` (not manual preview_start/preview_stop) builds+starts the server and
// polls `url` until it responds before running any test — standardized startup/readiness, per the
// gap this config closes. `reuseExistingServer: true` locally (a server already up via
// `preview_start` is reused, no rebuild) but ALWAYS fresh in CI.
//
// Usage: `npm run test:e2e:browser:release` (apps/web must have `API_INTERNAL_URL` resolvable —
// see apps/web/.env.production.local in local runs, or the real container env in CI/production).
//
// Guard from global-setup.ts (refuses any non-localhost baseURL) is inherited unchanged from the
// base config — this file only adds `webServer`, nothing about the production-vs-not decision.
export default defineConfig({
  ...baseConfig,
  webServer: {
    // Playwright resolves `webServer.cwd` relative to CONFIG FILE'S directory (`e2e/`), không phải
    // cwd của process gọi lệnh — xác nhận thực nghiệm: thiếu `cwd` khiến `npm --workspace=apps/web`
    // chạy từ bên trong `e2e/`, nơi không có `workspaces` nào để npm tìm thấy. `path.resolve` lên
    // một cấp về repo root.
    command: 'npm run build --workspace=apps/web && npm run start --workspace=apps/web -- -p 3000',
    url: 'http://localhost:3000/vi',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // real `next build` takes 1-2+ minutes; this is a one-time cost per run, not per-route
    cwd: path.resolve(__dirname, '..'),
  },
});
