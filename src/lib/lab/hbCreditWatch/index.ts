export function isCreditWatchEnabled(): boolean {
  return process.env.HB_HOBELISCO_CREDIT_WATCH_ENABLED === "true";
}

export async function runHbCreditWatch(): Promise<{ ok: boolean; skipped?: string; findings?: number }> {
  return { ok: true, skipped: "lab_stub", findings: 0 };
}
