export type ScenarioKind = "previsivel" | "imprevisivel";

export type FlowId =
  | "notas-conferencia"
  | "ficha-pagamento"
  | "mensalidade"
  | "votacao-assinatura"
  | "hb-credit-mercado"
  | "conta-coop"
  | "cobranca-asaas"
  | "sync-offline"
  | "auth-sessao"
  | "admin-plataforma"
  | "livro-fechamento"
  | "cooperado-cadastro";

export interface ProductionMitigation {
  id: string;
  name: string;
  priority: "P0" | "P1" | "P2";
  touchpoints: string[];
  affectedFlows: FlowId[];
  riskIfRushed: string;
  prerequisiteIds: string[];
  safeguards: string[];
}

export interface ImpactScenario {
  id: string;
  kind: ScenarioKind;
  flow: FlowId;
  title: string;
  trigger: string;
  mitigationsInvolved: string[];
  /** Implementação ingênua (tudo de uma vez) */
  naiveOk: boolean;
  naiveNote: string;
  /** Plano refinado (ordem + flags + testes) */
  refinedOk: boolean;
  refinedNote: string;
  userVisibleBreak?: string;
}

export interface PlanIteration {
  iteration: number;
  label: string;
  order: string[];
  flags: string[];
  successPct: number;
  passed: number;
  total: number;
  blockers: string[];
}

export interface ProductionImpactReport {
  generatedAt: string;
  disclaimer: string;
  mitigations: ProductionMitigation[];
  scenarios: ImpactScenario[];
  iterations: PlanIteration[];
  regressionTests: { name: string; passed: boolean; detail: string }[];
  finalSuccessPct: number;
  readyForProduction: boolean;
  goOrder: string[];
  doNotDoYet: string[];
}
