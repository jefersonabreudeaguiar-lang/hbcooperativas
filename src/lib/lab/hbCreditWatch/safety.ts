/** Guardas de segurança — probe READ-ONLY em hb_credit_* */

const FORBIDDEN_MUTATIONS = [
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
  ".rpc(",
  "INSERT INTO hb_credit",
  "UPDATE hb_credit",
  "DELETE FROM hb_credit",
] as const;

export function assertReadOnlyOperation(operationLabel: string): void {
  const lower = operationLabel.toLowerCase();
  for (const forbidden of FORBIDDEN_MUTATIONS) {
    if (lower.includes(forbidden.toLowerCase())) {
      throw new Error(`HB_CREDIT_WATCH_SAFETY_VIOLATION: ${forbidden}`);
    }
  }
}

export const ALLOWED_CREDIT_TABLES_READ = ["hb_credit_accounts"] as const;

export function assertAllowedTable(table: string): void {
  if (!ALLOWED_CREDIT_TABLES_READ.includes(table as (typeof ALLOWED_CREDIT_TABLES_READ)[number])) {
    throw new Error(`HB_CREDIT_WATCH_SAFETY_VIOLATION: table ${table} not in allowlist`);
  }
}
