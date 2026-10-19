/**
 * Staff F5 — responsável hidrata na hora (v505, sem defer).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cold = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/performance/cooperadoColdStart.ts"),
  "utf8"
);

assert.ok(cold.includes("isStaffGestaoRole(session.role)"));
assert.ok(cold.includes("sempre hidrata na hora"));
assert.ok(cold.includes("scheduleDeferredAppDataEagerWarm"));
assert.ok(!cold.includes("NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER"));

console.log("OK test-staff-defer-appdata-eager");
