/**
 * Cenários críticos do guard financeiro do cooperado (regressão Orlando).
 * Uso: npm run test:cooperado-financeiro
 */
import assert from "node:assert/strict";
import { cooperadoFinanceiroLocalAusente, notasSyncProvavelmenteCompleto } from "../src/services/fichaSyncGuard.ts";
import {
  buildValorExibicaoCooperadoOpts,
  getDescontosExtrasExibicaoCooperado,
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  getResumoPagamentoParaRegistro,
  getResumoValorAPagarRelatorio,
  getValorExibicaoCooperado,
  persistDescontosContaCoopNoArquivo,
  purgarFichasInvalidas,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService.ts";
import { setContaCoopDescontosMemoria } from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-1";
const COOPERADO = "c_orlando";

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Teste", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Orlando Teste",
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
    config: {},
    ...overrides,
  } as AppData;
}

function ficha(id: string, notaId: string, mesReferencia = "2026-08"): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia,
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    descricao: `Entrega nota ${notaId}`,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function nota(id: string, status: NotaPedido["status"]): NotaPedido {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: "2026-08",
    status,
    valorLiquido: 100,
    valorBruto: 100,
    instituicaoId: "inst-1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100 }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

// HB Créditos — regressão: total abatido e linhas visíveis no resumo cooperado (executar antes dos demais)
{
  const MES = "2026-08";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — mercado teste",
      valorReais: 50,
      tipo: "conta_coop",
      createdAt: "2026-08-15T12:00:00.000Z",
    },
  ]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  const opts = buildValorExibicaoCooperadoOpts(data, COOPERADO, MES, COOP);
  const linhas = getDescontosExtrasExibicaoCooperado(base, opts);
  const exibicao = getValorExibicaoCooperado(base, opts);

  assert.ok(aReceber.valorLiquido < base.valorEntregas, "compra HB deve reduzir valor a receber");
  assert.ok(
    linhas.some((d) => d.tipo === "conta_coop"),
    "resumo cooperado deve listar compra HB Créditos"
  );
  assert.equal(exibicao, aReceber.valorLiquido, "valor exibido deve igualar valor a receber");
}

{
  const MES = "2026-08";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, [
    {
      motivo: "Compra HB Créditos — memoria sessao",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-08-20T12:00:00.000Z",
    },
  ]);
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  const exibicao = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.ok(aReceber.valorLiquido < 100, "cache HB deve abater valor a receber sem arquivo mensal");
  assert.ok(
    exibicao.descontosExtras.some((d) => d.tipo === "conta_coop"),
    "resumo exibicao deve listar HB via cache"
  );
}

{
  const MES = "2026-09";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", MES)],
    notasPedido: [{ ...nota("n1", "conferida"), mesReferencia: MES }],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — snapshot",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-09-10T10:00:00.000Z",
    },
  ]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const snapshot = getResumoPagamentoParaRegistro(base, data, COOPERADO, MES, COOP);
  const opts = buildValorExibicaoCooperadoOpts(data, COOPERADO, MES, COOP);
  const linhas = getDescontosExtrasExibicaoCooperado(snapshot, opts);

  assert.ok(
    snapshot.descontosExtras.some((d) => d.tipo === "conta_coop"),
    "snapshot de pagamento deve carregar linhas conta_coop"
  );
  assert.ok(
    linhas.some((d) => d.tipo === "conta_coop"),
    "exibição cooperado não pode ocultar HB quando snapshot já tem desconto"
  );
}

// 1) Ficha da nuvem antes das notas conferidas = incompleto (deve recuperar)
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2")],
    notasPedido: [nota("n1", "aguardando_conferencia"), nota("n2", "aguardando_conferencia")],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    true,
    "ficha com notas ainda não conferidas localmente deve ser incompleto"
  );
}

// 2) notasSyncProvavelmenteCompleto só conta conferida/pago
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2"), ficha("f3", "n3"), ficha("f4", "n4")],
    notasPedido: [nota("n1", "aguardando_conferencia"), nota("n2", "aguardando_conferencia"), nota("n3", "aguardando_conferencia"), nota("n4", "aguardando_conferencia")],
  });
  assert.equal(
    notasSyncProvavelmenteCompleto(data, COOP),
    false,
    "notas em análise não devem marcar sync como completo"
  );
}

// 3) purgar não apaga tudo quando há conferidas e sync incompleto
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2")],
    notasPedido: [nota("n1", "conferida"), nota("n2", "aguardando_conferencia")],
  });
  const next = purgarFichasInvalidas(data);
  assert.ok(next.fichaCorrida.length > 0, "purgar não deve zerar ficha com conferidas parciais");
}

// 4) Cooperado sem histórico de entregas = financeiro ok (não bloqueia o app)
{
  const data = baseData({
    notasPedido: [nota("n0", "rascunho")],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    false,
    "cooperado só com rascunho não deve ser tratado como financeiro ausente"
  );
}

// 5) reconciliar cria ficha a partir de conferidas antes de purgar
{
  const data = baseData({
    notasPedido: [nota("n1", "conferida")],
  });
  const next = reconciliarFichaFromNotasConferidas(data);
  assert.ok(
    next.fichaCorrida.some((f) => f.notaPedidoId === "n1"),
    "reconciliar deve materializar ficha da nota conferida"
  );
  assert.equal(
    cooperadoFinanceiroLocalAusente(next, COOPERADO, COOP),
    false,
    "após reconciliar, financeiro deve estar pronto"
  );
}

console.log("OK — guard financeiro cooperado");
