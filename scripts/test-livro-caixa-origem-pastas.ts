/**
 * Pastas do Livro caixa — origem cadastrada + filtro + relatório.
 * npx tsx scripts/test-livro-caixa-origem-pastas.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, LivroCaixaLancamento } from "../src/types/index.ts";
import {
  cadastrarOrigemLivroCaixa,
  filtrarLancamentosPorPasta,
  listarPastasLivroCaixa,
  mergeLivroCaixaOrigensCadastroFromCloud,
  pastaKeyDeLancamento,
  rotuloOrigemLancamento,
} from "../src/lib/livro-caixa/livroCaixaOrigemPastas.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

function lancamento(partial: Partial<LivroCaixaLancamento> & Pick<LivroCaixaLancamento, "id" | "origem">): LivroCaixaLancamento {
  return {
    cooperativaId: "coop-1",
    data: "2026-10-20",
    mesReferencia: "2026-10",
    tipo: "credito",
    valor: 100,
    historico: "teste",
    createdAt: "2026-10-20T12:00:00.000Z",
    updatedAt: "2026-10-20T12:00:00.000Z",
    ...partial,
  };
}

const vazio = { livroCaixaOrigensCadastro: [] } as AppData;
const comOrigem = cadastrarOrigemLivroCaixa(vazio, {
  id: "orig-comb",
  cooperativaId: "coop-1",
  nome: "Combustível",
});
assert.equal(comOrigem.livroCaixaOrigensCadastro?.length, 1);
assert.equal(
  cadastrarOrigemLivroCaixa(comOrigem, { id: "x", cooperativaId: "coop-1", nome: "combustível" }),
  comOrigem,
  "não duplica origem com o mesmo nome"
);

const pnae = lancamento({ id: "l1", origem: "pnae" });
const comb = lancamento({
  id: "l2",
  origem: "origem_cadastrada",
  origemCadastroId: "orig-comb",
  historico: "Diesel",
});
assert.equal(pastaKeyDeLancamento(pnae), "sys:pnae");
assert.equal(pastaKeyDeLancamento(comb), "cad:orig-comb");
assert.deepEqual(
  filtrarLancamentosPorPasta([pnae, comb], "cad:orig-comb").map((l) => l.id),
  ["l2"]
);
assert.equal(rotuloOrigemLancamento(comb, comOrigem.livroCaixaOrigensCadastro ?? []), "Combustível");

const pastas = listarPastasLivroCaixa(comOrigem, "coop-1", [pnae, comb]);
assert.ok(pastas.some((p) => p.key === "cad:orig-comb" && p.quantidade === 1));
assert.ok(pastas.some((p) => p.key === "sys:pnae" && p.quantidade === 1));

const mergedOrigens = mergeLivroCaixaOrigensCadastroFromCloud(
  comOrigem.livroCaixaOrigensCadastro ?? [],
  []
);
assert.equal(mergedOrigens.length, 1, "pull sem cadastro não apaga origem local");

const ui = readFileSync(join(root, "src/app/(app)/livro-caixa/LivroCaixaContent.tsx"), "utf8");
assert.match(ui, /Cadastrar origem do lançamento/);
assert.match(ui, /Emitir relatório desta origem/);
assert.match(ui, /pastasOrigem\.map/);
assert.match(ui, /pastaOrigem: pastaAtiva/);
assert.match(
  ui,
  /resetForm\(\);\s*flushStaffGestaoLastGoodNow\(getDataOperationalTruth\(\)\);\s*void publicar\(\{ force: true \}\);/,
  "salvar lançamento grava lastro e publica na nuvem — F5 não depende só do aparelho"
);

const rel = readFileSync(join(root, "src/utils/livroCaixaRelatorioHtml.ts"), "utf8");
assert.match(rel, /pastaOrigem/);
assert.match(rel, /filtrarLancamentosPorPasta/);

const sync = readFileSync(join(root, "src/services/cooperativaSyncCloudService.ts"), "utf8");
assert.match(sync, /livroCaixaOrigensCadastro:/);
assert.match(sync, /mergeLivroCaixaOrigensCadastroFromCloud/);
assert.match(
  sync,
  /!dominioFornecido\("livroCaixa"\) && !replaceLivro/,
  "pull autoritativo não substitui o livro inteiro — mantém lançamento local"
);

console.log("ok: pastas do livro caixa por origem + relatório");
