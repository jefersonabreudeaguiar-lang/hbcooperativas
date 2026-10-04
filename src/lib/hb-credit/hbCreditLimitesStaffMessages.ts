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

/** Erro ao refetch da lista na aba Limites (nunca expor mensagem crua de JSON.parse). */
export function mensagemErroListaLimitesStaff(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (
    /unexpected end of json/i.test(msg) ||
    /failed to execute 'json'/i.test(msg) ||
    /resposta vazia/i.test(msg) ||
    /resposta inv[aá]lida/i.test(msg)
  ) {
    return "Não foi possível atualizar a lista agora (servidor demorou ou resposta incompleta). Os valores em cache continuam visíveis — use «Atualizar limites».";
  }
  if (/erro ao comunicar com o servidor/i.test(msg)) {
    return "Não foi possível atualizar a lista agora. Os valores exibidos foram mantidos — use «Atualizar limites» quando a conexão estiver estável.";
  }
  if (msg.trim()) return msg.trim();
  return "Não foi possível carregar limites da nuvem.";
}
