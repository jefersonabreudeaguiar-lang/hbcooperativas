# H8.9.62 — Integração Single-Flight no Writer

## 1. Objetivo

Integrar o módulo H8.9.60 (`enqueueOperacionalPush`) ao writer real `pushOperacionalToCloud` via **Estratégia B**, mantendo **`OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED = false`** (comportamento de produção = legado).

## 2. Refatoração

- Corpo anterior de `pushOperacionalToCloud` extraído para **`pushOperacionalToCloudInternal`** (`cooperativaSyncCloudService.ts`).
- Assinatura pública **`pushOperacionalToCloud(cnpj, data?, coopId?, options?)`** inalterada; call sites não modificados.

## 3. Wrapper público

```typescript
if (!isOperacionalPushSingleFlightEnabled()) {
  return pushOperacionalToCloudInternal(...);
}
return enqueueOperacionalPush(digits, () => pushOperacionalToCloudInternal(...));
```

## 4. Internal

- **`pushOperacionalToCloudInternal`**: merge, `payloadFinal`, dedupe, `secureApiFetch` POST `section: "operacional"`.
- **Não** chama `pushOperacionalToCloud` público.
- **Não** chama `enqueueOperacionalPush`.
- Hook de teste opcional: `setPushOperacionalInternalTestEnterHookForTests` (somente scripts offline).

## 5. Dedupe

- Permanece **dentro** de `Internal`, após `payloadFinal`, antes do POST.
- Fingerprint atualizado **somente** após `res.ok`.
- Chaves `operacionalPushCacheKey(cnpj, authoritative)` preservadas (`auth` vs `merge`).
- `forceOperacionalPush` continua ignorando dedupe (semântica anterior).

## 6. Authoritative

- `authoritative: true` → mesmo caminho de merge/POST; bypass de `operacionalPushSeguro` no cliente preservado.
- Pipeline servidor inalterado: POST → `uploadOperacionalSync` → H8.9.21 → H8.9.35 → Storage.

## 7. Options

Preservados: `authoritative`, `skipOperationalResetPush`, `forceOperacionalPush` (defaults inalterados).

Testes H8.9.62 cobrem cada flag (mock `secureApiFetch`).

## 8. Testes

| Suite | Resultado |
|-------|-----------|
| H8.9.60 `test-operacional-push-single-flight-h860.ts` | **7/7** |
| H8.9.62 `test-operacional-push-integracao-h862.ts` | **11/11** |
| H8.9.35 | **16/16** |
| H8.9.36 | **11/11** |
| `npx tsc --noEmit` | **PASS** |

H8.9.62: mock de rede via `setSecureApiFetchTestOverrideForTests`; sem Supabase/Storage.

## 9. Flag

- **`OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED`**: **`false`** (const de produção).
- Testes usam `setOperacionalPushSingleFlightEnabledForTests(true|false|null)` — **não** altera produção.

**FLAG DEFAULT: FALSE**

## 10. Recursão/deadlock

- `Internal` **não** referencia `pushOperacionalToCloud(` nem `enqueueOperacionalPush`.
- `requestAppSync` **não** alterado.
- Reentrância: `await pushOperacionalToCloud` **dentro** de `Internal` permanece anti-padrão (deadlock com fila).

**RECURSÃO: NÃO**

## 11. WIP

Working tree mantém alterações anteriores (ex.: `route.ts`, `NotasPedidoContent.tsx`, scripts `.mjs`) **fora** do escopo desta etapa; H8.9.62 limitou-se ao writer + single-flight + testes + hook de mock de rede.

## 12. Produção

Nenhum deploy, commit, push, upload ou escrita em produção/Storage/Supabase nesta etapa.

**PRODUÇÃO ALTERADA: NÃO**
**STORAGE ALTERADO: NÃO**
**SUPABASE ALTERADO: NÃO**

## 13. Conclusão

Estratégia B integrada com flag off → **zero mudança funcional em produção** até habilitar a flag em etapa futura. Single-flight pronto para ativação controlada.

HEAD referência: `2151b35bf58b947b82cae0703ed234cd7d04df94`.
