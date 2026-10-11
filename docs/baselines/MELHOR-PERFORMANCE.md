# Melhor performance (referência cooperado + responsável)

Ponto de referência quando **abas rápidas**, **Financeiro leve**, **browser do responsável estável** e **recibo assinado não reaparece** após sync.

| Campo | Valor |
|--------|--------|
| Nome | `melhor-performance` |
| Build app | **283** (`APP_BUILD_VERSION`) |
| Tag Git | `baseline/melhor-performance-build-283` |
| Manifesto | [`melhor-performance-manifest.json`](./melhor-performance-manifest.json) |
| Produção | https://hbcooperativas.vercel.app |

## Revalidar este ponto (local, sem mutar nuvem)

```bash
npm run baseline:melhor-performance
```

Inclui métricas HX 8.0 read-only, smoke cold-start/release e contrato recibo+assinatura.

## Blindagem (não regredir)

- **Agente (Cursor):** rule `.cursor/rules/melhor-performance-guard.mdc` — mudanças em sync/PWA/abas devem ser cirúrgicas; só melhorar ou manter a resposta, nunca piorar.
- **Antes de commit** em paths sensíveis (ver rule + `anchorFiles` no manifesto): `npm run gate:melhor-performance`
- **CI (GitHub):** workflow `melhor-performance-gate.yml` roda o mesmo gate quando esses paths mudam em PR/push no `main`.

## Se a performance “bagunçar” de novo

1. `git fetch origin && git show baseline/melhor-performance-build-283 --no-patch`
2. Compare build em produção: `npm run confirm:production`
3. Abra o manifesto JSON — políticas PWA/sync listadas em `cooperadoPerformancePolicy`
4. Diff de código entre a tag e `main` nos arquivos listados no manifesto

Rollback de **código** (só com autorização): checkout da tag ou promote do deployment indicado no manifesto após o próximo deploy confirmado.
