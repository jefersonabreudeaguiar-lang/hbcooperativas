# Lab — Atualização / Sync (isolado)

Este diretório **não altera** o app oficial (`src/`). Prototipa políticas de sincronização e mede impacto antes de promover para produção.

## Como rodar

**Página web (dev):** com `npm run dev`, abra [http://localhost:3000/lab/sync](http://localhost:3000/lab/sync)

**Terminal:**

```bash
npm run lab:sync-audit
```

## Conteúdo

| Arquivo | Função |
|---------|--------|
| `baselinePolicy.ts` | Modelo do comportamento atual (Build 59) |
| `proposedPolicy.ts` | Orquestrador lab: slices, fingerprints, gaps adaptativos |
| `coherenceValidator.ts` | Checagens pós-merge (ficha, pagamentos, mensalidades) |
| `scaleSimulator.ts` | Simulação 1000 cooperados · 20 cooperativas |
| `scoreAudit.ts` | Notas 0–10 antes/depois |

## Promoção para produção

Somente após: simulação OK, revisão de segurança, e PR dedicado — nunca merge direto do lab.
