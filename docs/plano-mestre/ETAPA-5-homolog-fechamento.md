# Plano mestre — Etapa 5: homologação e fechamento cooperado

**Pré-requisito:** Etapas 1–4 aceitas no celular **e** no browser.

## Checklist único (30 min)

| # | Cenário | OK |
|---|---------|-----|
| 1 | Login cooperado — Início &lt; 10s | |
| 2 | Trocar abas 3x — sem freeze | |
| 3 | Responsável lança → cooperado vê valor (~2 min) | |
| 4 | Atualizar 1x — valor mantém | |
| 5 | Reparar atalho — build = nuvem | |
| 6 | Browser Chrome (não PWA) — mesmo valor | |
| 7 | JSON diag anexado no suporte | |

## Gate técnico (repo)

```powershell
npm run cooperado:verify:fase4
```

Checklist piloto impresso: `docs/plano-mestre/FASE-4-PILOTO-CHECKLIST.md`.

## Próxima ordem (após SIM do piloto na Fase 4)

- Tag `cooperado-homolog-fechado` no commit de produção.
- Etapa 6+ (responsável/HB) só após linha acima verde.
