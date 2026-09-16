import { Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires -- no @types/pg in this project; `pg`
// is already a real runtime dependency (TypeORM's own driver), this script just uses it directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Client } = require('pg');
// eslint-disable-next-line @typescript-eslint/no-var-requires -- same rationale as `pg` above:
// ioredis is already a real runtime dependency (RedisService's own driver), used here ONLY to
// replicate AuthRevocationService.revokeAllForUser()'s exact key/TTL contract (see revokeTokensForUsers()
// below) -- this script never touches any OTHER Redis key.
const IORedis = require('ioredis');
type PgClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; connect: () => Promise<void>; end: () => Promise<void> };

// TASK-SCOPED GRANT/REVOKE CHANNEL -- hotel media publish (2026-09-15).
//
// Narrowest reusable path for "grant temp role(s) for one task, then revoke exactly those grants" --
// mirrors the SAME two writes UsersService.assignRole() and its revoke counterpart always perform
// (UserRolesRepository.assign()/revoke() -> user_roles row; AuditService.record() -> audit_logs
// row), via a plain pg client instead of full NestJS DI (no ts-node/devDependencies exist inside
// the running production container -- see bootstrap-production-reviewer.ts for the DI-based
// precedent this mirrors). NOT a general admin/permission tool: no new role, no new dashboard, no
// broader permission surface than the exact grants this task needs.
//
// Usage:
//   npx ts-node src/scripts/grant-hotel-media-task-permissions.ts plan
//   npx ts-node src/scripts/grant-hotel-media-task-permissions.ts grant   -- writes, prints new IDs
//   npx ts-node src/scripts/grant-hotel-media-task-permissions.ts revoke <id> [id...]
//
// GRANT_TARGET_EMAIL / GRANT_TARGET_ROLES env vars override the default target set below --
// same transactional plan/grant/revoke logic, just resolved against a different (email, targets)
// pair. Default behaviour (unset) is unchanged from the original hotel-batch upload targets.
// GRANT_TARGET_ROLES="moderator:global" restricts to exactly that one grant -- no business_manager,
// no other account touched.

const TARGET_EMAIL = process.env.GRANT_TARGET_EMAIL ?? 'haonhu2023@gmail.com';
const HOTEL_SLUGS = ['la-veranda-resort', 'novotel-phu-quoc', 'premier-village-phu-quoc'] as const;

interface GrantTarget {
  roleCode: 'business_manager' | 'moderator' | 'content_owner';
  scopeType: 'managed' | 'global';
  placeSlug?: string;
}

const DEFAULT_TARGETS: GrantTarget[] = [
  ...HOTEL_SLUGS.map((placeSlug) => ({ roleCode: 'business_manager' as const, scopeType: 'managed' as const, placeSlug })),
  { roleCode: 'moderator', scopeType: 'global' },
];

function parseTargetsOverride(spec: string): GrantTarget[] {
  // "moderator:global" or "business_manager:managed:<slug>" or "content_owner:global", comma-separated.
  return spec.split(',').map((entry) => {
    const [roleCode, scopeType, placeSlug] = entry.trim().split(':');
    if (roleCode !== 'business_manager' && roleCode !== 'moderator' && roleCode !== 'content_owner') {
      throw new Error(`Unknown roleCode in GRANT_TARGET_ROLES: ${roleCode}`);
    }
    if (scopeType !== 'managed' && scopeType !== 'global') throw new Error(`Unknown scopeType in GRANT_TARGET_ROLES: ${scopeType}`);
    if (roleCode === 'content_owner' && scopeType !== 'global') {
      throw new Error('content_owner is never business-scoped -- its capability comes from role_parents(contributor), not a managed grant. Use scopeType=global.');
    }
    return placeSlug ? { roleCode, scopeType, placeSlug } : { roleCode, scopeType };
  });
}

const TARGETS: GrantTarget[] = process.env.GRANT_TARGET_ROLES ? parseTargetsOverride(process.env.GRANT_TARGET_ROLES) : DEFAULT_TARGETS;

interface ResolvedTarget extends GrantTarget {
  userId: string;
  roleId: string;
  businessId: string | null;
  alreadyActive: boolean;
  existingGrantId: string | null;
}

async function resolveUser(client: PgClient, email: string): Promise<{ id: string; active: boolean }> {
  const { rows } = await client.query('SELECT id, is_active FROM users WHERE email = $1', [email]);
  if (rows.length !== 1) throw new Error(`Expected exactly 1 user for ${email}, found ${rows.length}`);
  if (!rows[0].is_active) throw new Error(`User ${email} is not active -- refusing to grant`);
  return { id: rows[0].id, active: rows[0].is_active };
}

