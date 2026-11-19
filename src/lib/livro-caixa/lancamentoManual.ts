import type { LivroCaixaLancamento, LivroCaixaOrigem } from "@/types";

export const ORIGENS_LANCAMENTO_MANUAL: LivroCaixaOrigem[] = [
  "manual", "credito_avulso", "debito_avulso", "pnae", "prestacao_contas", "origem_cadastrada", "outro",
];

/** Política compartilhada com o cache, sem carregar o motor financeiro na abertura. */
export function isLancamentoManualEditavel(l: LivroCaixaLancamento): boolean {
  if (l.origemId?.trim()) return false;
  return ORIGENS_LANCAMENTO_MANUAL.includes(l.origem);
}
