/**
 * H8.9.131 — merge operacional filtra fichaCorrida por notasPedidoExcluidas (simétrico ao push H8.9.129).
 * npx tsx scripts/test-merge-operacional-excluidas-ficha-h89131.ts
 */
import assert from "node:assert/strict";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const COOP_OTHER = "coop-outra";
const JEFERSON = "c_1781981564381_w67gg";
const NOTA_EXCL = "np_1786481440215_kp7h9";
const NOTA_ATIVA = "np_ativa_001";

function baseLocal(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
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

function cloudPayload(
  fichas: FichaCorrida[],
  excluidas: OperacionalSyncPayload["notasPedidoExcluidas"] = []
): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: 15,
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    notasPedidoExcluidas: excluidas,
    fichaCorrida: fichas,
    config: { descontoPadraoCooperativa: 0 },
  };
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
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function fichasComNota(merged: AppData, notaId: string): FichaCorrida[] {
  return (merged.fichaCorrida ?? []).filter((f) => f.notaPedidoId === notaId && f.cooperativaId === COOP);
}

function notaConferida(id: string): NotaPedido {
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

const tomb = [{ id: NOTA_EXCL, cooperativaId: COOP, deletedAt: "2026-09-23T04:08:04.654Z" }];

// 1 — nota ativa + ficha
{
  const merged = mergeOperacionalIntoData(
    baseLocal(),
    cloudPayload([ficha("fc_ativa", NOTA_ATIVA)]),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_ATIVA).length, 1);
  console.log("1 OK — ficha ativa permanece");
}

// 2 — nota excluída + ficha
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ notasPedidoExcluidas: tomb }),
    cloudPayload([ficha("fc_orfa", NOTA_EXCL)], tomb),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 0);
  console.log("2 OK — ficha de nota excluída removida no merge");
}

// 3 — duas fichas mesma nota excluída
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ notasPedidoExcluidas: tomb }),
    cloudPayload([ficha("fc_a", NOTA_EXCL), ficha("fc_b", NOTA_EXCL)], tomb),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 0);
  console.log("3 OK — ambas removidas");
}

// 4 — tombstone outra cooperativa no AppData local (não entra no escopo desta coop)
{
  const merged = mergeOperacionalIntoData(
    baseLocal({
      notasPedido: [notaConferida(NOTA_EXCL)],
      notasPedidoExcluidas: [
        { id: NOTA_EXCL, cooperativaId: COOP_OTHER, deletedAt: "2026-09-23T04:08:04.654Z" },
      ],
    }),
    cloudPayload([ficha("fc_mantem", NOTA_EXCL)], []),
    COOP
  );
  assert.equal(
    (merged.fichaCorrida ?? []).filter((f) => f.id === "fc_mantem").length,
    1,
    "CASO 4"
  );
  console.log("4 OK — tombstone outra coop não remove ficha desta coop");
}

// 5 — ficha sem notaPedidoId
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ notasPedidoExcluidas: tomb }),
    cloudPayload([ficha("fc_sem", "")], tomb),
    COOP
  );
  assert.equal((merged.fichaCorrida ?? []).filter((f) => f.id === "fc_sem").length, 1);
  console.log("5 OK — ficha sem notaPedidoId permanece");
}

// 6 — excluída + ativa
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ notasPedidoExcluidas: tomb }),
    cloudPayload([ficha("fc_excl", NOTA_EXCL), ficha("fc_ok", NOTA_ATIVA)], tomb),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_ATIVA).length, 1);
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 0);
  console.log("6 OK — somente ativa permanece");
}

// 7 — ficha pago de nota excluída
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ notasPedidoExcluidas: tomb }),
    cloudPayload([ficha("fc_pago", NOTA_EXCL, { status: "pago" })], tomb),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 0);
  console.log("7 OK — ficha pago de nota excluída removida");
}

// 8 — Jeferson
{
  const orphanIds = Array.from({ length: 10 }, (_, i) => `fc_jef_${i}`);
  const cloudFichas = orphanIds.map((id, i) =>
    ficha(id, NOTA_EXCL, { createdAt: `2026-08-01T00:00:0${i}.000Z` })
  );
  const merged = mergeOperacionalIntoData(
    baseLocal({ fichaCorrida: [], notasPedidoExcluidas: tomb }),
    cloudPayload(cloudFichas, tomb),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 0);
  console.log("8 JEFERSON OK — 0 fichas da nota excluída após merge");
}

// 9 — EXTRA H8.9.130: sem tombstone local → órfã preservada
{
  const merged = mergeOperacionalIntoData(
    baseLocal({ fichaCorrida: [] }),
    cloudPayload([ficha("fc_cloud_only", NOTA_EXCL)], []),
    COOP
  );
  assert.equal(fichasComNota(merged, NOTA_EXCL).length, 1);
  console.log("9 EXTRA OK — sem tombstone local, órfã permanece");
}

console.log("\nH8.9.131 — todos os casos OK");
