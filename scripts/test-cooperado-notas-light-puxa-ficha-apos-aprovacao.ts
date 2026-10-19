/**
 * Depois que o responsável aprova, o pull leve de notas não pode gravar
 * A receber/HB com ficha velha — tem que puxar o operacional.
 * npx tsx scripts/test-cooperado-notas-light-puxa-ficha-apos-aprovacao.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import type { AppData, NotaPedido } from "../src/types/index.ts";
import { cooperativaTemNotasConferidasSemFichaLocal } from "../src/services/fichaSyncGuard.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const src = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoNotasContratosLightPull.ts"), "utf8");

assert.match(src, /cooperativaTemNotasConferidasSemFichaLocal/, "detecta nota aprovada sem ficha");
assert.match(src, /syncCooperadoMessengerOperacionalLightFromCloud/, "puxa operacional (ficha) após notas");
assert.match(src, /refreshContaCoopDescontosAfterOperacionalSync/, "atualiza HB depois da ficha");
assert.match(
  src,
  /cooperadoPwaMaterializarSnapshotsFinanceirosPosSync\(opts\.user\)/,
  "grava snapshot só depois da ficha"
);

const COOP = "coop-1";
function empty(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "C", cnpj: "62351750000165", active: true }],
    cooperados: [{ id: "c-1", nomeCompleto: "Maria", cooperativaId: COOP, status: "ativo" }],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
  } as unknown as AppData;
}

const nota: NotaPedido = {
  id: "n-nova",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  status: "conferida",
  mesReferencia: "2026-10",
  valorLiquido: 100,
  valorBruto: 110,
  itens: [{ produtoNome: "Alface", unidade: "kg", quantidade: 10, valorUnitario: 11 }],
  createdAt: "2026-10-19T18:00:00.000Z",
} as NotaPedido;

const semFicha = { ...empty(), notasPedido: [nota] };
assert.equal(
  cooperativaTemNotasConferidasSemFichaLocal(semFicha, COOP),
  true,
  "aprovada sem ficha = atrasada"
);

const comFicha = {
  ...semFicha,
  fichaCorrida: [
    {
      id: "f-1",
      notaPedidoId: "n-nova",
      cooperadoId: "c-1",
      cooperativaId: COOP,
      mesReferencia: "2026-10",
      status: "pendente",
      valorLiquido: 100,
      valorBruto: 110,
    },
  ],
} as unknown as AppData;
assert.equal(
  cooperativaTemNotasConferidasSemFichaLocal(comFicha, COOP),
  false,
  "aprovada com ficha = alinhada"
);

console.log("ok: cooperado notas light puxa ficha/HB após aprovação");
