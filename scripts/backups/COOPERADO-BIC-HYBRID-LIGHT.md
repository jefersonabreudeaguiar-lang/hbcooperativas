# Cooperado BIC — modo híbrido leve

## Flag

- `NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT` (produção: `true`)
- Requer BIC padrão (`NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE=false`).

## Comportamento

1. **Cold start:** parse eager do AppData adiado (idle), como staff defer.
2. **Sessão mobile (3 ticks):** tick 0 = pull operacional completo; ticks 1–2 = só consulta revisão na nuvem — pull pesado só se mudou; recovery `operacional_full` só se exibição ainda zerada.
3. **UI:** componentes do início/gate financeiro assinam domínios `shell` + `financeiro` (não re-render a cada sync de notas).
4. **Snapshots BIC:** rematerialização em `requestIdleCallback`.

## Rollback

Em `vercel.json`, definir `NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT` como `false` e redeploy.
