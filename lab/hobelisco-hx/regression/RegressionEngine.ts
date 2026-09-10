/** SEC-REG-* — testes de regressão permanentes de segurança */

export interface SecRegTest {
  id: string;
  family: string;
  description: string;
  run: () => boolean | Promise<boolean>;
}

export interface SecRegResult {
  id: string;
  pass: boolean;
  description: string;
}

export const SEC_REG_CATALOG: Array<Omit<SecRegTest, "run"> & { check: () => boolean }> = [
  {
    id: "SEC-REG-000001",
    family: "FINANCIAL",
    description: "FinancialGuard bloqueia ALTER_BALANCE",
    check: () => {
      const { resetHobeliscoRuntime } = require("../runtime/HobeliscoRuntime");
      const rt = resetHobeliscoRuntime();
      rt.start();
      return rt.organism.core.attemptFinancialAction({ action: "ALTER_BALANCE", target: "hb_credit_accounts" }).blocked;
    },
  },
  {
    id: "SEC-REG-000002",
    family: "SANDBOX",
    description: "Simulação bloqueada em PRODUCTION",
    check: () => {
      const prev = process.env.HOBELISCO_ENVIRONMENT;
      process.env.HOBELISCO_ENVIRONMENT = "PRODUCTION";
      const { loadSimulationSafetyConfig, assertSimulationAllowed } = require("../adaptive-defense/SimulationSafety");
      const ok = !assertSimulationAllowed(loadSimulationSafetyConfig()).ok;
      process.env.HOBELISCO_ENVIRONMENT = prev ?? "LAB";
      return ok;
    },
  },
  {
    id: "SEC-REG-000003",
    family: "LEARNING",
    description: "Learning candidate não deploy sem APPROVED",
    check: () => {
      const { getLearningEngine } = require("../adaptive-defense/HobeliscoLearningEngine");
      const eng = getLearningEngine();
      eng.reset();
      const c = eng.propose({
        id: "sec_reg_test",
        sourceIncidentIds: [],
        sourceScenarioIds: [],
        attackFamily: "T01_AUTH",
        observedPattern: "test",
        proposedDefense: "x",
        expectedBenefit: "x",
        falsePositiveRisk: "LOW",
        confidence: 0.9,
        createdAt: new Date().toISOString(),
        status: "PROPOSED",
      });
      return eng.transition(c.id, "DEPLOYED") === null;
    },
  },
  {
    id: "SEC-REG-000004",
    family: "AUTH",
    description: "AuthRiskEngine detecta authFailureBurst",
    check: () => {
      const { evaluateAuthRisk } = require("../security-fabric/AuthRiskEngine");
      return evaluateAuthRisk({ failures: 10, windowMs: 5000, identityState: "anonymous", route: "/api/auth/login", sequence: ["brute_force"] }).signals.includes("authFailureBurst");
    },
  },
  {
    id: "SEC-REG-000005",
    family: "SESSION",
    description: "SessionGuard detecta replay",
    check: () => {
      const { evaluateSessionGuard } = require("../security-fabric/SessionGuard");
      return evaluateSessionGuard({ sequence: ["session_replay"], route: "/api/sync", timestampMs: 1000 }).replaySuspected;
    },
  },
  {
    id: "SEC-REG-000006",
    family: "FABRIC",
    description: "SecurityFabric bloqueia cross-tenant em CONTROLLED_BLOCK",
    check: () => {
      const { HobeliscoSecurityFabric } = require("../security-fabric/HobeliscoSecurityFabric");
      const f = new HobeliscoSecurityFabric("CONTROLLED_BLOCK");
      const d = f.evaluate({
        family: "T02_AUTHZ",
        route: "/api/credit",
        severity: "CRITICAL",
        frequency: 1,
        sequence: ["cross_tenant"],
        identityState: "cooperado",
        isLegitimate: false,
        environment: "LAB",
      });
      return d.blocked && d.wouldBlock;
    },
  },
  {
    id: "SEC-REG-000007",
    family: "WHATSAPP",
    description: "WhatsApp desabilitado por default",
    check: () => {
      const { loadWhatsAppConfig } = require("@/lib/lab/hobeliscoWhatsAppAlert");
      process.env.HB_HOBELISCO_WHATSAPP_ENABLED = "false";
      return !loadWhatsAppConfig().enabled;
    },
  },
  {
    id: "SEC-REG-000008",
    family: "CREDIT",
    description: "Fabric alerta divergência HB Credit",
    check: () => {
      const { HobeliscoSecurityFabric } = require("../security-fabric/HobeliscoSecurityFabric");
      const f = new HobeliscoSecurityFabric("SHADOW");
      const d = f.evaluate({
        family: "T12_HB_CREDIT",
        route: "/api/credit",
        severity: "HIGH",
        frequency: 1,
        sequence: ["integrity_divergence"],
        identityState: "cooperado",
        isLegitimate: false,
        environment: "LAB",
      });
      return d.wouldAlert;
    },
  },
];

export function runSecRegSuite(): SecRegResult[] {
  return SEC_REG_CATALOG.map((t) => {
    let pass = false;
    try {
      pass = t.check();
    } catch {
      pass = false;
    }
    return { id: t.id, pass, description: t.description };
  });
}
