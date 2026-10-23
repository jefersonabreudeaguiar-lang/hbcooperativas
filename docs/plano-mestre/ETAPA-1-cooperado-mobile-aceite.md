# Plano mestre — Etapa 1: cooperado mobile (acesso sem travar)

**Build alvo:** 549+  
**Produção:** https://hbcooperativas.vercel.app

## O que mudou nesta etapa

- **Garantia GA** (ao abrir/voltar ao PWA): deixa de forçar `operacional_full` só por snapshot divergente ou ficha “desatualizada” com motor local ok; prioriza rematerialização local.
- **Recovery financeiro:** cooperado GA não dispara `operacional_full` se `cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem` for falso.
- **Sync base informações:** só quando recovery na nuvem é realmente necessário.
- **Trace (opcional):** `localStorage.setItem('hb.coop.mobile.trace','1')` → eventos em `sessionStorage` (`readCooperadoMobileSyncTraceRing` no console via suporte).

## Roteiro de aceite (5 min — cooperado real)

1. **Reparar atalho** — header deve mostrar **v549** (ou superior).
2. Login cooperado (ex.: Orlando).
3. **Início** — valor ou “carregando” some em até **10 s**; app responde ao toque.
4. Trocar **Início → Entregas → Financeiro** três vezes — sem congelar.
5. **Atualizar** — termina em até **30 s** (Wi‑Fi normal); abas continuam clicáveis.
6. Minimizar app **10 s**, voltar — mesmo comportamento (sem spinner eterno).

## Resultado

| Campo | Valor |
|-------|--------|
| Aceite no celular | ☐ SIM / ☐ NÃO |
| Build visto no header | |
| Observação | |