async function resolveRole(client: PgClient, code: string): Promise<string> {
  const { rows } = await client.query('SELECT id FROM roles WHERE code = $1 AND is_assignable = true', [code]);
  if (rows.length !== 1) throw new Error(`Role ${code} not found or not assignable`);
  return rows[0].id;
}

async function resolvePlace(client: PgClient, slug: string): Promise<string> {
  const { rows } = await client.query('SELECT id FROM places WHERE slug = $1', [slug]);
  if (rows.length !== 1) throw new Error(`Place ${slug} not found`);
  return rows[0].id;
}

async function plan(client: PgClient): Promise<ResolvedTarget[]> {
  const user = await resolveUser(client, TARGET_EMAIL);
  const resolved: ResolvedTarget[] = [];
  for (const t of TARGETS) {
    const roleId = await resolveRole(client, t.roleCode);
    const businessId = t.placeSlug ? await resolvePlace(client, t.placeSlug) : null;
    const { rows } = await client.query(
      `SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND business_id ${businessId ? '= $3' : 'IS NULL'} AND revoked_at IS NULL`,
      businessId ? [user.id, roleId, businessId] : [user.id, roleId],
    );
    resolved.push({
      ...t,
      userId: user.id,
      roleId,
      businessId,
      alreadyActive: rows.length > 0,
      existingGrantId: rows[0]?.id ?? null,
    });
  }
  return resolved;
}

async function insertAudit(
  client: PgClient,
  event: string,
  actorId: string,
  entityId: string,
  context: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (event, actor_id, permission, entity_type, entity_id, result, context)
     VALUES ($1, $2, $3, 'user', $4, 'success', $5)`,
    [event, actorId, 'Role.Assign', entityId, JSON.stringify(context)],
  );
}

async function executeGrant(client: PgClient, resolved: ResolvedTarget[], logger: Logger): Promise<string[]> {
  const missing = resolved.filter((r) => !r.alreadyActive);
  if (missing.length === 0) {
    logger.log('SKIPPED -- all targets already active, nothing to grant');
    return [];
  }
  const created: string[] = [];
  try {
    for (const t of missing) {
      // BEGIN/COMMIT per grant: the user_roles row and its audit row must land together or not at
      // all -- two unwrapped statements would let an audit-insert failure leave an unaudited grant
      // active (caught exactly this way against the throwaway DB before this script ever touched
      // production: a wrong enum literal failed the audit insert while the user_roles row from the
      // SAME iteration had already committed on its own).
      await client.query('BEGIN');
      try {
        const { rows } = await client.query(
          `INSERT INTO user_roles (user_id, role_id, scope_type, business_id, granted_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [t.userId, t.roleId, t.scopeType, t.businessId, t.userId],
        );
        const grantId = rows[0].id;
        await insertAudit(client, 'role.assigned', t.userId, t.userId, {
          role_code: t.roleCode,
          scope_type: t.scopeType,
          business_id: t.businessId,
          user_role_id: grantId,
          task: 'hotel-media-publish-2026-09-15',
        });
        await client.query('COMMIT');
        created.push(grantId);
        logger.log(`GRANTED ${t.roleCode} scope=${t.scopeType} business=${t.businessId ?? 'global'} -> id=${grantId}`);
      } catch (itemErr) {
        await client.query('ROLLBACK');
        throw itemErr;
      }
    }
    return created;
  } catch (err) {
    // Fail-closed for the OUTER loop: if an earlier item's transaction already committed and a
    // LATER item then fails, revoke exactly the ones that committed -- `created` only ever holds
    // ids whose insert+audit pair both landed, so this is now accurate (see per-item transaction
    // above).
    logger.error(`Grant failed partway (${created.length}/${missing.length} committed) -- rolling back via revoke`, err as Error);
    if (created.length > 0) await executeRevoke(client, created, logger, 'role.assign_rollback');
    throw err;
  }
}

