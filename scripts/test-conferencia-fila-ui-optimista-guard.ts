/**
 * Blindagem: "Aprovar e próxima" não pode aguardar syncNuvem antes de prepararConferenciaNota.
 * npx tsx scripts/test-conferencia-fila-ui-optimista-guard.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const file = path.join(
  process.cwd(),
  "src",
  "app",
  "(app)",
  "notas-pedido",
  "NotasPedidoContent.tsx"
);
const src = fs.readFileSync(file, "utf8");

assert.ok(
  !src.includes("await syncNuvem"),
  "NotasPedidoContent não deve await syncNuvem — isso trava a fila na nuvem"
);

const enqueueIdx = src.indexOf("enqueueConferenciaAprovacaoSync(notaId");
assert.ok(enqueueIdx >= 0, "handleLancarNota deve enfileirar sync pós-aprovação");

const voidBlock = src.slice(enqueueIdx, enqueueIdx + 3500);
assert.ok(
  voidBlock.includes("void (async () => {") && voidBlock.includes("prepararConferenciaNota(proxima"),
  "bloco pós-enqueue deve avançar fila com prepararConferenciaNota"
);
assert.ok(
  !/void \(async \(\) => \{[\s\S]{0,1200}await enqueueConferenciaAprovacaoSync/.test(voidBlock) &&
    !voidBlock.includes("await syncNuvem"),
  "UI não deve await a fila de sync antes de abrir a próxima entrega"
);

console.log("test-conferencia-fila-ui-optimista-guard: OK");
