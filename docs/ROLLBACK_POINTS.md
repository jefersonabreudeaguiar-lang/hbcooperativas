# Pontos de retorno (produção)

## `rollback/pre-contrato-pagar-v437`

- **Commit:** `200e4134` (tag aponta para este commit)
- **App build:** 437
- **Descrição:** Última versão estável antes da persistência anti-regressão das abas Contratos e Pagar cooperados (build 438+). Pagos já saem do em aberto.

### Voltar o código a este ponto (local)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
git fetch origin
git checkout rollback/pre-contrato-pagar-v437
```

## `rollback/pre-hb-sync-storm-429`

- **Commit:** `a071acff` (tag aponta para este commit)
- **App build:** 428
- **Descrição:** Antes da coalescência do pipeline HB Créditos e fim do loop `LIMITE_SYNCED` → `sync-limite` (build 429+, anti-travamento cooperado/PWA).

### Voltar o código a este ponto (local)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
git fetch origin
git checkout rollback/pre-hb-sync-storm-429
```

## `rollback/pre-pwa-integrity-399`

- **Commit:** `0be7ae1c`
- **App build:** 398
- **Descrição:** Antes da integridade de chunks (guard DPL no layout), vigia de release cooperado e probe pós-interação (build 399+).

### Voltar o código a este ponto (local)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
git fetch origin
git checkout rollback/pre-pwa-integrity-399
```

Para publicar de novo esse estado em `main` (somente se for decisão explícita de rollback em produção):

```powershell
git checkout main
git reset --hard rollback/pre-pwa-integrity-399
git push origin main
```

> O `push` em `main` dispara deploy na Vercel. Combine com a equipe antes de usar `reset --hard` + push.

### Ver tags disponíveis

```powershell
git tag -l "rollback/*"
```
