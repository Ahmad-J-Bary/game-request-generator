/**
 * Normalizes a proxy state / region name for case-insensitive comparison and
 * grouping (e.g. "florida", "Florida" and "FLORIDA" are the same region).
 * Region names in the DB are typically uppercase, but proxy_state values are
 * free text, so all matching must happen on the normalized form.
 */
export function normalizeState(value?: string | null): string {
  return (value ?? "").trim().toUpperCase();
}
