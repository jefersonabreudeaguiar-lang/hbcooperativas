/**
 * Reproduz piloto: notas na fila com snapshot "Desconhecido" e cooperados[] vazio → "Cooperado";
 * após merge do cadastro (storage), nomes reais.
 * npx tsx scripts/test-conferir-nomes-sem-cadastro-local.ts
 */
import assert from "node:assert/strict";
import {
  agruparPendentesPorCooperado,
  getNomeEnvioEntregaNota,
} from "../src/utils/fotoEntrega.ts";
import {
  appDataParaConferirLeitura,
  listNotasFilaConferenciaResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import type { AppData, Cooperado, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-piloto";
const COOP_ID_NOTA = "c_1786212515875_a6fl0";

function notaDesconhecida(): NotaPedido {
  return {
    id: "np_test",
    cooperadoId: COOP_ID_NOTA,
    cooperativaId: COOP,
    cooperadoNomeSnapshot: "Desconhecido",
    status: "entregue",
    mesReferencia: "2026-10",
    valorLiquido: 10,
    itens: [],
    createdAt: "2026-10-01T00:00:00.000Z",
  } as NotaPedido;
}

function baseSemCadastro(): AppData {
  return {
    users: [],
    cooperados: [],
    notasPedido: [notaDesconhecida()],
    fichaCorrida: [],
    pagamentosCooperado: [],
    cooperativas: [{ id: COOP, nome: "Piloto", cnpj: "62351750000165", active: true }],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

resetResponsavelPainelIndexCache();
const pobre = baseSemCadastro();
const leituraPobre = appDataParaConferirLeitura(pobre, COOP);
const filaPobre = listNotasFilaConferenciaResponsavel(leituraPobre, COOP);
assert.ok(filaPobre.length > 0);
assert.equal(getNomeEnvioEntregaNota(filaPobre[0], leituraPobre, COOP), "Cooperado");

const cadastro: Cooperado = {
  id: COOP_ID_NOTA,
  nomeCompleto: "Maria Piloto Storage",
  cooperativaId: COOP,
  status: "ativo",
  chavePix: "x",
};
const comCadastro = { ...pobre, cooperados: [cadastro] };
resetResponsavelPainelIndexCache();
const leituraOk = appDataParaConferirLeitura(comCadastro, COOP);
const filaOk = listNotasFilaConferenciaResponsavel(leituraOk, COOP);
const grupos = agruparPendentesPorCooperado(leituraOk, filaOk, COOP);
assert.equal(getNomeEnvioEntregaNota(filaOk[0], leituraOk, COOP), "Maria Piloto Storage");
assert.equal(grupos[0]?.nome, "Maria Piloto Storage");
assert.equal(leituraOk.notasPedido[0].cooperadoNomeSnapshot, "Maria Piloto Storage");

console.log("ok: Conferir — cadastro local necessário para nomes (Desconhecido → storage)");
