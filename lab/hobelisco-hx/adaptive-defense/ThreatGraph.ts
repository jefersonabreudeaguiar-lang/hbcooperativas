import type { AttackChainStage } from "./types";

export interface ThreatGraphNode {
  signal: string;
  stage: AttackChainStage;
  at: number;
}

export interface ThreatGraphMatch {
  matched: boolean;
  chain: string[];
  stages: AttackChainStage[];
  confidence: number;
  explanation: string;
}

/** Padrões de cadeia conhecidos — LAB only */
const KNOWN_CHAINS: Array<{ signals: string[]; label: string; severity: number }> = [
  { signals: ["auth_failure", "token_anomaly", "privilege_attempt"], label: "auth_to_privilege", severity: 0.85 },
  { signals: ["auth_failure", "credit_endpoint", "replay"], label: "auth_credit_replay", severity: 0.9 },
  { signals: ["sync_anomaly", "integrity_failure"], label: "sync_integrity", severity: 0.75 },
  { signals: ["login_fail", "idor", "alter_ledger"], label: "multi_vector_financial", severity: 0.95 },
  { signals: ["rate_spike", "api_abuse"], label: "api_flood", severity: 0.7 },
];

export class ThreatGraph {
  private nodes: ThreatGraphNode[] = [];

  ingest(signal: string, stage: AttackChainStage, atMs: number): void {
    this.nodes.push({ signal, stage, at: atMs });
    if (this.nodes.length > 50) this.nodes.shift();
  }

  analyze(windowMs = 300_000): ThreatGraphMatch {
    const recent = this.nodes.filter((n) => Date.now() - n.at <= windowMs);
    const signals = recent.map((n) => n.signal);

    for (const chain of KNOWN_CHAINS) {
      const hits = chain.signals.filter((s) => signals.some((sig) => sig.includes(s) || s.includes(sig)));
      if (hits.length >= chain.signals.length) {
        return {
          matched: true,
          chain: chain.signals,
          stages: recent.map((n) => n.stage),
          confidence: chain.severity,
          explanation: `Chain detected: ${chain.label}`,
        };
      }
      if (hits.length >= 2) {
        return {
          matched: true,
          chain: hits,
          stages: recent.map((n) => n.stage),
          confidence: Math.min(0.8, 0.4 + hits.length * 0.15),
          explanation: `Partial chain: ${chain.label}`,
        };
      }
    }

    return { matched: false, chain: [], stages: [], confidence: 0, explanation: "No chain match" };
  }

  reset(): void {
    this.nodes = [];
  }
}

/** Standalone chain matcher for audit/tests */
export function matchThreatChain(signals: string[]): ThreatGraphMatch {
  const graph = new ThreatGraph();
  signals.forEach((s, i) => graph.ingest(s, "AUTHENTICATION", Date.now() - (signals.length - i) * 1000));
  return graph.analyze(600_000);
}
