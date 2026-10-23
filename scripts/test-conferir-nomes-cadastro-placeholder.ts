/**
 * Conferir — cadastro com nome placeholder "Cooperado" não esconde o nome da conta app.
 * npx tsx scripts/test-conferir-nomes-cadastro-placeholder.ts
 */
import assert from "node:assert/strict";
import { getNomeEnvioEntregaNota, getNomeGrupoConferencia } from "../src/utils/fotoEntrega.ts";
import {
  appDataParaConferirLeitura,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import type { AppData, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-piloto";

function base(): AppData {
  return {
    users: [
      {
        id: "u1",
        cooperadoId: "c1",
        name: "Jeferson Piloto",
        active: true,
        role: "cooperado",
        email: "j@test",
        passwordHash: "",
        createdAt: "",
        updatedAt: "",
      },
    ],
    cooperados: [
      {
        id: "c1",
        nomeCompleto: "Cooperado",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "x",
      },
    ],
    notasPedido: [],
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

function notaFila(): NotaPedido {
  return {
    id: "n1",
    cooperadoId: "c1",
    cooperativaId: COOP,
    status: "entregue",
    mesReferencia: "2026-10",
    valorLiquido: 10,
    itens: [],
    createdAt: "2026-10-01T00:00:00.000Z",
  } as NotaPedido;
}

resetResponsavelPainelIndexCache();
const data = base();
data.notasPedido = [notaFila()];
const leitura = appDataParaConferirLeitura(data, COOP);
const n = leitura.notasPedido[0];
const nome = getNomeEnvioEntregaNota(n, leitura, COOP);
assert.equal(nome, "Jeferson Piloto");
assert.equal(getNomeGrupoConferencia([n], leitura, COOP), "Jeferson Piloto");
assert.equal(leitura.notasPedido[0].cooperadoNomeSnapshot, "Jeferson Piloto");

console.log("ok: Conferir nomes — placeholder cadastro cede à conta app");
