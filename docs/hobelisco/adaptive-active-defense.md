# Hobelisco Adaptive Active Defense (LAB)

Plataforma de defesa adaptativa em laboratório — **não altera produção automaticamente**.

## Princípio

```text
PERCEBER → CORRELACIONAR → CLASSIFICAR → PROTEGER
→ SIMULAR → MEDIR → APRENDER → PROPOR → VALIDAR → FORTALECER
```

## Fronteiras

| Cyber Defense (automático em LAB) | Financial State (nunca automático) |
|-----------------------------------|-------------------------------------|
| REJECT, RATE_LIMIT, BACKOFF       | saldo, crédito, limite, movimentação |
| TEMPORARY_BLOCK, QUARANTINE       | pagamento, estorno, conta financeira |

## Módulos

| Módulo | Caminho |
|--------|---------|
| ThreatKnowledgeBase | `lab/hobelisco-hx/adaptive-defense/ThreatKnowledgeBase.ts` |
| ScenarioGenerator | `lab/hobelisco-hx/adaptive-defense/ScenarioGenerator.ts` |
| SimulationEngine | `lab/hobelisco-hx/adaptive-defense/HobeliscoSimulationEngine.ts` |
| CampaignRunner | `lab/hobelisco-hx/adaptive-defense/CampaignRunner.ts` |
| LearningEngine | `lab/hobelisco-hx/adaptive-defense/HobeliscoLearningEngine.ts` |
| PolicyLab | `lab/hobelisco-hx/adaptive-defense/DefensePolicyLab.ts` |

## Execução

```bash
npm run lab:hobelisco:adaptive-defense
# opções:
npm run lab:hobelisco:adaptive-defense -- --count=10000 --seed=20260909
```

Relatórios gerados em `lab/hobelisco-hx/reports/`:

- `hobelisco-defense-campaign-<timestamp>.json`
- `hobelisco-hardening-report-<timestamp>.json`
- `hobelisco-security-assessment-<timestamp>.json` — benchmark 0–10 + impacto produção

Ver também: [security-assessment-and-production-impact.md](./security-assessment-and-production-impact.md)

## Variáveis de ambiente

```env
HB_ADAPTIVE_DEFENSE_ENABLED=false   # default OFF
HB_ADAPTIVE_MAX_SCENARIOS=10000
HB_ADAPTIVE_SEED=20260909
HB_ADAPTIVE_MAX_DURATION_MS=120000
HB_ADAPTIVE_MAX_REQUESTS=50000
HOBELISCO_ENVIRONMENT=LAB
```

## Veredito

`LAB-HARDENED-ADAPTIVE-GREEN` requer:

- sandbox obrigatório
- zero mutações financeiras
- zero alvos externos
- ≥ 10.000 cenários (campanha FULL)
- learning candidates **sem** auto-deploy
- human approval antes de DEPLOYED

## Limitações conhecidas

- Simulações rodam contra runtime LAB sintético (localhost/sandbox)
- Learning candidates permanecem PROPOSED até aprovação humana
- Não promete cobertura absoluta — relatório inclui `knownGaps` e `unknownSpace`
