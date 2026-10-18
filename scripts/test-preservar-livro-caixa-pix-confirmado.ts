/**
 * PIX confirmado no Em aberto → pago + livro caixa não pode retroceder no sync.
 * npx tsx scripts/test-preservar-livro-caixa-pix-confirmado.ts
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import type { AppData, FichaCorrida, LivroCaixaLancamento, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional,
  preservarLivroCaixaDePagamentosConfirmados,
} from "../src/services/livroCaixaPagamentoGuard.ts";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService.ts";
import { applyPagarSlice, extractPagarSlice } from "../src/lib/responsavel/abaLastGoodCheckpoint.ts";
import {
  medirRiquezaStaffGestao,
  staffGestaoSnapshotPoorer,
} from "../src/lib/staff/staffGestaoSnapshotGuard.ts";

const COOP = "coop-1";

const pix: PagamentoCooperadoRegistro = {
  id: "pg-1",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesReferencia: "2026-10",
  status: "confirmado",
  valorBruto: 100,
  valorLiquido: 82,
  descontoCooperativa: 18,
  pagoEm: "2026-10-09T12:00:00.000Z",
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
} as PagamentoCooperadoRegistro;

const debito: LivroCaixaLancamento = {
  id: "lc-pg-1",
  cooperativaId: COOP,
  data: "2026-10-09",
  mesReferencia: "2026-10",
  tipo: "debito",
  valor: 100,
  historico: "Pagamento cooperado",
  origem: "pagamento_cooperado",
  origemId: "pg_caixa_pg-1",
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
};

const fichaPaga: FichaCorrida = {
  id: "f-1",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  notaPedidoId: "n-1",
  mesReferencia: "2026-10",
  status: "pago",
  descricao: "entrega",
  valorBruto: 100,
  valorLiquido: 82,
  descontos: 18,
  dataLancamento: "2026-10-02T00:00:00.000Z",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
} as FichaCorrida;

const rico = aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional(
  { pagamentosCooperado: [pix], livroCaixa: [debito] },
  { pagamentosCooperado: [pix], livroCaixa: [] }
);
assert.equal(rico.restauradas.length, 1, "upload pobre restaura débito do PIX");
assert.equal(rico.payload.livroCaixa?.some((l) => l.origemId === "pg_caixa_pg-1"), true);

const jaLa = preservarLivroCaixaDePagamentosConfirmados(
  { pagamentosCooperado: [pix], livroCaixa: [debito] },
  { pagamentosCooperado: [pix], livroCaixa: [{ ...debito, id: "outro", origemId: "pg_caixa_pg-1" }] }
);
assert.equal(jaLa.restauradas.length, 0, "mesma origemId não duplica");

const dataRico: AppData = {
  ...emptyInitialData,
  cooperativas: [{ id: COOP, nome: "C", cnpj: "1", active: true }],
  cooperados: [{ id: "c-1", nomeCompleto: "A", cooperativaId: COOP, status: "ativo" } as AppData["cooperados"][0]],
  pagamentosCooperado: [pix],
  fichaCorrida: [fichaPaga],
  livroCaixa: [debito],
};

const cloudPobre = {
  updatedAt: "2026-10-18T00:00:00.000Z",
  fullReset: true,
  operacionalSnapshotComplete: true,
  pagamentosCooperado: [pix],
  fichaCorrida: [{ ...fichaPaga, status: "pendente" as const, updatedAt: "2026-10-18T00:00:00.000Z" }],
  livroCaixa: [],
};

const merged = mergeOperacionalIntoData(dataRico, cloudPobre as never, COOP, []);
assert.equal(
  (merged.livroCaixa ?? []).some((l) => l.origemId === "pg_caixa_pg-1"),
  true,
  "pull replace não apaga débito do PIX confirmado"
);

const lastGood = extractPagarSlice(dataRico, COOP);
const atualPendenteMaisNovo: AppData = {
  ...dataRico,
  fichaCorrida: [
    { ...fichaPaga, status: "pendente", updatedAt: "2026-10-18T08:00:00.000Z" },
  ],
};
const restaurado = applyPagarSlice(atualPendenteMaisNovo, COOP, lastGood);
assert.equal(
  restaurado.fichaCorrida.find((f) => f.id === "f-1")?.status,
  "pago",
  "last-good pendente mais novo não rebaixa ficha paga"
);

const pobre = {
  ...dataRico,
  livroCaixa: [],
};
assert.equal(
  staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(pobre), medirRiquezaStaffGestao(dataRico)),
  true,
  "sumir débito PIX do caixa é snapshot pobre"
);

console.log("ok: PIX pago não some do livro caixa nem volta a em aberto no sync");
