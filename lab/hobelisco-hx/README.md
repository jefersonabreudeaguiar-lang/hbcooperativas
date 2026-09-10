# HOBELISCO HX — Laboratório

Organismo digital defensivo **isolado**. Não produção.

## Rodar Arena

```bash
npm run lab:hobelisco-arena
```

## UI

`/lab/hobelisco` — painel futurista + diálogo estruturado (não LLM)

## Gate

- Dev: habilitado automaticamente
- Produção: `HB_HOBELISCO_LAB_ENABLED=true` + `NEXT_PUBLIC_HB_HOBELISCO_LAB_ENABLED=true`

## Documentação

- `docs/adr/ADR-HOBELISCO-001.md`
- `docs/ANALISE-POTENCIAL-E-MERCADO.md`
- `docs/AUDITORIA-PARA-GPT.md`

**Nunca** promover lab direto para produção.
