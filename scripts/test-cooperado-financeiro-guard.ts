/**
 * Cenários críticos do guard financeiro do cooperado (regressão Orlando).
 * Uso: npm run test:cooperado-financeiro
 */
import assert from "node:assert/strict";
import { cooperadoFinanceiroLocalAusente, notasSyncProvavelmenteCompleto } from "../src/services/fichaSyncGuard.ts";
import { purgarFichasInvalidas, reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService.ts";
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

function ficha(id: string, notaId: string): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia: "2026-08",
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
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

// 1) Ficha da nuvem sem notas locais = incompleto (deve recuperar)
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2")],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    true,
    "ficha sem notas conferidas locais deve ser incompleto"
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

// 4) reconciliar cria ficha a partir de conferidas antes de purgar
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
