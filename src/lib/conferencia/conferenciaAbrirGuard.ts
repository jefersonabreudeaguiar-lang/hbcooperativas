/** Bloqueia abrir conferência enquanto exclusão da nota ainda não sincronizou. */
export function notaBloqueadaConferenciaPorExclusaoPendente(
  notaId: string,
  pendingDeleteIds: ReadonlySet<string> | undefined
): boolean {
  return Boolean(pendingDeleteIds?.has(notaId));
}
