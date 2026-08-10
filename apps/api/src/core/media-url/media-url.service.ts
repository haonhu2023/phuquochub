import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

/**
 * Builds the STABLE, public, application-origin URL clients use to fetch one media file
 * (Secure Private Media, 2026-08-10).
 *
 * Why this exists as its own service rather than a method on `StorageService`: the URL it produces
 * is an *API route*, not an object-storage address. `StorageService` is the S3-compatibility
 * boundary (MinIO → R2 must stay a config change, see its file header) and must not learn about
 * HTTP routing; conversely nothing here should know about buckets or object keys. Keeping them
 * apart is what lets the storage bucket become fully private without any consumer noticing.
 *
 * The returned URL is stable and cacheable-by-reference: it never expires, because it does not
 * carry a signature. `GET /media/{id}/file` re-checks publication status and mints a fresh
 * short-lived signed URL on every hit. That means a URL scraped from an HTML page keeps working
 * only for as long as the media stays published — hiding or rejecting media revokes access on the
 * very next request, which a directly-embedded signed URL could not do.
 *
 * @Global (see media-url.module.ts) — same convention as core/storage and core/redis.
 */
@Injectable()
export class MediaUrlService {
  private readonly base: string;

  constructor(config: ConfigService) {
    const api = config.get<AppConfig['api']>('api')!;
    // `publicUrl` is already normalized (no trailing slash) in configuration.ts. The global prefix
    // is read from the SAME config `main.ts` passes to `app.setGlobalPrefix()`, so the two can
    // never drift — a hard-coded '/api' here would silently break any deployment that overrides
    // API_GLOBAL_PREFIX.
    this.base = `${api.publicUrl}/${api.globalPrefix}`;
  }

  /** Absolute URL for `GET /media/{id}/file`. Safe to embed in HTML — no credential in it. */
  fileUrl(mediaId: string): string {
    return `${this.base}/media/${mediaId}/file`;
  }
}
