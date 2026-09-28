# H204 — Ponto de retrocesso local

**Timestamp:** 2026-09-28 (UTC-3)  
**HEAD anterior (git):** `d9d741a1202f2b5d03ff99e494039a7200919aa7`

## Snapshot

**Caminho:** `backups/H204-BEFORE-ORLANDO-GLOBAL/`

Conteúdo principal:
- Cópia recursiva de `src/` (estado imediatamente antes das alterações H204)
- `package.json`, `next.config.ts`

## Arquivos modificados antes do H204 (git status resumido)

Tracked modificados (pré-H204):
- `next.config.ts`, `package.json`
- `src/app/(app)/dashboard/page.tsx`, `ficha-corrida/page.tsx`, `notas-pedido/NotasPedidoContent.tsx`
- `src/components/sync/CooperativaSyncProvider.tsx`
- `src/services/bicProjecaoFinanceiraCooperado.ts`, `notaPedidoService.ts`
- Vários scripts cloud (fora do escopo H204)

Untracked relevantes (já presentes): hooks H203, `cooperadoApresentacaoFinanceira.ts`, facades BIC, testes BIC/H200/H203.

## Restauração local (sem Supabase)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
robocopy backups\H204-BEFORE-ORLANDO-GLOBAL\src src /E
Copy-Item -Force backups\H204-BEFORE-ORLANDO-GLOBAL\package.json .
Copy-Item -Force backups\H204-BEFORE-ORLANDO-GLOBAL\next.config.ts .
```

Remover arquivos criados pelo H204 se necessário:
- `src/lib/cooperadoFluxoFinanceiroGlobal.ts`
- `scripts/test-h204-orlando-global-simulation.ts`

**Não** executa commit, push, deploy ou escrita Supabase.
