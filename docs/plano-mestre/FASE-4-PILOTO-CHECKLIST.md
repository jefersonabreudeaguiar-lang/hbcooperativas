# Fase 4 — Checklist piloto (Etapa 5)

**Build mínimo:** `v644` · **Produção:** https://hbcooperativas.vercel.app  
**Conta:** `jefersonabreudeaguiar@gmail.com` (PWA instalado **e** Chrome normal).

Marque **SIM** ou **NÃO** em cada linha e envie o JSON do item 7.

| # | Cenário | PWA | Chrome |
|---|---------|-----|--------|
| 1 | Login → Início visível em &lt; 15 s | | |
| 2 | Trocar abas 10× — sem travar | | |
| 3 | Responsável lança → você vê em ~2 min ou **Atualizar** 1× | | |
| 4 | **Atualizar** 1× — valor não zera | | |
| 5 | Menu **Reparar atalho** (se existir) — badge = build da nuvem | | |
| 6 | Mesmo **A receber** no Chrome (não PWA) que no app instalado | | |
| 7 | JSON diag anexado (abaixo) | | |

## Item 7 — copiar JSON de diagnóstico

No celular, com sessão cooperado aberta:

1. Abra o Início e aguarde valor carregar.
2. No Chrome DevTools **não** é prático no celular — use o atalho de homolog se aparecer no menu, **ou** no desktop logado como cooperado cole no console:

```javascript
copy(JSON.stringify(window.__HB_COOP_DIAG__?.() ?? { hint: "Abra /dashboard e rode hb-cooperado-console-diag se disponível" }, null, 2))
```

Alternativa: carregue `https://hbcooperativas.vercel.app/hb-cooperado-console-diag.js` no console após login e siga as instruções do script.

## Portão

**“Homologação Etapa 5 fechada?”** — **SIM** só se **todas** as linhas PWA **e** Chrome = SIM.

Repo (agente): `npm run cooperado:verify:fase4` deve estar verde antes do seu SIM final.
