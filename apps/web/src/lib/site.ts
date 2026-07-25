// MVP SEO pass: the web app's own public origin. Previously nothing exposed this -- Next.js's
// `metadataBase` (and anything computing an absolute URL for a sitemap/robots/canonical/JSON-LD)
// silently fell back to `http://localhost:3000` in every environment, including production.
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
