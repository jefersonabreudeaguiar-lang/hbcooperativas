/** Textos do runbook Fase C — exibidos no painel Saúde HB. */

export type HbCreditRunbookStep = {
  id: string;
  title: string;
  when: string;
  steps: string[];
};

export const HB_CREDIT_RUNBOOK_STEPS: HbCreditRunbookStep[] = [
  {
    id: "normal",
    title: "Operação normal",
    when: "Painel verde, cooperados pagando sem reclamação.",
    steps: [
      "Fases A e B em sombra: nenhuma ação; só monitore este painel 1–2× por semana.",
      "Cron de reconciliação (6h UTC): se falhar, abra ticket antes de mexer em limite manual.",
    ],
  },
  {
    id: "alerta-b",
    title: "Muitos alertas Fase B (antifraude)",
    when: "credit.phase_b_guard com prioridade HIGH nas últimas horas.",
    steps: [
      "Confirme se é cooperado real (várias compras no mercado) ou suspeita de fraude.",
      "Se fraude: pause operações HB (Vercel → HB_CREDIT_OPERATIONS_ENABLED=false) e avise mercados.",
      "Se comportamento legítimo: mantenha sombra ou ajuste limites HB_CREDIT_PHASE_B_* antes de ligar enforce.",
      "Enforce B: cooperado em risco médio verá pedido de PIN duas vezes.",
    ],
  },
  {
    id: "divergencia-a",
    title: "Divergência Fase A (limite/saldo)",
    when: "credit.phase_a_guard ou reconciliação aponta DIVERGENT.",
    steps: [
      "Não altere amount_used ou limite direto no banco.",
      "Responsável HB: aba Limites → sincronizar / atualizar; cooperado: Atualizar no app.",
      "Só ligue bloqueio A (sombra off + HB_CREDIT_PHASE_A_BLOCK_DIVERGENT) se quiser impedir pagamento até alinhar.",
    ],
  },
  {
    id: "pausa",
    title: "Pausar HB Créditos (incidente)",
    when: "Ataque, bug em massa ou manutenção urgente.",
    steps: [
      "Vercel → Environment → HB_CREDIT_OPERATIONS_ENABLED=false → redeploy.",
      "Cooperado verá que HB está indisponível; pagamentos não autorizam.",
      "Após corrigir: volte true, confirme /api/credit/status e este painel.",
      "Comunique mercados parceiros se a pausa durar mais de 1 h.",
    ],
  },
  {
    id: "retomada",
    title: "Retomar após pausa",
    when: "Incidente resolvido.",
    steps: [
      "HB_CREDIT_OPERATIONS_ENABLED=true e deploy confirmado (build em produção).",
      "Teste: pagamento de valor baixo com cooperado de confiança.",
      "Monitore Fase A/B por 24 h antes de ligar enforce.",
    ],
  },
];
