# Rollback — Concerto BIC Movimento IV

```json
"NEXT_PUBLIC_BIC_REVISION_PULSE": "false",
"NEXT_PUBLIC_BIC_SONATA_SYNC_UI": "false"
```

Remove `CooperadoBicRevisionPulseHost` do `CooperadoFinanceiroGate` se necessário desligar pulso por completo.

Health: `GET /api/health/bic-paridade` permanece inofensivo se deixado publicado (exige staff autenticado).
