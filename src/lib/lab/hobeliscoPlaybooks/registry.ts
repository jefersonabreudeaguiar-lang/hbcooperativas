import type { HobeliscoPlaybook } from "./types";

const NO_AUTO_FIX = "O Hobelisco não executa nenhuma correção financeira.";

export const PLAYBOOK_REGISTRY: HobeliscoPlaybook[] = [
  {
    id: "auth_burst",
    title: "Playbook: Burst de autenticação",
    eventTypes: ["auth_failure", "access_denied"],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Conta do cooperado ou do operador pode ser comprometida.",
      "Várias tentativas erradas podem bloquear acesso legítimo.",
      "O padrão pode se espalhar para outras contas da cooperativa.",
    ],
    steps: [
      { order: 1, text: "Revise os logs de login da cooperativa indicada." },
      { order: 2, text: "Identifique usuário, IP ou dispositivo associado ao burst." },
      { order: 3, text: "Verifique se há tentativa legítima (senha esquecida, troca de aparelho)." },
      { order: 4, text: "Se suspeito, acione reset de senha ou bloqueio manual no HB Coop." },
      { order: 5, text: "Registre o resultado da análise." },
    ],
  },
  {
    id: "sync_ficha",
    title: "Playbook: Falha sync ficha",
    eventTypes: ["sync_ficha_pull_failure", "sync_session_failure", "sync_background_failure"],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Cooperado usa o app com dados desatualizados.",
      "Crédito e ficha podem ficar inconsistentes offline.",
      "Erros acumulados exigem suporte manual mais tarde.",
    ],
    steps: [
      { order: 1, text: "Verifique conectividade do cooperado/dispositivo." },
      { order: 2, text: "Peça para forçar sync no app (Atualizar agora)." },
      { order: 3, text: "Consulte sync_audit_log por erros recentes." },
      { order: 4, text: "Se persistir, escale para suporte técnico." },
      { order: 5, text: "Registre o outcome." },
    ],
  },
  {
    id: "credit_divergence",
    title: "Playbook: Divergência HB Créditos",
    eventTypes: ["credit_integrity_divergence"],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Decisões financeiras com valores incorretos.",
      "Divergência pode indicar erro de integração ou operação não registrada.",
      "Problema pode afetar outros cooperados se não for auditado.",
    ],
    steps: [
      { order: 1, text: "Acesse Admin → HB Créditos." },
      { order: 2, text: "Filtre a cooperativa indicada no incidente." },
      { order: 3, text: "Localize a conta indicada." },
      { order: 4, text: "Compare limite, usado e disponível." },
      { order: 5, text: "Confira as últimas movimentações." },
      { order: 6, text: "Verifique se a divergência é explicada por operação legítima." },
      { order: 7, text: "Se houver erro real, corrija somente pelo fluxo normal do HB Coop." },
      { order: 8, text: "Registre o resultado da análise." },
    ],
  },
  {
    id: "credit_over_limit",
    title: "Playbook: Crédito acima do limite",
    eventTypes: ["credit_integrity_over_limit"],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Cooperado pode estar usando crédito além do autorizado.",
      "Risco financeiro e operacional para a cooperativa.",
      "Novas movimentações podem agravar a situação sem revisão.",
    ],
    steps: [
      { order: 1, text: "Acesse Admin → HB Créditos." },
      { order: 2, text: "Localize a conta indicada." },
      { order: 3, text: "Compare limite e utilizado." },
      { order: 4, text: "Audite as movimentações recentes." },
      { order: 5, text: "Verifique se existe operação legítima explicando o estado." },
      { order: 6, text: "Se necessário, encaminhe para responsável financeiro." },
      { order: 7, text: "Corrija somente pelo fluxo normal do HB Coop." },
      { order: 8, text: "Registre o outcome." },
    ],
  },
  {
    id: "credit_probe_error",
    title: "Playbook: Falha de observação HB Credit",
    eventTypes: ["credit_probe_execution_error"],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Hobelisco pode deixar de detectar problemas de crédito nesta cooperativa.",
      "Alertas futuros podem chegar atrasados ou incompletos.",
    ],
    steps: [
      { order: 1, text: "Verifique disponibilidade do serviço." },
      { order: 2, text: "Verifique autenticação/configuração LAB." },
      { order: 3, text: "Verifique conexão com Supabase." },
      { order: 4, text: "Verifique schema/tabelas de observabilidade." },
      { order: 5, text: "Execute novo ciclo de observação." },
      { order: 6, text: "Se persistir, escale para suporte técnico." },
      { order: 7, text: "Registre o outcome." },
    ],
  },
  {
    id: "credit_invalid",
    title: "Playbook: Estado financeiro inválido",
    eventTypes: [
      "credit_integrity_invalid_limit",
      "credit_integrity_invalid_used",
      "credit_integrity_invalid_available",
    ],
    disclaimer: NO_AUTO_FIX,
    potentialImpact: [
      "Valores inválidos podem travar fluxos do HB Créditos.",
      "Relatórios e limites ficam incorretos.",
      "Correção tardia exige mais trabalho manual.",
    ],
    steps: [
      { order: 1, text: "Acesse Admin → HB Créditos." },
      { order: 2, text: "Localize a conta com valores negativos ou inconsistentes." },
      { order: 3, text: "Audite origem dos dados na base." },
      { order: 4, text: "Encaminhe para responsável financeiro se necessário." },
      { order: 5, text: "Corrija somente pelo fluxo normal do HB Coop." },
      { order: 6, text: "Registre o outcome." },
    ],
  },
];

export function resolvePlaybookForIncident(context: Record<string, string | number | boolean>): HobeliscoPlaybook | null {
  const eventType = String(context.eventType ?? context.event_type ?? "");
  if (!eventType) return null;
  return PLAYBOOK_REGISTRY.find((p) => p.eventTypes.some((et) => eventType.includes(et) || et.includes(eventType))) ?? null;
}

export function resolvePlaybookByEventType(eventType: string): HobeliscoPlaybook | null {
  return PLAYBOOK_REGISTRY.find((p) => p.eventTypes.includes(eventType)) ?? null;
}
