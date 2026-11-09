/** Placeholders and internal identifiers are never a person's name. */
export function nomeCooperadoSnapshotUtilizavel(nome?: string | null): string | undefined {
  const value = nome?.trim();
  if (!value || /^(?:(?:nome |cooperado )?desconhecido|cooperado|sem nome|—|-|c_\S+|u_\S+)$/i.test(value)) return undefined;
  return value;
}
