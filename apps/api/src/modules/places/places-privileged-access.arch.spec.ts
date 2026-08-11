import { readFileSync } from 'fs';
import { join } from 'path';
import { PlacesController } from './places.controller';
import { PlacesRepository } from './repositories/places.repository';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';

/**
 * PLACE-022 / OD-B2 / F-24 — Architecture guard for privileged Place-card access.
 *
 * Invariant enforced: NO `@Public` PlacesController route may reach the privileged repository
 * method `getCardByIdIncludingInactive` (which intentionally returns inactive/non-published rows
 * — no `status` filter). The method is reserved for permission-gated moderation/write flows.
 *
 * The test is DETERMINISTIC and combines two authorities:
 *   • runtime controller metadata (`IS_PUBLIC_KEY` via reflect-metadata) — which routes are @Public;
 *   • static reachability parsed from source — controller handler → service method(s) → repo method.
 * It fails (never silently passes) if:
 *   1. the privileged method is missing/renamed without updating this guard;
 *   2. any @Public route can transitively reach the privileged method;
 *   3. any controller calls the privileged repository method directly;
 *   4. the set of service methods calling the privileged method drifts from the approved allowlist.
 */

// Single source of truth for the privileged method name. Asserted to exist below, so a future
// rename/removal breaks THIS guard rather than silently disabling it.
const PRIVILEGED_METHOD = 'getCardByIdIncludingInactive';

// Approved privileged callers (PlacesService methods). Each is wired to a permission-gated,
// non-@Public controller route (create→Place.Create, update→Place.Edit.Managed,
// archive→Place.Archive, approve→Place.Approve). Adding a caller must be a deliberate edit here.
//
// PLACE-041 (Place Content Management MVP, 2026-08-11): `listMine` added. Wired to `GET
// /places/mine` — non-@Public (JwtAuthGuard requires auth; see controller comment for why no
// static @RequirePermissions applies), and the row returned per id is only fetched for
// `business_id`s the CALLING user already holds an effective `Place.Edit.Managed` grant for
// (PlacesService.listMine, verified via the same AuthorizationService PDP the guard uses) — same
// privilege boundary as `update`, just re-derived per row instead of taken from a route param.
const APPROVED_SERVICE_CALLERS = ['archive', 'approve', 'create', 'listMine', 'update'].sort();

const PLACES_DIR = __dirname;
const serviceSrc = readFileSync(join(PLACES_DIR, 'places.service.ts'), 'utf8');
const controllerSrc = readFileSync(join(PLACES_DIR, 'places.controller.ts'), 'utf8');

// Split a class source into { methodName -> body } by locating `<name>(` declarations for the
// given known method names and slicing between consecutive declarations (source order).
function methodBodies(src: string, methodNames: string[]): Record<string, string> {
  const marks = methodNames
    .map((name) => {
      // match a method declaration: optional async, name, '(' — not a `.name(` call.
      const re = new RegExp(`(^|\\n)\\s*(async\\s+)?${name}\\s*\\(`);
      const m = re.exec(src);
      return m ? { name, index: m.index } : null;
    })
    .filter((x): x is { name: string; index: number } => x !== null)
    .sort((a, b) => a.index - b.index);
  const out: Record<string, string> = {};
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    out[marks[i].name] = src.slice(start, end);
  }
  return out;
}

// Runtime metadata: is a PlacesController handler @Public?
function isPublic(handler: string): boolean {
  const h = PlacesController.prototype[handler as keyof PlacesController] as unknown as object;
  return Reflect.getMetadata(IS_PUBLIC_KEY, h) === true;
}

const controllerHandlers = Object.getOwnPropertyNames(PlacesController.prototype).filter(
  (n) => n !== 'constructor' && typeof (PlacesController.prototype as unknown as Record<string, unknown>)[n] === 'function',
);

// Service method names = the private+public methods of PlacesService, taken from the approved
// list plus any others discovered in source (so a NEW caller is detected, not assumed away).
const serviceMethodNames = Array.from(
  new Set([...APPROVED_SERVICE_CALLERS, ...(serviceSrc.match(/(?:^|\n)\s*(?:async\s+)?([a-zA-Z_]\w*)\s*\(/g) || [])
    .map((m) => m.replace(/[^a-zA-Z0-9_ async]/g, '').trim().replace(/^async\s+/, ''))
    .filter(Boolean)]),
);
const serviceBodies = methodBodies(serviceSrc, serviceMethodNames);
const controllerBodies = methodBodies(controllerSrc, controllerHandlers);

// Which service methods call the privileged repo method (directly)?
const directPrivilegedCallers = Object.entries(serviceBodies)
  .filter(([, body]) => new RegExp(`\\.${PRIVILEGED_METHOD}\\s*\\(`).test(body))
  .map(([name]) => name)
  .sort();

// Transitive closure over intra-service calls (a service method that calls another privileged one).
function privilegedServiceMethods(): Set<string> {
  const priv = new Set(directPrivilegedCallers);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of Object.entries(serviceBodies)) {
      if (priv.has(name)) continue;
      for (const p of priv) {
        if (new RegExp(`\\.${p}\\s*\\(`).test(body)) {
          priv.add(name);
          changed = true;
          break;
        }
      }
    }
  }
  return priv;
}

// Which service methods does a controller handler call?
function serviceCallsOf(handlerBody: string): string[] {
  return [...handlerBody.matchAll(/this\.placesService\.([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]);
}

describe('PLACE-022 — privileged Place-card access is unreachable from @Public routes (F-24)', () => {
  it('privileged method exists on PlacesRepository (guard is wired to the real method)', () => {
    expect(typeof PlacesRepository.prototype[PRIVILEGED_METHOD as keyof PlacesRepository]).toBe(
      'function',
    );
  });

  it('the OLD ambiguous name `getCardById` no longer exists on the repository', () => {
    expect(
      (PlacesRepository.prototype as unknown as Record<string, unknown>)['getCardById'],
    ).toBeUndefined();
  });

  it('exactly the approved service methods call the privileged repo method', () => {
    expect(directPrivilegedCallers).toEqual(APPROVED_SERVICE_CALLERS);
  });

  it('no @Public PlacesController route can transitively reach the privileged method', () => {
    const priv = privilegedServiceMethods();
    const violations: string[] = [];
    for (const handler of controllerHandlers) {
      if (!isPublic(handler)) continue;
      const body = controllerBodies[handler] ?? '';
      for (const svc of serviceCallsOf(body)) {
        if (priv.has(svc)) {
          violations.push(`@Public route "${handler}" → placesService.${svc}() → ${PRIVILEGED_METHOD}()`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no PlacesController handler calls the privileged repository method directly', () => {
    const offenders = controllerHandlers.filter((h) =>
      new RegExp(`\\.${PRIVILEGED_METHOD}\\s*\\(`).test(controllerBodies[h] ?? ''),
    );
    expect(offenders).toEqual([]);
  });

  it('documents the approved privileged callers (self-check)', () => {
    // Every approved caller is a real service method AND is reached only by non-@Public routes.
    for (const caller of APPROVED_SERVICE_CALLERS) {
      expect(serviceBodies[caller]).toBeDefined();
      const publicReachers = controllerHandlers.filter(
        (h) => isPublic(h) && serviceCallsOf(controllerBodies[h] ?? '').includes(caller),
      );
      expect(publicReachers).toEqual([]);
    }
  });
});
