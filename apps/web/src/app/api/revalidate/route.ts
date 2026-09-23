import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { apiGetAuth, ApiError } from '@/lib/http';

// C1 (2026-09-22, hardened same day after owner review) — real invalidation for the tagged caches
// in modules/places/api/places.api.ts.
//
// TWO callers, TWO auth modes:
//
// 1. THE API SERVER itself (PlacesService, server-to-server, see apps/api/src/core/
//    cache-invalidation/) — the DURABLE path. It calls this after EVERY successful place write
//    that touches public output (update/publish/unpublish), regardless of which client (web UI,
//    a direct API caller, a future AI agent) issued the original request — the write boundary is
//    the one place every caller passes through, so this is the guarantee that a direct API write
//    doesn't leave the cache stale with nothing watching. Authenticated with a SHARED SECRET set
//    only in server env vars on both processes (`REVALIDATE_INTERNAL_SECRET`, never
//    `NEXT_PUBLIC_`-prefixed, so it can never end up in a client bundle or a browser-visible log).
//
// 2. THE DASHBOARD (browser, after its OWN mutation succeeds) — a FAST, OPTIONAL UX path, not the
//    correctness guarantee (the API-side call above already covers correctness). Authenticated by
//    the caller's own real JWT access token, verified against a genuine `GET /users/me` call —
//    never a static secret, which would have to be embedded in client JS to be reachable from the
//    browser at all, i.e. would protect nothing.
//
// Either mode, the REQUEST BODY never carries raw cache tags — it names the entity
// (`{ entityType: 'place', slug }`) and THIS ROUTE computes the exact tags server-side. A caller
// (compromised or just buggy) cannot ask to invalidate an arbitrary tag string.
const ALLOWED_ENTITY_TYPES = new Set(['place']);

function tagsFor(entityType: string, slug: string): string[] {
  if (entityType === 'place') return [`place:${slug}`, 'places:list'];
  return [];
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Lengths differ → not equal, but still run a same-size comparison so the early return itself
  // doesn't leak length via timing (compare bufA against itself — constant-time no-op).
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

async function authenticate(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const internalSecret = process.env.REVALIDATE_INTERNAL_SECRET;
  const providedSecret = request.headers.get('x-internal-revalidate-secret');
  if (internalSecret && providedSecret && timingSafeStringEqual(providedSecret, internalSecret)) {
    return { ok: true };
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) {
    return { ok: false, status: 401, error: 'Thiếu access token hoặc internal secret hợp lệ.' };
  }
  try {
    await apiGetAuth('/users/me', token, { cache: 'no-store' });
    return { ok: true };
  } catch (err) {
    const status = err instanceof ApiError && err.status === 403 ? 403 : 401;
    return { ok: false, status, error: 'Access token không hợp lệ.' };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return NextResponse.json({ revalidated: false, error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ revalidated: false, error: 'Body phải là JSON.' }, { status: 400 });
  }

  const { entityType, slug } = (body as { entityType?: unknown; slug?: unknown }) ?? {};
  if (
    typeof entityType !== 'string' ||
    !ALLOWED_ENTITY_TYPES.has(entityType) ||
    typeof slug !== 'string' ||
    slug.length === 0 ||
    slug.length > 200
  ) {
    return NextResponse.json(
      { revalidated: false, error: 'Body phải có dạng { entityType: "place", slug: string }.' },
      { status: 400 },
    );
  }

  const tags = tagsFor(entityType, slug);
  for (const tag of tags) {
    // Next 16's revalidateTag() bắt buộc profile thứ hai (không còn single-arg như bản cũ hơn) —
    // `{ expire: 0 }` yêu cầu coi entry đang cache là hết hạn NGAY, không chờ một cache-life profile
    // đặt trước.
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ revalidated: true, tags });
}
