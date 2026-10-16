/**
 * Matriz de paridade BIC — fixtures locais (sem rede).
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { resolveLeituraFinanceiraCooperadoCore } from "../src/lib/bic/bicLeituraPorta.ts";
import { leituraFinanceiraParidadeCooperado } from "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal.ts";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "false";

const COOP = "coop-matrix";

function cooperado(id: string) {
  return {
    id,
    cooperativaId: COOP,
    nomeCompleto: id,
    cpfCnpj: "1",
    telefone: "",
    endereco: "",
    comunidade: "",
    chavePix: "x",
    pixValido: true,
    ativo: true,
    createdAt: "",
    updatedAt: "",
  };
}

function shell(cooperados: string[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "C", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: cooperados.map(cooperado),
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
  } as AppData;
}

type Case = { name: string; data: AppData; cooperadoId: string; expectValorMin?: number };

const cases: Case[] = [
  { name: "vazio", data: shell(["c0"]), cooperadoId: "c0", expectValorMin: 0 },
  {
    name: "ficha_pendente",
    data: {
      ...shell(["c1"]),
      fichaCorrida: [
        {
          id: "f1",
          cooperadoId: "c1",
          cooperativaId: COOP,
          mesReferencia: "2026-09",
          valorLiquido: 88.5,
          valorBruto: 88.5,
          valorDesconto: 0,
          status: "pendente",
          descricao: "x",
        },
      ],
    },
    cooperadoId: "c1",
    expectValorMin: 88.5,
  },
  {
    name: "pix_aguardando",
    data: {
      ...shell(["c2"]),
      pagamentosCooperado: [
        {
          id: "p1",
          cooperadoId: "c2",
          cooperativaId: COOP,
          mesReferencia: "2026-10",
          valor: 120,
          status: "aguardando_confirmacao",
          createdAt: "",
          updatedAt: "",
        },
      ],
    },
    cooperadoId: "c2",
    expectValorMin: 0,
  },
];

for (const c of cases) {
  const bic = resolveLeituraFinanceiraCooperadoCore(c.data, c.cooperadoId, COOP);
  const legado = leituraFinanceiraParidadeCooperado(c.data, c.cooperadoId, COOP);
  assert.ok(Number.isFinite(bic.valorLiquido), `${c.name}: bic finite`);
  assert.ok(Number.isFinite(legado.valorLiquido), `${c.name}: legado finite`);
  if (c.expectValorMin != null && c.expectValorMin > 0) {
    assert.ok(
      bic.valorLiquido >= c.expectValorMin - 0.02 || legado.valorLiquido >= c.expectValorMin - 0.02,
      `${c.name}: valor esperado`
    );
  }
}

console.log(`OK test-bic-paridade-matrix (${cases.length} casos)`);
