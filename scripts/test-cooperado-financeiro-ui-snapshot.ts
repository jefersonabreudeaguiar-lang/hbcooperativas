/**
 * PASSO 25 — CooperadoFinanceiroUiSnapshot (read-only, determinístico).
 * Uso: npm run test:cooperado-financeiro-ui-snapshot
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { buildCooperadoFinanceiroUiSnapshot } from "../src/services/cooperadoFinanceiroUiSnapshot";
import { getValorQuantoVouReceberMotorLegado } from "../src/services/cooperadoEntregasService";

const COOP = "coop-p25";
const COOP_WRONG = "coop-other";
const COOPERADO = "c_p25";
const MES = "2026-09";

function withBicOfficial<T>(fn: () => T): T {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
  return fn();
}

function withBicOff<T>(fn: () => T): T {
  delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL;
  delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL;
  delete process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK;
  delete process.env.HB_BIC_LAB_B4_AUTHORITY;
  delete process.env.HB_BIC_LAB_ENABLED;
  delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ;
  return fn();
}

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "P25",
        cpfCnpj: "1",
        telefone: "",
        endereco: "",
        comunidade: "",
        chavePix: "x",
        pixValido: true,
        ativo: true,
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    descontos: [],
    comunicados: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
    ...overrides,
  } as AppData;
}

const results: { name: string; ok: boolean }[] = [];

function run(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.error(`FAIL — ${name}`, e);
    throw e;
  }
}

// TESTE A — BIC ON + dado válido
run("TESTE A — BIC ON + dado válido", () => {
  withBicOfficial(() => {
    const data = base({
      fichaCorrida: [
        {
          id: "f1",
          cooperadoId: COOPERADO,
          cooperativaId: COOP,
          mesReferencia: MES,
          valorLiquido: 200,
          valorBruto: 200,
          valorDesconto: 0,
          status: "pendente",
          descricao: "Entrega",
        },
      ],
    });
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
      opts: { dataReady: true },
    });
    assert.equal(snap.status, "CONFIRMADO");
    assert.equal(snap.autoridade, "BIC");
    assert.equal(snap.bicAuthoritative, true);
    assert.equal(snap.valorAReceber, 200);
    assert.equal(snap.podeAssinarRecibo, false);
    assert.equal(snap.podeExibirBannerRecibo, false);
    assert.equal(snap.observability.source, "bic");
    assert.equal(snap.observability.fallback, false);
  });
});

// TESTE B — BIC ON + BIC aguardando (sem AppData)
run("TESTE B — BIC ON + aguardando BIC", () => {
  withBicOfficial(() => {
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data: null,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
    });
    assert.equal(snap.status, "AGUARDANDO_BIC");
    assert.equal(snap.valorAReceber, 0);
    assert.equal(snap.podeAssinarRecibo, false);
    assert.equal(snap.painelValorDestaque, 0);
  });
});

// TESTE C — tenant inválido (cooperado em outra coop)
run("TESTE C — BIC ON + tenant inválido", () => {
  withBicOfficial(() => {
    const data = base({
      fichaCorrida: [
        {
          id: "f1",
          cooperadoId: COOPERADO,
          cooperativaId: COOP,
          mesReferencia: MES,
          valorLiquido: 999,
          valorBruto: 999,
          valorDesconto: 0,
          status: "pendente",
          descricao: "Não deve vazar",
        },
      ],
    });
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId: COOPERADO,
      cooperativaId: COOP_WRONG,
      opts: { dataReady: true },
    });
    assert.equal(snap.status, "INCONSISTENTE");
    assert.equal(snap.valorAReceber, 0);
    assert.equal(snap.observability.fallback, true);
    assert.equal(snap.observability.fallbackReason, "invalid_tenant_mismatch");
    assert.notEqual(snap.valorAReceber, 999);
  });
});

// TESTE D — BIC OFF legado
run("TESTE D — BIC OFF legado", () => {
  withBicOff(() => {
    const data = base({
      pagamentosCooperado: [
        {
          id: "pg1",
          cooperadoId: COOPERADO,
          cooperativaId: COOP,
          mesReferencia: MES,
          valorLiquido: 77,
          status: "aguardando_confirmacao",
          mesesReferencia: [MES],
        },
      ],
    });
    const legado = getValorQuantoVouReceberMotorLegado(data, COOPERADO, COOP);
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
    });
    assert.equal(snap.status, "LEGADO");
    assert.equal(snap.autoridade, "LEGADO");
    assert.equal(snap.bicAuthoritative, false);
    assert.equal(snap.observability.source, "legacy");
    assert.equal(snap.podeAssinarRecibo, legado.aguardandoAssinatura && legado.valorRecibo > 0);
  });
});

// TESTE E — contaminação recibo legado com BIC ON
run("TESTE E — recibo legado não atravessa snapshot BIC", () => {
  withBicOfficial(() => {
    const data = base({
      pagamentosCooperado: [
        {
          id: "pg1",
          cooperadoId: COOPERADO,
          cooperativaId: COOP,
          mesReferencia: MES,
          valorLiquido: 123.42,
          status: "aguardando_confirmacao",
          mesesReferencia: [MES],
        },
      ],
    });
    const legado = getValorQuantoVouReceberMotorLegado(data, COOPERADO, COOP);
    assert.ok(legado.valorRecibo > 0 || legado.aguardandoAssinatura, "motor legado ainda vê recibo");
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
      opts: { dataReady: true },
    });
    assert.equal(snap.status, "CONFIRMADO");
    assert.equal(snap.autoridade, "BIC");
    assert.equal(snap.podeAssinarRecibo, false);
    assert.equal(snap.podeExibirBannerRecibo, false);
    assert.equal(snap.valorAReceber, 0);
    assert.notEqual(snap.valorAReceber, legado.valorRecibo);
  });
});

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("CooperadoFinanceiroUiSnapshot: OK (5/5)");
}
