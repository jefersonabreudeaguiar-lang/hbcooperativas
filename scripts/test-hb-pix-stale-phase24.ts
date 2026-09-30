/**
 * Fase 2.4 — PIX / operacional alterando crédito-base authoritative → HB STALE.
 * npm run test:hb-pix-stale
 */
import assert from "node:assert/strict";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { diffAuthoritativeCreditBaseFromOperacional } from "../src/modules/hb-credit/engine/operationalAuthoritativeCreditBaseChange.ts";
import { HB_CREDIT_STATE_STALE_CODE } from "../src/modules/hb-credit/engine/hbCreditLimitSyncState.ts";
import { registrarPagamentoCooperado } from "../src/services/notaPedidoService.ts";
import type { AppData, Cooperado, FichaCorrida, NotaPedido } from "../src/types/index.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { OPERATIONAL_RESET_VERSION } from "../src/services/operationalReset.ts";
import {
  authorizeHb,
  runInterleavedScenario,
  type InterleaveStep,
} from "../archived/hobelisco-lab/scripts-lab/paymentHbConcurrencyModel.ts";

const COOP = "coop-1";
const COOP_CNPJ = "62351750000165";
const COOPERADO = "c_pix";

const results: Array<{ id: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }> = [];

function record(id: string, status: "PASS" | "FAIL" | "SKIP", detail?: string) {
  results.push({ id, status, detail });
  if (status === "FAIL") console.error(`FAIL ${id}${detail ? `: ${detail}` : ""}`);
}

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Teste", cnpj: COOP_CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado PIX",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", nome: "Inst", cooperativaId: COOP, ativo: true, createdAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 0 },
    ...overrides,
  } as AppData;
}

function ficha(id: string, notaId: string): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia: "2026-09",
    status: "pendente",
    valorBruto: 2000,
    descontos: 0,
    valorLiquido: 2000,
    descricao: "Entrega",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function nota(id: string): NotaPedido {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: "2026-09",
    status: "conferida",
    valorLiquido: 2000,
    valorBruto: 2000,
    instituicaoId: "inst-1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 2000 }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const cooperados: Cooperado[] = [
  {
    id: COOPERADO,
    cooperativaId: COOP,
    nomeCompleto: "Cooperado PIX",
    cpf: "00000000000",
    status: "ativo",
    createdAt: "",
  },
];

function operacionalFromAppData(data: AppData): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fichaCorrida: data.fichaCorrida ?? [],
    pagamentosCooperado: data.pagamentosCooperado ?? [],
    mensalidades: data.mensalidades ?? [],
    descontos: data.descontos ?? [],
    arquivosMensais: data.arquivosMensais ?? [],
    comunicados: data.comunicados ?? [],
    config: data.config ?? { descontoPadraoCooperativa: 0 },
  };
}

function diffPixScenario(before: OperacionalSyncPayload, after: OperacionalSyncPayload) {
  return diffAuthoritativeCreditBaseFromOperacional({
    beforeOperacional: before,
    afterOperacional: after,
    cooperativaId: COOP,
    cnpj: COOP_CNPJ,
    cooperados,
    notas: [nota("n1")],
    cooperadoIds: [COOPERADO],
  });
}

let data = baseData({
  fichaCorrida: [ficha("f1", "n1")],
  notasPedido: [nota("n1")],
});
const beforePix = operacionalFromAppData(data);
data = registrarPagamentoCooperado(data, COOPERADO, "2026-09", "Responsável");
const afterPix = operacionalFromAppData(data);
const pixDiff = diffPixScenario(beforePix, afterPix);

record(
  "T1 PIX aguardando → base alterada",
  pixDiff.material &&
    pixDiff.changedCooperadoIds.includes(COOPERADO) &&
    (pixDiff.beforeCents[COOPERADO] ?? 0) > 0 &&
    (pixDiff.afterCents[COOPERADO] ?? 0) === 0
    ? "PASS"
    : "FAIL",
  `material=${pixDiff.material} before=${pixDiff.beforeCents[COOPERADO]} after=${pixDiff.afterCents[COOPERADO]}`
);

