/** Cadastro único de assinatura em papel — disponível para todos os cooperados. */
export function cooperadoUsaAssinaturaCadastro(cooperadoId: string | undefined | null): boolean {
  return Boolean(cooperadoId?.trim());
}

/** Alias mantido nos imports existentes. */
export const cooperadoUsaAssinaturaCadastroPilot = cooperadoUsaAssinaturaCadastro;

/** Meu cadastro — cooperado pode enviar nova foto mesmo com assinatura já confirmada. */
export function cooperadoPodeEditarAssinaturaCadastroNoMeuCadastro(): boolean {
  return true;
}
