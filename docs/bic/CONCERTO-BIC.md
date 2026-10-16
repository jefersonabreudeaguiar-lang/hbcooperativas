# Concerto BIC

Plano de maturidade BIC (meta rubrica **99/100**) em quatro movimentos. Este documento acompanha o **Movimento I — Allegro**.

## Movimento II — Largo (cooperado 99 no recorte)

| Entrega | Função |
|---------|--------|
| `cooperadoBicSessionReinforcementSkip.ts` | Reforços 8s/22s pulam pull se revisão nuvem já aplicada + remat &lt; 90s |
| `cooperadoBicMobileSessionSync` | Coalesce com sync inflight |
| Migração gaps | Policy, recovery, snapshots, HB sync, entregas, ficha → `cooperadoLeituraFinanceiraExibicao` |
| `useCooperadoInicioValorReceberCardState` | Domínios `shell`+`financeiro` no híbrido leve |

Testes: `npm run test:cooperado-bic-session-skip` + matriz/porta existentes.

## Movimento I (entregue neste repositório)

| Artefato | Função |
|----------|--------|
| `src/lib/bic/bicLeituraPorta.ts` | Maestro — `leituraCooperadoFinanceira`, `leituraStaffCooperadoFinanceira`, `leituraHbCreditoFinanceira` |
| `src/lib/bic/bicLeituraPortaGating.ts` | Rollback por superfície |
| `cooperadoLeituraFinanceiraExibicao` | Entrada cooperado; usa porta quando flag cooperado ativa |
| `docs/bic/cobertura-leitura.json` | Mapa gerado (`npm run bic:cobertura-leitura`) |
| `scripts/test-bic-leitura-porta.ts` | Gating + paridade porta/core |
| `scripts/test-bic-paridade-matrix.ts` | Matriz de fixtures |

## Flags (Vercel)

| Variável | Produção recomendada | Efeito |
|----------|----------------------|--------|
| `NEXT_PUBLIC_BIC_LEITURA_PORTA` | omit ou `true` | Master kill-switch (`false` desliga todas as superfícies); não liga superfícies sozinho |
| `NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO` | `true` após CI | Entrada cooperado passa pelo envelope `meta` da porta (valor idêntico ao core) |
| `NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF` | `false` até Mov. III | Staff continua legado até migração |
| `NEXT_PUBLIC_BIC_LEITURA_PORTA_HB_CREDITO` | `false` até Mov. III | HB usa helpers atuais |

Rollback rápido: `NEXT_PUBLIC_BIC_LEITURA_PORTA=false` — ver `scripts/backups/BIC-LEITURA-PORTA.md`.

## Próximos movimentos

- **II Largo:** cooperado 99 — TTL sessão, domínios UI, drift idle  
- **III Presto:** staff + HB na porta  
- **IV Finale:** sinal de revisão + observabilidade

## Testes

```bash
npm run test:bic-leitura-porta
npm run test:bic-paridade-matrix
npm run bic:cobertura-leitura
```
