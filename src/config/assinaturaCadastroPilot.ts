/** Piloto: cadastro único de assinatura em papel — só este cooperado por enquanto. */
export const ASSINATURA_CADASTRO_PILOT_COOPERADO_ID = "c_1782263929381_ncp55";

export const ASSINATURA_CADASTRO_PILOT_NOME = "Orlando Fetisch";

export function cooperadoUsaAssinaturaCadastroPilot(cooperadoId: string | undefined | null): boolean {
  if (!cooperadoId?.trim()) return false;
  return cooperadoId.trim() === ASSINATURA_CADASTRO_PILOT_COOPERADO_ID;
}
