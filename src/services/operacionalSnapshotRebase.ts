type Snapshot = Record<string, unknown>;
type MergeResult = { ok: true; snapshot: Snapshot } | { ok: false; conflicts: string[] };

function record(value: unknown): value is Snapshot {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Snapshots are JSON; object property order does not indicate a change. */
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  }
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function indexRows(rows: unknown[]): Map<string, Snapshot> | null {
  const indexed = new Map<string, Snapshot>();
  for (const row of rows) {
    if (!record(row) || typeof row.id !== "string" || !row.id || indexed.has(row.id)) return null;
    indexed.set(row.id, row);
  }
  return indexed;
}

/**
 * Rebase a change made against an explicit baseline onto the current snapshot.
 * Only collections whose identities are known to be unique can merge by row.
 * A conflict on any row rejects the entire change.
 */
export function rebaseOperacionalSnapshot(
  base: Snapshot,
  incoming: Snapshot,
  current: Snapshot,
  rowCollections: ReadonlySet<string>
): MergeResult {
  // A newer reset is a boundary, even if the edited row did not exist before.
  if (!equal(base.operationalResetVersion, current.operationalResetVersion)) {
    return { ok: false, conflicts: ["operationalResetVersion"] };
  }
  const conflicts: string[] = [];
  const fields = new Set([...Object.keys(current), ...Object.keys(base), ...Object.keys(incoming)]);
  const entries: [string, unknown][] = [];
  for (const field of fields) {
    const before = Object.hasOwn(base, field) ? base[field] : undefined;
    const desired = Object.hasOwn(incoming, field) ? incoming[field] : undefined;
    const remote = Object.hasOwn(current, field) ? current[field] : undefined;
    // updatedAt is assigned by the writer after the rebase.
    if (field === "updatedAt" || equal(before, desired) || equal(remote, desired)) {
      if (remote !== undefined) entries.push([field, remote]);
      continue;
    }
    if (equal(before, remote)) {
      if (desired !== undefined) entries.push([field, desired]);
      continue;
    }
    if (!rowCollections.has(field) || !Array.isArray(before) ||
        !Array.isArray(desired) || !Array.isArray(remote)) {
      conflicts.push(field);
      continue;
    }
    const oldRows = indexRows(before);
    const edits = indexRows(desired);
    const currentRows = indexRows(remote);
    if (!oldRows || !edits || !currentRows) {
      conflicts.push(field);
      continue;
    }
    for (const id of new Set([...oldRows.keys(), ...edits.keys()])) {
      const oldRow = oldRows.get(id);
      const edited = edits.get(id);
      const currentRow = currentRows.get(id);
      if (equal(oldRow, edited) || equal(edited, currentRow)) continue;
      if (!equal(oldRow, currentRow)) {
        conflicts.push(`${field}:${id}`);
      } else if (edited) {
        currentRows.set(id, edited);
      } else {
        currentRows.delete(id);
      }
    }
    entries.push([field, [...currentRows.values()]]);
  }
  return conflicts.length ? { ok: false, conflicts } : { ok: true, snapshot: Object.fromEntries(entries) };
}
