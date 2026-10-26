# Ponto de retorno — Cooperado mobile Fase 3 (build 644)

**Objetivo:** Voltar ao estado em que o piloto Jeferson confirmou **Fase 3 SIM** (abas fluidas, valores, ficha e Financeiro corretos), sem apagar dados de outros cooperados na nuvem.

---

## Identificação

| Campo | Valor |
|--------|--------|
| Referência | `cooperado-mobile-fase3-v644` |
| Manifest (git) | `docs/baselines/cooperado-mobile-fase3-v644-manifest.json` |
| Tag git | `cooperado-mobile-fase3-v644` → `2dd7cb2a6de4` |
| Produção | build **644**, `dpl_AnaNJcdXMZU9wUBzeUTg4kzFBCvV` |
| Piloto | `c_1781981564381_w67gg` / `jefersonabreudeaguiar@gmail.com` |

---

## Restaurar só o programa (PWA cooperado)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
git fetch origin --tags
npm run restore:cooperado-backup-code
# preserva gestão + anti-travamento; depois: APP_BUILD_VERSION + public/sw.js e deploy
```

Checkout da tag inteira (só se quiser rollback global — afeta responsável):

```powershell
git checkout cooperado-mobile-fase3-v644
```

Ou na Vercel: **Promote** o deployment `dpl_AnaNJcdXMZU9wUBzeUTg4kzFBCvV`.

Validar:

```powershell
npx tsx scripts/test-cooperado-fase2-tab-fluidez-v566.ts
npm run test:cooperado-financeiro
```

---

## Backup exclusivo dos **dados** do cooperado (nuvem)

Gera slice read-only em `backups/` (não vai para o git):

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
npm run backup:cooperado-slice
# opcional: --cooperado-id=c_1781981564381_w67gg --cnpj=62351750000165
```

Conteúdo típico do diretório:

- `manifest.json` — contagens e hashes
- `cooperado-record.json` — cadastro no storage
- `notas_pedido.json` — notas da tabela filtradas pelo cooperado
- `operacional-slice.json` — fichas, pagamentos e domínios operacionais **só** desse cooperado (extraídos do `operacional.json` da cooperativa)
- `entregas-slice.json` — arquivos em `hb-entregas` ligados às notas do cooperado (quando existirem)

**Restaurar dados:** não há upload automático. Use o slice como referência forense ou peça merge assistido (script `restore-operacional-from-backup.mjs` é para backup **completo** de operacional, não para slice).

---

## O que NÃO fazer

- Não rodar `wipe-*`, `reset-operacional` ou `repair-*` na nuvem “para testar”.
- Não restaurar `operacional.json` inteiro a partir de um slice sem revisão humana.
- Não commitar pastas em `backups/` (estão no `.gitignore`).

---

**Índice operacional do ponto de retorno Fase 3 — build 644.**
