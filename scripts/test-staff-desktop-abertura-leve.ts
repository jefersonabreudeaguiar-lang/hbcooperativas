/**
 * PC gestão — abertura sem financeiro_delta forçado.
 * npx tsx scripts/test-staff-desktop-abertura-leve.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { staffResponsavelOpeningSyncRequest } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(read("src/lib/staff/staffResponsavelSyncPolicy.ts").includes("staffGestaoEmViewportDesktop"));
assert.ok(read("src/lib/staff/staffGestaoModoDesktop.ts").includes("staffGestaoAberturaSyncDelayMs"));
assert.equal(staffResponsavelOpeningSyncRequest(emptyInitialData).tier, "financeiro_delta");

console.log("OK test-staff-desktop-abertura-leve");
