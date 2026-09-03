# Local-staging `API_INTERNAL_URL` — reproducible config

**Scope:** `D:/Projects/PhuQuocHub-local-staging-runtime` only — a sibling
directory, **not a git repository**, outside this repo. Never touches
production. This runbook exists so the fix in
[apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) (server-side SSR
fetches must use a Docker-internal URL, not the host-facing
`NEXT_PUBLIC_API_URL`) can be reproduced on a fresh local-staging checkout
without recalling an undocumented manual edit.

## What to add

In `docker-compose.local-staging.yml`, under the `web:` service's
`environment:` block (alongside the existing `NODE_ENV: production`), add:

```yaml
      # Server-side (SSR) fetch trong container PHẢI đi qua tên service Docker network — KHÔNG
      # bao giờ dùng NEXT_PUBLIC_API_URL (địa chỉ host, không resolve được từ trong container).
      # Runtime env (không có tiền tố NEXT_PUBLIC_), không bake vào image/client bundle.
      API_INTERNAL_URL: http://api:4000/api
```

`http://api:4000/api` is the compose service name (`api:`) + its internal
container port (`4000`, see the `api:` service's `API_PORT`) + the API's
global prefix (`api`) — not a secret, not a host/production address, and
resolvable only on the `staging_net` bridge network this compose file
defines. This is a **runtime** environment variable (no `NEXT_PUBLIC_`
prefix), set on the container, not a Docker build `arg` — it is never baked
into the Next.js client bundle and does not require an image rebuild to
change.

## Verbatim patch

Unified diff against the `web:` service block, applicable with
`patch -p0 < this-block` from the runtime directory:

```diff
--- docker-compose.local-staging.yml (before)
+++ docker-compose.local-staging.yml (after)
@@ -147,6 +147,10 @@
       - api
     environment:
       NODE_ENV: production
+      # Server-side (SSR) fetch trong container PHẢI đi qua tên service Docker network — KHÔNG
+      # bao giờ dùng NEXT_PUBLIC_API_URL (địa chỉ host, không resolve được từ trong container).
+      # Runtime env (không có tiền tố NEXT_PUBLIC_), không bake vào image/client bundle.
+      API_INTERNAL_URL: http://api:4000/api
     ports:
       - "127.0.0.1:13000:3000"
     networks: [staging_net]
```

## Checksums (audit trail)

| File state | SHA-256 |
|---|---|
| `docker-compose.local-staging.yml` before this change | `c2ce14d4f7619bc20556536e861f563061254ed3520bf5e7966f720bdb0bfb21` |
| `docker-compose.local-staging.yml` after this change | `4282b26d972e5e82faf1359f4af2227b7e255b0f97dc00c3d9a2586702b4636e` |

Verify the current file matches the "after" hash:

```bash
sha256sum D:/Projects/PhuQuocHub-local-staging-runtime/docker-compose.local-staging.yml
```

## Applying to a freshly recreated runtime directory

1. Copy/regenerate `docker-compose.local-staging.yml` as normal (it is not
   version-controlled — see the file's own header comment for why).
2. Add the four lines above under `web: environment:`.
3. Confirm the resulting file's SHA-256 matches the "after" value in this
   table.
4. No change to `.env.local-staging` is needed — `API_INTERNAL_URL`'s value
   here is a fixed Docker DNS name, not a secret, and is not read from that
   file.
5. Recreate only the `web` service (`docker compose ... up -d --no-deps web`)
   — this env var takes effect on container start, no image rebuild
   required.

## No secrets

No password, token, API key, or other secret value appears in this
document, the patch, or the environment variable itself.
