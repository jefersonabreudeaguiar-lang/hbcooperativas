/**
 * Compra HB já liquidada no PIX não volta no resumo — mesmo ciclo da aba Limites.
 * npx tsx scripts/test-hb-ciclo-apos-liquidacao.ts
 */
import assert from "node:assert/strict";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  coletarCicloHbLiquidado,
  compraHbPertenceCicloAberto,
  filtrarDescontosContaCoopAposLiquidacao,
} from "../src/lib/hb-credit/hbCreditCicloAposLiquidacao.ts";
import { getResumoPagamentoCooperado } from "../src/services/notaPedidoService.ts";
import { persistDescontosContaCoopNoArquivo } from "../src/services/notaPedidoService.ts";
import type { DescontoContaCoopRemoto } from "../src/lib/hb-credit/mergeFichaDescontos.ts";

const COOP = "coop-ciclo-hb";
const COOPERADO = "c_ciclo_hb";

function compra(iso: string, valor: number, id: string): DescontoContaCoopRemoto {
  return {
    motivo: `Compra HB Créditos — mercado (${id})`,
    valorReais: valor,
    tipo: "conta_coop",
    createdAt: iso,
    hbTransactionId: id,
  };
}

function pagamento(opts: {
  mes: string;
  pagoEm: string;
  extras?: PagamentoCooperadoRegistro["descontosExtras"];
}): PagamentoCooperadoRegistro {
  return {
    id: `pg-${opts.mes}`,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: opts.mes,
    valorBruto: 500,
    descontoCooperativa: 0,
    descontosExtras: opts.extras ?? [],
    valorLiquido: 450,
    fichaIds: [`f-${opts.mes}`],
    notaPedidoIds: [`n-${opts.mes}`],
    status: "confirmado",
    pagoPor: "resp",
    pagoEm: opts.pagoEm,
    createdAt: opts.pagoEm,
    updatedAt: opts.pagoEm,
  };
}

function dataBase(meses: string[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Ciclo HB",
        cpf: "000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: meses.map((mes) => ({
      id: `n-${mes}`,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "conferida",
      valorBruto: 500,
      valorLiquido: 500,
      instituicaoId: "i1",
      itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500 }],
      createdAt: `${mes}-10T00:00:00.000Z`,
      updatedAt: `${mes}-10T00:00:00.000Z`,
    })),
    fichaCorrida: meses.map((mes) => ({
      id: `f-${mes}`,
      cooperadoId: COOPERADO,
      cooperativaId: COOP,
      notaPedidoId: `n-${mes}`,
      mesReferencia: mes,
      status: mes === meses[meses.length - 1] ? "pendente" : "pago",
      valorBruto: 500,
      descontos: 0,
      valorLiquido: 500,
      descricao: "Entrega",
      createdAt: `${mes}-10T00:00:00.000Z`,
    })),
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
  } as AppData;
}

{
  const ciclo = {
    explicitTransactionIds: new Set(["tx_paga"]),
    pagamentos: [{ meses: ["2026-09"], mesMax: "2026-09", quitadoAteMs: Date.parse("2026-10-05T12:00:00.000Z") }],
  };
  assert.equal(
    compraHbPertenceCicloAberto(compra("2026-09-12T10:00:00.000Z", 40, "tx_set"), ciclo),
    false,
    "compra do mês liquidado não volta"
  );
  assert.equal(
    compraHbPertenceCicloAberto(compra("2026-09-12T10:00:00.000Z", 40, "tx_paga"), ciclo),
    false,
    "id já no PIX some"
  );
  assert.equal(
    compraHbPertenceCicloAberto(compra("2026-10-03T10:00:00.000Z", 25, "tx_antes_pix"), ciclo),
    false,
    "compra depois da ficha, mas antes do PIX, já entrou na liquidação"
  );
  assert.equal(
    compraHbPertenceCicloAberto(compra("2026-10-06T10:00:00.000Z", 30, "tx_nova"), ciclo),
    true,
    "compra depois do PIX entra no ciclo novo"
  );
  assert.equal(
    compraHbPertenceCicloAberto(compra("2026-08-12T10:00:00.000Z", 15, "tx_ago"), ciclo),
    true,
    "mês anterior ainda sem PIX continua no ciclo"
  );
}

{
  let data = dataBase(["2026-09", "2026-10"]);
  const linhas = [
    compra("2026-09-12T10:00:00.000Z", 50, "tx_set"),
    compra("2026-10-03T10:00:00.000Z", 20, "tx_antes"),
    compra("2026-10-08T10:00:00.000Z", 35, "tx_depois"),
  ];
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, "2026-09", COOP, linhas);
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, "2026-10", COOP, linhas);
  data = {
    ...data,
    pagamentosCooperado: [
      pagamento({
        mes: "2026-09",
        pagoEm: "2026-10-05T12:00:00.000Z",
        extras: [{ tipo: "conta_coop", motivo: "Compra HB Créditos — mercado (tx_set)", valor: 50 }],
      }),
    ],
  };

  const ciclo = coletarCicloHbLiquidado(data, COOPERADO, COOP);
  const vivos = filtrarDescontosContaCoopAposLiquidacao(linhas, ciclo);
  assert.deepEqual(
    vivos.map((d) => d.hbTransactionId),
    ["tx_depois"],
    "só a compra depois do PIX sobrevive"
  );

  const out = getResumoPagamentoCooperado(data, COOPERADO, "2026-10", COOP);
  assert.equal(out.valorEntregas, 500);
  assert.equal(out.valorLiquido, 465, "resumo de outubro desconta só a compra nova");
  assert.equal(
    out.descontosExtras.some((d) => d.motivo.includes("tx_set") || d.valor === 50),
    false,
    "compra de setembro não reaparece"
  );
  assert.equal(
    out.descontosExtras.some((d) => d.motivo.includes("tx_depois") && d.valor === 35),
    true,
    "compra atualizada aparece — mesma linha do Limites"
  );
}

console.log("ok: ciclo HB após liquidação — resumo = Limites");
