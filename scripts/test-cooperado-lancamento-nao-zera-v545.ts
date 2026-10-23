/**
 * Contrato v545 — lançamento novo no mesmo mês de um PIX aguardando não some.
 * npx tsx scripts/test-cooperado-lancamento-nao-zera-v545.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData } from "../src/types/index.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";
import { getPagamentoAguardandoCooperado } from "../src/services/notaPedidoService.ts";
import { cooperadoApresentacaoFinanceiraConsolidada } from "../src/lib/cooperadoApresentacaoFinanceira.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const watch = readFileSync(join(ROOT, "src/hooks/useCooperadoStaffRevisionWatch.ts"), "utf8");
const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
const quitada = readFileSync(join(ROOT, "src/services/notaPedidoService.ts"), "utf8");

assert.doesNotMatch(watch, /setInterval\(\(\) => void checkHint\(\)/);
assert.match(provider, /chainQueuedRefresh/);
assert.match(quitada, /PIX com ficha\/nota explícitas não quita lançamento novo/);

assert.equal(
  cooperadoApresentacaoFinanceiraConsolidada({
    role: "cooperado",
    syncing: true,
    cooperadoPagamentosHydrated: false,
    exibirComDadosLocais: true,
    dadosFinanceirosConsistentes: false,
  }),
  true,
  "dados locais vencem inconsistência durante sync"
);

const COOP = "coop-v545";
const CID = "c_v545";
const MES = "2026-09";

const data = {
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
  cooperados: [
    {
      id: CID,
      cooperativaId: COOP,
      nomeCompleto: "Cooperado",
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
  notasPedido: [
    {
      id: "np_old",
      cooperativaId: COOP,
      cooperadoId: CID,
      instituicaoId: "i",
      numeroNota: "1",
      dataEntrega: MES,
      localEntrega: "L",
      itens: [],
      valorBruto: 233,
      percentualDescontoCooperativa: 0,
      valorDesconto: 0,
      valorLiquido: 233,
      status: "pago",
      mesReferencia: MES,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "np_new",
      cooperativaId: COOP,
      cooperadoId: CID,
      instituicaoId: "i",
      numeroNota: "2",
      dataEntrega: MES,
      localEntrega: "L",
      itens: [],
      valorBruto: 237.6,
      percentualDescontoCooperativa: 0,
      valorDesconto: 11.88,
      valorLiquido: 225.72,
      status: "conferida",
      mesReferencia: MES,
      createdAt: "",
      updatedAt: "",
    },
  ],
  fichaCorrida: [
    {
      id: "fc_old",
      cooperativaId: COOP,
      cooperadoId: CID,
      notaPedidoId: "np_old",
      descricao: "",
      valorBruto: 233,
      descontos: 0,
      valorLiquido: 233,
      saldoAcumulado: 0,
      mesReferencia: MES,
      status: "pago",
      dataLancamento: MES,
      createdAt: "",
    },
    {
      id: "fc_new",
      cooperativaId: COOP,
      cooperadoId: CID,
      notaPedidoId: "np_new",
      descricao: "",
      valorBruto: 237.6,
      descontos: 11.88,
      valorLiquido: 225.72,
      saldoAcumulado: 0,
      mesReferencia: MES,
      status: "pendente",
      dataLancamento: MES,
      createdAt: "",
    },
  ],
  pagamentosCooperado: [
    {
      id: "pg_old",
      cooperativaId: COOP,
      cooperadoId: CID,
      mesReferencia: MES,
      mesesReferencia: [MES],
      valorBruto: 245.6,
      descontoCooperativa: 12.28,
      descontosExtras: [],
      valorLiquido: 123.42,
      fichaIds: ["fc_old"],
      notaPedidoIds: ["np_old"],
      status: "aguardando_confirmacao",
      pagoPor: "R",
      pagoEm: MES,
      createdAt: MES,
    },
  ],
  arquivosMensais: [],
  mensalidades: [],
  descontos: [],
  comunicados: [],
  config: { descontoPadraoCooperativa: 5 },
  auditLog: [],
} as AppData;

const bruto = getValorQuantoVouReceber(data, CID, COOP);
assert.equal(bruto.valor, 225.72, "lançamento novo aparece mesmo com PIX antigo no mês");
assert.equal(getPagamentoAguardandoCooperado(data, CID, MES), undefined);

console.log("OK test-cooperado-lancamento-nao-zera-v545");
