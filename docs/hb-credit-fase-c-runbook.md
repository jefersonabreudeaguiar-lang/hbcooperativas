# HB Créditos — Fase C (operação)

Fase C **não altera** o fluxo do cooperado por padrão. Entrega **visibilidade** e **runbook** para responsável/tesoureiro.

## No app

1. Login como **responsável** ou **tesoureiro**
2. **HB Créditos** → aba **Saúde**
3. Ver: módulo/operaciones ON, modo Fase A/B, alertas 24 h, runbook embutido

## Terminal / CI

```bash
npm run security:health
npm run test:hb-credit-phase-c
```

## Pausar pagamentos (incidente)

Vercel → `HB_CREDIT_OPERATIONS_ENABLED=false` → redeploy.

Cooperado deixa de autorizar pagamentos HB até retomar (`true`).

## Endurecer segurança (separado da Fase C)

| Objetivo | Variáveis |
|----------|-----------|
| Step-up (2º PIN) | `HB_CREDIT_PHASE_B_SHADOW=false`, `HB_CREDIT_PHASE_B_ENFORCE=true` |
| Bloquear divergência limite | `HB_CREDIT_PHASE_A_SHADOW=false`, `HB_CREDIT_PHASE_A_BLOCK_DIVERGENT=true` |

Monitore `credit.phase_a_guard` e `credit.phase_b_guard` na aba Saúde antes de ligar.

## Próxima evolução (não neste deploy)

- Pausa HB pelo painel (sem Vercel), com auditoria
- Alertas e-mail/Slack automáticos
