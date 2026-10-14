/** Detecção cooperado mobile em scripts inline do `<head>` (sem bundle React). */
export function cooperadoMobilePilotInlineSessionHelperJs(): string {
  return (
    `function hbCoopSessGaCooperadoMobile(s){if(!s||s.role!=="cooperado")return false;` +
    `try{var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;` +
    `var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;return standalone||mobile;}` +
    `catch(e){return true;}}function hbCoopSessPilot(s){return hbCoopSessGaCooperadoMobile(s);}`
  );
}