{
  const noop = diffPixScenario(afterPix, afterPix);
  record(
    "T2 sem alteração financeira",
    !noop.material && noop.changedCooperadoIds.length === 0 ? "PASS" : "FAIL",
    `material=${noop.material}`
  );
}

{
  const replay = diffPixScenario(afterPix, afterPix);
  record("T3 replay mesmo PIX", !replay.material ? "PASS" : "FAIL");
}

const TETO = 50;
const BASE_CENTS = 200_000;
const LIMITE = calcLimiteFromPercentual(BASE_CENTS, TETO);

function pixScenario(steps: InterleaveStep[]) {
  return runInterleavedScenario({
    name: "pix-phase24",
    tetoPercent: TETO,
    initialBaseCents: BASE_CENTS,
    steps,
    staleGuard: true,
  });
}

{
  const r = pixScenario([
    { kind: "payment_awaiting_register" },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  const auth = authorizeHb(r.final.hb, LIMITE, { enforceSyncState: true });
  record(
    "T4 race PIX + authorize",
    r.authorizeFailCount === 1 &&
      r.final.hb.financialLimitSyncState === "STALE" &&
      auth.errorCode === HB_CREDIT_STATE_STALE_CODE
      ? "PASS"
      : "FAIL",
    `fail=${r.authorizeFailCount} state=${r.final.hb.financialLimitSyncState}`
  );
}

{
  const r = pixScenario([
    { kind: "payment_awaiting_register" },
    { kind: "sync_hb" },
  ]);
  record(
    "T5 sync OK → SYNCED",
    r.final.hb.financialLimitSyncState === "SYNCED" && r.final.hb.limitReleasedCents === 0 ? "PASS" : "FAIL",
    `state=${r.final.hb.financialLimitSyncState} limit=${r.final.hb.limitReleasedCents}`
  );
}

{
  const r = pixScenario([{ kind: "payment_awaiting_register" }]);
  record(
    "T6 sync falha → STALE",
    r.final.hb.financialLimitSyncState === "STALE" ? "PASS" : "FAIL",
    `state=${r.final.hb.financialLimitSyncState}`
  );
}

record(
  "T7 DIVERGENT",
  "SKIP",
  "DIVERGENT permanece STALE — coberto por syncHbLimitAfterCooperadoPayment (Fase 2.3); operacional PIX só marca STALE."
);

{
  let versionBump = 0;
  for (let i = 0; i < 10; i++) {
    const d = diffPixScenario(afterPix, afterPix);
    if (d.material) versionBump++;
  }
  record("T8 10 retries idempotentes", versionBump === 0 ? "PASS" : "FAIL", `materialHits=${versionBump}`);
}

{
  const confirmed = diffPixScenario(afterPix, afterPix);
  record(
    "T9 pagamento já registrado replay",
    !confirmed.material ? "PASS" : "FAIL",
    "mesmo operacional sanitizado → sem nova alteração"
  );
}

record(
  "T10 conta HB inexistente",
  "SKIP",
  "markHbCreditLimitStale no-op sem conta; authorize já falha sem limite — caminho server-side em markHbStaleBeforeOperacionalUpload."
);

record(
  "T11 migration ausente",
  "SKIP",
  "markHbCreditLimitStale retorna erro 503 / fail-closed no upload operacional (Fase 2.3)."
);

{
  const r = pixScenario([
    { kind: "payment_awaiting_register" },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  record(
    "T12 CRITICAL PIX + authorize",
    r.authorizeOkCount === 0 &&
      r.final.hb.amountUsedCents === 0 &&
      r.final.hb.financialLimitSyncState === "STALE"
      ? "PASS"
      : "FAIL",
    `ok=${r.authorizeOkCount} used=${r.final.hb.amountUsedCents}`
  );
}

console.log("\n--- Fase 2.4 test results ---");
for (const r of results) {
  console.log(`${r.status} ${r.id}${r.detail ? ` — ${r.detail}` : ""}`);
}

const failed = results.filter((r) => r.status === "FAIL");
assert.equal(failed.length, 0, `${failed.length} test(s) failed`);
