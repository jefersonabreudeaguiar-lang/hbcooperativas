# Runbook — após pagamentos em massa (responsável)

Objetivo: alinhar **operacional**, **livro caixa**, **a pagar/a receber** e **HB Créditos** sem apagar notas nem pagamentos confirmados.

Pré-requisitos: `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. CNPJ padrão piloto: `62351750000165`.

## Ordem recomendada

1. **Auditoria (somente leitura)**
   - `npx tsx scripts/audit-contadores-alinhamento-once.ts`
   - `npx tsx scripts/audit-a-receber-vs-ficha-once.ts`

2. **Integridade operacional + livro caixa**
   - `npx tsx scripts/_once-sync-pos-pagamentos-cooperativa-once.ts [cnpj]`  
     (ou `repair-operacional-pagamentos-integridade.ts` se o repair oficial já incluir `livroCaixa` no upload)
   - Verificar saída: `Pagamentos confirmados sem débito livro caixa: 0 → 0`

3. **HB Créditos**
   - `npx tsx scripts/audit-hb-limites-ghost.ts` (limites fantasma)
   - Se necessário: `npx tsx scripts/_once-hb-limites-rapido-once.ts --apply`
   - Projeção ficha × HB (simulação): `npx tsx scripts/repair-hb-ficha-base-cooperativa.ts` → só `--apply` se a simulação indicar desalinhamento

4. **Reauditoria**
   - Repetir passo 1 + ghost HB = 0 contas infladas

## Backup

Scripts `_once-sync-*` gravam backup em `scripts/backups/` antes do upload.

## Homologação UI

Cooperado: Início (card) e Financeiro — Ctrl+F5. Responsável: fila Pagar e relatório em aberto = R$ 0 quando todos quitados.
