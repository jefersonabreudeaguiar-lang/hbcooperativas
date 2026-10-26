# Piloto cooperado — Jeferson (baseline v644)

**Produção global (`main`) não é alterada por esta branch.** Só Preview Vercel desta branch até SIM nas fases.

## Quem testa

| Campo | Valor |
|--------|--------|
| E-mail | `jefersonabreudeaguiar@gmail.com` |
| cooperadoId | `c_1781981564381_w67gg` |
| Cooperativa (CNPJ) | `62351750000165` |

## Baseline de código

- Tag: `cooperado-mobile-fase3-v644` (`2dd7cb2a`) — Fase 3 SIM em 24/10/2026.
- Script: `npm run pilot:cooperado-baseline`
- Build piloto: **680+** (badge no header — diferente de produção).

## Como abrir (Jeferson)

1. Abrir a **URL de Preview** da branch `pilot/cooperado-jeferson-baseline` (Vercel → Deployments → branch pilot).
2. Login com o e-mail acima.
3. Instalar/atualizar PWA a partir **dessa URL** (não use o ícone antigo de produção até o portão final).
4. Conferir badge **v680** (ou superior piloto).

## Portões (SIM / NÃO)

Seguir `docs/plano-mestre/LIDERANCA-COOPERADO-2026.md`:

1. **Fase 1** — abre sem branco/splash preso?  
2. **Fase 2** — abas fluidas 10x?  
3. **Fase 3** — A receber + Financeiro + nuvem?  
4. **Fase 4** — homolog Etapa 5?

Só após **SIM** em todas → merge para `main` e `confirm:production:wait`.

## Referência histórica (bytecode exato 644)

Deploy produção na época: `dpl_AnaNJcdXMZU9wUBzeUTg4kzFBCvV` — útil para comparar se o preview divergir.

## Dados

Nuvem **não** é restaurada. Slice forense: `npm run backup:cooperado-slice`.
