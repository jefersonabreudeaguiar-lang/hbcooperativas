# Pontos de retorno (produção)

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
