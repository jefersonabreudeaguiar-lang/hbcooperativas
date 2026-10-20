/**
 * Troca de abas do cooperado — estilo app: esconde/mostra, sem trabalho pesado no toque.
 * Não voltar a parsear AppData nem puxar nuvem no mesmo frame da troca.
 */
export const COOPERADO_TROCA_ABAS_RAPIDA_VERSION = 1;

/** Keep-alive + URL otimista: destino em cache pinta na hora. */
export const COOPERADO_TROCA_ABAS_USA_CACHE_KEEP_ALIVE = true;

/** Sync / rematerializar só depois do paint (idle). */
export const COOPERADO_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE = true;
