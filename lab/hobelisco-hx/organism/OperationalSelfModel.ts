/** Modelo operacional de autoconsciência — derivado do estado real */

import type { HobeliscoCore } from "../core/HobeliscoCore";
import { getOrganismIdentity } from "./OrganismIdentity";
import type { ComponentLifecycleManager } from "./ComponentLifecycleManager";

export interface OperationalSelfModel {
  state: string;
  health: number;
  alive: boolean;
  limitations: string[];
  capabilities: string[];
  incapabilities: string[];
  memoryAvailable: boolean;
  productionAccess: false;
  financialMutation: false;
  codeMutation: false;
  lastThreat: string | null;
  lastDeath: string | null;
  activeDna: string;
  validatedAntibodies: number;
  arenaSimulations: number;
  selfTruth: string[];
}

export function buildOperationalSelfModel(
  core: HobeliscoCore,
  components?: ComponentLifecycleManager
): OperationalSelfModel {
  const snap = core.snapshot();
  const identity = getOrganismIdentity();
  const limitations: string[] = [];
  const capabilities: string[] = ["PERCEIVE", "REMEMBER", "REASON", "ACT", "VERIFY"];
  const incapabilities: string[] = [
    "PRODUCTION_ACCESS",
    "FINANCIAL_MUTATION",
    "CODE_MUTATION",
    "REAL_DATABASE",
  ];
  const selfTruth: string[] = [];

  selfTruth.push("Não tenho acesso à produção.");
  selfTruth.push("Não posso alterar créditos diretamente.");
  selfTruth.push("Não posso modificar meu próprio código.");

  if (!core.audit.verify().ok) {
    limitations.push("Auditoria degradada ou indisponível.");
    selfTruth.push("Minha auditoria está degradada.");
  }

  if (components?.hasCriticalDead()) {
    limitations.push("Componente crítico morto.");
    selfTruth.push("Um órgão crítico está morto.");
  }

  if (snap.circuitBreaker.open) {
    limitations.push("Circuit breaker aberto.");
  }

  if (snap.state === "HIBERNATING") {
    capabilities.push("HIBERNATE");
    selfTruth.push("Estou em hibernação — sensores reduzidos.");
  }

  if (snap.state === "SAFE_MODE") {
    limitations.push("SAFE_MODE ativo.");
    selfTruth.push("Estou em SAFE_MODE.");
  }

  const lastThreat = snap.recentThreats[0]?.fingerprint ?? null;

  return {
    state: snap.state,
    health: snap.health.overall,
    alive: snap.state !== "DEAD" && snap.health.overall > 0,
    limitations,
    capabilities,
    incapabilities,
    memoryAvailable: snap.memoryStats.short + snap.memoryStats.mid > 0,
    productionAccess: false,
    financialMutation: false,
    codeMutation: false,
    lastThreat,
    lastDeath: null,
    activeDna: identity.dnaId,
    validatedAntibodies: snap.antibodies.length,
    arenaSimulations: core.persistence.stats().simulations ?? 0,
    selfTruth,
  };
}
