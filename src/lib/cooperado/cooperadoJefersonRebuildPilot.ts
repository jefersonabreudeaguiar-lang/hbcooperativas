import type { User } from "@/types";
import {
  COOPERADO_MOBILE_PILOT_COOPERADO_ID,
  isCooperadoMobilePilot,
} from "@/lib/cooperado/cooperadoMobilePilot";

/** Liga reconstrução incremental — só afeta Jeferson quando `true`. */
export const COOPERADO_JEFERSON_REBUILD_MODE_ON = true;

export type CooperadoJefersonRebuildTab = "inicio" | "entregas" | "precos" | "financeiro";

/**
 * Abas já reimplementadas no piloto. Vazio = cooperado Jeferson vê casca zerada em todas.
 * Promoção oficial: copiar implementação estável e habilitar GA separadamente.
 */
export const COOPERADO_JEFERSON_REBUILD_TABS_HABILITADAS: readonly CooperadoJefersonRebuildTab[] = [
  "inicio",
];

export function isCooperadoJefersonRebuildPilot(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!COOPERADO_JEFERSON_REBUILD_MODE_ON) return false;
  return isCooperadoMobilePilot(user);
}

export function cooperadoJefersonRebuildTabHabilitada(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!isCooperadoJefersonRebuildPilot(user)) return true;
  return COOPERADO_JEFERSON_REBUILD_TABS_HABILITADAS.includes(tab);
}

/** Conteúdo legado pesado deve ficar desligado quando a aba ainda não foi refeita. */
export function cooperadoJefersonRebuildUsarConteudoLegado(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  return cooperadoJefersonRebuildTabHabilitada(tab, user);
}

export function shouldRenderCooperadoJefersonRebuildShell(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoJefersonRebuildPilot(user) && !cooperadoJefersonRebuildTabHabilitada(tab, user);
}

export function isCooperadoJefersonRebuildInicioAtivo(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoJefersonRebuildPilot(user) && cooperadoJefersonRebuildTabHabilitada("inicio", user);
}

/** Fragmento para `<head>` — Jeferson rebuild não faz parse do operacional local. */
export function cooperadoJefersonRebuildInlineHeadSkipAppDataWarmJs(): string {
  const id = COOPERADO_MOBILE_PILOT_COOPERADO_ID;
  if (!COOPERADO_JEFERSON_REBUILD_MODE_ON) return "";
  return (
    `try{var raw=localStorage.getItem("coopeagriplla_session");if(raw){var s=JSON.parse(raw);` +
    `var cid=(s.cooperadoId||s.mobileCooperadoId||"").trim();` +
    `if(s.role==="cooperado"&&cid==="` +
    id +
    `")return;}}catch(e){}`
  );
}
