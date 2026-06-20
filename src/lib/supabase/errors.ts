export function isCooperativasTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  return Boolean(error.message?.includes("Could not find the table 'public.cooperativas'"));
}

export function isNotasPedidoTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  return Boolean(error.message?.includes("Could not find the table 'public.notas_pedido'"));
}
