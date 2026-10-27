# Plano mestre HB Cooperativas

Índice único para estabilização e lançamento. **Comece pelo marco zero** se a pergunta é “por que nunca estabilizou depois do pagamento”.

## Norte

| Prioridade | Documento |
|------------|-----------|
| **1 — Marco zero (estratégia)** | [`MARCO-ZERO-PROGRAMA-2026.md`](./MARCO-ZERO-PROGRAMA-2026.md) |
| **2 — Diagnóstico (por quê)** | [`../diagnostico/MARCO-ZERO-POS-PAGAMENTO.md`](../diagnostico/MARCO-ZERO-POS-PAGAMENTO.md) |
| **3 — Gestão (execução)** | [`LIDERANCA-RESPONSAVEL-2026.md`](./LIDERANCA-RESPONSAVEL-2026.md) |
| **4 — Cooperado (execução)** | [`LIDERANCA-COOPERADO-2026.md`](./LIDERANCA-COOPERADO-2026.md) |
| **V2 — só HB Créditos (backup + plano)** | [`../backup-pre-v2-hb-creditos/README.md`](../backup-pre-v2-hb-creditos/README.md) |

## Etapas históricas (cooperado / valor / PWA)

- [`ETAPA-1-cooperado-mobile-aceite.md`](./ETAPA-1-cooperado-mobile-aceite.md)
- [`ETAPA-2-valor-pos-lancamento.md`](./ETAPA-2-valor-pos-lancamento.md)
- [`ETAPA-3-pwa-build.md`](./ETAPA-3-pwa-build.md)
- [`ETAPA-4-sync-performance.md`](./ETAPA-4-sync-performance.md)
- [`ETAPA-5-homolog-fechamento.md`](./ETAPA-5-homolog-fechamento.md)

## Gates rápidos (terminal)

```powershell
# Verdade na nuvem (read-only)
npx tsx scripts/audit-contadores-alinhamento-once.ts 62351750000165

# Gestão
npm run responsavel:verify:lancamento

# Produção alinhada
npm run confirm:production:wait
```
