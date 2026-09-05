/**
 * Simula Orlando pós-transferência: ficha local obsoleta + notas no Jeferson.
 */
import type { AppData, FichaCorrida, NotaPedido } from "../src/types";
import {
  cooperadoFinanceiroLocalAusente,
  limparFichaObsoletaCooperado,
} from "../src/services/fichaSyncGuard";

const ORLANDO = "c_1782263929381_ncp55";
const JEFERSON = "c_1781981564381_w67gg";
const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";

const nota: NotaPedido = {
  id: "nota_test_1",
  cooperativaId: COOP,
  cooperadoId: JEFERSON,
  cooperadoNomeSnapshot: "Jeferson Abreu de Aguiar",
  mesReferencia: "2026-08",
  status: "conferida",
  valorBruto: 100,
  valorLiquido: 95,
  descontos: 5,
  itens: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const ficha: FichaCorrida = {
  id: "ficha_test_1",
  cooperativaId: COOP,
  cooperadoId: ORLANDO,
  cooperadoNomeSnapshot: "Orlando Fetisch",
  notaPedidoId: nota.id,
  descricao: "Teste",
  valorBruto: 100,
  descontos: 5,
  valorLiquido: 95,
  saldoAcumulado: 95,
  mesReferencia: "2026-08",
  status: "pendente",
  dataLancamento: "2026-08-01",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const data = {
  cooperados: [
    { id: ORLANDO, cooperativaId: COOP, nomeCompleto: "Orlando Fetisch" },
    { id: JEFERSON, cooperativaId: COOP, nomeCompleto: "Jeferson Abreu de Aguiar" },
  ],
  notasPedido: [nota],
  fichaCorrida: [ficha],
  arquivosMensais: [
    {
      id: "arq_orlando_ago",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      mesReferencia: "2026-08",
      notaPedidoIds: [nota.id],
      pagamentoIds: [],
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
} as unknown as AppData;

const antes = cooperadoFinanceiroLocalAusente(data, ORLANDO, COOP);
const limpo = limparFichaObsoletaCooperado(data, ORLANDO, COOP);
const depois = cooperadoFinanceiroLocalAusente(limpo, ORLANDO, COOP);

const dataSemNotas = {
  ...data,
  notasPedido: [],
} as unknown as AppData;

const antesSemNotas = cooperadoFinanceiroLocalAusente(dataSemNotas, ORLANDO, COOP);
const limpoSemNotas = limparFichaObsoletaCooperado(dataSemNotas, ORLANDO, COOP);
const depoisSemNotas = cooperadoFinanceiroLocalAusente(limpoSemNotas, ORLANDO, COOP);

console.log({
  comNotaJeferson: { antesBloqueado: antes, fichaApos: limpo.fichaCorrida.length, depoisBloqueado: depois },
  semNotasLocais: {
    antesBloqueado: antesSemNotas,
    fichaApos: limpoSemNotas.fichaCorrida.length,
    depoisBloqueado: depoisSemNotas,
  },
});

if (depois !== false || limpo.fichaCorrida.length !== 0 || depoisSemNotas !== false || limpoSemNotas.fichaCorrida.length !== 0) {
  console.error("FALHOU");
  process.exit(1);
}
console.log("OK — Orlando destrava após limpeza");
