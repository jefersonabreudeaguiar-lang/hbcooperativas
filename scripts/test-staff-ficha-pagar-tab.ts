/**
 * Pagar cooperados (responsável) — paridade com o contrato travado.
 * npx tsx scripts/test-staff-ficha-pagar-tab.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const ficha = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");
const contrato = readFileSync(
  join(ROOT, "src/lib/responsavel/responsavelPagarCooperadosContrato.ts"),
  "utf8"
);
const lastGood = readFileSync(join(ROOT, "src/lib/responsavel/abaLastGoodCheckpoint.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(
  contrato.includes('RESPONSAVEL_PAGAR_COOPERADOS_ABA_PADRAO = "pagar"') &&
    contrato.includes("abaInicialPagarCooperadosResponsavel"),
  "contrato: menu Pagar cooperados abre na aba Pagar"
);
assert(
  ficha.includes("abaInicialPagarCooperadosResponsavel") &&
    ficha.includes("RESPONSAVEL_PAGAR_COOPERADOS_TITULO"),
  "UI usa o contrato da aba Pagar"
);
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
  "HB pilot: mesAtivo staff"
);
assert(!ficha.includes("mesHbSyncPilot"), "sem mesHbSyncPilot");
assert(
  /: \(financeiroAberto\?\.valorLiquido \?\? 0\);/.test(ficha),
  "totalPendente staff via financeiroAberto"
);
assert(
  !ficha.includes('requestSyncTier("financeiro_delta"'),
  "Pagar cooperados não puxa operacional ao abrir"
);
assert(
  ficha.includes("tryReaplicarPagarLastGoodSeRegrediuInStore") &&
    ficha.includes("peekStaffGestaoLastGood") &&
    lastGood.includes("fichaPendenteAPagar"),
  "lastro: não apaga a fila a pagar nem zera a tela"
);

console.log("test-staff-ficha-pagar-tab.ts done.");
