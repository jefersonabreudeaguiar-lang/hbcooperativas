# Responsável — performance (build 420+)

## Causas típicas de travamento no browser

1. **JSON.parse síncrono** do `AppData` no primeiro frame (`preloadAppData({ eager: true })`).
2. **Rajada de pulls** de notas ao abrir a fila (mount + vista + poll + visibility).
3. **Re-render global** em `useAppDataSelector` a cada sync operacional/financeiro na tela de Notas.

## O que o app faz agora

| Mitigação | Flag / código |
|-----------|----------------|
| Parse do localStorage após 1º paint (staff) | `NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER=true` → `cooperadoColdStart.ts` |
| Poll da fila só após ~6s do mount | `NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS=6000` |
| Menos repaint (cooperados, contratos, conferência) | `useAppDataSelectorForDomainsWhenActive` em `NotasPedidoStaffResponsavelApp.tsx` |
| Um chunk a menos até Notas | `NotasPedidoContent` importa `NotasPedidoStaffResponsavelApp` direto |

## Medir em homolog/produção

```text
localStorage.setItem("hb-rql-perf-debug","1"); location.reload();
// após usar a fila / conferir:
window.__hbRqlPerf.print()
```

Ver também `docs/performance-staff-conferir-antes-depois.md`.

## Rollback rápido (sem revert de código)

- `NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER=false` — volta parse síncrono no login.
- `NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS=0` — poll imediato (mais rede, menos “fila parada” no boot).
- `NEXT_PUBLIC_STAFF_FILA_NOTAS_LIVE_POLL=0` — desliga poll agressivo da fila.

## Testes

```bash
npx tsx scripts/test-perf-responsavel-fila-p1.ts
npm run test:perf-fluxos
```
