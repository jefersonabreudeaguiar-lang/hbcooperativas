/**
 * Abertura do app cooperado — Início na hora, nuvem em segundo plano.
 * Não voltar a esperar login/sync/splash para pintar.
 */
export const COOPERADO_ABERTURA_INSTANTANEA_VERSION = 1;

/** Mesmo prefixo de `INICIO_CARD_STORAGE_VERSION` — sem importar persistência no layout. */
export const COOPERADO_INICIO_CARD_STORAGE_VERSION = 8;

/** Login cooperado navega assim que a sessão local existe — JWT/nuvem depois. */
export const COOPERADO_LOGIN_NAVEGA_ANTES_DA_NUVEM = true;

/** Splash do PWA não segura a tela: pinta o último Início e o React assume. */
export const COOPERADO_BOOT_SHELL_PINTA_INICIO_LOCAL = true;
