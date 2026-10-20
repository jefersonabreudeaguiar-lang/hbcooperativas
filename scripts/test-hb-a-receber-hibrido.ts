/**
 * A receber híbrido: ficha ganha; overlay cobre o buraco; lastro não zera.
 * npx tsx scripts/test-hb-a-receber-hibrido.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aplicarDebitoHbHibridoNaParidade,
  aplicarDebitoHbHibridoNoValor,
  escolherDebitoHbHibrido,
  mesclarDescontosExtrasComHbHibrido,
  HB_A_RECEBER_HIBRIDO_VERSION,
} from "../src/lib/hb-credit/hbAReceberHibrido.ts";
import type { LeituraFinanceiraParidadeCooperado } from "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal.ts";

assert.equal(HB_A_RECEBER_HIBRIDO_VERSION, 1);

const overlay = [
  {
    motivo: "Compra HB Créditos — mercado",
    valorReais: 80,
    tipo: "conta_coop" as const,
    createdAt: "2026-10-20T12:00:00.000Z",
    hbTransactionId: "tx_hibrido",
  },
];

{
  const soOverlay = escolherDebitoHbHibrido({ linhasFicha: [], linhasOverlay: overlay });
  assert.equal(soOverlay.fonte, "overlay");
  assert.equal(soOverlay.valorReais, 80);
  assert.equal(aplicarDebitoHbHibridoNoValor(500, 80), 420);
}

{
  const ficha = escolherDebitoHbHibrido({
    linhasFicha: [{ tipo: "conta_coop", valor: 80, motivo: "Compra HB" }],
    linhasOverlay: overlay,
  });
  assert.equal(ficha.fonte, "ficha", "ficha ganha — sem descontar duas vezes");
  assert.equal(ficha.valorReais, 80);
}

{
  assert.equal(aplicarDebitoHbHibridoNoValor(80, 80), 80, "desconto igual ao lastro não zera");
  assert.equal(aplicarDebitoHbHibridoNoValor(50, 80), 50, "desconto maior que o lastro não zera");
  assert.equal(aplicarDebitoHbHibridoNoValor(0, 80), 0);
}

{
  const extras = mesclarDescontosExtrasComHbHibrido(
    [{ tipo: "mensalidade", motivo: "Mensalidade", valor: 10 }],
    { fonte: "overlay", valorReais: 80, linhas: overlay }
  );
  assert.equal(extras.filter((d) => d.tipo === "conta_coop").length, 1);
  const jaTem = mesclarDescontosExtrasComHbHibrido(
    [{ tipo: "conta_coop", motivo: "Compra HB", valor: 80 }],
    { fonte: "overlay", valorReais: 80, linhas: overlay }
  );
  assert.equal(jaTem.filter((d) => d.tipo === "conta_coop").length, 1, "não duplica linha");
}

{
  const paridade = {
    valorLiquido: 500,
    mesLabel: "Outubro 2026",
    mesesResumo: ["2026-10"],
    descontosExtras: [] as LeituraFinanceiraParidadeCooperado["descontosExtras"],
    resumo: {
      valorEntregas: 500,
      valorLiquido: 500,
      descontosExtras: [],
      valorBruto: 500,
      descontoCooperativa: 0,
      fichaIds: [],
      notaPedidoIds: [],
    },
    consolidado: {
      meses: ["2026-10"],
      mesLabel: "Outubro 2026",
      valorLiquido: 500,
      aguardandoAssinatura: false,
      resumo: {
        valorEntregas: 500,
        valorLiquido: 500,
        descontosExtras: [],
        valorBruto: 500,
        descontoCooperativa: 0,
        fichaIds: [],
        notaPedidoIds: [],
      },
    },
  } as LeituraFinanceiraParidadeCooperado;
  const h = aplicarDebitoHbHibridoNaParidade(paridade, overlay);
  assert.equal(h.valorLiquido, 420);
  assert.ok(h.descontosExtras.some((d) => d.tipo === "conta_coop"));
}

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const warmup = readFileSync(join(ROOT, "src/hooks/useHbCreditDescontosWarmup.ts"), "utf8");
assert.match(warmup, /HB_CREDIT_ACCOUNT_CACHE_EVENT/, "puxa ficha HB quando o card HB já tem cache");
assert.match(warmup, /cooperadoHbCreditCacheTemValor/, "se o HB já mostra uso, não espera o idle longo");
assert.doesNotMatch(
  warmup,
  /if \(Date\.now\(\) - lastSilentFichaAt < SILENT_FICHA_VISIBLE_GAP_MS\) return;\s+lastSilentFichaAt = Date\.now\(\)/,
  "não trava 90s antes do fetch"
);

const inicio = readFileSync(join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"), "utf8");
assert.match(inicio, /escolherDebitoHbHibrido/, "Início aplica híbrido no A receber");
assert.match(inicio, /permitirQuedaPorHb/, "Início pode cair quando há débito HB");

const financeiro = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");
assert.match(financeiro, /aplicarDebitoHbHibridoNaParidade/, "Financeiro aplica híbrido");
assert.match(financeiro, /if \(drift && liveValor > 0\.005\)/, "Financeiro não troca lastro por zero");
assert.match(financeiro, /HB_A_RECEBER_HIBRIDO_EVENT/, "Financeiro ouve overlay sem rematerializar Entregas");

assert.match(inicio, /HB_A_RECEBER_HIBRIDO_EVENT/, "Início ouve overlay sem rematerializar Entregas");

const hibridoSrc = readFileSync(join(ROOT, "src/lib/hb-credit/hbAReceberHibrido.ts"), "utf8");
assert.match(hibridoSrc, /dispatchHbAReceberHibridoRefresh/);
assert.doesNotMatch(
  hibridoSrc,
  /dispatchCooperadoPwaLeveUiSnapshotRefresh/,
  "overlay HB não dispara refresh da aba Entregas"
);

console.log("test-hb-a-receber-hibrido.ts ok");
