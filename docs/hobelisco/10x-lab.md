# Hobelisco HX — 10X LAB

Evolução de defesa aplicativa **exclusivamente em laboratório**.

## Comandos

```bash
# Campanha completa 100.000 cenários (~4–8 min)
npm run lab:hobelisco:10x

# Rápido 10.000 cenários (~25 s)
npm run lab:hobelisco:10x:quick

# Parâmetros
npm run lab:hobelisco:10x -- --count=100000 --seed=20260909
```

## O que foi adicionado (HX-0.6.0)

| Módulo | Path |
|--------|------|
| Security Fabric | `lab/hobelisco-hx/security-fabric/` |
| Auth Risk Engine | `security-fabric/AuthRiskEngine.ts` |
| Session Guard | `security-fabric/SessionGuard.ts` |
| False Positive Lab | `adaptive-defense/FalsePositiveLab.ts` |
| Extended Security Score | `adaptive-defense/ExtendedSecurityScore.ts` |
| SEC-REG regression | `lab/hobelisco-hx/regression/RegressionEngine.ts` |
| WhatsApp alerts | `src/lib/lab/hobeliscoWhatsAppAlert.ts` |
| 10X audit | `lab/hobelisco-hx/tenx-audit/runHobelisco10xAudit.ts` |

## Métricas antes → depois (10k quick, CONTROLLED_BLOCK)

| Métrica | Antes (~) | Depois (~) |
|---------|-----------|--------------|
| Prevention | 55% | **67%+** |
| Coverage | 77% | **83%+** |
| Detection | 99.6% | **99.8%+** |
| Financial mutations | 0 | **0** |

## Modos do Fabric

```env
HOBELISCO_FABRIC_MODE=OBSERVE    # default — só alerta
HOBELISCO_FABRIC_MODE=SHADOW       # wouldBlock sem bloquear
HOBELISCO_FABRIC_MODE=CONTROLLED_BLOCK  # bloqueia policies aprovadas (LAB)
```

## WhatsApp (LAB)

Ver [whatsapp-alerts-lab.md](./whatsapp-alerts-lab.md).

Incidentes ≥70% confiança disparam WhatsApp se `HB_HOBELISCO_WHATSAPP_ENABLED=true`.

## Relatórios

Gerados em `lab/hobelisco-hx/reports/`:

- `hobelisco-10x-baseline-*.json`
- `hobelisco-10x-campaign-*.json`
- `hobelisco-10x-comparison-*.json`
- `hobelisco-10x-security-score-*.json`
- `hobelisco-10x-final-report-*.json`

## Gates críticos (RED se falhar)

- `financialMutations > 0`
- `externalTargets > 0`
- SEC-REG regression falha
- Simulação em PRODUCTION

## Produção

**Não ativar** active defense ou CONTROLLED_BLOCK em produção sem fase de staging documentada em [security-assessment-and-production-impact.md](./security-assessment-and-production-impact.md).
