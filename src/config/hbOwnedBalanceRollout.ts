/** Liberação explícita no servidor e limitada à cooperativa validada. Padrão fechado. */
export function isHbOwnedBalanceOperationsReady(cnpj?: string): boolean {
  const scope = process.env.HB_OWNED_BALANCE_CNPJ ?? "";
  return process.env.HB_OWNED_BALANCE_OPERATIONS_ENABLED === "true"
    && /^\d{14}$/.test(scope)
    && cnpj?.replace(/\D/g, "") === scope;
}
