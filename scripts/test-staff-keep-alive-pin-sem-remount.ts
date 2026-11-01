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
assert.ok(keepAlive.includes('mode={active ? "visible" : "hidden"}'), "Activity preserva DOM e pausa efeitos da aba oculta");
assert.ok(keepAlive.includes("<RetainedPanel key={href}"), "identidade do painel independe da posição no cache");

const session = read("src/lib/staff/staffResponsavelMountPullSession.ts");
assert.ok(session.includes("staffResponsavelMountPullJaFeito"));

const notas = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.ok(notas.includes("staffResponsavelMountPullJaFeito"));

console.log("OK test-staff-keep-alive-pin-sem-remount");
