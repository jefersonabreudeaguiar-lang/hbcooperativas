/**
 * Renderização React real da apresentação Conferir → Em aberto.
 * Usa react-dom/server + DataTable/StatCard reais, fixtures só em memória.
 * npx tsx scripts/test-conferir-em-aberto-render-v479.ts
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SITUACAO_ENTREGA_POS_PIX,
  SITUACAO_SEM_PIX_MES,
} from "../src/components/notas/conferirEmAbertoSituacao.ts";
import {
  LancamentosEmAbertoPainelView,
  type LinhaTabelaConferir,
} from "../src/components/notas/LancamentosEmAbertoPainelView.tsx";
import { formatCurrency } from "../src/utils/format.ts";

function linha(partial: Partial<LinhaTabelaConferir> & Pick<LinhaTabelaConferir, "id" | "situacao" | "total">): LinhaTabelaConferir {
  return {
    cooperado: partial.cooperado ?? partial.id,
    mesesLabel: partial.mesesLabel ?? "outubro 2026",
    entregas: partial.entregas ?? 1,
    ...partial,
  };
}

function renderView(linhasTabela: LinhaTabelaConferir[], totalGeral: number) {
  const html = renderToStaticMarkup(
    createElement(LancamentosEmAbertoPainelView, {
      linhasTabela,
      totalGeral,
      detalharPorMes: false,
      cooperadosCount: linhasTabela.length,
    })
  );
  assert.match(html, /<table/, "DataTable real emitiu <table>");
  assert.match(html, /Situação/, "cabeçalho Situação");
  assert.match(html, /Valor pendente/, "cabeçalho Valor pendente");
  assert.match(html, /Total pendente a pagar/, "cartão de total");
  return html;
}

{
  const html = renderView(
    [linha({ id: "c-syn-sem", cooperado: "Syn Sem Pix", situacao: SITUACAO_SEM_PIX_MES, total: 100 })],
    100
  );
  assert.ok(html.includes(SITUACAO_SEM_PIX_MES));
  assert.ok(html.includes(formatCurrency(100)), `total 100 no HTML: ${formatCurrency(100)}`);
  assert.ok(!html.includes(SITUACAO_ENTREGA_POS_PIX));
  console.log("ok: render sem PIX — Situação + Valor pendente + total 100");
}

{
  const html = renderView(
    [linha({ id: "c-syn-pos", cooperado: "Syn Pos Pix", situacao: SITUACAO_ENTREGA_POS_PIX, total: 40 })],
    40
  );
  assert.ok(html.includes(SITUACAO_ENTREGA_POS_PIX));
  assert.ok(html.includes(formatCurrency(40)), `total 40 no HTML: ${formatCurrency(40)}`);
  assert.ok(!html.includes(formatCurrency(100)), "não duplica o PIX de 100");
  assert.ok(!html.includes(formatCurrency(110)), "não soma leftover com PIX");
  console.log("ok: render pos PIX — leftover 40 sem duplicar PIX");
}

{
  const html = renderView(
    [linha({ id: "c-syn-misto", cooperado: "Syn Misto", situacao: "", total: 110 })],
    110
  );
  assert.match(html, />—</);
  assert.ok(!html.includes(SITUACAO_SEM_PIX_MES));
  assert.ok(!html.includes(SITUACAO_ENTREGA_POS_PIX));
  assert.ok(html.includes(formatCurrency(110)), `total 110 no HTML: ${formatCurrency(110)}`);
  console.log("ok: render misto — apresentação — + total 110");
}

console.log("ok: renderização React Conferir v479 — DataTable real");
