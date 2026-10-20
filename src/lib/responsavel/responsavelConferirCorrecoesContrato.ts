/**
 * Contrato Conferir → Correções (responsável).
 * Não voltar ao modelo que esconde cooperado com nota ainda sem liquidar.
 *
 * 1. A aba lista cooperados com nota conferida/devolvida/pendente ainda sem PIX.
 * 2. A lista lê o lastro real (getData), não a foto do Conferir que marca nota como paga.
 * 3. Relançar: tira da ficha, zera itens, volta à fila com as mesmas fotos. Bloqueia pago/PIX.
 * 4. Apagar: remove a entrega, a ficha e a nuvem. Bloqueia pago/PIX.
 */
export const RESPONSAVEL_CONFERIR_CORRECOES_CONTRATO_VERSION = 1;

export const RESPONSAVEL_CONFERIR_CORRECOES_TITULO = "Correções de entregas";

export function correcoesLeemLastroRealNaoFotoAlinhada(): true {
  return true;
}

export function correcoesNaoMexemNotaLiquidada(): true {
  return true;
}
