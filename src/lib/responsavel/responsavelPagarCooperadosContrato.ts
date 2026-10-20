/**
 * Contrato da aba Pagar cooperados (responsável).
 * Não voltar ao modelo que esvazia a fila ou abre em Ficha sem ordem + bump.
 *
 * 1. Menu «Pagar cooperados» abre na aba Pagar.
 * 2. Lista quem tem ficha em aberto ou nota conferida sem PIX.
 * 3. Valor = ficha em aberto (não consolidado zerado).
 * 4. Abrir a aba não puxa operacional (isso retrocede o painel).
 * 5. Last-good guarda PIX confirmado E quem ainda está a pagar — sync pobre não apaga a fila.
 */
export const RESPONSAVEL_PAGAR_COOPERADOS_CONTRATO_VERSION = 1;

export const RESPONSAVEL_PAGAR_COOPERADOS_ABA_PADRAO = "pagar" as const;
export const RESPONSAVEL_PAGAR_COOPERADOS_TITULO = "Pagar cooperados";

export type AbaFichaPagarResponsavel = "ficha" | "pagar";

export function abaInicialPagarCooperadosResponsavel(opts: {
  abaQuery?: string | null;
  filaQuery?: string | null;
}): AbaFichaPagarResponsavel {
  if (opts.abaQuery === "ficha") return "ficha";
  if (opts.abaQuery === "pagar") return "pagar";
  if (opts.filaQuery === "assinaturas" || opts.filaQuery === "verificar-recibos") {
    return "pagar";
  }
  return RESPONSAVEL_PAGAR_COOPERADOS_ABA_PADRAO;
}

export function staffPagarNaoPuxaOperacionalAoAbrir(): true {
  return true;
}
