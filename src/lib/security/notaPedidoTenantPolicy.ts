/** Detects note IDs already owned by a different cooperative in the global SQL table. */
export function notaPedidoIdsDeOutraCooperativa(
  cnpjAlvo: string,
  rows: readonly { id: string; cooperativa_cnpj: string }[]
): string[] {
  const alvo = cnpjAlvo.replace(/\D/g, "");
  if (alvo.length !== 14) return rows.map((row) => row.id);
  return rows
    .filter((row) => row.cooperativa_cnpj.replace(/\D/g, "") !== alvo)
    .map((row) => row.id);
}
