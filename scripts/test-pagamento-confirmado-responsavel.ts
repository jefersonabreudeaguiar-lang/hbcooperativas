/**
 * Pagamento do responsável já nasce confirmado (sem assinatura do cooperado).
 * npx tsx scripts/test-pagamento-confirmado-responsavel.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida } from "../src/types/index.ts";
import {
  registrarPagamentoCooperado,
  promoverPagamentosAguardandoConfirmadosPeloResponsavel,
  getPagamentoAguardandoCooperado,
  getPagamentoPendenteAssinaturaReciboCooperado,
  getPagamentoConfirmadoCooperadoMes,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceberMotorLegado } from "../src/services/cooperadoEntregasService.ts";

const COOP = "coop-pay";

function base(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: "c1",
        cooperativaId: COOP,
        nomeCompleto: "Coop Teste",
        cpfCnpj: "1",
        status: "ativo",
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [
      {
        id: "fc1",
        cooperativaId: COOP,
        cooperadoId: "c1",
        notaPedidoId: "np1",
        mesReferencia: "2026-09",
        descricao: "Entrega",
        valorBruto: 100,
        descontos: 0,
        valorLiquido: 100,
        saldoAcumulado: 100,
        status: "pendente",
        itens: [],
        createdAt: "",
        updatedAt: "",
      } as FichaCorrida,
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

{
  const out = registrarPagamentoCooperado(base(), "c1", "2026-09", "Orlando");
  const pg = out.pagamentosCooperado[out.pagamentosCooperado.length - 1]!;
  assert.equal(pg.status, "confirmado");
  assert.ok(pg.reciboHtml?.includes("Recibo"));
  assert.equal(getPagamentoAguardandoCooperado(out, "c1", "2026-09"), undefined);
  assert.ok(getPagamentoConfirmadoCooperadoMes(out, "c1", "2026-09"));
  const pendente = getPagamentoPendenteAssinaturaReciboCooperado(out, "c1", "2026-09");
  assert.ok(pendente);
  assert.equal(pendente!.status, "confirmado");
  const m6 = getValorQuantoVouReceberMotorLegado(out, "c1", COOP);
  assert.equal(m6.aguardandoAssinatura, true);
  assert.equal(m6.valorRecibo, pg.valorLiquido);
}

{
  let data = base();
  data = {
    ...data,
    pagamentosCooperado: [
      {
        id: "pg_old",
        cooperativaId: COOP,
        cooperadoId: "c1",
        mesReferencia: "2026-08",
        valorBruto: 50,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 50,
        fichaIds: [],
        notaPedidoIds: [],
        status: "aguardando_confirmacao",
        pagoPor: "Orlando",
        pagoEm: "2026-08-01T12:00:00.000Z",
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    ],
  };
  const out = promoverPagamentosAguardandoConfirmadosPeloResponsavel(data);
  assert.equal(out.pagamentosCooperado[0]!.status, "confirmado");
  assert.ok(out.pagamentosCooperado[0]!.reciboHtml?.length);
}

console.log("test-pagamento-confirmado-responsavel: OK");
