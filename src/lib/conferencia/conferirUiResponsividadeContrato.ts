/**
 * Conferir — página não pode travar o browser (ANR).
 * Incidente v603: leitura pesada no render + hydrate síncrono no frame.
 *
 * Regras (agente + CI):
 * 1. Nunca `appDataParaConferirLeitura` / relatório Em aberto no corpo do render — só selector, useMemo, idle ou aba ativa.
 * 2. Hidratação de cadastro (cooperados nuvem) só em useEffect + idle/timeout; sem resetar cache do painel no mesmo tick.
 * 3. Badge Em aberto: `useDeferredValue` ou equivalente — UI da fila não espera o motor completo.
 * 4. Antes de push em hooks Conferir: `npm run test:conferir-ui-nao-travar` + gate preservar-app.
 */

export const CONFERIR_UI_RESPONSIVIDADE_VERSION = 1;

/** Uma passagem de `appDataParaConferirLeitura` por revisão de domínio — não reentrar no render. */
export const CONFERIR_LEITURA_PESADA_SO_MEMO_OU_SELECTOR = true;

/** Download de cooperados não bloqueia o primeiro paint da fila. */
export const CONFERIR_HYDRATE_CADASTRO_NO_IDLE = true;

/** Contagem Em aberto não bloqueia fila/cooperado/histórico. */
export const CONFERIR_EM_ABERTO_CONTAGEM_DIFERIDA = true;
