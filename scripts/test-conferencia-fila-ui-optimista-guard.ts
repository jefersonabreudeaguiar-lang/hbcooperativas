/**
 * Blindagem: "Aprovar e próxima" não pode aguardar syncNuvem antes de prepararConferenciaNota.
 * Build 155+ — sync pós-decisão via conferenciaDecisaoNuvemSync (fila enqueue interna).
 * npx tsx scripts/test-conferencia-fila-ui-optimista-guard.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const staffMain = path.join(
  ROOT,
  "src",
  "app",
  "(app)",
  "notas-pedido",
  "NotasPedidoStaffMain.tsx"
);
const nuvemSync = path.join(ROOT, "src", "services", "conferenciaDecisaoNuvemSync.ts");
const src = fs.readFileSync(staffMain, "utf8");
const syncSrc = fs.readFileSync(nuvemSync, "utf8");

assert.ok(
  !src.includes("await syncNuvem"),
  "NotasPedidoStaffMain não deve await syncNuvem — isso trava a fila na nuvem"
);

assert.ok(
  src.includes("scheduleConferenciaAprovacaoNuvemSync"),
  "handleLancarNota agenda sync pós-aprovação via conferenciaDecisaoNuvemSync"
);
assert.ok(
  syncSrc.includes("enqueueConferenciaAprovacaoSync") &&
    syncSrc.includes("void enqueue(notaId,"),
  "fila de sync pós-aprovação permanece enfileirada (não bloqueia UI)"
);

const scheduleIdx = src.indexOf("scheduleConferenciaAprovacaoNuvemSync({");
assert.ok(scheduleIdx >= 0, "bloco de aprovação chama scheduleConferenciaAprovacaoNuvemSync");

const proximaIdx = src.indexOf("void prepararConferenciaNota(proxima", scheduleIdx);
assert.ok(proximaIdx >= 0, "após gravar aprovação, avança fila com prepararConferenciaNota(proxima");

const between = src.slice(scheduleIdx, proximaIdx);
assert.ok(
  !between.includes("await scheduleConferenciaAprovacaoNuvemSync") &&
    (between.includes("requestIdleCallback(runAprovacaoCloudSync") ||
      between.includes("setTimeout(runAprovacaoCloudSync")),
  "sync nuvem não bloqueia transição para próxima nota (idle/deferred)"
);

assert.ok(
  src.includes("conferenciaModalAberta") && src.includes("bloquearAcaoFinalConferencia"),
  "aprovação com modal aberto não bloqueia por sync em background"
);

console.log("test-conferencia-fila-ui-optimista-guard: OK");
