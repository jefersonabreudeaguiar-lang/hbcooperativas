/**
 * Concerto BIC Movimento I — porta, gating e paridade com o core.
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import {
  isBicLeituraPortaAtiva,
  isBicLeituraPortaGlobalEnabled,
  listBicLeituraPortaSuperficiesAtivas,
} from "../src/lib/bic/bicLeituraPortaGating.ts";
import {
  leituraCooperadoFinanceira,
  resolveLeituraFinanceiraCooperadoCore,
} from "../src/lib/bic/bicLeituraPorta.ts";
import { cooperadoLeituraFinanceiraExibicao } from "../src/lib/cooperado/cooperadoLeituraFinanceiraExibicao.ts";
import { isBicCentralReadAuthorityEnabled } from "../src/lib/bic/bicCentralReadAuthority.ts";

const COOP = "coop-porta";
const COOPERADO = "c-porta";
const MES = "2026-09";

function envBase(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL: "true",
    NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK: "true",
    NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE: "false",
    NEXT_PUBLIC_BIC_LEITURA_PORTA: "true",
  };
}

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Test",
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

function withEnv(patch: Record<string, string>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    process.env[k] = patch[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

withEnv(
  { ...envBase(), NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO: "false" },
  () => {
    assert.equal(isBicCentralReadAuthorityEnabled(), true);
    assert.equal(isBicLeituraPortaGlobalEnabled(), true);
    assert.equal(isBicLeituraPortaAtiva("cooperado"), false);
    assert.deepEqual(listBicLeituraPortaSuperficiesAtivas(), []);
  }
);

withEnv(
  { ...envBase(), NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO: "true" },
  () => {
    assert.equal(isBicLeituraPortaAtiva("cooperado"), true);
    assert.ok(listBicLeituraPortaSuperficiesAtivas().includes("cooperado"));
  }
);

withEnv({ ...envBase(), NEXT_PUBLIC_BIC_LEITURA_PORTA: "false" }, () => {
  assert.equal(isBicLeituraPortaGlobalEnabled(), false);
  assert.equal(isBicLeituraPortaAtiva("cooperado"), false);
});

const dataFicha = base({
  fichaCorrida: [
    {
      id: "f1",
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
      mesReferencia: MES,
      valorLiquido: 240,
      valorBruto: 240,
      valorDesconto: 0,
      status: "pendente",
      descricao: "Entrega",
    },
  ],
});

function assertSameParidade(
  a: ReturnType<typeof resolveLeituraFinanceiraCooperadoCore>,
  b: ReturnType<typeof resolveLeituraFinanceiraCooperadoCore>,
  label: string
): void {
  assert.equal(a.valorLiquido, b.valorLiquido, `${label}: valorLiquido`);
  assert.deepEqual(a.mesesResumo, b.mesesResumo, `${label}: mesesResumo`);
}

withEnv({ ...envBase(), NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO: "false" }, () => {
  const core = resolveLeituraFinanceiraCooperadoCore(dataFicha, COOPERADO, COOP);
  const entrada = cooperadoLeituraFinanceiraExibicao(dataFicha, COOPERADO, COOP);
  assertSameParidade(core, entrada, "flag off");
  assert.ok(core.valorLiquido >= 240 - 0.01);
});

withEnv({ ...envBase(), NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO: "true" }, () => {
  const core = resolveLeituraFinanceiraCooperadoCore(dataFicha, COOPERADO, COOP);
  const porta = leituraCooperadoFinanceira(dataFicha, COOPERADO, COOP);
  const entrada = cooperadoLeituraFinanceiraExibicao(dataFicha, COOPERADO, COOP);
  assert.equal(porta.meta.viaPorta, true);
  assertSameParidade(core, porta.value, "porta vs core");
  assertSameParidade(core, entrada, "entrada vs core");
});

console.log("OK test-bic-leitura-porta");
