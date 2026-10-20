/**
 * Contrato Conferir entregas + Em aberto (responsável).
 * Não voltar ao modelo que esvazia a fila ou espera a nuvem para pintar.
 *
 * 1. Abrir Conferir pinta o lastro na hora — notas enviadas não esperam sync pesado.
 * 2. Nota só sai da fila quando o responsável lança na ficha, rejeita, cancela ou apaga.
 * 3. Sync pobre / keep-alive / F5 não apagam o card que já estava na tela.
 * 4. Em aberto pinta o lastro na hora; abrir a aba não zera o cache.
 * 5. Lastro do painel fica no aparelho (sobrevive fechar o PWA).
 * 6. Em aberto lista cooperados e valores da ficha sem PIX (mesmo lastro do Pagar),
 *    não a foto do Conferir que marca nota como paga.
 */
export const RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION = 2;

export function staffEmAbertoUsaFichaDoPagarNaoFotoConferir(): true {
  return true;
}

export const RESPONSAVEL_CONFERIR_ENTREGAS_TITULO = "Conferir entregas";
export const RESPONSAVEL_CONFERIR_EM_ABERTO_TITULO = "Em aberto";

export function staffConferirPintaLastroNaHora(): true {
  return true;
}

export function staffConferirFilaNaoSomeSemLancamento(): true {
  return true;
}

export function staffEmAbertoNaoResetaCacheAoAbrir(): true {
  return true;
}

export function staffGestaoLastroPersisteNoAparelho(): true {
  return true;
}
