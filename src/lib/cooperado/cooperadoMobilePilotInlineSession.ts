import { COOPERADO_MOBILE_PILOT_COOPERADO_ID, COOPERADO_MOBILE_PILOT_EMAIL } from "@/lib/cooperado/cooperadoMobilePilot";
import { normalizeAuthEmail } from "@/lib/security/appCreator";

/** Detecção de sessão piloto em scripts inline do `<head>` (sem bundle React). */
export function cooperadoMobilePilotInlineSessionHelperJs(): string {
  const email = normalizeAuthEmail(COOPERADO_MOBILE_PILOT_EMAIL);
  const id = COOPERADO_MOBILE_PILOT_COOPERADO_ID;
  return `function hbCoopSessPilot(s){if(!s)return false;var em=String(s.email||"").toLowerCase().trim();return em==="` +
    email +
    `"||String(s.cooperadoId||"")==="` +
    id +
    `";}`;
}
