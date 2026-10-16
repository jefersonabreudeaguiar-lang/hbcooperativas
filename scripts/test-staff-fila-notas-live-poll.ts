/**
 * Poll rápido da fila Conferir (fotos do cooperado → responsável).
 * npx tsx scripts/test-staff-fila-notas-live-poll.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStaffFilaNotasLivePollEnabled,
  resolveStaffNotasPollIntervalMs,
  resolveStaffNotasPullMinIntervalMs,
} from "../src/lib/performance/staffFilaNotasLivePoll";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const staff = readFileSync(
  join(ROOT, "src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx"),
  "utf8"
);
const cloud = readFileSync(join(ROOT, "src/services/notaPedidoCloudService.ts"), "utf8");
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
assert(staff.includes("staffFilaNotasLivePoll"), "Staff notas usa política live poll");
assert(staff.includes("mostrarFilaResponsavelConteudo"), "poll notas só na vista Conferir");
assert(staff.includes("refreshStaffFilaNotasFromUploadProgress"), "Staff poll uploadProgress");
assert(cloud.includes("refreshStaffFilaNotasFromUploadProgress"), "cloud service exporta refresh leve");
assert(hbPanel.includes("useStaffConferenciaModalOpen"), "painel PIX pausa durante Conferir");
assert(hbPanel.includes("isStaffConferenciaModalOpen"), "sync HB não grava AppData na Conferir");

console.log("test-staff-fila-notas-live-poll.ts done.");
