# H204 — Fluxo Orlando Desktop mapeado (referência funcional global)

**Modo:** read-only no código de produção cooperado; Orlando = referência de **sequência**, não de dados.

---

## Sequência ponta a ponta

```text
1. LOGIN
   AuthProvider.login → dataStore session
   resolveExperienceUser(user, getData())
     • cooperado app → role cooperado + cooperadoId canônico
     • responsável desktop → papel real (não força cooperado)
     • responsável mobile + link → asCooperadoExperience(mobileCooperadoId)

2. APPDATA / WARM
   useAppData → subscribe getData()
   waitForAppDataWarm() antes de sync

3. CooperativaSyncProvider (mount)
   • cooperadoPagamentosHydrated = false (role cooperado)
   • setTimeout(0) → runSync({ force: true })
   • register handlers: visibility, online, idle → runSync / pullVotacao

4. HYDRATION PARCIAL (votação / operacional leve)
   hydrateCooperadoPagamentosFromCloud()
     → syncOperacionalFromCloud(cnpj)
   H204: NÃO marca cooperadoPagamentosHydrated (evita UI definitiva cedo)

5. SYNC COMPLETO cooperado (Orlando Desktop funcional)
   runSync:
     setCooperadoPagamentosHydrated(false)
     syncCooperativaBackground(cnpj, coopId, cooperadoCanonico)
     ensureCooperadoFinanceiroFromCloud(cnpj, coopId, cooperadoCanonico)
     refreshCooperadoNotasEmAnalise, republishLocalAguardandoConferencia
     aplicarSanidadeFinanceiroCooperadoLocal (lease-safe)
     refreshContaCoopDescontosAfterOperacionalSync
   finally: markCooperadoPagamentosHydrated(true)

6. GATE READINESS (H203/H204)
   cooperadoApresentacaoFinanceiraConsolidada:
     role === cooperado → cooperadoPagamentosHydrated && !syncing
   useCooperadoExibirAguardandoAssinatura → mesmo pronto

7. PROJEÇÃO (motor único — todos os IDs)
   resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
   getValorQuantoVouReceber / getPagamentoAguardandoCooperado / getResumoQuantoVouReceberCooperado
   Facades BIC:
     getInicioCooperadoParaExibicao (M8 + máscara apresentação)
     getQuantoVouReceberCooperadoParaExibicao (M6 + máscara H204)
     getPainelQuantoVouReceberCooperadoParaExibicao (M7 + cooperadoFluxoPainelProjecaoOpts)

8. UI
   dashboard/page.tsx → CooperadoDashboard
   ficha-corrida/page.tsx → painéis + assinatura
   CooperadoFinanceiroGate → bloqueio slice vazio (não Orlando-specific)
```

---

## Funções por etapa

| Etapa | Funções |
|-------|---------|
| Auth | `AuthProvider`, `resolveExperienceUser`, `resolveCooperadoExperienceId` |
| AppData | `getData`, `preloadAppData`, `waitForAppDataWarm` |
| Sync | `runSync`, `hydrateCooperadoPagamentosFromCloud`, `syncOperacionalFromCloud`, `ensureCooperadoFinanceiroFromCloud` |
| Gate | `cooperadoApresentacaoFinanceiraConsolidada`, `useCooperadoExibirAguardandoAssinatura` |
| Projeção | `getValorQuantoVouReceber`, `getPagamentoAguardandoCooperado`, `cooperadoExibirValorReceberInicio` |
| Facade | `bicProjecaoFinanceiraCooperado.ts`, `cooperadoFluxoFinanceiroGlobal.ts` |
| UI | `dashboard/page.tsx`, `ficha-corrida/page.tsx` |

---

## IDs e filtros

- **cooperadoId** session → `resolverCooperadoIdCanonico` em toda projeção cooperado
- **cooperativaId** → `getUserCooperativaId(user, data)` + `validateBicTenantContext`
- **Merge runtime:** `mergeOperacionalIntoData`, `ensureCooperadoFinanceiroFromCloud`, guards `fichaSyncGuard` / `preservar-pagamentos`

---

## Orlando no código de produção

**Nenhum** `if (orlando)` / `cooperadoId === c_1782263929381_ncp55` no motor UI cooperado. Constantes Orlando apenas em diagnóstico e comentários históricos.

---

## Primeira divergência estrutural (pré-H204)

**Etapa:** `hydrateCooperadoPagamentosFromCloud` → `finally` → `markCooperadoPagamentosHydrated()`

**Efeito:** `apresentacaoConsolidada=true` antes de `runSync` + `ensureCooperadoFinanceiroFromCloud`, exibindo projeção sobre AppData local incompleto.

**Orlando Desktop:** frequentemente AppData local já alinhado → “funciona”. Outros cooperados: valores/recibo incorretos até sync completa — **não** por motor diferente, mas por **readiness antecipada**.

**Correção H204:** readiness financeiro **somente** no `finally` de `runSync` (cooperado); hydrate parcial não libera apresentação definitiva.
