/**
 * Poll rápido da fila Conferir (fotos do cooperado → responsável).
 * npx tsx scripts/test-staff-fila-notas-live-poll.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStaffFilaNotasLivePollEnabled,
  resolveStaffFilaBackgroundCatchupMs,
  resolveStaffNotasPollIntervalMs,
  resolveStaffNotasPullMinIntervalMs,
} from "../src/lib/performance/staffFilaNotasLivePoll";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const staff = readFileSync(
  join(ROOT, "src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx"),
  "utf8"
);
const cloud = readFileSync(join(ROOT, "src/services/notaPedidoCloudService.ts"), "utf8");
const api = readFileSync(join(ROOT, "src/app/api/notas-pedido/route.ts"), "utf8");
const table = readFileSync(join(ROOT, "src/lib/supabase/notasStorage.ts"), "utf8");
const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
const hbPanel = readFileSync(join(ROOT, "src/components/payments/HbUnifiedPaymentPanel.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(isStaffFilaNotasLivePollEnabled(), "live poll default on");
assert(resolveStaffNotasPullMinIntervalMs(true) < resolveStaffNotasPullMinIntervalMs(false), "pull mais rápido na fila");
assert(resolveStaffNotasPollIntervalMs(true) < resolveStaffNotasPollIntervalMs(false), "intervalo menor na fila");
assert(resolveStaffFilaBackgroundCatchupMs(true) === 0, "na Conferir o catch-up de fundo fica desligado");
assert(resolveStaffFilaBackgroundCatchupMs(false) >= 1_500, "fora da Conferir há catch-up de fundo");
assert(staff.includes("staffFilaNotasLivePoll"), "Staff notas usa política live poll");
assert(staff.includes("syncStaffFilaConferenciaLiveFromCloud"), "Staff poll usa fila live sem watermark");
assert(staff.includes("puxarFilaLiveResponsavel"), "Staff dispara fila live ao abrir a aba");
assert(cloud.includes("syncStaffFilaConferenciaLiveFromCloud"), "cloud service exporta fila live");
assert(cloud.includes("lite=1&fila=1"), "fila live não usa since/watermark");
assert(api.includes('searchParams.get("fila") === "1"'), "API tem GET ?fila=1");
assert(table.includes("fetchFilaConferenciaFromTable"), "SQL lista a fila sem cursor");
assert(table.includes('"rascunho"'), "fila SQL inclui rascunho para payload já publicado");
assert(provider.includes("syncStaffFilaConferenciaLiveFromCloud"), "gestão puxa fila mesmo fora de Conferir");
assert(provider.includes("resolveStaffFilaBackgroundCatchupMs"), "catch-up de fundo nas outras abas");
assert(cloud.includes("refreshStaffFilaNotasFromUploadProgress"), "cloud service exporta refresh leve");
assert(hbPanel.includes("useStaffConferenciaModalOpen"), "painel PIX pausa durante Conferir");
assert(hbPanel.includes("isStaffConferenciaModalOpen"), "sync HB não grava AppData na Conferir");

console.log("test-staff-fila-notas-live-poll.ts done.");
