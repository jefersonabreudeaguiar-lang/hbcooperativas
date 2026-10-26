# Piloto Jeferson — produção (canário)

Mudanças novas entram **só para o cooperado Jeferson** na URL de produção. Demais cooperados e responsáveis seguem o comportamento atual até **SIM** do piloto e promoção GA.

## Quem

| Campo | Valor |
|--------|--------|
| E-mail | `jefersonabreudeaguiar@gmail.com` |
| cooperadoId | `c_1781981564381_w67gg` |
| Cooperativa (CNPJ) | `62351750000165` |

## Como o Jeferson valida

1. Abrir **https://hbcooperativas.vercel.app** (PWA ou navegador).
2. Login com o e-mail acima.
3. No header: build atual (ex. **v682**) e **estrela amarela** = revisão piloto pendente de promoção.
4. Responder **SIM/NÃO** nas fases do `docs/plano-mestre/LIDERANCA-COOPERADO-2026.md`.

## O que está no canário (revisão 11)

- **A receber complementar** após PIX com escopo explícito (nova entrega no mesmo mês).
- **Conferência após PIX** usa `dataConferencia` no escopo temporal (só Jeferson).

Código: `cooperadoJefersonCanary.ts` + ramo em `notaPedidoService.ts`.

## Promoção para todos

1. SIM do Jeferson nas fases.
2. Igualar `COOPERADO_MOBILE_PILOT_PROMOTED_REVISION` a `PENDING` (estrela some).
3. Remover gate `cooperadoJefersonCanaryFinanceComplementarAtivo` (comportamento vira GA).
4. `npm run confirm:production:wait`.

## Preview branch (opcional)

A branch `pilot/cooperado-jeferson-baseline` era experimento de bytecode v644 no Preview — **não é necessária** para o canário em produção descrito acima.
