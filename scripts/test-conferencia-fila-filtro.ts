import assert from "node:assert/strict";
import {
  isNotaNaFilaConferenciaResponsavel,
  notaPassaFiltroStatusListaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
  sanitizarNotaParaFilaConferencia,
} from "../src/utils/notaStatus";
import { repararNotasPedidoFilaConferencia } from "../src/services/conferenciaFilaRepair";
import {
  agruparPendentesPorCooperado,
  getChaveGrupoConferencia,
  getNomeEnvioEntregaNota,
  getNomeGrupoConferencia,
  nomeCooperadoSnapshotUtilizavel,
  resolverCooperadoIdGrupoConferencia,
} from "../src/utils/fotoEntrega";
import type { AppData, NotaPedido } from "../src/types";

assert.equal(isNotaNaFilaConferenciaResponsavel("entregue"), true);
assert.equal(notaPassaFiltroStatusListaConferencia("entregue", "aguardando_conferencia"), true);
assert.equal(notaPassaFiltroStatusListaConferencia("conferida", "aguardando_conferencia"), false);
assert.equal(notaPassaFiltroStatusListaConferencia("conferida", "conferida"), true);

assert.equal(
  notaElegivelParaFilaConferenciaResponsavel({
    status: "aguardando_conferencia",
    conferidaPor: "Maria",
    dataConferencia: "2026-09-01",
  }),
  false
);

const coopId = "coop1";
const altonId = "c_alton";
const altonDup = "c_alton_old";

const data = {
  cooperativas: [{ id: coopId, nome: "Test", cnpj: "62351750000165" }],
  cooperados: [
    {
      id: altonId,
      cooperativaId: coopId,
      nomeCompleto: "Alton Silva",
      cpfCnpj: "12345678901",
      telefone: "",
      endereco: "",
      comunidade: "",
      cafDap: "",
      chavePix: "",
      banco: "",
      agencia: "",
      conta: "",
      status: "ativo",
      produtos: [],
      observacoes: "",
      createdAt: "",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: altonDup,
      cooperativaId: coopId,
      nomeCompleto: "Alton Silva",
      cpfCnpj: "12345678901",
      telefone: "",
      endereco: "",
      comunidade: "",
      cafDap: "",
      chavePix: "",
      banco: "",
      agencia: "",
      conta: "",
      status: "ativo",
      produtos: [],
      observacoes: "",
      createdAt: "",
      updatedAt: "2020-01-01T00:00:00.000Z",
    },
  ],
  notasPedido: [],
} as unknown as AppData;

const zombie = {
  id: "z1",
  status: "aguardando_conferencia" as const,
  conferidaPor: "X",
  dataConferencia: "2026-01-01",
  cooperadoId: altonId,
  cooperativaId: coopId,
  createdAt: "",
  updatedAt: "",
} as unknown as NotaPedido;
const fixed = sanitizarNotaParaFilaConferencia(zombie);
assert.equal(fixed.conferidaPor, undefined);
assert.equal(notaElegivelParaFilaConferenciaResponsavel(fixed), true);
const reparo = repararNotasPedidoFilaConferencia({ ...data, notasPedido: [zombie] }, coopId);
assert.equal(reparo.repaired, 1);

const notaNuvem: NotaPedido = {
  id: "n1",
  cooperadoId: altonDup,
  cooperadoNomeSnapshot: "Alton Silva",
  cooperativaId: coopId,
  status: "entregue",
  mesReferencia: "2026-09",
  numeroNota: "1",
  instituicaoId: "i1",
  itens: [],
  valorBruto: 0,
  valorDesconto: 0,
  valorLiquido: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

assert.equal(resolverCooperadoIdGrupoConferencia(data, notaNuvem, coopId), altonId);
assert.equal(getChaveGrupoConferencia(notaNuvem, data, coopId), `id:${altonId}`);

const outroId = "c_outro";
const dataEnvio = {
  ...data,
  cooperados: [
    ...data.cooperados,
    {
      id: outroId,
      cooperativaId: coopId,
      nomeCompleto: "Cleones Silva",
      cpfCnpj: "99999999999",
      telefone: "",
      endereco: "",
      comunidade: "",
      cafDap: "",
      chavePix: "",
      banco: "",
      agencia: "",
      conta: "",
      status: "ativo",
      produtos: [],
      observacoes: "",
      createdAt: "",
      updatedAt: "",
    },
  ],
} as unknown as AppData;
const notaIdErrado: NotaPedido = {
  ...notaNuvem,
  id: "n-id-errado",
  cooperadoId: outroId,
  cooperadoNomeSnapshot: "Alton Silva",
  status: "aguardando_conferencia",
};
assert.equal(resolverCooperadoIdGrupoConferencia(dataEnvio, notaIdErrado, coopId), altonId);

assert.equal(nomeCooperadoSnapshotUtilizavel("Desconhecido"), undefined);
assert.equal(nomeCooperadoSnapshotUtilizavel("Cooperado"), undefined);
assert.equal(nomeCooperadoSnapshotUtilizavel("c_alton"), undefined);
assert.equal(nomeCooperadoSnapshotUtilizavel("Alton Silva"), "Alton Silva");

const notaSoCadastro: NotaPedido = {
  ...notaNuvem,
  id: "n-so-cadastro",
  cooperadoId: altonId,
  cooperadoNomeSnapshot: "Cooperado",
};
assert.equal(getNomeEnvioEntregaNota(notaSoCadastro, data, coopId), "Alton Silva");

const dataComUser = {
  ...data,
  users: [
    {
      id: "u1",
      email: "alton@test.com",
      name: "Alton Silva App",
      role: "cooperado",
      active: true,
      cooperadoId: altonId,
      createdAt: "",
      updatedAt: "",
    },
  ],
  cooperados: [],
} as unknown as AppData;
const notaSemCadastro: NotaPedido = {
  ...notaNuvem,
  id: "n-user",
  cooperadoId: altonId,
  cooperadoNomeSnapshot: "Cooperado",
};
assert.equal(getNomeEnvioEntregaNota(notaSemCadastro, dataComUser, coopId), "Alton Silva App");

const notaSemNome: NotaPedido = {
  ...notaNuvem,
  id: "n-desconhecido",
  cooperadoId: altonId,
  cooperadoNomeSnapshot: "Desconhecido",
  createdAt: "2026-10-19T18:53:30.000Z",
  updatedAt: "2026-10-19T18:53:30.000Z",
};
const notaAntigaAlton: NotaPedido = {
  ...notaNuvem,
  id: "n-antiga",
  cooperadoId: altonId,
  cooperadoNomeSnapshot: "Alton Silva",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};
assert.equal(getNomeGrupoConferencia([notaSemNome, notaAntigaAlton], data), "Alton Silva");
const grupos = agruparPendentesPorCooperado(data, [notaAntigaAlton, notaSemNome], coopId);
assert.equal(grupos.length, 1);
assert.equal(grupos[0].nome, "Alton Silva");
assert.equal(grupos[0].notas.length, 2);

console.log("test-conferencia-fila-filtro: OK");
