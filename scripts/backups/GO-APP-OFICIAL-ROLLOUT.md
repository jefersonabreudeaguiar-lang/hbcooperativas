# GO — app oficial (novo modelo BIC + UI)

**Objetivo:** mesmo modelo validado no LAB (Início, entregas/notas, a receber, HB Créditos) **sem apagar dados**.

## O que este deploy NÃO faz

- Não roda `wipe-platform`, `reset-operacional`, `wipe-cooperados-teste`
- Não aplica `APPLY_HB_CREDIT_TUDO.sql` em produção (schema HB já existe no Supabase prod)
- Não altera cooperados, notas, pagamentos, livro caixa, mercados na nuvem — **só app (leitura/UI/sync leve)**

## Vercel — Production Environment

Copie de `.env.production-official.example`:

| Variável | Valor |
|----------|--------|
| `NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK` | `true` |
| `NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL` | `true` |
| `NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL` | `true` |
| `NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC` | `1` |
| `NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC` | `1` |

**Não definir:** `HB_BIC_LAB_*`, `NEXT_PUBLIC_HB_BIC_LAB_ENABLED`

Manter Supabase/url/chaves **de produção** atuais.

## Antes do merge/deploy

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
npx tsc --noEmit
npm run test:cooperado-inicio-card-policy
npm run test:bic-lab-b4-wiring
npm run lab:bic-full-audit
```

Simular env oficial (export vars ou `.env.local` temporário):

```powershell
npm run verify:official-rollout
```

## Depois do deploy

1. Cooperado: Início → card A receber; HB → Disponível / limite (nuvem HB inalterada)
2. Responsável: Conta Coop / limites como antes
3. Rollback rápido: `NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=false` + redeploy (dados intactos)
