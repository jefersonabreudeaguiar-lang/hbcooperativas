import type { AuthoritativeCreditBaseErrorPayload } from "@/modules/hb-credit/engine/creditBaseAuthoritative";

/** Mensagem amigável quando GET/sync não consegue calcular crédito-base (M6) na nuvem. */
export function mensagemAvisoBaseAuthoritativeLimites(
  error?: AuthoritativeCreditBaseErrorPayload | null
): string {
  if (!error?.message) return "";
  if (error.code === "OPERACIONAL_UNAVAILABLE") {
    return "Não foi possível calcular o valor a receber na nuvem (operacional indisponível ou desatualizado). Sincronize os dados da cooperativa e clique em «Atualizar limites».";
  }
  if (error.code === "COOPERATIVA_NOT_FOUND") {
    return "Cooperativa não encontrada na nuvem. Verifique o cadastro e tente novamente.";
  }
  return error.message;
}
