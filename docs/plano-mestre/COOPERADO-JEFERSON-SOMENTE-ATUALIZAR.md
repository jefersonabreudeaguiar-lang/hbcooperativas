# Piloto Jeferson — app leve («só Atualizar»)

**Status:** piloto Jeferson — `COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON` (build ≥707). Orlando e demais: GA inalterado.

## Comportamento

| Área | Piloto Jeferson | Demais cooperados |
|------|-----------------|-------------------|
| Abertura / troca de abas | Sem sync operacional/financeiro automático, sem bootstrap pós-deploy, sem prefetch agressivo de abas | GA atual |
| Início + Financeiro | **1ª entrada** leve; **2ª entrada** (≥30s após a 1ª) → **Atualizar automático**; depois, cada volta ao app (intervalo mín. 45s). Botão Atualizar usa o mesmo fluxo suave | GA atual |
| Entregas — fotos | Envio e sync de notas **na hora** (responsável vê na fila) | GA atual |
| AppData local | Parse adiado no cold start; **Atualizar** libera warm + sync base | GA atual |

## Código

- `src/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot.ts` — flag + gate de sync + janela `entrega`.
- Teste: `scripts/test-cooperado-jeferson-somente-atualizar-gate.ts`.

## Promoção produção

1. Homologar no aparelho Jeferson (abertura fluida, Atualizar traz valores, foto chega ao responsável).
2. Trocar flag para GA ou extrair política por cooperativa conforme decisão de produto.

## Rollback

`COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON = false` → Jeferson volta ao GA imediato.
