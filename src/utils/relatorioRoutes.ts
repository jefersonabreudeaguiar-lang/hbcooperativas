/** URL canônica para abrir um relatório em /relatorios. */
export function hrefRelatorio(
  tipo: string,
  options?: { mes?: string; cooperado?: string; instituicao?: string }
): string {
  const params = new URLSearchParams({ tipo });
  if (options?.mes) params.set("mes", options.mes);
  if (options?.cooperado) params.set("cooperado", options.cooperado);
  if (options?.instituicao) params.set("instituicao", options.instituicao);
  return `/relatorios?${params.toString()}`;
}
