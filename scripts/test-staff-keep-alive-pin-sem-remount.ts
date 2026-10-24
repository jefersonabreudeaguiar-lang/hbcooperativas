/**
 * Keep-alive gestão — abas pinadas não desmontam (evita tela branca / 2º pull na Conferir).
 * npx tsx scripts/test-staff-keep-alive-pin-sem-remount.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const keepAlive = read("src/components/performance/StaffMobileTabKeepAlive.tsx");
assert.ok(!keepAlive.includes("isStaffHeavyTab(active)"), "não desmonta aba pesada única");

const session = read("src/lib/staff/staffResponsavelMountPullSession.ts");
assert.ok(session.includes("staffResponsavelMountPullJaFeito"));

const notas = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.ok(notas.includes("staffResponsavelMountPullJaFeito"));

console.log("OK test-staff-keep-alive-pin-sem-remount");
