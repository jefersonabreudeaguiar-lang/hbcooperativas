import type {
  CreditIntegrityFinding,
  CreditProbeSnapshot,
  IncidentOutcomeRecord,
} from "./types";

/** Repositório in-memory para testes e fallback — NÃO muta hb_credit_* */

export class CreditWatchMemoryRepository {
  private snapshots = new Map<string, CreditProbeSnapshot>();
  private findings = new Map<string, CreditIntegrityFinding>();
  private runKeys = new Set<string>();
  private outcomes = new Map<string, IncidentOutcomeRecord>();

  hasRunKey(key: string): boolean {
    return this.runKeys.has(key);
  }

  markRunKey(key: string): void {
    this.runKeys.add(key);
  }

  saveSnapshot(snapshot: CreditProbeSnapshot): void {
    this.snapshots.set(snapshot.id, snapshot);
  }

  getLatestSnapshot(coopCnpj: string): CreditProbeSnapshot | null {
    const digits = coopCnpj.replace(/\D/g, "");
    const list = [...this.snapshots.values()]
      .filter((s) => s.coopCnpj.replace(/\D/g, "") === digits)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return list[0] ?? null;
  }

  getFindingByFingerprint(fingerprint: string): CreditIntegrityFinding | null {
    return this.findings.get(fingerprint) ?? null;
  }

  saveFinding(finding: CreditIntegrityFinding): { created: boolean } {
    const existing = this.findings.get(finding.fingerprint);
    if (existing) {
      this.findings.set(finding.fingerprint, {
        ...existing,
        snapshotId: finding.snapshotId,
        severity: finding.severity,
        expectedCents: finding.expectedCents,
        observedCents: finding.observedCents,
        differenceCents: finding.differenceCents,
        resolvedAt: null,
      });
      return { created: false };
    }
    this.findings.set(finding.fingerprint, finding);
    return { created: true };
  }

  resolveFinding(fingerprint: string, resolvedAt: string): boolean {
    const existing = this.findings.get(fingerprint);
    if (!existing || existing.resolvedAt) return false;
    this.findings.set(fingerprint, { ...existing, resolvedAt });
    return true;
  }

  listActiveFindings(coopCnpj: string): CreditIntegrityFinding[] {
    const digits = coopCnpj.replace(/\D/g, "");
    return [...this.findings.values()].filter(
      (f) => f.coopCnpj.replace(/\D/g, "") === digits && !f.resolvedAt
    );
  }

  saveOutcome(outcome: IncidentOutcomeRecord): void {
    this.outcomes.set(outcome.id, outcome);
  }

  getOutcome(incidentId: string): IncidentOutcomeRecord | null {
    const list = [...this.outcomes.values()]
      .filter((o) => o.incidentId === incidentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }

  stats(): Record<string, number> {
    return {
      snapshots: this.snapshots.size,
      findings: this.findings.size,
      activeFindings: [...this.findings.values()].filter((f) => !f.resolvedAt).length,
      outcomes: this.outcomes.size,
    };
  }

  reset(): void {
    this.snapshots.clear();
    this.findings.clear();
    this.runKeys.clear();
    this.outcomes.clear();
  }
}

let sharedRepo: CreditWatchMemoryRepository | null = null;

export function getCreditWatchRepository(): CreditWatchMemoryRepository {
  if (!sharedRepo) sharedRepo = new CreditWatchMemoryRepository();
  return sharedRepo;
}

export function resetCreditWatchRepository(): void {
  sharedRepo?.reset();
  sharedRepo = null;
}
