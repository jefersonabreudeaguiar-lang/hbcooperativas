# RQL — Response Quality Levels (HX 8.0)

Estratégia de performance **adaptativa** para o app cooperativa: resposta instantânea na UI, sync e persistência em plano de fundo, sem sacrificar offline-first.

## Regras de escopo (obrigatórias)

1. **Preservar fluxos** — nenhuma mudança de regra de negócio, HB, pagamentos, conferência ou Supabase sem fase dedicada.
2. **Compatibilidade** — `requestAppSync`, `requestAppSyncLight` e `requestAppSyncImmediate` mantêm o mesmo contrato (`force` → `runSync`).
3. **Opt-in agressivo** — adiar sync durante interação só com `NEXT_PUBLIC_APP_SCHEDULER_DEFER_SYNC=true` (default **false**).
4. **Sync único** — continua em `CooperativaSyncProvider.runSync`; tiers são metadados até a onda 8.4 (delta API).
5. **Sem `git add -A`** em PRs de performance — commits cirúrgicos por onda.

## Níveis RQL

| Nível | Meta percebida | Entrega |
|-------|----------------|---------|
| **L0** | &lt; 50 ms | Shell, rota, último snapshot |
| **L1** | &lt; 150 ms | Viewport interativo (selectors estreitos) |
| **L2** | &lt; 800 ms | Dados locais frescos (`dataRevision`) |
| **L3** | background | `runSync` / nuvem |
| **L4** | idle | compactação fotos, migrações IDB |

## Prioridades do AppScheduler (P0–P5)

| P | Uso |
|---|-----|
| P0 | Input / scroll |
| P1 | Mutação local + optimistic |
| P2 | Fetch da rota ativa |
| P3 | Prefetch |
| P4 | **Sync global** (`requestSyncTier`) |
| P5 | Tarefas idle |

## Tiers de sync (8.0)

| Tier | Wrapper legado | `force` default |
|------|----------------|-----------------|
| `pulse` | `requestAppSyncLight` | `false` |
| `notas_delta` | (reservado 8.4) | `false` |
| `financeiro_delta` | (reservado 8.4) | `false` |
| `operacional_full` | `requestAppSync` / `Immediate` | `true` |

Coalescência: no mesmo debounce (450 ms), o tier de maior rank e `force: true` vence.

## Arquivos (infra 8.0)

- `src/lib/performance/appScheduler.ts` — fila + debounce de sync
- `src/lib/performance/syncTier.ts` — tipos e merge
- `src/lib/performance/rqlMarks.ts` — `performance.mark` em troca de rota
- `src/services/syncRequest.ts` — `requestSyncTier` + bridge
- `src/components/performance/AppSchedulerBootstrap.tsx` — marcas de navegação

## Baseline read-only

```bash
npx tsx scripts/baseline-performance-rql-h80-readonly.ts
```

## Testes infra

```bash
npx tsx scripts/test-app-scheduler-h80.ts
```

## Onda 8.1

- `useAppShellNavigation` — menu mobile/desktop sem `useAppData` no layout
- Dashboard gestão — sem `useAppData()` na página
- `ResponsavelFilaCooperadosList` — virtualização a partir de 14 cooperados na fila
- `useResponsavelFilaConferencia` — lê `getData()` por revision (sem prop do pai)

Teste: `npx tsx scripts/test-render-rql-h81.ts`

## Onda 9.0 — Cold Start Cooperado (instant resume)

- `cooperadoColdStart` — sync silencioso na abertura, dedupe de mount, `syncingForUi`
- Auth + `preloadAppData({ eager })` — sessão e AppData no primeiro frame
- Gate / dashboard — sem skeleton em cascata quando há dados locais ou cache do card
- Cache início — snapshot recente (45d) libera abertura mesmo sem valor a receber

Flag: `NEXT_PUBLIC_COOPERADO_INSTANT_RESUME=false` desliga (default ligado).

Teste: `npx tsx scripts/test-cooperado-cold-start-h90.ts`

Marcas: `performance.mark("rql:cold:*")`

## Ondas seguintes

- **8.2** — conferência: draft em memória (7.3)
- **8.3** — notify por domínio + IDB shard
- **8.4** — API delta por tier
- **8.5** — workers (BIC / admin stats)
- **8.6** — keep-alive abas cooperado + view transitions

## SLOs alvo (homolog / prod medidos)

- Troca de aba cooperado (L1): p75 &lt; 200 ms
- Input delay p95 &lt; 100 ms
- Sync nunca bloqueia toque (defer opt-in ou fila P4)
