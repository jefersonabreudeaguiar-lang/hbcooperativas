/**
 * Pagar cooperados (responsável) — paridade com backup e5dbdc0c (build 404).
 * npx tsx scripts/test-staff-ficha-pagar-tab.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const ficha = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");
const backup = readFileSync(
  join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"),
  "utf8"
);

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(
  ficha.includes("cooperadoPendentePagamentoResponsavel(leitura, cooperadoFilter, undefined, coopId)") &&
    ficha.includes("cooperadoTemNotaConferidaSemPix(leitura, cooperadoFilter, coopId)"),
  "filtro cooperado: motor pendente + nota lançada sem PIX"
);
assert(
  ficha.includes("appDataParaPagarCooperadosResponsavel") &&
    ficha.includes("reconciliarFichaFromNotasConferidas(d)"),
  "Pagar reconstrói ficha das notas conferidas (lista + PIX)"
);
assert(
  ficha.includes("mesReferencia: isCooperado ? mesReferenciaHbCooperado : mesAtivo"),
  "HB pilot: mesAtivo staff (backup 404)"
);
assert(
  !ficha.includes("mesHbSyncPilot"),
  "sem mesHbSyncPilot (não estava no backup)"
);
assert(
  /: \(financeiroAberto\?\.valorLiquido \?\? 0\);/.test(ficha),
  "totalPendente staff via financeiroAberto (backup 404)"
);
assert(
  !ficha.includes('requestSyncTier("financeiro_delta"'),
  "Pagar cooperados não puxa operacional ao abrir"
);

console.log("test-staff-ficha-pagar-tab.ts done.");
