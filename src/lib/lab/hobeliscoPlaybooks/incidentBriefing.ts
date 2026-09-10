import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import { resolvePlaybookForIncident } from "./registry";
import type { HobeliscoPlaybook } from "./types";

export interface IncidentBriefing {
  title: string;
  whatHappened: string[];
  whatCouldHappen: string[];
  measures: { order: number; text: string }[];
  playbookTitle: string | null;
  disclaimer: string;
  severityLabel: string;
  statusLabel: string;
  eventTypeLabel: string;
}

const STATUS_LABELS: Record<string, string> = {
  OBSERVED: "Observado — aguardando correlação",
  CORRELATED: "Identificado — aguardando sua decisão",
  CONFIRMED: "Medidas aceitas — execute o playbook",
  DISMISSED: "Arquivado — medidas não aplicadas",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  auth_failure: "Falha de login",
  access_denied: "Acesso negado",
  sync_ficha_pull_failure: "Falha ao sincronizar ficha",
  sync_session_failure: "Falha de sessão de sync",
  sync_background_failure: "Falha de sync em segundo plano",
  credit_integrity_divergence: "Divergência de crédito",
  credit_integrity_over_limit: "Crédito acima do limite",
  credit_integrity_invalid_limit: "Limite de crédito inválido",
  credit_integrity_invalid_used: "Valor utilizado inválido",
  credit_integrity_invalid_available: "Saldo disponível inválido",
  credit_probe_execution_error: "Falha na observação de crédito",
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function resolveEventTypeLabel(eventType: string): string {
  for (const [key, label] of Object.entries(EVENT_TYPE_LABELS)) {
    if (eventType.includes(key)) return label;
  }
  return eventType || "Evento de segurança";
}

function buildWhatHappened(incident: HobeliscoIncidentV2, eventType: string, eventLabel: string): string[] {
  const lines: string[] = [];
  const occurrences = Number(incident.context.occurrences ?? incident.signalsCount);
  const coop = incident.cooperativeId ? `cooperativa ${incident.cooperativeId}` : "uma cooperativa";
  const account = incident.context.cooperadoId || incident.context.accountId;
  const expected = Number(incident.context.expectedCents ?? 0);
  const observed = Number(incident.context.observedCents ?? 0);
  const difference = Number(incident.context.differenceCents ?? 0);

  lines.push(incident.explanation);

  if (eventType.includes("auth") || eventType.includes("access_denied")) {
    lines.push(
      `Foram detectadas ${occurrences} tentativa(s) suspeita(s) de autenticação na ${coop}.`,
      "O Hobelisco agrupou sinais semelhantes em uma janela curta de tempo."
    );
  } else if (eventType.includes("sync")) {
    lines.push(
      `O app do cooperado apresentou falha ao sincronizar dados${account ? ` (conta ${String(account)})` : ""}.`,
      `Registramos ${occurrences} sinal(is) de erro de sync nos últimos minutos.`
    );
  } else if (eventType.includes("credit")) {
    lines.push(`Situação financeira inconsistente detectada na ${coop}.`);
    if (account) lines.push(`Conta envolvida: ${String(account)}.`);
    if (expected !== 0 || observed !== 0) {
      lines.push(
        `Esperado: ${formatCents(expected)} · Observado: ${formatCents(observed)}${
          difference !== 0 ? ` · Diferença: ${formatCents(difference)}` : ""
        }.`
      );
    }
  } else {
    lines.push(`Tipo: ${eventLabel}. ${occurrences} sinal(is) correlacionado(s).`);
  }

  lines.push(
    `Primeira detecção: ${new Date(incident.firstSeen).toLocaleString("pt-BR")}.`,
    `Última atividade: ${new Date(incident.lastSeen).toLocaleString("pt-BR")}.`,
    `Confiança do Hobelisco: ${(incident.confidence * 100).toFixed(0)}%.`
  );

  return lines;
}

function defaultWhatCouldHappen(eventType: string): string[] {
  if (eventType.includes("auth") || eventType.includes("access_denied")) {
    return [
      "Conta pode ser comprometida se a tentativa for mal-intencionada.",
      "Cooperado legítimo pode ficar bloqueado após várias tentativas erradas.",
      "Padrão pode se repetir em outras contas da mesma cooperativa.",
    ];
  }
  if (eventType.includes("sync")) {
    return [
      "Cooperado pode operar com dados desatualizados no app.",
      "Informações de crédito ou ficha podem ficar inconsistentes offline.",
      "Erros podem se acumular e exigir intervenção manual mais tarde.",
    ];
  }
  if (eventType.includes("credit_integrity_divergence")) {
    return [
      "Decisões financeiras podem ser tomadas com base em valores incorretos.",
      "Divergência pode indicar erro de integração ou operação não registrada.",
      "Sem revisão, o problema pode afetar outros cooperados da mesma base.",
    ];
  }
  if (eventType.includes("credit_integrity_over_limit")) {
    return [
      "Cooperado pode estar utilizando crédito além do limite autorizado.",
      "Risco operacional e financeiro para a cooperativa.",
      "Situação pode piorar se novas movimentações ocorrerem sem auditoria.",
    ];
  }
  if (eventType.includes("credit_integrity_invalid")) {
    return [
      "Valores negativos ou inconsistentes podem travar fluxos do HB Créditos.",
      "Relatórios e limites podem ficar incorretos.",
      "Correção tardia exige mais trabalho manual.",
    ];
  }
  if (eventType.includes("credit_probe")) {
    return [
      "O Hobelisco pode deixar de detectar problemas de crédito nesta cooperativa.",
      "Alertas futuros podem chegar atrasados ou incompletos.",
    ];
  }
  return [
    "O padrão pode continuar ou escalar sem intervenção humana.",
    "Cooperados ou dados da cooperativa podem ser afetados.",
    "Quanto mais tempo passar, mais difícil fica investigar a causa.",
  ];
}

function resolveTitle(playbook: HobeliscoPlaybook | null, eventLabel: string): string {
  if (playbook) return playbook.title.replace(/^Playbook:\s*/i, "");
  return eventLabel;
}

export function buildIncidentBriefing(incident: HobeliscoIncidentV2): IncidentBriefing {
  const eventType = String(incident.context.eventType ?? incident.context.event_type ?? "");
  const eventLabel = resolveEventTypeLabel(eventType);
  const playbook = resolvePlaybookForIncident(incident.context);
  const whatCouldHappen =
    playbook?.potentialImpact?.length ? playbook.potentialImpact : defaultWhatCouldHappen(eventType);

  return {
    title: resolveTitle(playbook, eventLabel),
    whatHappened: buildWhatHappened(incident, eventType, eventLabel),
    whatCouldHappen,
    measures: playbook?.steps ?? [
      {
        order: 1,
        text: "Revise os detalhes técnicos abaixo e consulte o responsável da cooperativa.",
      },
      { order: 2, text: "Documente o que encontrou e registre o resultado nesta tela." },
    ],
    playbookTitle: playbook?.title ?? null,
    disclaimer:
      playbook?.disclaimer ??
      "O Hobelisco não executa nenhuma correção automaticamente. Você decide e executa as medidas.",
    severityLabel: SEVERITY_LABELS[incident.severity] ?? incident.severity,
    statusLabel: STATUS_LABELS[incident.status] ?? incident.status,
    eventTypeLabel: eventLabel,
  };
}

export function isIncidentPending(incident: HobeliscoIncidentV2): boolean {
  return incident.status === "CORRELATED" || incident.status === "OBSERVED";
}
