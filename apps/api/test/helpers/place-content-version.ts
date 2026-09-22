import { DataSource } from 'typeorm';

// CAS (AddPlaceContentVersion, 2026-09-22) — `PATCH /places/:id` now REQUIRES
// `expected_content_version` in the body (see UpdatePlaceDto). e2e specs that PATCH the same
// place more than once across `it()` blocks can't hardcode a version number: each successful
// write bumps it by 1, and test execution order (and which OTHER spec in the same describe
// already wrote to that place) determines the current value. Reading it fresh from the DB right
// before each PATCH is the one approach that's correct regardless of ordering.
export async function currentPlaceContentVersion(ds: DataSource, placeId: string): Promise<number> {
  const rows: Array<{ content_version: number }> = await ds.query(
    `SELECT content_version FROM places WHERE id = $1`,
    [placeId],
  );
  if (!rows[0]) {
    throw new Error(`currentPlaceContentVersion: place ${placeId} not found`);
  }
  return rows[0].content_version;
}
