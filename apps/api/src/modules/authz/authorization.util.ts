// Logic thuần (không phụ thuộc DB) để khớp permission — dễ unit-test.
// Quy ước: Module.Action[.Scope]; wildcard `*` (toàn cục) và `Module.*` (theo module).
// Scope: Any ⊃ Managed ⊃ Own (security.md §5.4). Explicit deny thắng allow.

type Scope = 'own' | 'managed' | 'any';
const SCOPE_RANK: Record<Scope, number> = { own: 1, managed: 2, any: 3 };

interface ParsedPerm {
  base: string; // Module.Action
  scope?: Scope;
}

function parsePerm(code: string): ParsedPerm {
  const parts = code.split('.');
  const last = parts[parts.length - 1].toLowerCase();
  if (last === 'own' || last === 'managed' || last === 'any') {
    return { base: parts.slice(0, -1).join('.'), scope: last as Scope };
  }
  return { base: code };
}

/** Một permission được cấp có thỏa mãn permission yêu cầu không? */
export function grantSatisfies(granted: string, required: string): boolean {
  if (granted === '*') {
    return true;
  }
  if (granted.endsWith('.*')) {
    const grantedModule = granted.slice(0, -2); // 'Place.*' → 'Place'
    const requiredModule = required.split('.')[0];
    return grantedModule === requiredModule;
  }
  const g = parsePerm(granted);
  const r = parsePerm(required);
  if (g.base !== r.base) {
    return false;
  }
  if (!r.scope) {
    return true; // yêu cầu không kèm scope → mọi cấp scope đều thỏa
  }
  // Grant không kèm scope coi như áp mọi tài nguyên (rank Any).
  const grantedRank = g.scope ? SCOPE_RANK[g.scope] : SCOPE_RANK.any;
  return grantedRank >= SCOPE_RANK[r.scope];
}

/** Deny-by-default: deny thắng; phải có ít nhất một allow khớp. */
export function isAllowed(allow: string[], deny: string[], required: string): boolean {
  if (deny.some((d) => grantSatisfies(d, required))) {
    return false;
  }
  return allow.some((a) => grantSatisfies(a, required));
}
