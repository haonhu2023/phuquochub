import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

// C1 follow-up (2026-09-22) — the DURABLE, server-side half of cache invalidation. Found by the
// owner's own review: the original C1 pass only had the WEB CLIENT call `/api/revalidate` after
// its own successful mutation — a direct API write (curl, a script, a future AI agent, anything
// that isn't this specific web UI code path) left the public cache stale with no invalidation at
// all. Hooking this into `PlacesService` instead (the actual write boundary every caller goes
// through, regardless of which client issued the request) closes that gap for good — see each
// call site's own comment for exactly when it fires.
//
// MUST NEVER throw, MUST NEVER make a caller's already-successful DB write look like it failed —
// every call site awaits this AFTER its own write has committed and swallows this service's
// result entirely (it returns void). A stale cache entry self-heals via the 60s `revalidate`
// window already on every tagged fetch (see places.api.ts) regardless of what happens here.
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private readonly webInternalUrl: string | null;
  private readonly sharedSecret: string | null;
  private loggedUnconfigured = false;

  constructor(config: ConfigService) {
    const cfg = config.get<AppConfig['cacheInvalidation']>('cacheInvalidation')!;
    // configuration.ts already strips a trailing slash, but this service constructs the target URL
    // by simple concatenation (see `invalidate()` below) — stripping again here is defense in
    // depth against any future config source that doesn't normalize it, not a workaround for a
    // known bug.
    this.webInternalUrl = cfg.webInternalUrl?.replace(/\/+$/, '') || null;
    this.sharedSecret = cfg.sharedSecret;
  }

  /** Invalidates the public cache for one place (detail + every listing/sitemap tagged `places:list`). */
  async invalidatePlace(slug: string): Promise<void> {
    await this.invalidate({ entityType: 'place', slug });
  }

  private async invalidate(payload: { entityType: 'place'; slug: string }): Promise<void> {
    if (!this.webInternalUrl || !this.sharedSecret) {
      // Log ONCE per process, not once per mutation — a dev/test environment that never set these
      // (server-side invalidation is optional; the client-triggered path + the 60s window still
      // work without it) shouldn't spam its own logs on every single place write.
      if (!this.loggedUnconfigured) {
        this.logger.warn(
          'WEB_INTERNAL_URL/REVALIDATE_INTERNAL_SECRET chưa cấu hình — bỏ qua server-side cache invalidation (client-triggered path + cửa sổ revalidate 60s vẫn hoạt động).',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const url = `${this.webInternalUrl}/api/revalidate`;
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Revalidate-Secret': this.sharedSecret },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) return;
        this.logger.warn(`Revalidate thất bại (lần ${attempt}/${maxAttempts}): HTTP ${res.status} từ ${url}`);
      } catch (err) {
        this.logger.warn(
          `Revalidate lỗi (lần ${attempt}/${maxAttempts}) tới ${url}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.error(
      `Server-side cache invalidation thất bại sau ${maxAttempts} lần cho ${JSON.stringify(payload)} — sẽ tự phục hồi qua cửa sổ revalidate 60s.`,
    );
  }
}
