/**
 * Contrato Ficha / Foto a receber — não voltar ao modelo antigo.
 * npx tsx scripts/test-cooperado-fotos-ficha-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResumoMesEntregasCooperado } from "../src/services/cooperadoEntregasService.ts";
import {
  COOPERADO_FICHA_FOTOS_LIQUIDADAS_LABEL,
  COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL,
  COOPERADO_FOTOS_FICHA_CONTRATO_VERSION,
  mesclarResumosFichaComMesesAnteriores,
  particionarResumosFotosPorAberto,
  resumosFotosAPartirDeResumos,
} from "../src/lib/cooperado/cooperadoFotosFichaContrato.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

function resumo(mes: string, comFoto: boolean): ResumoMesEntregasCooperado {
  return {
    mesReferencia: mes,
    notas: [
      {
        id: `n-${mes}`,
        mesReferencia: mes,
        status: "lancado",
        fotoNaNuvem: comFoto,
        fotoPedido: comFoto ? "foto.jpg" : undefined,
      } as never,
    ],
    quantidadeEntregas: 1,
    emAnalise: 0,
    rejeitadas: 0,
    conferidas: 0,
    pagas: mes === "2026-09" ? 1 : 0,
    valorBruto: 100,
    valorAReceber: mes === "2026-10" ? 100 : 0,
    valorRecebido: mes === "2026-09" ? 100 : 0,
  } as ResumoMesEntregasCooperado;
}

assert.equal(COOPERADO_FOTOS_FICHA_CONTRATO_VERSION, 1);
assert.equal(COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL, "Foto a receber");
assert.equal(COOPERADO_FICHA_FOTOS_LIQUIDADAS_LABEL, "Fotos por mês");

const aberto = resumo("2026-10", true);
const anterior = resumo("2026-09", true);
const extrato = mesclarResumosFichaComMesesAnteriores([aberto], [anterior]);
assert.deepEqual(
  extrato.map((r) => r.mesReferencia),
  ["2026-10", "2026-09"],
  "Ficha Extrato mostra mês aberto e o anterior"
);

const abertoGanha = mesclarResumosFichaComMesesAnteriores(
  [{ ...aberto, valorAReceber: 80 }],
  [{ ...aberto, valorAReceber: 10 }]
);
assert.equal(abertoGanha.length, 1);
assert.equal(abertoGanha[0]?.valorAReceber, 80);

const { aReceber, fichaLiquidada } = particionarResumosFotosPorAberto(
  [aberto, anterior],
  new Set(["2026-10"])
);
assert.deepEqual(
  aReceber.map((r) => r.mesReferencia),
  ["2026-10"],
  "Financeiro Foto a receber só tem mês em aberto"
);
assert.deepEqual(
  fichaLiquidada.map((r) => r.mesReferencia),
  ["2026-09"],
  "Ficha Fotos por mês só tem mês já liquidado"
);

const soComFoto = resumosFotosAPartirDeResumos([
  resumo("2026-08", false),
  resumo("2026-07", true),
]);
assert.deepEqual(soComFoto.map((r) => r.mesReferencia), ["2026-07"]);

const financeiroNav = readFileSync(
  join(root, "src/components/cooperado/CooperadoFinanceiroSecoesNav.tsx"),
  "utf8"
);
assert.match(financeiroNav, /COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL/);
assert.doesNotMatch(
  financeiroNav,
  /label: "Fotos"/,
  "Financeiro não pode voltar ao rótulo Fotos"
);

const financeiroPage = readFileSync(
  join(root, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"),
  "utf8"
);
assert.match(financeiroPage, /listarResumosFotosAReceber/);
assert.match(financeiroPage, /COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL/);
assert.doesNotMatch(
  financeiroPage,
  /listarResumosFotosCooperado\(/,
  "Financeiro não lista todas as fotos — só mês a receber"
);

const fichaTab = readFileSync(
  join(root, "src/components/cooperado/CooperadoMinhaFichaTab.tsx"),
  "utf8"
);
assert.match(fichaTab, /listarResumosFotosFichaLiquidada/);
assert.match(fichaTab, /mesclarResumosFichaComMesesAnteriores/);
assert.match(fichaTab, /COOPERADO_FICHA_FOTOS_LIQUIDADAS_LABEL/);

const entregasMain = readFileSync(
  join(root, "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx"),
  "utf8"
);
assert.match(entregasMain, /listarResumosFichaComMesesAnteriores/);
assert.match(entregasMain, /fotosFichaLiquidadaCache/);

const snapshot = readFileSync(
  join(root, "src/lib/cooperado/cooperadoPwaEntregasResumosSnapshot.ts"),
  "utf8"
);
assert.match(snapshot, /fichaExtrato/);
assert.match(snapshot, /fotosFichaLiquidada/);
assert.match(snapshot, /listarResumosFichaComMesesAnteriores/);
assert.match(snapshot, /listarResumosFotosFichaLiquidada/);

const financeiroSnap = readFileSync(
  join(root, "src/lib/cooperado/cooperadoPwaFichaResumoSnapshot.ts"),
  "utf8"
);
assert.match(financeiroSnap, /fotosAReceber/);
assert.match(financeiroSnap, /listarResumosFotosAReceber/);

const contrato = readFileSync(
  join(root, "src/lib/cooperado/cooperadoFotosFichaContrato.ts"),
  "utf8"
);
assert.match(contrato, /COOPERADO_FOTOS_FICHA_CONTRATO_VERSION = 1/);

console.log("ok: contrato Ficha / Foto a receber travado (mês anterior + liquidação)");
