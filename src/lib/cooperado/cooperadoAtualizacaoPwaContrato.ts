/**
 * Contrato — atualização do PWA do cooperado (atalho instalado).
 * Híbrido nível frota: pintar na hora, trocar o HTML uma vez, sem apagar a vida do cooperado.
 *
 * Modelo: WhatsApp/Uber/Instagram Web — envelope de versão + swap de documento.
 * Não é “limpar cache e cookie”. Isso mata sessão e quebra o atalho (WebAPK).
 */

export const COOPERADO_ATUALIZACAO_PWA_CONTRATO_VERSION = 1;

/** Início pinta do aparelho antes de qualquer probe de versão. */
export const COOPERADO_ATUALIZACAO_PINTA_ANTES_DO_PROBE = true;

/**
 * Atalho instalado: se o HTML/JS estiver atrás da nuvem, troca o documento uma vez
 * depois do cold start — sem desregistrar o Service Worker e sem apagar cookie/sessão.
 */
export const COOPERADO_ATUALIZACAO_TROCA_HTML_UMA_VEZ = true;

/** Proibido no align do atalho: unregister de SW (Android “página sem resposta”). */
export const COOPERADO_ATUALIZACAO_PRESERVA_SERVICE_WORKER = true;

/** Proibido: limpar cookie/sessão para “forçar update”. */
export const COOPERADO_ATUALIZACAO_PRESERVA_SESSAO = true;

/** Sem polling ao trocar Início/Entregas/Financeiro. */
export const COOPERADO_ATUALIZACAO_SEM_POLL_NAS_ABAS = true;

export const COOPERADO_ATUALIZACAO_COLD_START_ENDED_TRIGGER = "cold_start_ended";
