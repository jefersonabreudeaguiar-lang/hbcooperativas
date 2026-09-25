/**
 * H8.9.129 — fichaCorrida no payload operacional não inclui notas tombstoned.
 * npx tsx scripts/test-operacional-excluidas-ficha-h89129.ts
 */
import assert from "node:assert/strict";
import { buildOperacionalPayloadForTests } from "../src/services/cooperativaSyncCloudService.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const COOP_OTHER = "coop-outra";
const JEFERSON = "c_1781981564381_w67gg";
const NOTA_EXCL = "np_1786481440215_kp7h9";
const NOTA_ATIVA = "np_ativa_001";

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [
      { id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" },
      { id: COOP_OTHER, nome: "Outra", cnpj: "11111111000191", createdAt: "", updatedAt: "" },
    ],
    cooperados: [
      {
        id: JEFERSON,
        cooperativaId: COOP,
        nomeCompleto: "Jeferson A.",
        cpfCnpj: "00000000000",
        status: "ativo",
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    notasPedidoExcluidas: [],
    config: { descontoPadraoCooperativa: 0 },
    ...overrides,
  } as AppData;
}

function ficha(
  id: string,
  notaPedidoId: string | undefined,
  patch?: Partial<FichaCorrida>
): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: JEFERSON,
    notaPedidoId: notaPedidoId ?? "",
    descricao: "Teste",
    valorBruto: 10,
    descontos: 0,
    valorLiquido: 10,
    saldoAcumulado: 10,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function notaAtiva(id: string): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: JEFERSON,
    instituicaoId: "inst-1",
    numeroNota: "1",
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    status: "conferida",
    valorBruto: 10,
    valorLiquido: 10,
    valorDesconto: 0,
    itens: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function ids(payload: ReturnType<typeof buildOperacionalPayloadForTests>): string[] {
  return (payload.fichaCorrida ?? []).map((f) => f.id).sort();
}

// CASO 1 — nota ativa + ficha ativa
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      notasPedido: [notaAtiva(NOTA_ATIVA)],
      fichaCorrida: [ficha("fc_ativa", NOTA_ATIVA)],
    }),
    COOP
  );
  assert.ok(payload.fichaCorrida?.some((f) => f.id === "fc_ativa"), "CASO 1: ficha ativa permanece");
  console.log("CASO 1 OK");
}

// CASO 2 — nota excluída + ficha correspondente
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: [ficha("fc_orfa", NOTA_EXCL)],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.equal(payload.fichaCorrida?.length ?? 0, 0, "CASO 2: ficha de nota excluída removida");
  console.log("CASO 2 OK");
}

// CASO 3 — duas fichas da mesma nota excluída
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: [ficha("fc_a", NOTA_EXCL), ficha("fc_b", NOTA_EXCL)],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.deepEqual(ids(payload), [], "CASO 3: nenhuma ficha da nota excluída");
  console.log("CASO 3 OK");
}

// CASO 4 — tombstone de outra cooperativa
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: [ficha("fc_mantem", NOTA_EXCL)],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP_OTHER, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.deepEqual(ids(payload), ["fc_mantem"], "CASO 4: excluída de outra coop não filtra");
  console.log("CASO 4 OK");
}

// CASO 5 — ficha sem notaPedidoId
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: [ficha("fc_sem_nota", "")],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.deepEqual(ids(payload), ["fc_sem_nota"], "CASO 5: ficha sem notaPedidoId permanece");
  console.log("CASO 5 OK");
}

// CASO 6 — uma excluída e uma ativa
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      notasPedido: [notaAtiva(NOTA_ATIVA)],
      fichaCorrida: [ficha("fc_excl", NOTA_EXCL), ficha("fc_ok", NOTA_ATIVA)],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.deepEqual(ids(payload), ["fc_ok"], "CASO 6: só ficha da nota ativa");
  console.log("CASO 6 OK");
}

// CASO 7 — ficha paga de nota excluída
{
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: [ficha("fc_pago", NOTA_EXCL, { status: "pago" })],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.equal(payload.fichaCorrida?.length ?? 0, 0, "CASO 7: ficha pago de nota excluída removida");
  console.log("CASO 7 OK");
}

// Caso real Jeferson (memória)
{
  const orphanIds = Array.from({ length: 10 }, (_, i) => `fc_jef_${i}`);
  const payload = buildOperacionalPayloadForTests(
    baseData({
      fichaCorrida: orphanIds.map((id, i) =>
        ficha(id, NOTA_EXCL, {
          valorLiquido: 188.1,
          valorBruto: 198,
          status: "pendente",
        })
      ),
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    COOP
  );
  assert.equal(payload.fichaCorrida?.length ?? 0, 0, "Jeferson: 10 fichas órfãs não entram no payload");
  console.log("CASO JEFERSON OK");
}

console.log("\nH8.9.129 — todos os casos passaram.");
