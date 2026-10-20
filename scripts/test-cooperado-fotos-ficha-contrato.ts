/**
 * Contrato Ficha / Foto a receber — ficha completa + fotos por mês com sequência.
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
  mesclarResumosFichaCompletaFontes,
  mesclarResumosFichaComMesesAnteriores,
  particionarResumosFotosPorAberto,
  resumosFotosAPartirDeResumos,
} from "../src/lib/cooperado/cooperadoFotosFichaContrato.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

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

assert.equal(COOPERADO_FOTOS_FICHA_CONTRATO_VERSION, 2);
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

const { aReceber, fichaLiquidada } = particionarResumosFotosPorAberto(
  [aberto, anterior],
  new Set(["2026-10"])
);
assert.deepEqual(aReceber.map((r) => r.mesReferencia), ["2026-10"]);
assert.deepEqual(fichaLiquidada.map((r) => r.mesReferencia), ["2026-09"]);

const soComFoto = resumosFotosAPartirDeResumos([resumo("2026-08", false), resumo("2026-07", true)]);
assert.deepEqual(soComFoto.map((r) => r.mesReferencia), ["2026-07"]);

const mesclado = mesclarResumosFichaCompletaFontes(
  [],
  [resumo("2026-10", true)],
  [resumo("2026-09", true)]
);
assert.deepEqual(mesclado.map((r) => r.mesReferencia), ["2026-10", "2026-09"]);

const financeiroNav = read("src/components/cooperado/CooperadoFinanceiroSecoesNav.tsx");
assert.match(financeiroNav, /COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL/);
assert.doesNotMatch(financeiroNav, /label: "Fotos"/);

const financeiroPage = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.match(financeiroPage, /listarResumosFotosAReceber/);
assert.doesNotMatch(financeiroPage, /listarResumosFotosCooperado\(/);

const fichaTab = read("src/components/cooperado/CooperadoMinhaFichaTab.tsx");
assert.match(fichaTab, /listarResumosFotosFichaTodas/);
assert.match(fichaTab, /listarResumosFichaCompletaCooperado/);
assert.match(fichaTab, /mesclarResumosFichaCompletaFontes/);
assert.match(fichaTab, /lerCooperadoPwaFichaResumoSnapshot/);
assert.match(fichaTab, /COOPERADO_FICHA_FOTOS_LIQUIDADAS_LABEL/);
assert.match(fichaTab, /Ficha completa/);

const entregasMain = read("src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx");
assert.match(entregasMain, /listarResumosFichaCompletaCooperado/);
assert.match(entregasMain, /painelCooperadoEntregasAtivo/);
assert.match(entregasMain, /fotosFichaLiquidadaCache/);
assert.match(entregasMain, /useState\(""\)/);
assert.doesNotMatch(entregasMain, /useState\(isCooperado \? "pendentes"/);
assert.doesNotMatch(entregasMain, /filtrarResumosMesesNaoQuitados\(/);

const snapshot = read("src/lib/cooperado/cooperadoPwaEntregasResumosSnapshot.ts");
assert.match(snapshot, /fichaExtrato/);
assert.match(snapshot, /listarResumosFichaCompletaCooperado/);
assert.match(snapshot, /listarResumosFotosFichaTodas/);
assert.match(snapshot, /COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION = 2/);

const sanfona = read("src/components/cooperado/cooperadoMesEntregasFotosSanfona.tsx");
assert.match(sanfona, /FotoLightbox/);
assert.match(sanfona, /sequencia/);
assert.match(sanfona, /onIndexChange/);

const contrato = read("src/lib/cooperado/cooperadoFotosFichaContrato.ts");
assert.match(contrato, /COOPERADO_FOTOS_FICHA_CONTRATO_VERSION = 2/);
assert.match(contrato, /listarResumosFichaCompletaCooperado/);
assert.match(contrato, /listarResumosFotosFichaTodas/);

console.log("ok: contrato Ficha completa + Fotos por mês com sequência");
