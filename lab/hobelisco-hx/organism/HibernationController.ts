/** Hibernação funcional no LAB */

import type { HobeliscoCore } from "../core/HobeliscoCore";
import { loadLabOrganismConfig } from "../config";
import { getPulseCount } from "./OrganismIdentity";

export interface HibernationDecision {
  shouldHibernate: boolean;
  shouldWake: boolean;
  reason: string;
}

export function evaluateHibernation(
  core: HobeliscoCore,
  stablePulses: number,
  lastEventCritical: boolean
): HibernationDecision {
  const cfg = loadLabOrganismConfig();
  const state = core.stateMachine.current;

  if (state === "HIBERNATING") {
    if (lastEventCritical) {
      return { shouldHibernate: false, shouldWake: true, reason: "critical_event" };
    }
    return { shouldHibernate: true, shouldWake: false, reason: "still_hibernating" };
  }

  if (state === "WATCHING") {
    const snap = core.snapshot();
    const lowRisk = snap.riskLevel === "L0_OBSERVE";
    const stable = stablePulses >= cfg.hibernationPulseThreshold;
    const healthy = snap.health.overall >= 70;
    if (lowRisk && stable && healthy && getPulseCount() >= cfg.hibernationPulseThreshold) {
      return { shouldHibernate: true, shouldWake: false, reason: "stability" };
    }
  }

  return { shouldHibernate: false, shouldWake: false, reason: "active" };
}

export function enterHibernation(core: HobeliscoCore): boolean {
  if (core.stateMachine.current !== "WATCHING") return false;
  try {
    core.stateMachine.transition("HIBERNATING");
    core.audit.append("HIBERNATION_ENTER", { state: "HIBERNATING" });
    return true;
  } catch {
    return false;
  }
}

export function wakeFromHibernation(core: HobeliscoCore): boolean {
  if (core.stateMachine.current !== "HIBERNATING") return false;
  try {
    core.stateMachine.transition("AWAKE");
    core.stateMachine.transition("WATCHING");
    core.audit.append("HIBERNATION_WAKE", { state: "WATCHING" });
    return true;
  } catch {
    core.stateMachine.force("WATCHING");
    return true;
  }
}
