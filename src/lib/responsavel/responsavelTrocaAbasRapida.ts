/**
 * Troca de abas do responsável — esconde/mostra o lastro, sem remount no toque.
 * Não puxar operacional nem parsear AppData no mesmo frame da troca.
 */

export const RESPONSAVEL_TROCA_ABAS_RAPIDA_VERSION = 1;

export const RESPONSAVEL_TROCA_ABAS_USA_CACHE_KEEP_ALIVE = true;

export const RESPONSAVEL_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE = true;

export const RESPONSAVEL_TROCA_ABAS_PIN_DO_DIA = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
] as const;
