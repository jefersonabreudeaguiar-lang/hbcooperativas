export interface PlaybookStep {
  order: number;
  text: string;
}

export interface HobeliscoPlaybook {
  id: string;
  title: string;
  eventTypes: string[];
  disclaimer: string;
  /** Riscos em linguagem simples se o operador não agir */
  potentialImpact?: string[];
  steps: PlaybookStep[];
}

export type PlaybookOutcomeType =
  | "RESOLVED"
  | "FALSE_ALARM"
  | "ESCALATED"
  | "STILL_INVESTIGATING";

export const OUTCOME_LABELS: Record<PlaybookOutcomeType, string> = {
  RESOLVED: "Resolvido",
  FALSE_ALARM: "Falso alarme",
  ESCALATED: "Escalado",
  STILL_INVESTIGATING: "Ainda em investigação",
};
