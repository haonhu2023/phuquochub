# H-5 — REFRESH TOKEN REUSE DETECTION / FAMILY REVOCATION

## Status

**Complete.** Closes finding **H-5** of the read-only Production Readiness Review (full-repository
audit, 2026-08-06 — never written to a file in this repository, same source as H-1/H-3/H-4):

> "Refresh-token rotation currently rejects a replayed/consumed token with 401, but does not detect
> compromise lineage or revoke the descendant token family."

Only reuse detection and family revocation were implemented. No redesign of JWT access-token
revocation (H-1 untouched as a mechanism, only invoked as a primitive), no change to `AuthService`'s
audit infrastructure beyond one new event (H-3's `emitAudit()` reused as-is), no change to throttle
configuration (H-4 untouched). No Medium-severity finding was started after this milestone.

## The gap this closes

Before this milestone, `TokenService.rotate()` had exactly one failure mode for an unusable jti: "not
present in Redis" → 401 `reason=revoked`. A replay of a **legitimately-issued-then-rotated** refresh
token (the textbook signal of token theft — an attacker using a stolen token after the real owner has
already rotated past it) produced the **exact same signal** as a garbage/never-issued jti. There was
no way to distinguish genuine compromise from ordinary invalidity, and no reaction beyond rejecting
the one request in front of it.

## Redis family model

**No new JWT claim.** The refresh token payload (`{sub, jti, type}`) is byte-for-byte unchanged.
Family membership lives entirely in Redis, folded into the value already stored at the jti key H-1
introduced (`refresh:{jti}`), which changes from a bare `userId` string to `${state}:${userId}:
${familyId}` with `state ∈ {active, consumed}`. The server round-trips `familyId` through exactly the
same mechanism H-1 already used for `userId` — reading it back from the value stored at issuance,
inside the same atomic operation that consumes the token. A JWT claim was considered and found
unnecessary: Redis was already the source of truth for token ownership, and family is just one more
field in the same value. This means tokens already in circulation before this deploy decode and
rotate normally (they get an anonymous family assigned by `issueTokens()` the moment they're used,
since no `familyId` parameter is passed for them).

Four Redis keys, all bounded (TTL = `jwt.refreshTtl`, self-expiring, no cleanup job required):

| Key | Value | Role |
|---|---|---|
| `refresh:{jti}` | `${state}:${userId}:${familyId}` | Per-token state (extends H-1's key — added `state`+`familyId`) |
| `refresh:user:{userId}` | SET of active jti | Unchanged from H-1 — immediate kill list for logout-all |
| `refresh:user:families:{userId}` | SET of familyId | **New** — lets logout-all enumerate which families to revoke |
| `refresh:family:{familyId}:revoked` | `'1'` (existence = revoked) | **New** — blocks every jti in the family, active or consumed |

## Atomic consume — one Lua `EVAL`

`rotate()` previously had a genuine race: `GET` to check the jti, then a **separate** `MULTI(DEL,
SREM)` to remove it — two Redis round-trips with a real gap between them. Two concurrent `rotate()`
calls on the same token could both pass the `GET` check before either issued its `DEL`.

`CONSUME_JTI_SCRIPT` (`apps/api/src/modules/auth/token.service.ts`) folds the read-check-mutate
sequence into **one** Redis command. Redis executes an entire Lua script as a single indivisible
operation — no other command on that Redis instance, including another `EVAL`, can interleave with a
script while it runs. This is what makes the consume atomic: there is no window between "read the
jti's state" and "write its new state" for a second caller to land in.

The family key's name depends on `familyId`, which is only knowable *after* reading the jti's value
— inside the script. It's built dynamically via Lua string concatenation from `ARGV`, rather than
passed as a declared `KEYS` entry. This is safe on this deployment's single-instance Redis
(`docker-compose.yml`'s `redis:7-alpine`, one node, not Cluster) but would break on Redis Cluster,
where the jti key and the dynamically-built family key could hash to different nodes — a limitation
worth remembering if this deployment ever moves to Cluster.

Four possible outcomes, returned as a small tuple:

- **`invalid`** — jti never existed (or was deleted by logout/logout-all). 401, unchanged from H-1.
- **`family_revoked`** — this family was already killed by an earlier reuse detection or by
  logout-all. 401, but does **not** re-trigger the H-1/audit reaction (that already happened once, at
  the original detection).
- **`reused`** — the jti's state was already `consumed`. This is genuine reuse. The script itself
  sets the family-revoked marker **inside the same atomic operation**, independent of anything the
  application layer does afterward.
- **`ok`** — the jti was `active`; transitioned to `consumed` via `SET ... KEEPTTL` (original TTL
  preserved, not extended — the consumed marker dies exactly when the token itself would have).

## Token-flow changes

- **Login/register** (`issueTokens(user)`, no `familyId` argument): a fresh `randomUUID()` family is
  generated. Two consecutive logins for the same user produce two independent families — proven by
  unit test.
- **Refresh, normal case**: `consumeJti()` returns `ok`; the old jti is dropped from the active-jti
  index (`refresh:user:{userId}`, same cleanup H-1 already did); the child token is minted via
  `issueTokens(user, consumed.familyId)` — **same family** as the parent.
- **Refresh, reuse case**: `rotate()` throws `RefreshTokenError('reused', userId, familyId)`. No new
  token pair is issued.
- **Logout** (`revoke()`): unchanged — deletes the presented jti only. Does not touch the family. A
  logout does not cascade to sibling devices/sessions, matching pre-existing semantics.
- **Logout-all** (`revokeAllRefreshForUser()`): unchanged behavior for the active-jti index (still
  kills every currently-active refresh token immediately), **plus** now walks
  `refresh:user:families:{userId}` and sets the family-revoked marker for every family the user has
  ever logged in with (within the TTL window). This closes a small gap: without it, a stray
  already-consumed jti from before a logout-all, replayed afterward, would land in `reused` (spurious
  extra H-1 call + audit) rather than the cleaner `family_revoked`.

## Atomicity — why the chosen mechanism is genuinely atomic

Redis is single-threaded for command execution, and `EVAL` scripts run to completion as one command
before the server processes anything else queued behind them. There is no `await` or yield point
*inside* Redis while a Lua script executes. This is different from, and strictly stronger than, using
a client-side `MULTI`/`EXEC` transaction around a `GET`+conditional-`SET`: a `WATCH`-based optimistic
transaction still requires a round trip to read the value before queuing the write, and the
application has to retry on conflict. The Lua script instead performs the read, the branching
decision, and the write all inside Redis itself, in one round trip, with no client-side retry logic
needed — the two racing `rotate()` calls each send one `EVAL` command; Redis serializes them, and
whichever runs second necessarily observes the state the first one just wrote.

## Reuse detection reaction (`AuthService.refresh()`)

On `reason === 'reused'`:
1. Emit `auth.refresh.reuse_detected` via `emitAudit()` (H-3's existing best-effort wrapper — never
   throws, logs on failure). Done **first**, so the forensic trail exists even if step 2 fails.
2. Call `AuthRevocationService.revokeAllForUser(userId)` — H-1's existing primitive. This call is
   **not** wrapped in a try/catch here; if Redis is down, the `ServiceUnavailableException` it throws
   propagates as a 503 instead of the original 401. This mirrors H-1's own "security-side-effect
   rule" (never silently swallow a revocation failure) applied consistently — `logoutAll()` already
   behaves the same way.
3. Rethrow the original `RefreshTokenError` unchanged — external response (401, exact same message)
   is identical to any other failed refresh.

Crucially, the family-revoked marker is committed **inside the Lua script**, before either of these
two steps runs. A failure in the audit write or in the H-1 call cannot "un-revoke" a family that's
already dead in Redis — satisfying the instruction that audit failure must not restore a compromised
family.

## Concurrency proof

Two simultaneous `POST /auth/refresh` requests using the identical refresh token, fired via
`Promise.all` against the real app + real Redis (`auth-refresh-reuse.e2e-spec.ts`, "CONCURRENCY"
test):

- Exactly one response is `200` (normal rotation), the other is `401` — deterministically, proven
  against live Redis, not asserted from a mock.
- The losing branch is treated identically to a genuine attacker replay: the family dies. This is a
  **deliberate, disclosed** policy — Redis cannot distinguish "a legitimate client retried due to a
  network blip" from "an attacker racing the real owner," since both present as two concurrent
  requests carrying the same valid token. Revoke-over-allow is the safe default; this is documented
  as an accepted false positive, consistent with how other refresh-rotation implementations describe
  the same trade-off.
- Proven specifically: replaying the **winning** branch's own (never-before-reused) refresh token
  immediately returns 401 — demonstrating that the unit of revocation is the *family*, not the
  individual token, regardless of which side of the race a given token was on.
- The original, pre-race access token is confirmed revoked via H-1 (after waiting past the 1-second
  epoch-resolution boundary — see limitations below).

## H-1 interaction

`revokeAllForUser()` is called unmodified, exactly as `logoutAll()` already calls it — H-5 adds a
second caller, not a new code path. The pre-existing 1-second `iat`-resolution limitation (documented
at H-1: a token issued in the same second as a revocation is not considered revoked) is inherited,
not introduced. It surfaces most visibly in the concurrency scenario: the winning branch's freshly
minted access token can be issued in the same second the losing branch's H-1 call sets the revocation
epoch, in which case that access token can survive up to its normal TTL even though its refresh token
is dead immediately. The refresh/family layer closes the loop deterministically regardless of clock
granularity (see the concurrency test's `replayWinner` assertion); the access-token layer inherits
H-1's existing, disclosed, second-resolution gap.

## H-3 audit interaction

One new event, `auth.refresh.reuse_detected`, added the same way all seven H-3 events were —
`event` is a free-form string field on `AuditEvent`, not a fixed enum, so no schema change was
needed. Context carries `family_id` (an opaque server-generated UUID — not sensitive) and `reason:
'reused'`. Verified directly (not just by convention) that no refresh/access token or other secret
ever appears in the audit row for this event, in both the unit tests and the live e2e.

## H-4 throttle compatibility

Untouched. `ThrottlerGuard` still runs before any route handler body, so a throttled request never
reaches `AuthService.refresh()` and never touches the family/reuse logic at all — no interaction to
verify beyond what H-4 already proved.

## Unit tests

`token.service.spec.ts` (21 tests, rewritten where the value format or consume mechanism changed):
issuance produces the new `active:{userId}:{familyId}` value shape; two logins for the same user
yield distinct families; no new JWT claim is added; rotation passes the family through unchanged;
each of the four `consumeJti()` outcomes maps to the correct `RefreshTokenError` (or success); the
`family_revoked` outcome opportunistically cleans the still-"active" jti from the user index; a
defensive check catches a (theoretically unreachable short of key compromise) mismatch between the
Redis-stored owner and the JWT's verified `sub`; a Redis/`eval` failure propagates unmodified, never
silently mapped to a 401; `revokeAllRefreshForUser()` now cascades family revocation on logout-all,
covering the family-only, jti-only, both-empty, and both-populated cases.

`auth.service.spec.ts` (+9 tests): the `reused` branch emits `auth.refresh.reuse_detected` (not
`auth.refresh.failure`), calls `revokeAllForUser`, never leaks the raw refresh token into the audit
context, emits audit before calling H-1 (so the trail survives an H-1 failure), and lets an H-1
failure propagate rather than being swallowed.

## E2E / live validation

**New `auth-refresh-reuse.e2e-spec.ts`, 2/2 passing against real Redis + Postgres:**

1. The full 10-step scenario: mint tokens → refresh once successfully → replay the original
   (consumed) refresh token → 401 → the newest, never-before-used descendant is *also* rejected
   (proving the family, not just the replayed token, is dead) → both generations' access tokens
   confirmed revoked via H-1 → the `auth.refresh.reuse_detected` audit row confirmed present with no
   token/secret leakage → a completely different user's tokens confirmed unaffected → Redis residue
   confirmed bounded (family-revoked marker has a positive, TTL-bounded lifetime; the active-jti index
   is empty).
2. The concurrency scenario described above.

**Two pre-existing e2e files updated, not regressed:** `auth-refresh-throttle.e2e-spec.ts` and
`auth-audit.e2e-spec.ts` each had a "replay an already-rotated token" scenario that asserted
`auth.refresh.failure(reason=revoked)`. That scenario is now — correctly — a reuse-detection case,
so the assertion changed to `auth.refresh.reuse_detected(reason=reused)`. The external HTTP response
(401 status, exact same error message) is unchanged in both files; only the audit classification
became more specific, which is the entire point of this milestone. This was caught by running the
full focused auth e2e suite before considering the milestone done — not assumed safe.

## Redis cleanup / TTL proof

Every key this milestone introduces or modifies carries a TTL no longer than `jwt.refreshTtl`:
`refresh:{jti}`'s TTL is set once at issuance and preserved (`KEEPTTL`) through the consumed
transition, never extended; `refresh:user:families:{userId}` is refreshed on every token issuance
exactly like the existing `refresh:user:{userId}` index; `refresh:family:{familyId}:revoked` is
created with an explicit `EX jwt.refreshTtl`. The live e2e directly asserts a positive, bounded TTL on
the family-revoked marker after triggering it, and confirms the active-jti index (`refresh:user:
{userId}`) is empty after the full scenario completes. No new unbounded-growth structure was
introduced — every set is either capped by TTL-driven self-expiry or actively pruned on the paths that
already existed (rotation, logout, logout-all).

## Full regression

| Gate | Result |
|---|---|
| Focused auth unit (`token.service.spec.ts`, `auth.service.spec.ts`) | 49 tests — pass |
| Focused auth e2e (9 suites, incl. `security-hardening`, the two updated files, and the new reuse file) | 64 tests — pass |
| New reuse e2e | 2/2 — pass |
| BE unit (full) | **129 suites / 1558 tests** — pass (+11) |
| BE e2e (full, `--runInBand`) | **32 suites / 281 tests** — pass (+1 suite, +2 tests) |
| `tsc --noEmit` | clean |
| `eslint "src/**/*.ts" --max-warnings=0` | clean |
| `eslint "test/**/*.ts" --max-warnings=0` | clean (one pre-existing, unrelated warning in `authz-own-scope-hardening.e2e-spec.ts`, a file this milestone never touched, left as-is — out of scope) |
| `nest build` | clean |
| Monorepo `turbo run typecheck lint build` | **12/12** |
| `git diff --check` | clean (CRLF-on-checkout warnings only, no real whitespace errors) |
| Secret scan over the diff | no findings |
| New migrations | **none** — Redis-only model, no DB table added |
| Lingering `node`/Jest processes after every run | zero |

## Documentation

- **ADR-016** — new dated implementation-status section appended (H-1/H-3's sections left verbatim,
  same convention as every prior milestone this session).
- **`docs/delivery/state.yaml`** — H-5 summary pushed to the top of the `current.task` chain, H-4's
  summary demoted verbatim beneath it.
- **OpenAPI** — intentionally unchanged. No externally observable contract changed: same status
  codes, same response shapes, same error message text for every endpoint this milestone touches.
- **`docs/architecture/deployment.md`** — intentionally unchanged. H-5 is an application-layer
  token/family mechanism owned by ADR-016, not infrastructure/rate-limit configuration; only H-4
  touched `deployment.md` because throttling specifically is shared rate-limit infra (`PLACE-028`).
- This report.

## Remaining auth limitations

Carried forward, not introduced by this milestone: `User.Ban`/password-reset endpoints still don't
exist (H-1's pre-existing note); `AuditEvent.ip`/`.userAgent` are still never populated anywhere in
the repo (H-3's pre-existing note). New to this milestone, disclosed above: the double-click/race
false-positive policy (§Concurrency proof), the inherited 1-second H-1 resolution surfacing more
visibly in the race scenario, and the Redis-Cluster incompatibility of the dynamic family-key
construction inside the Lua script (fine on this deployment's single Redis instance; would need
redesign — e.g. hash-tagging or computing the family key application-side and passing it through
`KEYS` — before a move to Redis Cluster).

**Per the governing instruction for this milestone: no Medium-severity finding begins after H-5.**
