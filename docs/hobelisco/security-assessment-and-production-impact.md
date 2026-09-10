# Hobelisco — Avaliação de Segurança e Impacto em Produção

Documento honesto. **Notas 0–10 não substituem pentest, WAF gerenciado ou certificação.**

Relatório gerado automaticamente ao rodar:

```bash
npm run lab:hobelisco:adaptive-defense
```

Arquivo: `lab/hobelisco-hx/reports/hobelisco-security-assessment-<timestamp>.json`

---

## 1. O que o Hobelisco é (e o que não é)

| É | Não é |
|---|--------|
| Camada applicativa/domínio (coop, crédito, sync) | Antivírus (Defender, Kaspersky, Norton) |
| Observer + correlacionador + LAB de simulação | WAF de borda substituto |
| Playbooks com humano no loop | SOC 24/7 |
| Fail-closed para mutação financeira | EDR (CrowdStrike) |

**Antivírus e EDR** protegem SO/processos/malware. **Não inspecionam** JWT, sync offline, divergência HB Credit. Comparar nota global seria enganoso — o benchmark marca `applicableToThisApp: false` para essas categorias.

---

## 2. Comparativo 0–10 (referência + Hobelisco)

Dimensões ponderadas: detecção, prevenção, aderência domínio, FP, maturidade, prontidão prod, auditoria, threat intel, IR.

### Soluções de mercado (estimativa conservadora)

| Solução | Nota geral | Aplicável ao app? | Papel |
|---------|------------|-------------------|-------|
| Cloudflare WAF | ~7.5 | Sim | Borda OWASP, bot, rate limit |
| AWS WAF + Shield | ~7.2 | Sim | Borda enterprise |
| ModSecurity CRS | ~6.2 | Sim | WAF open source (FP alto) |
| Supabase Auth + RLS | ~7.0 | Sim | **Já no app** — autorização estrutural |
| Sentry / Datadog | ~6.5 | Sim | Observabilidade, não bloqueia |
| Splunk / Sentinel | ~7.5 | Sim | SIEM — detecta, não bloqueia inline |
| Contrast RASP | ~7.2 | Parcial | Runtime app — raro em Next.js |
| Windows Defender | ~6.5* | **Não** | *Camada errada para API |
| CrowdStrike EDR | ~7.8* | **Não** | *Endpoint, complementar |

### Hobelisco (medido / projetado)

| Modo | Nota geral | Base |
|------|------------|------|
| **V2 Observe-only** (prod viável) | **~5.8** | Middleware ingest, incidentes, playbooks, sem bloqueio |
| **LAB Adaptive** (campanha 10k) | **~5.5–6.0** | Métricas reais: 77% coverage, 55% prevention, 0 FP lab |
| **Contribuição honesta ao app** | **~5.5** | Complemento a RLS+WAF — não substituto |

> Veredito benchmark: **COMPLEMENTO VALIOSO** em domínio coop/crédito; **insuficiente sozinho**.

---

## 3. Métricas reais da última campanha LAB (10.000 cenários)

| Métrica | Valor | Interpretação |
|---------|-------|----------------|
| Defense Coverage Score | 77.28% | Conhecido coberto — não 100% |
| Prevention (blocked) | ~55% | Metade dos ataques simulados só detectados |
| Detection (blocked+detected) | ~99.8% | Quase tudo visto — 17 missed |
| False positive | 0 | LAB — tráfego real pode diferir |
| Financial mutations | **0** | Gate crítico OK |
| Missed | 17 | Principalmente T12_HB_CREDIT |

**Lacunas honestas:** T01_AUTH e T06_SESSION bloqueiam pouco no LAB (muito DETECTED_ONLY). Active defense não está no middleware prod.

---

## 4. O que aconteceria em produção

### Estado atual (default)

```env
HB_HOBELISCO_V2_ENABLED=false
HB_ADAPTIVE_DEFENSE_ENABLED=false
```

**Impacto:** zero. App funciona como hoje.

### Cenário recomendado — Fase 1: STAGING observe-only

```env
HOBELISCO_ENVIRONMENT=STAGING
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
```

| Vantagens | Desvantagens |
|-----------|--------------|
| Visibilidade auth/sync/credit/admin | +latência mínima middleware (~1–5ms) |
| Incidentes correlacionados | Alertas exigem triagem humana |
| Zero bloqueio de usuário | Schema Supabase observability necessário |
| Playbooks HB Credit | Curva operacional |

**Fluxo funcional:** inalterado para cooperado. Admin vê painel Hobelisco + alertas.

### Cenário — Credit Watch cron (staging → prod piloto)

| Vantagens | Desvantagens |
|-----------|--------------|
| Divergência crédito detectada cedo | Cron + CRON_SECRET |
| Read-only — sem mutação | Falso positivo se dados upstream errados |
| Dedup + fingerprint estável | Intervalo 15min — não tempo real |

### Cenário NÃO recomendado agora — Active defense inline

| Risco | Efeito |
|-------|--------|
| RATE_LIMIT mal calibrado | Cooperado legítimo bloqueado (rede compartilhada) |
| REPLAY_REJECTION agressivo | Mobile offline/sync legítimo rejeitado |
| Sem baseline 30 dias | FP desconhecidos |

**Gate:** human approval + canary 1% + rollback automático + campanha GREEN.

---

## 5. Fluxo funcional por área

```text
[Request] → middleware (observe?) → API → Supabase RLS
                ↓
         CorrelationEngine (async)
                ↓
         Incidente CANDIDATE → CONFIRMED (humano) → Playbook → Outcome (humano)
```

- **Login:** observe registra falhas; não bloqueia (V2).
- **Sync:** detecta replay/conflict; não corrige dados.
- **HB Credit:** alerta divergência; **nunca** altera saldo.
- **Admin:** alerta sequência anômala; playbook após confirmação.

---

## 6. O que implementamos (viável LAB)

| Item | Status |
|------|--------|
| SecurityBenchmark (comparativo 0–10) | ✅ |
| ProductionImpactAssessment | ✅ |
| Fail-closed tests | ✅ |
| Chaos/learning isolation tests | ✅ |
| Relatório `hobelisco-security-assessment-*.json` | ✅ |
| Active defense em prod | ❌ bloqueado by design |
| Auto-deploy learning | ❌ bloqueado |
| MITRE feed ao vivo | ❌ fora de escopo — TKB normalizado estático |

---

## 7. Recomendação profissional

1. **Manter** Supabase RLS + auth como barreira principal.
2. **Adicionar** WAF na borda (Cloudflare/AWS) — maior ganho preventivo.
3. **Pilotar** Hobelisco V2 observe-only em STAGING 2–4 semanas.
4. **Rodar** `lab:hobelisco:adaptive-defense` em CI nightly — regressão.
5. **Não** ligar active defense em prod sem fase 5 do deploymentPhases.
6. **Nunca** prometer “app invulnerável” — coverage medido, gaps conhecidos.

---

## 8. Disclaimer

Notas derivadas de campanha LAB sintética + estimativas conservadoras de mercado. Tráfego real, atacantes adaptativos e misconfigurations não cobertos por simulação permanecem em **UNKNOWN_SPACE**.
