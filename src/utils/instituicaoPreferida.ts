const KEY_PREFIX = "coopeagriplla_inst_padrao_";

export function getInstituicaoPadraoId(cooperativaId: string): string | null {
  if (typeof window === "undefined" || !cooperativaId) return null;
  return localStorage.getItem(`${KEY_PREFIX}${cooperativaId}`);
}

export function setInstituicaoPadraoId(cooperativaId: string, instituicaoId: string): void {
  if (typeof window === "undefined" || !cooperativaId || !instituicaoId) return;
  localStorage.setItem(`${KEY_PREFIX}${cooperativaId}`, instituicaoId);
}

export function clearInstituicaoPadraoId(cooperativaId: string): void {
  if (typeof window === "undefined" || !cooperativaId) return;
  localStorage.removeItem(`${KEY_PREFIX}${cooperativaId}`);
}

/** Instituição para conferência: padrão salvo → informada pelo cooperado → primeira da lista. */
export function resolverInstituicaoConferencia(
  cooperativaId: string,
  instituicoes: { id: string }[],
  instituicaoNota?: string
): string {
  const padrao = getInstituicaoPadraoId(cooperativaId);
  if (padrao && instituicoes.some((i) => i.id === padrao)) return padrao;
  if (instituicaoNota && instituicoes.some((i) => i.id === instituicaoNota)) return instituicaoNota;
  return instituicoes[0]?.id ?? "";
}