async function executeRevoke(client: PgClient, grantIds: string[], logger: Logger, event = 'role.revoked'): Promise<void> {
  // Whole batch is one transaction: an incident revoke must be all-or-nothing across the exact
  // set of ids given -- a partial revoke (some ids down, some still active) is worse than either
  // extreme here, since it leaves the caller unsure which permissions are actually still live.
  await client.query('BEGIN');
  let revokedUserIds: string[];
  try {
    revokedUserIds = await executeRevokeInTransaction(client, grantIds, logger, event);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  // CORRECTED (2026-09-16, verified directly against the deployed auth code, not assumed):
  // PermissionsGuard (apps/api/src/modules/authz/guards/permissions.guard.ts) builds a BRAND-NEW
  // RequestScopedGrantCache on every single canActivate() call and always re-queries
  // UserRolesRepository.getScopedGrants() from Postgres -- there is no cross-request cache, and
  // TokenService.sign() (apps/api/src/modules/auth/token.service.ts:146) proves the access-token
  // payload is exactly `{ sub, email, type: 'access' }` -- no roles/permissions claim exists to go
  // stale. A soft-revoked user_roles row is therefore ALREADY effective on the target user's VERY
  // NEXT request, with or without touching Redis -- permission revocation is not gated by JWT
  // expiry, contrary to what an earlier version of this comment assumed without checking.
  //
  // What the Redis call below actually does is a DIFFERENT thing: AuthRevocationService (the H-1
  // mechanism, apps/api/src/core/auth-revocation/auth-revocation.service.ts) invalidates the
  // user's SESSION/AUTHENTICATION itself -- JwtAuthGuard rejects their existing, still validly-
  // signed, unexpired token with 401 on their very next request, forcing re-login. That is a
  // materially different guarantee from "the permission is gone" (which was already true). We
  // still call it here, matching UsersService.revokeRole()'s behavior for every other role change
  // in the system, purely for consistency/defense-in-depth (e.g. it also clears any UI state a
  // frontend may have cached from a stale /users/me response) -- NOT because it is required for
  // this revoke to take effect. Runs AFTER the DB commit (never before); on failure THROWS rather
  // than swallowing, matching AuthRevocationService.revokeAllForUser()'s own contract, so a failed
  // session-kill is visible to the operator rather than silently skipped.
  if (revokedUserIds.length > 0) {
    await revokeTokensForUsers(revokedUserIds, logger);
  }
}

async function executeRevokeInTransaction(client: PgClient, grantIds: string[], logger: Logger, event: string): Promise<string[]> {
  const revokedUserIds: string[] = [];
  for (const id of grantIds) {
    const { rows } = await client.query(
      `UPDATE user_roles SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING user_id`,
      [id],
    );
    if (rows.length === 0) {
      logger.warn(`SKIPPED revoke for ${id} -- already revoked or not found (idempotent)`);
      continue;
    }
    await insertAudit(client, event, rows[0].user_id, rows[0].user_id, { user_role_id: id, task: 'hotel-media-publish-2026-09-15' });
    logger.log(`REVOKED user_role id=${id}`);
    revokedUserIds.push(rows[0].user_id);
  }
  return revokedUserIds;
}

// Replicates AuthRevocationService.revokeAllForUser()'s EXACT key format (`authrev:<userId>`) and
// TTL source (`JWT_ACCESS_TTL` env var, default 900s, same default as configuration.ts's
// `jwt.accessTtl`) -- deliberately the SAME contract, not a reimplementation with different
// semantics, so a revoked grant here behaves identically to one revoked through the real API path.
async function revokeTokensForUsers(userIds: string[], logger: Logger): Promise<void> {
  const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const revokedAtSec = Math.floor(Date.now() / 1000);
    const uniqueUserIds = [...new Set(userIds)];
    for (const userId of uniqueUserIds) {
      await redis.set(`authrev:${userId}`, String(revokedAtSec), 'EX', accessTtl);
      logger.log(`REVOKED access tokens for user_id=${userId} (mốc ${revokedAtSec})`);
    }
  } finally {
    await redis.quit();
  }
}

async function main(): Promise<void> {
  const logger = new Logger('GrantHotelMediaTaskPermissions');
  const mode = process.argv[2];
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    if (mode === 'plan') {
      const resolved = await plan(client);
      logger.log(JSON.stringify(resolved, null, 2));
    } else if (mode === 'grant') {
      const resolved = await plan(client);
      const created = await executeGrant(client, resolved, logger);
      logger.log(`Created grant IDs: ${JSON.stringify(created)}`);
    } else if (mode === 'revoke') {
      const ids = process.argv.slice(3);
      if (ids.length === 0) throw new Error('revoke requires one or more user_role ids as arguments');
      await executeRevoke(client, ids, logger);
    } else {
      throw new Error('Usage: plan | grant | revoke <id...>');
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}
