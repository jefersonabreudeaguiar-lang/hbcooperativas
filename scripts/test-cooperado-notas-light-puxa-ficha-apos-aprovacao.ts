/**
 * Depois que o responsável aprova: notas leves NÃO esperam operacional (trava o Atualizar).
 * A ficha entra no pull operacional; notas só marcam a revisão de notas.
 * npx tsx scripts/test-cooperado-notas-light-puxa-ficha-apos-aprovacao.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import type { AppData, NotaPedido } from "../src/types/index.ts";
import { cooperadoTemConferidaAguardandoFicha } from "../src/services/fichaSyncGuard.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const src = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoNotasContratosLightPull.ts"), "utf8");
const atualizar = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoAtualizarManual.ts"), "utf8");
const eventDriven = readFileSync(
  join(ROOT, "src/lib/performance/cooperadoEventDrivenSync.ts"),
  "utf8"
);

assert.match(src, /cooperadoTemConferidaAguardandoFicha/, "detecta nota aprovada deste cooperado sem ficha");
assert.match(src, /persistAppliedCooperativaNotasRevision/, "não marca operacional como já puxado");
assert.match(src, /runCooperadoMessengerOperacionalLightPull/, "agenda ficha sem await no caminho de notas");
assert.doesNotMatch(
  src,
  /await syncCooperadoMessengerOperacionalLightFromCloud/,
  "não espera operacional no pull de notas (trava o app)"
);
assert.doesNotMatch(
  src,
  /refreshContaCoopDescontosAfterOperacionalSync/,
  "HB não entra no caminho de notas"
);
assert.doesNotMatch(
  src,
  /persistAppliedCooperativaCloudRevision/,
  "não grava fingerprint completo depois só das notas"
);
assert.doesNotMatch(atualizar, /waitForAppDataWarm/, "Atualizar não espera 12s de parse");
assert.match(eventDriven, /persistAppliedCooperativaNotasRevision/, "helper de revisão só de notas");

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
  cooperadoTemConferidaAguardandoFicha(semFicha, "c-1", COOP),
  true,
  "aprovada sem ficha = atrasada"
);

const liteZero: NotaPedido = {
  ...nota,
  id: "n-lite",
  valorLiquido: 0,
  valorBruto: 0,
  itens: [],
};
assert.equal(
  cooperadoTemConferidaAguardandoFicha({ ...empty(), notasPedido: [liteZero] }, "c-1", COOP),
  true,
  "nota lite conferida sem ficha também puxa operacional"
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
  cooperadoTemConferidaAguardandoFicha(comFicha, "c-1", COOP),
  false,
  "aprovada com ficha = alinhada"
);

console.log("ok: cooperado notas light não trava; ficha vem no operacional");
